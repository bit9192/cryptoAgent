// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IAssetCustody {
    function withdraw(address token, address to, uint256 value) external;
}

contract AssetCustody {

    address private _owner;

    constructor(address _owner_) {
        _owner = _owner_;
    }

    modifier onlyOwner() {
        require(_owner == msg.sender, "Asset caller only owner");
        _;
    }

    function setOwner(address _owner_) external onlyOwner {
        _owner = _owner_;
    }

    struct Call {
        address target;
        bytes callData;
    }
    function aggregate(Call[] memory calls) public onlyOwner returns (uint256 blockNumber, bytes[] memory returnData) {
        blockNumber = block.number;
        returnData = new bytes[](calls.length);
        for(uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            require(success);
            returnData[i] = ret;
        }
    }
}
