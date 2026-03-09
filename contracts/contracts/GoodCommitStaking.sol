// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// ── GoodDollar Identity interface ────────────────────────────────────────────
// Production contract on Celo mainnet: 0xC361A6E67822a0EDc17D899227dd9FC50BD62F42
// We use getWhitelistedRoot() so linked/connected wallets are handled correctly.
interface IIdentity {
    function getWhitelistedRoot(address account) external view returns (address);
    function isWhitelisted(address account) external view returns (bool);
}

/**
 * @title GoodCommitStaking
 * @notice Habit-staking contract for the GoodCommit dApp on Celo.
 *
 * Two entry points for users:
 *   A) claimInitialSeed() — verified GoodDollar users claim 10 G$ once for free.
 *      The contract checks GoodDollar Identity on-chain; no backend trust needed.
 *   B) stakeGDollar()     — any wallet stakes their own G$ into a habit.
 *
 * Earned points decay 40%/day when inactive. Points convert to G$ at 10:1.
 * Failed commitments: 60% → UBI pool, 40% → reward treasury.
 */
contract GoodCommitStaking is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 public constant POINTS_PER_G_DOLLAR   = 10;      // 10 pts = 1 G$
    uint256 public constant SEED_AMOUNT            = 10e18;   // 10 G$ (18 decimals)
    uint256 public constant DECAY_RATE_BPS         = 4000;    // 40% daily decay
    uint256 public constant SLASH_UBI_BPS          = 6000;    // 60% to UBI pool
    uint256 public constant SLASH_TREASURY_BPS     = 4000;    // 40% to treasury
    uint256 public constant PARTIAL_STAKE_BONUS_BPS = 500;    // +5% bonus
    uint256 public constant FULL_STAKE_BONUS_BPS   = 1000;    // +10% bonus
    uint256 public constant BPS_DENOMINATOR        = 10000;
    uint256 public constant INACTIVITY_THRESHOLD   = 3 days;

    // Plant growth thresholds (points)
    uint256 public constant STAGE_SEED     = 0;
    uint256 public constant STAGE_SPROUT   = 10;
    uint256 public constant STAGE_GROWING  = 30;
    uint256 public constant STAGE_MATURE   = 60;
    uint256 public constant STAGE_FRUITING = 100;

    // ── Enums ─────────────────────────────────────────────────────────────────
    enum HabitType  { Health, Academics }
    enum PlantStage { Seed, Sprout, Growing, Mature, Fruiting }

    // ── Structs ───────────────────────────────────────────────────────────────
    struct HabitStake {
        uint256 stakedAmount;      // G$ currently staked (18 decimals)
        uint256 points;            // accumulated points
        uint256 lastActivityTime;  // unix timestamp of last recorded activity
        uint256 commitmentEnd;     // unix timestamp when commitment expires
        bool    active;            // true if stake is live
    }

    struct UserProfile {
        bool    initialized;
        bool    hasClaimedSeed;
        uint256 totalPointsEarned;
        uint256 totalWorkoutsCompleted;
        uint256 totalQuizzesCompleted;
        uint256 totalClaimed;      // total G$ ever claimed out
        uint256 totalStaked;       // cumulative G$ ever staked in
    }

    // ── State ─────────────────────────────────────────────────────────────────
    IERC20   public immutable gDollarToken;
    IIdentity public immutable identityContract;

    address public verifier;          // backend wallet — records workouts/quizzes
    address public rewardTreasury;    // receives 40% of slashed stakes
    address public ubiPool;           // receives 60% of slashed stakes
    uint256 public decayRewardPool;   // accumulated decayed points pool (for redistribution)

    mapping(address => UserProfile)                         public userProfiles;
    mapping(address => mapping(HabitType => HabitStake))    public habitStakes;

    // Prevent double-claim: track which GoodDollar root address has claimed
    // (root = getWhitelistedRoot(user), so linked wallets share one seed)
    mapping(address => bool) public rootHasClaimed;

    // ── Events ────────────────────────────────────────────────────────────────
    event SeedClaimed(address indexed user, address indexed gdRoot, uint256 amount);
    event Staked(address indexed user, HabitType indexed habitType, uint256 amount, uint256 durationDays);
    event WorkoutRecorded(address indexed user, uint256 points, string exerciseType);
    event QuizRecorded(address indexed user, uint8 correct, uint8 total, uint256 pointsEarned);
    event PointsDecayed(address indexed user, HabitType indexed habitType, uint256 decayedPoints);
    event PointsClaimed(address indexed user, HabitType indexed habitType, uint256 gDollarPayout);
    event Unstaked(address indexed user, HabitType indexed habitType, uint256 amount);
    event StakeSlashed(address indexed user, HabitType indexed habitType, string reason, uint256 ubiAmount, uint256 treasuryAmount);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event UbiPoolUpdated(address indexed oldPool, address indexed newPool);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyVerifier() {
        require(msg.sender == verifier, "GoodCommit: caller is not verifier");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address _gDollarToken,
        address _identityContract,
        address _verifier,
        address _rewardTreasury,
        address _ubiPool
    ) Ownable(msg.sender) {
        require(_gDollarToken      != address(0), "Zero token");
        require(_identityContract  != address(0), "Zero identity");
        require(_verifier          != address(0), "Zero verifier");
        require(_rewardTreasury    != address(0), "Zero treasury");
        require(_ubiPool           != address(0), "Zero UBI pool");

        gDollarToken      = IERC20(_gDollarToken);
        identityContract  = IIdentity(_identityContract);
        verifier          = _verifier;
        rewardTreasury    = _rewardTreasury;
        ubiPool           = _ubiPool;
    }

    // =========================================================================
    // SEED CLAIM — identity verified on-chain, no backend trust needed
    // =========================================================================

    /**
     * @notice Claim a one-time gift of 10 G$ for GoodDollar-verified users.
     *
     * Checks the GoodDollar Identity contract directly, so even if the user's
     * MetaMask wallet (msg.sender) is different from their registered GoodDollar
     * wallet, the linked-account lookup (getWhitelistedRoot) handles it correctly.
     *
     * The seed is transferred from the contract's own balance. Ensure the contract
     * holds sufficient G$ before deployment (owner funds it via fundContract()).
     */
    function claimInitialSeed() external nonReentrant whenNotPaused {
        address user = msg.sender;

        // ── 1. Resolve the GoodDollar root for this wallet ──────────────────
        address gdRoot = identityContract.getWhitelistedRoot(user);
        require(
            gdRoot != address(0),
            "GoodCommit: wallet not GoodDollar verified - visit gooddollar.org"
        );

        // ── 2. Prevent double-claim per GoodDollar identity ──────────────────
        require(
            !rootHasClaimed[gdRoot],
            "GoodCommit: seed already claimed for this GoodDollar identity"
        );

        // ── 3. Also prevent the same Ethereum address from claiming twice ────
        UserProfile storage profile = userProfiles[user];
        require(!profile.hasClaimedSeed, "GoodCommit: seed already claimed");

        // ── 4. Contract must hold enough G$ ──────────────────────────────────
        require(
            gDollarToken.balanceOf(address(this)) >= SEED_AMOUNT,
            "GoodCommit: insufficient seed funds in contract"
        );

        // ── 5. Mark as claimed BEFORE transfer (re-entrancy guard + pattern) ─
        rootHasClaimed[gdRoot]   = true;
        profile.hasClaimedSeed   = true;
        profile.initialized      = true;

        // ── 6. Transfer seed G$ to the user ──────────────────────────────────
        gDollarToken.safeTransfer(user, SEED_AMOUNT);

        emit SeedClaimed(user, gdRoot, SEED_AMOUNT);
    }

    /**
     * @notice Check whether a wallet is eligible for the seed (not yet claimed,
     *         and GoodDollar-verified).
     * @return eligible  true if they can claim
     * @return gdRoot    the GoodDollar root address (zero if not verified)
     * @return reason    human-readable reason if not eligible
     */
    function checkSeedEligibility(address user)
        external
        view
        returns (bool eligible, address gdRoot, string memory reason)
    {
        gdRoot = identityContract.getWhitelistedRoot(user);

        if (gdRoot == address(0)) {
            return (false, address(0), "Wallet not GoodDollar verified");
        }
        if (rootHasClaimed[gdRoot]) {
            return (false, gdRoot, "Seed already claimed for this identity");
        }
        if (userProfiles[user].hasClaimedSeed) {
            return (false, gdRoot, "Seed already claimed by this address");
        }
        if (gDollarToken.balanceOf(address(this)) < SEED_AMOUNT) {
            return (false, gdRoot, "Contract seed fund empty");
        }
        return (true, gdRoot, "Eligible");
    }

    // =========================================================================
    // STAKING — open to all connected wallets (no identity check)
    // =========================================================================

    /**
     * @notice Stake your own G$ into a habit commitment.
     * @param habitType     0 = Health, 1 = Academics
     * @param amount        G$ amount to stake (in wei, i.e. with 18 decimals)
     * @param durationDays  commitment period in days (1–365)
     */
    function stakeGDollar(
        HabitType habitType,
        uint256   amount,
        uint256   durationDays
    ) external nonReentrant whenNotPaused {
        require(amount > 0,                           "GoodCommit: amount must be > 0");
        require(durationDays >= 1 && durationDays <= 365, "GoodCommit: duration 1-365 days");

        HabitStake storage stake = habitStakes[msg.sender][habitType];

        // Pull G$ from user (requires prior ERC-20 approve)
        gDollarToken.safeTransferFrom(msg.sender, address(this), amount);

        stake.stakedAmount    += amount;
        if (!stake.active) {
            stake.points          = 0;
            stake.active          = true;
        }
        stake.lastActivityTime = block.timestamp;
        stake.commitmentEnd   = block.timestamp + (durationDays * 1 days);

        UserProfile storage profile = userProfiles[msg.sender];
        profile.initialized  = true;
        profile.totalStaked  += amount;

        emit Staked(msg.sender, habitType, amount, durationDays);
    }

    // =========================================================================
    // ACTIVITY RECORDING — called by the verifier (backend wallet)
    // =========================================================================

    /**
     * @notice Record a completed workout. Called by the backend after GPS/camera
     *         validation. Awards 1 point per second of activity.
     */
    function recordWorkout(
        address  user,
        HabitType habitType,
        uint256  duration,      // seconds
        uint256  pointsEarned,
        string   calldata exerciseType
    ) external onlyVerifier whenNotPaused {
        require(duration > 0,      "GoodCommit: zero duration");
        require(pointsEarned > 0,  "GoodCommit: zero points");

        HabitStake storage stake = habitStakes[user][habitType];
        require(stake.active, "GoodCommit: no active stake");

        _applyDecay(user, habitType);

        stake.points           += pointsEarned;
        stake.lastActivityTime  = block.timestamp;

        UserProfile storage profile = userProfiles[user];
        profile.totalPointsEarned    += pointsEarned;
        profile.totalWorkoutsCompleted++;

        emit WorkoutRecorded(user, pointsEarned, exerciseType);
    }

    /**
     * @notice Record a completed quiz. Called by the backend after answer validation.
     */
    function recordQuiz(
        address  user,
        HabitType habitType,
        uint8    correctAnswers,
        uint8    totalQuestions,
        uint256  pointsEarned,
        int256   pointsPenalty   // negative for wrong-answer penalty
    ) external onlyVerifier whenNotPaused {
        require(totalQuestions > 0, "GoodCommit: zero questions");

        HabitStake storage stake = habitStakes[user][habitType];
        require(stake.active, "GoodCommit: no active stake");

        _applyDecay(user, habitType);

        if (pointsPenalty < 0) {
            uint256 penalty = uint256(-pointsPenalty);
            stake.points = stake.points > penalty ? stake.points - penalty : 0;
        }

        stake.points           += pointsEarned;
        stake.lastActivityTime  = block.timestamp;

        UserProfile storage profile = userProfiles[user];
        profile.totalPointsEarned    += pointsEarned;
        profile.totalQuizzesCompleted++;

        emit QuizRecorded(user, correctAnswers, totalQuestions, pointsEarned);
    }

    // =========================================================================
    // HARVEST — convert points to G$ when plant reaches Fruiting (100+ pts)
    // =========================================================================

    /**
     * @notice Claim your earned points.
     *   Converts points to G$ and resets the plant to Seed stage.
     *   Requires at least STAGE_FRUITING (100) points.
     *   Blocks claims before the commitment period ends.
     */
    function claimPoints(
        HabitType habitType
    ) external nonReentrant whenNotPaused {
        HabitStake storage stake = habitStakes[msg.sender][habitType];
        require(stake.active,           "GoodCommit: no active stake");
        require(stake.points >= STAGE_FRUITING, "GoodCommit: need 100+ points to claim");
        require(block.timestamp >= stake.commitmentEnd, "GoodCommit: commitment period not ended yet");

        _applyDecay(msg.sender, habitType);

        uint256 pts    = stake.points;
        uint256 payout = (pts * 1e18) / POINTS_PER_G_DOLLAR; // pts→G$

        stake.points = 0;

        if (payout > 0) {
            require(
                gDollarToken.balanceOf(address(this)) >= payout,
                "GoodCommit: insufficient contract balance for harvest"
            );
            gDollarToken.safeTransfer(msg.sender, payout);
            userProfiles[msg.sender].totalClaimed += payout;
        }

        emit PointsClaimed(msg.sender, habitType, payout);
    }

    /**
     * @notice Unstake your G$.
     *   Allows users to withdraw their staked G$ anytime.
     *   Unstaking exits the habit, preventing further points or activity until re-staking.
     */
    function unstakeTokens(HabitType habitType) external nonReentrant whenNotPaused {
        HabitStake storage stake = habitStakes[msg.sender][habitType];
        require(stake.active, "GoodCommit: no active stake");
        require(stake.stakedAmount > 0, "GoodCommit: nothing to unstake");
        
        uint256 amount = stake.stakedAmount;
        stake.stakedAmount = 0;
        stake.active = false;
        
        gDollarToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, habitType, amount);
    }

    // =========================================================================
    // SLASHING — called by verifier for inactivity (3+ days)
    // =========================================================================

    /**
     * @notice Slash an inactive user's stake.
     *   60% → UBI pool
     *   40% → reward treasury
     */
    function slashStake(
        address   user,
        HabitType habitType,
        string    calldata reason
    ) external onlyVerifier whenNotPaused {
        HabitStake storage stake = habitStakes[user][habitType];
        require(stake.active,      "GoodCommit: no active stake");
        require(
            block.timestamp >= stake.lastActivityTime + INACTIVITY_THRESHOLD,
            "GoodCommit: user not inactive yet"
        );

        uint256 amount     = stake.stakedAmount;
        uint256 ubiAmount  = (amount * SLASH_UBI_BPS)      / BPS_DENOMINATOR;
        uint256 treasuryAmt = (amount * SLASH_TREASURY_BPS) / BPS_DENOMINATOR;

        // Reset stake
        stake.active       = false;
        stake.stakedAmount = 0;
        stake.points       = 0;

        if (ubiAmount > 0)   gDollarToken.safeTransfer(ubiPool,        ubiAmount);
        if (treasuryAmt > 0) gDollarToken.safeTransfer(rewardTreasury, treasuryAmt);

        emit StakeSlashed(user, habitType, reason, ubiAmount, treasuryAmt);
    }

    // =========================================================================
    // INACTIVITY CHECK
    // =========================================================================

    function isInactive(address user, HabitType habitType) external view returns (bool) {
        HabitStake storage stake = habitStakes[user][habitType];
        if (!stake.active) return false;
        return block.timestamp >= stake.lastActivityTime + INACTIVITY_THRESHOLD;
    }

    // =========================================================================
    // VIEWS
    // =========================================================================

    function getPlantStage(address user, HabitType habitType)
        external view returns (PlantStage)
    {
        uint256 pts = habitStakes[user][habitType].points;
        if (pts >= STAGE_FRUITING) return PlantStage.Fruiting;
        if (pts >= STAGE_MATURE)   return PlantStage.Mature;
        if (pts >= STAGE_GROWING)  return PlantStage.Growing;
        if (pts >= STAGE_SPROUT)   return PlantStage.Sprout;
        return PlantStage.Seed;
    }

    function getUserProfile(address user)
        external view
        returns (
            bool    initialized,
            bool    hasClaimedSeed,
            uint256 totalPointsEarned,
            uint256 totalWorkoutsCompleted,
            uint256 totalQuizzesCompleted,
            uint256 totalClaimed,
            uint256 totalStaked
        )
    {
        UserProfile storage p = userProfiles[user];
        return (
            p.initialized,
            p.hasClaimedSeed,
            p.totalPointsEarned,
            p.totalWorkoutsCompleted,
            p.totalQuizzesCompleted,
            p.totalClaimed,
            p.totalStaked
        );
    }

    function getHabitStake(address user, HabitType habitType)
        external view
        returns (
            uint256 stakedAmount,
            uint256 points,
            uint256 lastActivityTime,
            uint256 commitmentEnd,
            bool    active
        )
    {
        HabitStake storage s = habitStakes[user][habitType];
        return (s.stakedAmount, s.points, s.lastActivityTime, s.commitmentEnd, s.active);
    }

    function contractGDollarBalance() external view returns (uint256) {
        return gDollarToken.balanceOf(address(this));
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    /**
     * @dev Apply 40%/day point decay for each full day of inactivity.
     *      Decayed points flow into the global decayRewardPool.
     */
    function _applyDecay(address user, HabitType habitType) internal {
        HabitStake storage stake = habitStakes[user][habitType];
        if (stake.points == 0) return;

        uint256 daysInactive = (block.timestamp - stake.lastActivityTime) / 1 days;
        if (daysInactive == 0) return;

        uint256 remaining = stake.points;
        for (uint256 i = 0; i < daysInactive && remaining > 0; i++) {
            uint256 decayed = (remaining * DECAY_RATE_BPS) / BPS_DENOMINATOR;
            remaining -= decayed;
        }

        uint256 decayedTotal = stake.points - remaining;
        decayRewardPool     += decayedTotal;
        stake.points         = remaining;

        emit PointsDecayed(user, habitType, decayedTotal);
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    /**
     * @notice Fund the contract's G$ balance so it can pay out seed claims and harvests.
     *         Caller must have approved this contract to spend their G$.
     */
    function fundContract(uint256 amount) external onlyOwner {
        gDollarToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Zero address");
        emit VerifierUpdated(verifier, _verifier);
        verifier = _verifier;
    }

    function setRewardTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero address");
        emit TreasuryUpdated(rewardTreasury, _treasury);
        rewardTreasury = _treasury;
    }

    function setUbiPool(address _ubiPool) external onlyOwner {
        require(_ubiPool != address(0), "Zero address");
        emit UbiPoolUpdated(ubiPool, _ubiPool);
        ubiPool = _ubiPool;
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /**
     * @notice Emergency withdrawal of all G$ to owner (only while paused).
     */
    function emergencyWithdraw() external onlyOwner whenPaused {
        uint256 bal = gDollarToken.balanceOf(address(this));
        if (bal > 0) gDollarToken.safeTransfer(owner(), bal);
    }
}
