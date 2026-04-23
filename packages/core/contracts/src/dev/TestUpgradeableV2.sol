//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TestUpgradeable.sol";

contract TestUpgradeableV123 is TestUpgradeable1 {
    /// @custom:oz-upgrades-validate-as-initializer
    function initializeV2() external reinitializer(2) {
        // 预留 V2 初始化逻辑
        __Ownable_init(msg.sender);
    }

    function increment() external onlyOwner {
        value += 1;
    }

    function version() external pure override returns (string memory) {
        return "v2";
    }
}
