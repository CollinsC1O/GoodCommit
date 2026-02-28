// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IGoodDollar
 * @dev Interface for GoodDollar G$ token
 */
interface IGoodDollar is IERC20 {
    function burn(uint256 amount) external;
}
