// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IGoodDollar.sol";

/**
 * @title GoodCommitStaking
 * @dev Stake-to-improve contract for GoodCommit habit tracking
 * Users stake G$ tokens on habits. Success = rewards. Failure = slashing to UBI pool.
 */
contract GoodCommitStaking is ReentrancyGuard, Pausable, Ownable {
    IGoodDollar public immutable gToken;
    
    // UBI pool address (where slashed funds go)
    address public ubiPool;
    
    // Reward treasury (where successful user rewards come from)
    address public rewardTreasury;
    
    // Slashing distribution: 60% to UBI, 40% to reward pool
    uint256 public constant UBI_SLASH_PERCENTAGE = 60;
    uint256 public constant REWARD_POOL_PERCENTAGE = 40;
    
    // Daily reward rate for mature plants (in basis points, 100 = 1%)
    uint256 public dailyYieldRate = 50; // 0.5% daily yield
    
    enum HabitType { Health, Academics, Focus }
    enum PlantStatus { Active, Mature, Withered, Harvested }
    
    struct HabitStake {
        address user;
        HabitType habitType;
        uint256 stakedAmount;
        uint256 duration; // in days
        uint256 startTime;
        uint256 lastCheckIn;
        uint256 currentStreak;
        PlantStatus status;
        uint256 accumulatedRewards;
        bool exists;
    }
    
    // Mapping: user => habitType => HabitStake
    mapping(address => mapping(HabitType => HabitStake)) public userStakes;
    
    // Track total staked per user
    mapping(address => uint256) public totalStakedByUser;
    
    // Track total slashed to UBI
    uint256 public totalSlashedToUBI;
    
    // Events
    event StakePlanted(address indexed user, HabitType habitType, uint256 amount, uint256 duration);
    event CheckInCompleted(address indexed user, HabitType habitType, uint256 newStreak);
    event PlantMatured(address indexed user, HabitType habitType);
    event StakeSlashed(address indexed user, HabitType habitType, uint256 slashedAmount);
    event RewardsHarvested(address indexed user, HabitType habitType, uint256 amount);
    event PlantWithered(address indexed user, HabitType habitType);
    
    constructor(
        address _gToken,
        address _ubiPool,
        address _rewardTreasury
    ) {
        require(_gToken != address(0), "Invalid G$ token address");
        require(_ubiPool != address(0), "Invalid UBI pool address");
        require(_rewardTreasury != address(0), "Invalid reward treasury");
        
        gToken = IGoodDollar(_gToken);
        ubiPool = _ubiPool;
        rewardTreasury = _rewardTreasury;
    }
    
    /**
     * @dev Plant a new habit seed by staking G$
     */
    function plantSeed(
        HabitType habitType,
        uint256 amount,
        uint256 durationInDays
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Stake amount must be > 0");
        require(durationInDays == 7 || durationInDays == 14 || durationInDays == 30, "Invalid duration");
        require(!userStakes[msg.sender][habitType].exists, "Habit already planted");
        
        // Transfer G$ from user to contract
        require(gToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        // Create new stake
        userStakes[msg.sender][habitType] = HabitStake({
            user: msg.sender,
            habitType: habitType,
            stakedAmount: amount,
            duration: durationInDays,
            startTime: block.timestamp,
            lastCheckIn: block.timestamp,
            currentStreak: 0,
            status: PlantStatus.Active,
            accumulatedRewards: 0,
            exists: true
        });
        
        totalStakedByUser[msg.sender] += amount;
        
        emit StakePlanted(msg.sender, habitType, amount, durationInDays);
    }
    
    /**
     * @dev Check in daily habit completion (called by backend after verification)
     */
    function checkIn(address user, HabitType habitType) external onlyOwner {
        HabitStake storage stake = userStakes[user][habitType];
        require(stake.exists, "No stake found");
        require(stake.status == PlantStatus.Active || stake.status == PlantStatus.Mature, "Invalid status");
        
        // Check if check-in is within valid time window (24-48 hours since last)
        require(block.timestamp >= stake.lastCheckIn + 1 days, "Too early to check in");
        require(block.timestamp <= stake.lastCheckIn + 2 days, "Missed check-in window");
        
        stake.currentStreak++;
        stake.lastCheckIn = block.timestamp;
        
        emit CheckInCompleted(user, habitType, stake.currentStreak);
        
        // Check if plant should mature
        if (stake.currentStreak >= stake.duration && stake.status == PlantStatus.Active) {
            stake.status = PlantStatus.Mature;
            emit PlantMatured(user, habitType);
        }
        
        // If mature, accumulate daily yield
        if (stake.status == PlantStatus.Mature) {
            uint256 dailyYield = (stake.stakedAmount * dailyYieldRate) / 10000;
            stake.accumulatedRewards += dailyYield;
        }
    }
    
    /**
     * @dev Slash stake for missed check-in or cheating
     */
    function slashStake(address user, HabitType habitType) external onlyOwner {
        HabitStake storage stake = userStakes[user][habitType];
        require(stake.exists, "No stake found");
        require(stake.status != PlantStatus.Withered, "Already withered");
        
        uint256 slashAmount = stake.stakedAmount;
        
        // Calculate distribution
        uint256 toUBI = (slashAmount * UBI_SLASH_PERCENTAGE) / 100;
        uint256 toRewardPool = slashAmount - toUBI;
        
        // Transfer slashed funds
        require(gToken.transfer(ubiPool, toUBI), "UBI transfer failed");
        require(gToken.transfer(rewardTreasury, toRewardPool), "Reward pool transfer failed");
        
        totalSlashedToUBI += toUBI;
        totalStakedByUser[user] -= stake.stakedAmount;
        
        stake.status = PlantStatus.Withered;
        stake.stakedAmount = 0;
        
        emit StakeSlashed(user, habitType, slashAmount);
        emit PlantWithered(user, habitType);
    }
    
    /**
     * @dev Harvest accumulated rewards
     */
    function harvestRewards(HabitType habitType) external nonReentrant {
        HabitStake storage stake = userStakes[msg.sender][habitType];
        require(stake.exists, "No stake found");
        require(stake.status == PlantStatus.Mature, "Plant not mature");
        require(stake.accumulatedRewards > 0, "No rewards to harvest");
        
        uint256 rewards = stake.accumulatedRewards;
        stake.accumulatedRewards = 0;
        
        // Transfer rewards from treasury
        require(gToken.transferFrom(rewardTreasury, msg.sender, rewards), "Reward transfer failed");
        
        emit RewardsHarvested(msg.sender, habitType, rewards);
    }
    
    /**
     * @dev Unstake after completion (returns original stake)
     */
    function unstake(HabitType habitType) external nonReentrant {
        HabitStake storage stake = userStakes[msg.sender][habitType];
        require(stake.exists, "No stake found");
        require(stake.status == PlantStatus.Mature, "Must complete streak first");
        require(stake.accumulatedRewards == 0, "Harvest rewards first");
        
        uint256 amount = stake.stakedAmount;
        totalStakedByUser[msg.sender] -= amount;
        
        stake.status = PlantStatus.Harvested;
        stake.exists = false;
        
        // Return original stake
        require(gToken.transfer(msg.sender, amount), "Unstake transfer failed");
    }
    
    /**
     * @dev Get user's stake info
     */
    function getStakeInfo(address user, HabitType habitType) 
        external 
        view 
        returns (
            uint256 stakedAmount,
            uint256 duration,
            uint256 currentStreak,
            PlantStatus status,
            uint256 accumulatedRewards,
            uint256 lastCheckIn
        ) 
    {
        HabitStake memory stake = userStakes[user][habitType];
        return (
            stake.stakedAmount,
            stake.duration,
            stake.currentStreak,
            stake.status,
            stake.accumulatedRewards,
            stake.lastCheckIn
        );
    }
    
    /**
     * @dev Check if check-in is overdue
     */
    function isCheckInOverdue(address user, HabitType habitType) external view returns (bool) {
        HabitStake memory stake = userStakes[user][habitType];
        if (!stake.exists || stake.status == PlantStatus.Withered || stake.status == PlantStatus.Harvested) {
            return false;
        }
        return block.timestamp > stake.lastCheckIn + 2 days;
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
    
    function setDailyYieldRate(uint256 _rate) external onlyOwner {
        require(_rate <= 1000, "Rate too high"); // Max 10%
        dailyYieldRate = _rate;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
}
