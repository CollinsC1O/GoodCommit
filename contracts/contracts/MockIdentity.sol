// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockIdentity {
    mapping(address => bool)    private _verified;
    mapping(address => address) private _roots;

    function setVerified(address account, bool status) external {
        _verified[account] = status;
    }

    function setRoot(address account, address root) external {
        _roots[account] = root;
    }

    function getWhitelistedRoot(address account) external view returns (address) {
        if (!_verified[account]) return address(0);
        address customRoot = _roots[account];
        return customRoot != address(0) ? customRoot : account;
    }

    function isWhitelisted(address account) external view returns (bool) {
        return _verified[account];
    }
}
