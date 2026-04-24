// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

// 空合约，仅用于导出 OpenZeppelin 的 proxy 类型供编译
contract _ProxyContractWrapper {
    // 这些是占位符来确保类型被编译
    TransparentUpgradeableProxy private _proxy;
    ProxyAdmin private _admin;
}
