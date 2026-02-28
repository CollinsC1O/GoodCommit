// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GamificationEngine } from "./GamificationEngine.sol";

contract StakingContract {
    address public gDollarToken; // Mock G$ Token for now or actual G$ Token on Celo
    GamificationEngine public engine;

    struct HabitData {
        uint256 stakedAmount;
        uint256 startTime;
        uint256 duration;
        bool isActive;
        string habitType; // e.g. "fitness", "academics"
    }

    mapping(address => mapping(uint256 => HabitData)) public userHabits;
    mapping(address => uint256) public nextHabitId;

    event HabitStarted(address indexed user, uint256 habitId, uint256 amount, string habitType);
    event HabitEnded(address indexed user, uint256 habitId, bool successful);

    constructor(address _gDollarToken, address _engine) {
        gDollarToken = _gDollarToken;
        engine = GamificationEngine(_engine);
    }

    function setEngine(address _engine) external {
        engine = GamificationEngine(_engine);
    }

    function startHabit(uint256 amount, uint256 duration, string memory habitType) external {
        require(amount > 0, "Must stake some G$");
        require(duration > 0, "Duration must be > 0");
        
        // Mock transfer (in reality we would use IERC20(gDollarToken).transferFrom)
        // IERC20(gDollarToken).transferFrom(msg.sender, address(this), amount);

        uint256 habitId = nextHabitId[msg.sender]++;
        userHabits[msg.sender][habitId] = HabitData({
            stakedAmount: amount,
            startTime: block.timestamp,
            duration: duration,
            isActive: true,
            habitType: habitType
        });

        emit HabitStarted(msg.sender, habitId, amount, habitType);
    }

    // This function will be called by the GamificationEngine after verifying off-chain oracle/sensor logic
    function resolveHabit(address user, uint256 habitId, bool successful) external {
        require(msg.sender == address(engine), "Only GamificationEngine can resolve");
        
        HabitData storage habit = userHabits[user][habitId];
        require(habit.isActive, "Habit not active");
        
        habit.isActive = false;

        if (successful) {
            // Give back stake and grant GoodFruit reward via Engine
            // IERC20(gDollarToken).transfer(user, habit.stakedAmount);
            engine.mintGoodFruit(user, habitId);
        } else {
            // Slash stake -> send part to UBI pool, part to treasury
            // uint256 slashAmount = habit.stakedAmount;
            // IERC20(gDollarToken).transfer(engine.ubiPool(), slashAmount / 2);
            // IERC20(gDollarToken).transfer(engine.treasury(), slashAmount / 2);
        }

        emit HabitEnded(user, habitId, successful);
    }
}
