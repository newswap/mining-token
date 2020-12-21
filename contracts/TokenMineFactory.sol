// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import './TokenMine.sol';

// NewMine is the master of NewFarm. He can distribute New and he is a fair guy.
contract TokenMineFactory is Ownable {
    using SafeERC20 for IERC20;
    IERC20 public nsp;
    // deploy tokenMine fee, default 10 NSP
    uint256 public fee = 10 * 10 ** 18; 
    // fee transfer to this address
    address public feeAddress; 

    constructor(
        address _nsp,
        address _feeAddress
    ) Ownable() public {
        nsp = IERC20(_nsp);
        feeAddress = _feeAddress;
    }

    function setFee(uint256 _fee) public onlyOwner {
        fee = _fee;
    }

    function setFeeAddress(address _feeAddress) public onlyOwner {
        require(_feeAddress != address(0x0), "setFeeAddress: cannot zero address");
        feeAddress = _feeAddress;
    }

    event Deploy(address _tokenMineAddress, address _owner, string _name, address _stakingToken, address _rewardsToken, uint256 _startBlock, uint256 _endBlock, uint256 _rewardAmount, uint256 _miningFee);
    // deploy a tokenMine contract
    function deploy(string memory _name, 
        address _stakingToken, 
        address _rewardsToken, 
        uint256 _startBlock, 
        uint256 _endBlock, 
        uint256 _rewardAmount, 
        uint256 _miningFee) public returns (address) {

        address tokenMine = address(new TokenMine(msg.sender, _name, _stakingToken, _rewardsToken, _startBlock, _endBlock, _rewardAmount, _miningFee));

        IERC20(_rewardsToken).safeTransferFrom(msg.sender, tokenMine, _rewardAmount);
        nsp.safeTransferFrom(msg.sender, feeAddress, fee);  

        emit Deploy(tokenMine, msg.sender, _name, _stakingToken, _rewardsToken, _startBlock, _endBlock, _rewardAmount, _miningFee);

        return tokenMine;
    }

}
