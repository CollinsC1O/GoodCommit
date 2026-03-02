// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IGoodDollar.sol";

/**
 * @title GoodCommitStaking
 * @dev Comprehensive stake-to-improve contract for GoodCommit
 * Supports point accumulation, workout/quiz verification, flexible harvesting, and plant growth
 */
contract GoodCommitStaking is ReentrancyGuard, Pausable, Ownable {
    IGoodDollar public immutable gToken;
    
    // UBI pool address (where slashed funds go)
    address public ubiPool;
    
    // Reward treasury (where successful user rewards come from)
    address public rewardTreasury;
    
    // Backend verifier address (can submit workout/quiz results)
    address public verifier;
    
    // Slashing distribution: 60% to UBI, 40% to reward pool
    uint256 public constant UBI_SLASH_PERCENTAGE = 60;
    uint256 public constant REWARD_POOL_PERCENTAGE = 40;
    
    // Initial seed amount for new users (10 G$ = 10 * 10^18)
    uint256 public constant INITIAL_SEED_AMOUNT = 10 * 10**18;
    
    // Point conversion rate: 1 point = 0.1 G$ (10 points = 1 G$)
    uint256 public constant POINTS_TO_GTOKEN_RATE = 10**17; // 0.1 G$
    
    // Staking bonus percentages
    uint256 public constant STAKE_ALL_BONUS = 10; // 10% bonus for staking all
    uint256 public constant STAKE_PARTIAL_BONUS = 5; // 5% bonus for partial stake
    
    // Withering/Decay settings
    uint256 public constant DAILY_DECAY_PERCENTAGE = 40; // 40% points lost per missed day
    uint256 public constant GRACE_PERIOD = 0; // No grace period - immediate decay
    uint256 public constant COMPLETE_WITHER_DAYS = 8; // Days until all points lost (~8 days)
    
    // Reward pool for active users (accumulated from decayed points)
    uint256 public decayRewardPool;
    
    enum HabitType { Health, Academics }
    enum PlantStatus { Seed, Sprout, Growing, Mature, Fruiting, Withered, Harvested }
    
    // Plant growth thresholds (in points)
    uint256 public constant SEED_THRESHOLD = 10;
    uint256 public constant SPROUT_THRESHOLD = 30;
    uint256 public constant GROWING_THRESHOLD = 60;
    uint256 public constant MATURE_THRESHOLD = 90;
    uint256 public constant FRUITING_THRESHOLD = 100;
    
    struct UserProfile {
        bool initialized;
        bool hasClaimedSeed;
        uint256 totalPointsEarned;
        uint256 totalWorkoutsCompleted;
        uint256 totalQuizzesCompleted;
        uint256 totalClaimed;
        uint256 totalStaked;
    }
    
    struct HabitStake {
        address user;
        HabitType habitType;
        uint256 stakedAmount; // In G$ tokens
        uint256 points; // Accumulated points
        uint256 basePoints; // Points before decay calculation
        uint256 duration; // in days (for time-based tracking)
        uint256 startTime;
        uint256 lastActivity;
        uint256 lastDecayCheck; // Last time decay was calculated
        uint256 currentStreak;
        PlantStatus status;
        bool exists;
    }
    
    struct WorkoutResult {
        uint256 timestamp;
        uint256 duration; // in seconds
        uint256 pointsEarned;
        string exerciseType;
        bool verified;
    }
    
    struct QuizResult {
        uint256 timestamp;
        uint8 correctAnswers;
        uint8 totalQuestions;
        uint256 pointsEarned;
        int256 pointsPenalty; // Can be negative
        bool verified;
    }
    
    // Mappings
    mapping(address => UserProfile) public userProfiles;
    mapping(address => mapping(HabitType => HabitStake)) public userStakes;
    mapping(address => mapping(HabitType => WorkoutResult[])) public workoutHistory;
    mapping(address => mapping(HabitType => QuizResult[])) public quizHistory;
    mapping(address => uint256) public totalStakedByUser;
    
    // Track total slashed to UBI
    uint256 public totalSlashedToUBI;
    uint256 public totalSeedsDistributed;
    
    // Events
    event SeedClaimed(address indexed user, uint256 amount);
    event StakePlanted(address indexed user, HabitType habitType, uint256 amount, uint256 duration);
    event PointsAdded(address indexed user, HabitType habitType, uint256 points, uint256 newTotal);
    event PointsDeducted(address indexed user, HabitType habitType, uint256 points, uint256 newTotal);
    event PointsDecayed(address indexed user, HabitType habitType, uint256 decayedPoints, uint256 daysMissed);
    event DecayRewardPoolUpdated(uint256 newTotal);
    event WorkoutRecorded(address indexed user, HabitType habitType, uint256 pointsEarned);
    event QuizRecorded(address indexed user, HabitType habitType, uint256 pointsEarned, int256 penalty);
    event PlantGrowthUpdated(address indexed user, HabitType habitType, PlantStatus newStatus);
    event PlantWithering(address indexed user, HabitType habitType, uint256 daysInactive);
    event PointsClaimed(address indexed user, HabitType habitType, uint256 amount);
    event PointsStaked(address indexed user, HabitType habitType, uint256 amount, uint256 bonus);
    event PartialStakeAndClaim(address indexed user, HabitType habitType, uint256 staked, uint256 claimed);
    event StakeSlashed(address indexed user, HabitType habitType, uint256 slashedAmount);
    event PlantWithered(address indexed user, HabitType habitType);
    
    modifier onlyVerifier() {
        require(msg.sender == verifier || msg.sender == owner(), "Not authorized verifier");
        _;
    }
    
    constructor(
        address _gToken,
        address _ubiPool,
        address _rewardTreasury,
        address _verifier
    ) Ownable(msg.sender) {
        require(_gToken != address(0), "Invalid G$ token address");
        require(_ubiPool != address(0), "Invalid UBI pool address");
        require(_rewardTreasury != address(0), "Invalid reward treasury");
        require(_verifier != address(0), "Invalid verifier address");
        
        gToken = IGoodDollar(_gToken);
        ubiPool = _ubiPool;
        rewardTreasury = _rewardTreasury;
        verifier = _verifier;
    }
    
    /**
     * @dev Claim initial seed amount (one-time per user)
     */
    function claimInitialSeed() external nonReentrant whenNotPaused {
        UserProfile storage profile = userProfiles[msg.sender];
        
        if (!profile.initialized) {
            profile.initialized = true;
        }
        
        require(!profile.hasClaimedSeed, "Seed already claimed");
        
        profile.hasClaimedSeed = true;
        totalSeedsDistributed += INITIAL_SEED_AMOUNT;
        
        // Transfer initial seed from treasury
        require(gToken.transferFrom(rewardTreasury, msg.sender, INITIAL_SEED_AMOUNT), "Seed transfer failed");
        
        emit SeedClaimed(msg.sender, INITIAL_SEED_AMOUNT);
    }
    
    /**
     * @dev Plant a new habit seed by staking G$ (optional - can also just accumulate points)
     */
    function plantSeed(
        HabitType habitType,
        uint256 amount,
        uint256 durationInDays
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Stake amount must be > 0");
        require(durationInDays >= 1, "Duration must be at least 1 day");
        
        HabitStake storage stake = userStakes[msg.sender][habitType];
        
        if (!stake.exists) {
            // Create new stake
            stake.user = msg.sender;
            stake.habitType = habitType;
            stake.stakedAmount = 0;
            stake.points = 0;
            stake.basePoints = 0;
            stake.duration = durationInDays;
            stake.startTime = block.timestamp;
            stake.lastActivity = block.timestamp;
            stake.lastDecayCheck = block.timestamp;
            stake.currentStreak = 0;
            stake.status = PlantStatus.Seed;
            stake.exists = true;
        }
        
        // Transfer G$ from user to contract
        require(gToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        stake.stakedAmount += amount;
        totalStakedByUser[msg.sender] += amount;
        
        UserProfile storage profile = userProfiles[msg.sender];
        if (!profile.initialized) {
            profile.initialized = true;
        }
        profile.totalStaked += amount;
        
        emit StakePlanted(msg.sender, habitType, amount, durationInDays);
    }
    
    /**
     * @dev Calculate and apply point decay for missed days
     * This is called automatically before any point-related operation
     * Simple 40% reduction per day missed, no grace period
     */
    function _applyDecay(address user, HabitType habitType) internal {
        HabitStake storage stake = userStakes[user][habitType];
        
        if (!stake.exists || stake.points == 0) {
            return;
        }
        
        // Calculate days missed since last activity
        uint256 timeSinceActivity = block.timestamp - stake.lastActivity;
        uint256 daysMissed = timeSinceActivity / 1 days;
        
        if (daysMissed == 0) {
            return;
        }
        
        // Calculate decay: 40% loss per day (keep 60%)
        uint256 decayedPoints = 0;
        uint256 remainingPoints = stake.points;
        
        for (uint256 i = 0; i < daysMissed && i < COMPLETE_WITHER_DAYS; i++) {
            uint256 dailyDecay = (remainingPoints * DAILY_DECAY_PERCENTAGE) / 100;
            decayedPoints += dailyDecay;
            remainingPoints -= dailyDecay;
            
            if (remainingPoints == 0) break;
        }
        
        if (decayedPoints > 0) {
            // Deduct decayed points
            if (stake.points >= decayedPoints) {
                stake.points -= decayedPoints;
            } else {
                decayedPoints = stake.points;
                stake.points = 0;
            }
            
            // Add decayed points to reward pool for active users
            decayRewardPool += decayedPoints;
            
            emit PointsDecayed(user, habitType, decayedPoints, daysMissed);
            emit DecayRewardPoolUpdated(decayRewardPool);
            
            // Update plant status based on remaining points
            _updatePlantStatus(user, habitType);
            
            // If all points lost, mark as withered
            if (stake.points == 0) {
                stake.status = PlantStatus.Withered;
                emit PlantWithered(user, habitType);
            } else {
                emit PlantWithering(user, habitType, daysMissed);
            }
        }
        
        stake.lastDecayCheck = block.timestamp;
    }
    
    /**
     * @dev Check decay status without applying it (view function)
     */
    function checkDecayStatus(address user, HabitType habitType) 
        external 
        view 
        returns (
            uint256 currentPoints,
            uint256 pointsAfterDecay,
            uint256 decayAmount,
            uint256 daysMissed,
            bool willWither
        ) 
    {
        HabitStake memory stake = userStakes[user][habitType];
        
        if (!stake.exists || stake.points == 0) {
            return (0, 0, 0, 0, false);
        }
        
        uint256 timeSinceActivity = block.timestamp - stake.lastActivity;
        daysMissed = timeSinceActivity / 1 days;
        
        if (daysMissed == 0) {
            return (stake.points, stake.points, 0, 0, false);
        }
        
        // Calculate decay: 40% loss per day
        uint256 remainingPoints = stake.points;
        decayAmount = 0;
        
        for (uint256 i = 0; i < daysMissed && i < COMPLETE_WITHER_DAYS; i++) {
            uint256 dailyDecay = (remainingPoints * DAILY_DECAY_PERCENTAGE) / 100;
            decayAmount += dailyDecay;
            remainingPoints -= dailyDecay;
            
            if (remainingPoints == 0) break;
        }
        
        pointsAfterDecay = stake.points > decayAmount ? stake.points - decayAmount : 0;
        willWither = pointsAfterDecay == 0;
        
        return (stake.points, pointsAfterDecay, decayAmount, daysMissed, willWither);
    }
    
    /**
     * @dev Record workout result and add points (called by backend verifier)
     */
    function recordWorkout(
        address user,
        HabitType habitType,
        uint256 duration,
        uint256 pointsEarned,
        string calldata exerciseType
    ) external onlyVerifier {
        require(habitType == HabitType.Health, "Must be Health habit");
        
        HabitStake storage stake = userStakes[user][habitType];
        
        // Initialize stake if doesn't exist
        if (!stake.exists) {
            stake.user = user;
            stake.habitType = habitType;
            stake.stakedAmount = 0;
            stake.points = 0;
            stake.basePoints = 0;
            stake.duration = 30; // Default 30 days
            stake.startTime = block.timestamp;
            stake.lastActivity = block.timestamp;
            stake.lastDecayCheck = block.timestamp;
            stake.currentStreak = 0;
            stake.status = PlantStatus.Seed;
            stake.exists = true;
        } else {
            // Apply decay before adding new points
            _applyDecay(user, habitType);
        }
        
        // Add points
        stake.points += pointsEarned;
        stake.basePoints += pointsEarned;
        stake.lastActivity = block.timestamp;
        stake.currentStreak++;
        
        // Update plant status based on points
        _updatePlantStatus(user, habitType);
        
        // Record workout history
        workoutHistory[user][habitType].push(WorkoutResult({
            timestamp: block.timestamp,
            duration: duration,
            pointsEarned: pointsEarned,
            exerciseType: exerciseType,
            verified: true
        }));
        
        // Update user profile
        UserProfile storage profile = userProfiles[user];
        if (!profile.initialized) {
            profile.initialized = true;
        }
        profile.totalPointsEarned += pointsEarned;
        profile.totalWorkoutsCompleted++;
        
        emit PointsAdded(user, habitType, pointsEarned, stake.points);
        emit WorkoutRecorded(user, habitType, pointsEarned);
    }
    
    /**
     * @dev Record quiz result and add/deduct points (called by backend verifier)
     */
    function recordQuiz(
        address user,
        HabitType habitType,
        uint8 correctAnswers,
        uint8 totalQuestions,
        uint256 pointsEarned,
        int256 pointsPenalty
    ) external onlyVerifier {
        require(habitType == HabitType.Academics, "Must be Academics habit");
        require(totalQuestions > 0, "Invalid quiz");
        
        HabitStake storage stake = userStakes[user][habitType];
        
        // Initialize stake if doesn't exist
        if (!stake.exists) {
            stake.user = user;
            stake.habitType = habitType;
            stake.stakedAmount = 0;
            stake.points = 0;
            stake.basePoints = 0;
            stake.duration = 30; // Default 30 days
            stake.startTime = block.timestamp;
            stake.lastActivity = block.timestamp;
            stake.lastDecayCheck = block.timestamp;
            stake.currentStreak = 0;
            stake.status = PlantStatus.Seed;
            stake.exists = true;
        } else {
            // Apply decay before adding new points
            _applyDecay(user, habitType);
        }
        
        // Add points or apply penalty
        if (pointsPenalty < 0) {
            // Deduct points (but don't go below 0)
            uint256 deduction = uint256(-pointsPenalty);
            if (stake.points >= deduction) {
                stake.points -= deduction;
            } else {
                stake.points = 0;
            }
            emit PointsDeducted(user, habitType, deduction, stake.points);
        } else {
            stake.points += pointsEarned;
            stake.basePoints += pointsEarned;
            emit PointsAdded(user, habitType, pointsEarned, stake.points);
        }
        
        stake.lastActivity = block.timestamp;
        stake.currentStreak++;
        
        // Update plant status based on points
        _updatePlantStatus(user, habitType);
        
        // Record quiz history
        quizHistory[user][habitType].push(QuizResult({
            timestamp: block.timestamp,
            correctAnswers: correctAnswers,
            totalQuestions: totalQuestions,
            pointsEarned: pointsEarned,
            pointsPenalty: pointsPenalty,
            verified: true
        }));
        
        // Update user profile
        UserProfile storage profile = userProfiles[user];
        if (!profile.initialized) {
            profile.initialized = true;
        }
        profile.totalPointsEarned += pointsEarned;
        profile.totalQuizzesCompleted++;
        
        emit QuizRecorded(user, habitType, pointsEarned, pointsPenalty);
    }
    
    /**
     * @dev Update plant status based on accumulated points
     */
    function _updatePlantStatus(address user, HabitType habitType) internal {
        HabitStake storage stake = userStakes[user][habitType];
        PlantStatus oldStatus = stake.status;
        PlantStatus newStatus;
        
        if (stake.points >= FRUITING_THRESHOLD) {
            newStatus = PlantStatus.Fruiting;
        } else if (stake.points >= MATURE_THRESHOLD) {
            newStatus = PlantStatus.Mature;
        } else if (stake.points >= GROWING_THRESHOLD) {
            newStatus = PlantStatus.Growing;
        } else if (stake.points >= SPROUT_THRESHOLD) {
            newStatus = PlantStatus.Sprout;
        } else {
            newStatus = PlantStatus.Seed;
        }
        
        if (newStatus != oldStatus) {
            stake.status = newStatus;
            emit PlantGrowthUpdated(user, habitType, newStatus);
        }
    }
    
    /**
     * @dev Claim all points and convert to G$ tokens (resets to seed)
     */
    function claimAllPoints(HabitType habitType) external nonReentrant whenNotPaused {
        HabitStake storage stake = userStakes[msg.sender][habitType];
        require(stake.exists, "No stake found");
        
        // Apply decay before claiming
        _applyDecay(msg.sender, habitType);
        
        require(stake.points > 0, "No points to claim");
        
        uint256 pointsToClaim = stake.points;
        uint256 gTokenAmount = (pointsToClaim * POINTS_TO_GTOKEN_RATE) / 10**18;
        
        // Reset to seed state
        stake.points = 0;
        stake.basePoints = 0;
        stake.status = PlantStatus.Seed;
        stake.currentStreak = 0;
        stake.lastActivity = block.timestamp;
        stake.lastDecayCheck = block.timestamp;
        
        // Update profile
        UserProfile storage profile = userProfiles[msg.sender];
        profile.totalClaimed += gTokenAmount;
        
        // Transfer G$ from treasury
        require(gToken.transferFrom(rewardTreasury, msg.sender, gTokenAmount), "Claim transfer failed");
        
        emit PointsClaimed(msg.sender, habitType, gTokenAmount);
        emit PlantGrowthUpdated(msg.sender, habitType, PlantStatus.Seed);
    }
    
    /**
     * @dev Stake partial points and claim the rest
     */
    function stakePartialAndClaim(
        HabitType habitType,
        uint256 pointsToStake
    ) external nonReentrant whenNotPaused {
        HabitStake storage stake = userStakes[msg.sender][habitType];
        require(stake.exists, "No stake found");
        
        // Apply decay before staking/claiming
        _applyDecay(msg.sender, habitType);
        
        require(stake.points > 0, "No points available");
        require(pointsToStake > 0 && pointsToStake < stake.points, "Invalid stake amount");
        
        uint256 pointsToClaim = stake.points - pointsToStake;
        
        // Calculate bonus for staking (5%)
        uint256 bonus = (pointsToStake * STAKE_PARTIAL_BONUS) / 100;
        
        // Convert claim points to G$
        uint256 gTokenAmount = (pointsToClaim * POINTS_TO_GTOKEN_RATE) / 10**18;
        
        // Update stake
        stake.points = pointsToStake + bonus;
        stake.basePoints = pointsToStake + bonus;
        stake.lastActivity = block.timestamp;
        stake.lastDecayCheck = block.timestamp;
        _updatePlantStatus(msg.sender, habitType);
        
        // Update profile
        UserProfile storage profile = userProfiles[msg.sender];
        profile.totalClaimed += gTokenAmount;
        profile.totalStaked += (pointsToStake * POINTS_TO_GTOKEN_RATE) / 10**18;
        
        // Transfer claimed G$ from treasury
        require(gToken.transferFrom(rewardTreasury, msg.sender, gTokenAmount), "Claim transfer failed");
        
        emit PartialStakeAndClaim(msg.sender, habitType, pointsToStake, pointsToClaim);
        emit PointsStaked(msg.sender, habitType, pointsToStake, bonus);
    }
    
    /**
     * @dev Stake all points with 10% bonus
     */
    function stakeAllPoints(HabitType habitType) external nonReentrant whenNotPaused {
        HabitStake storage stake = userStakes[msg.sender][habitType];
        require(stake.exists, "No stake found");
        
        // Apply decay before staking
        _applyDecay(msg.sender, habitType);
        
        require(stake.points > 0, "No points to stake");
        
        uint256 pointsToStake = stake.points;
        
        // Calculate bonus for staking all (10%)
        uint256 bonus = (pointsToStake * STAKE_ALL_BONUS) / 100;
        
        // Update stake with bonus
        stake.points = pointsToStake + bonus;
        stake.basePoints = pointsToStake + bonus;
        stake.lastActivity = block.timestamp;
        stake.lastDecayCheck = block.timestamp;
        _updatePlantStatus(msg.sender, habitType);
        
        // Update profile
        UserProfile storage profile = userProfiles[msg.sender];
        profile.totalStaked += (pointsToStake * POINTS_TO_GTOKEN_RATE) / 10**18;
        
        emit PointsStaked(msg.sender, habitType, pointsToStake, bonus);
    }
    
    /**
     * @dev Unstake G$ tokens (only staked amount, not points)
     */
    function unstakeTokens(HabitType habitType, uint256 amount) external nonReentrant {
        HabitStake storage stake = userStakes[msg.sender][habitType];
        require(stake.exists, "No stake found");
        require(amount > 0 && amount <= stake.stakedAmount, "Invalid unstake amount");
        
        stake.stakedAmount -= amount;
        totalStakedByUser[msg.sender] -= amount;
        
        // Return staked G$ tokens
        require(gToken.transfer(msg.sender, amount), "Unstake transfer failed");
    }
    
    /**
     * @dev Slash stake for cheating or inactivity (admin/verifier only)
     */
    function slashStake(address user, HabitType habitType, string calldata reason) external onlyVerifier {
        HabitStake storage stake = userStakes[user][habitType];
        require(stake.exists, "No stake found");
        require(stake.status != PlantStatus.Withered, "Already withered");
        require(stake.stakedAmount > 0, "No staked amount to slash");
        
        uint256 slashAmount = stake.stakedAmount;
        
        // Calculate distribution: 60% to UBI, 40% to reward pool
        uint256 toUBI = (slashAmount * UBI_SLASH_PERCENTAGE) / 100;
        uint256 toRewardPool = slashAmount - toUBI;
        
        // Transfer slashed funds
        require(gToken.transfer(ubiPool, toUBI), "UBI transfer failed");
        require(gToken.transfer(rewardTreasury, toRewardPool), "Reward pool transfer failed");
        
        totalSlashedToUBI += toUBI;
        totalStakedByUser[user] -= stake.stakedAmount;
        
        // Wither the plant and reset
        stake.status = PlantStatus.Withered;
        stake.stakedAmount = 0;
        stake.points = 0;
        
        emit StakeSlashed(user, habitType, slashAmount);
        emit PlantWithered(user, habitType);
    }
    
    /**
     * @dev Check if user is inactive and should be slashed
     */
    function isInactive(address user, HabitType habitType) external view returns (bool) {
        HabitStake memory stake = userStakes[user][habitType];
        if (!stake.exists || stake.stakedAmount == 0) {
            return false;
        }
        // Inactive if no activity for 3 days
        return block.timestamp > stake.lastActivity + 3 days;
    }
    
    /**
     * @dev Get user's stake info
     */
    function getStakeInfo(address user, HabitType habitType) 
        external 
        view 
        returns (
            uint256 stakedAmount,
            uint256 points,
            uint256 duration,
            uint256 currentStreak,
            PlantStatus status,
            uint256 lastActivity
        ) 
    {
        HabitStake memory stake = userStakes[user][habitType];
        return (
            stake.stakedAmount,
            stake.points,
            stake.duration,
            stake.currentStreak,
            stake.status,
            stake.lastActivity
        );
    }
    
    /**
     * @dev Get decay reward pool balance
     */
    function getDecayRewardPool() external view returns (uint256) {
        return decayRewardPool;
    }
    
    /**
     * @dev Get user profile
     */
    function getUserProfile(address user) 
        external 
        view 
        returns (
            bool initialized,
            bool hasClaimedSeed,
            uint256 totalPointsEarned,
            uint256 totalWorkoutsCompleted,
            uint256 totalQuizzesCompleted,
            uint256 totalClaimed,
            uint256 totalStaked
        )
    {
        UserProfile memory profile = userProfiles[user];
        return (
            profile.initialized,
            profile.hasClaimedSeed,
            profile.totalPointsEarned,
            profile.totalWorkoutsCompleted,
            profile.totalQuizzesCompleted,
            profile.totalClaimed,
            profile.totalStaked
        );
    }
    
    /**
     * @dev Get workout history count
     */
    function getWorkoutCount(address user, HabitType habitType) external view returns (uint256) {
        return workoutHistory[user][habitType].length;
    }
    
    /**
     * @dev Get quiz history count
     */
    function getQuizCount(address user, HabitType habitType) external view returns (uint256) {
        return quizHistory[user][habitType].length;
    }
    
    /**
     * @dev Get specific workout result
     */
    function getWorkoutResult(address user, HabitType habitType, uint256 index)
        external
        view
        returns (
            uint256 timestamp,
            uint256 duration,
            uint256 pointsEarned,
            string memory exerciseType,
            bool verified
        )
    {
        require(index < workoutHistory[user][habitType].length, "Invalid index");
        WorkoutResult memory result = workoutHistory[user][habitType][index];
        return (
            result.timestamp,
            result.duration,
            result.pointsEarned,
            result.exerciseType,
            result.verified
        );
    }
    
    /**
     * @dev Get specific quiz result
     */
    function getQuizResult(address user, HabitType habitType, uint256 index)
        external
        view
        returns (
            uint256 timestamp,
            uint8 correctAnswers,
            uint8 totalQuestions,
            uint256 pointsEarned,
            int256 pointsPenalty,
            bool verified
        )
    {
        require(index < quizHistory[user][habitType].length, "Invalid index");
        QuizResult memory result = quizHistory[user][habitType][index];
        return (
            result.timestamp,
            result.correctAnswers,
            result.totalQuestions,
            result.pointsEarned,
            result.pointsPenalty,
            result.verified
        );
    }
    
    /**
     * @dev Convert points to G$ token amount
     */
    function pointsToGToken(uint256 points) public pure returns (uint256) {
        return (points * POINTS_TO_GTOKEN_RATE) / 10**18;
    }
    
    /**
     * @dev Convert G$ token amount to points
     */
    function gTokenToPoints(uint256 amount) public pure returns (uint256) {
        return (amount * 10**18) / POINTS_TO_GTOKEN_RATE;
    }
    
    // Admin functions
    function setUBIPool(address _ubiPool) external onlyOwner {
        require(_ubiPool != address(0), "Invalid address");
        ubiPool = _ubiPool;
    }
    
    function setRewardTreasury(address _rewardTreasury) external onlyOwner {
        require(_rewardTreasury != address(0), "Invalid address");
        rewardTreasury = _rewardTreasury;
    }
    
    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Invalid address");
        verifier = _verifier;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Emergency withdraw (only owner, only when paused)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner whenPaused {
        require(token != address(0), "Invalid token");
        IGoodDollar(token).transfer(owner(), amount);
    }
}
