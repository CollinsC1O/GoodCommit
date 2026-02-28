// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStakingContract {
    function resolveHabit(
        address user,
        uint256 habitId,
        bool successful
    ) external;
}

contract GamificationEngine {
    address public owner;
    address public stakingContract;

    address public ubiPool;
    address public treasury;

    event GoodFruitMinted(
        address indexed user,
        uint256 habitId,
        uint256 amount
    );
    event PlantMatured(address indexed user, uint256 habitId);

    constructor(address _ubiPool, address _treasury) {
        owner = msg.sender;
        ubiPool = _ubiPool;
        treasury = _treasury;
    }

    function setStakingContract(address _stakingContract) external {
        require(msg.sender == owner, "Only owner");
        stakingContract = _stakingContract;
    }

    // Represents the daily check-in backed by off-chain sensor ORACLE
    function dailyCheckIn(
        address user,
        uint256 habitId,
        bool success
    ) external {
        require(msg.sender == owner, "Only verified oracle/backend");

        // Let's assume the user failed their check-in
        if (!success) {
            // Calls the staking contract to slash
            IStakingContract(stakingContract).resolveHabit(
                user,
                habitId,
                false
            );
        } else {
            // Logic to track streak, if streak == duration -> resolve as successful
            // For MVP simplicity, let's say one successful check-in matures it for testing
            IStakingContract(stakingContract).resolveHabit(user, habitId, true);
        }
    }

    function mintGoodFruit(address user, uint256 habitId) external {
        require(msg.sender == stakingContract, "Only StakingContract");

        emit PlantMatured(user, habitId);
        // Minting logic for daily G$ micro yield would go here
        emit GoodFruitMinted(user, habitId, 10 * 10 ** 18); // 10 G$ daily yield mock
    }
}
