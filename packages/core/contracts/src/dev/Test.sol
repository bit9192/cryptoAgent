// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IToken {
    function approve(address, uint) external;
    function transfer(address, uint) external;
    function allowance(address, address) external view returns(uint);
    function transferFrom(address, address, uint) external;
    function balanceOf(address) external view returns(uint);
    function totalSupply() external view returns(uint);
}

contract ERC20 {

    uint public totalSupply;
    mapping(address => uint) internal _balanceOf;
    mapping(address => mapping(address => uint)) public allowance;

    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    function _mint(address to, uint value) internal {
        totalSupply += value;
        _balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint value) internal {
        _balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    function _approve(
        address owner,
        address spender,
        uint value
    ) internal virtual {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function _transfer(
        address from,
        address to,
        uint value
    ) internal virtual {
        _balanceOf[from] -= value;
        _balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function balanceOf(address user) external virtual view returns(uint) {
        return _balanceOf[user];
    }

    function approve(address spender, uint value) external {
        _approve(msg.sender, spender, value);
    }

    function transfer(address to, uint value) external {
        _transfer(msg.sender, to, value);
    }
    
    function transferFrom(
        address from,
        address to,
        uint value
    ) external {
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= value, "Insufficient Allowance");
            allowance[from][msg.sender] -= value;
        }
        _transfer(from, to, value);
    }
}


contract TEST11111 is ERC20 {


    constructor() {
        _mint(msg.sender, 1000 * 10 ** 18);
    }
    
    function name() public pure returns(string memory) {
        return "test";
    }

    function symbol() public pure returns(string memory) {
        return "test";
    }

    function decimals() public pure returns(uint8) {
        return 18;
    }

    function burn(uint amount) external {
        _burn(msg.sender, amount);
    }

    function mint(address to, uint amount) public {
        _mint(to, amount);
    }
}

contract Test2 {
    struct User {
        string name;
        uint age;
    }

    User[] private _users;

    constructor() {
        for(uint i = 0; i < 10; i++) {
            User memory user = User(string(abi.encodePacked("User", uint2str(i))), 20 + i);
            _users.push(user);
        }
    }

    function uint2str(uint _i) internal pure returns (string memory _uintAsString) {
        if (_i == 0) {
            return "0";
        }
        uint j = _i;
        uint len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    function test() external pure returns(User memory) {
        return User("Alice", 30);
    }

    function users() external view returns(User[] memory, uint) {
        return (_users, _users.length);
    }
}


contract Test3 {
    struct User {
        string name;
        uint age;
    }

    User[] private _users;

    constructor() {
        for(uint i = 0; i < 10; i++) {
            User memory user = User(string(abi.encodePacked("User", uint2str(i))), 20 + i);
            _users.push(user);
        }
    }

    function uint2str(uint _i) internal pure returns (string memory _uintAsString) {
        if (_i == 0) {
            return "0";
        }
        uint j = _i;
        uint len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    function test() external pure returns(User memory) {
        return User("Alice", 30);
    }

    function users() external view returns(User[] memory, uint) {
        return (_users, _users.length);
    }
}

