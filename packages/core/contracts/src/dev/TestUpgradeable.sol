//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract TestUpgradeable1 is Initializable, OwnableUpgradeable {
	uint256 public value;
	string public name;
	string public name1;
    address public addr;

	function initialize(string memory _name, uint256 _value) external initializer {
		__Ownable_init(msg.sender);
		name = _name;
		value = _value;
	}

	function setValue(uint256 _value) external onlyOwner {
		value = _value;
	}

    function setAddr() external {
        addr = msg.sender;
    }

	function setName(string calldata _name) external onlyOwner {
		name = _name;
	}

	function version() external pure virtual returns (string memory) {
		return "v1";
	}

    function aa() external pure returns (uint256) {
        return 30000000 * 1 ether;
    }
}

