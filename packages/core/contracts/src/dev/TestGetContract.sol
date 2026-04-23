// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract TestGetContract {
	uint256 public number;

	event NumberChanged(uint256 previousValue, uint256 newValue, address indexed caller);

	constructor(uint256 initialValue) payable {
		number = initialValue;
	}

	function setNumber(uint256 newValue) external {
		uint256 oldValue = number;
		number = newValue;
		emit NumberChanged(oldValue, newValue, msg.sender);
	}

	function add(uint256 value) external {
		uint256 oldValue = number;
		number = oldValue + value;
		emit NumberChanged(oldValue, number, msg.sender);
	}

	function version() external pure returns (string memory) {
		return "normal-v1";
	}

	receive() external payable {}
}

contract TestGetContractUpgradeable is Initializable, OwnableUpgradeable {
	uint256 public number;

	event NumberChanged(uint256 previousValue, uint256 newValue, address indexed caller);

	function initialize(uint256 initialValue) external initializer {
		__Ownable_init(msg.sender);
		number = initialValue;
	}

	function setNumber(uint256 newValue) external onlyOwner {
		uint256 oldValue = number;
		number = newValue;
		emit NumberChanged(oldValue, newValue, msg.sender);
	}

	function version() external pure virtual returns (string memory) {
		return "upgradable-v1";
	}

	receive() external payable {}
}

contract TestGetContractUpgradeableV2 is TestGetContractUpgradeable {
	/// @custom:oz-upgrades-validate-as-initializer
	function initializeV2() external reinitializer(2) {
		// reserved for future migration fields
	}

	function increment() external onlyOwner {
		uint256 oldValue = number;
		number = oldValue + 1;
		emit NumberChanged(oldValue, number, msg.sender);
	}

	function version() external pure override returns (string memory) {
		return "upgradable-v2";
	}
}
