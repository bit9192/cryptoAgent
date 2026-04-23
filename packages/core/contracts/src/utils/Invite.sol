// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Invite {
    /// @dev sponsor[users] = sponsor
    mapping(address => address) public sponsor; 
    /// @notice sponsor's users
    mapping(address => address[]) public userOfsponsor;
    /// @notice bind sponsor event
    event Bindsponsor(address indexed user, address indexed sponsor);

    /// @notice bind sponsor
    function _bind(address _user, address _sponsor) internal {
        sponsor[_user] = _sponsor;
        userOfsponsor[_sponsor].push(_user);
        emit Bindsponsor(_user, _sponsor);
    }

    /// @notice check user is bind sponsor
    function _checkUnbind(address _user, address _sponsor) internal view returns(bool _noBinded) {
        /// @dev user binded , sponsor can't be change sponsor
        _noBinded = sponsor[_user] == address(0);
        /// @dev sponsor can't be zero address
        /// @dev check sponsor is exist
        require(!_noBinded || sponsor[_sponsor] != address(0), "sponsor not exist");
    }

    /// @notice safe bind sponsor, if user is binded, sponsor can't be change, if user not binded, sponsor have to had sponsor
    function _safeBind(address _user, address _sponsor) internal {
        if (_checkUnbind(_user,_sponsor)) {
            _bind(_user, _sponsor);
        }
    }

    /// @notice change sponsor, new sponsor's sponsor cann't equel user
    function _changeSponsor(address _user, address _newSponsor) internal {
        require(_user != address(0), "Invalid user");
        require(_newSponsor != _user, "User cannot sponsor themselves");
        sponsor[_user] = _newSponsor;
        emit Bindsponsor(_user, _newSponsor);
        // Check for circular sponsor relationships
        while(_newSponsor != address(0)) {
            require(_user != sponsor[_newSponsor], "New sponsor causes circular relationship");
            _newSponsor = sponsor[_newSponsor];
        }
    }
    
    /// @notice Fix the user assignment if they are not under the correct sponsor.
    function fixSponsor(address _sponsor) external {
        address[] storage _users = userOfsponsor[_sponsor];
        uint256 i = 0;
        while (i < _users.length) {
            address _user = _users[i];
            if (sponsor[_user] != _sponsor) {
                _users[i] = _users[_users.length - 1];
                _users.pop();
            }
            else {
                i++;
            }
        }
    }

    function userOfsponsorList(address _user) external view returns(address[] memory) {
        return userOfsponsor[_user];
    }
}