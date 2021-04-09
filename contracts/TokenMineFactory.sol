// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import './TokenMine.sol';

// TokenMineFactory is the deployer of tokenMine
contract TokenMineFactory is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    // deploy tokenMine fee, default 100000 NEW
    uint256 public fee = 100000 * 10 ** 18; 
    // fee transfer to this address
    address payable public feeAddress; 
    // 30 days
    uint256 public maxIntervalForStart = 30 * 28800;

    constructor(
        address payable _feeAddress
    ) public {
        feeAddress = _feeAddress;
    }

    function setFee(uint256 _fee) public onlyOwner {
        fee = _fee;
    }

    function setFeeAddress(address payable _feeAddress) public onlyOwner {
        require(_feeAddress != address(0x0), "setFeeAddress: cannot zero address");
        feeAddress = _feeAddress;
    }

    function setMaxIntervalForStart(uint256 _maxIntervalForStart) public onlyOwner {
        maxIntervalForStart = _maxIntervalForStart;
    }

    event Deploy(address _tokenMineAddress, address _owner, string _name, address _stakingToken, 
                    address _rewardsToken, uint256 _startBlock, uint256 _endBlock, uint256 _rewardAmount, bool _isStakingLPToken);
    
    // deploy a tokenMine contract
    function deploy(string memory _name, 
        address _stakingToken, 
        address _rewardsToken, 
        uint256 _startBlock, 
        uint256 _endBlock, 
        uint256 _rewardAmount, 
        bool _isStakingLPToken) public payable returns (address) {
        require(_startBlock.sub(block.number) <= maxIntervalForStart, 'Deploy: genesis too late');

        address tokenMine = address(new TokenMine(msg.sender, _name, _stakingToken, _rewardsToken, _startBlock, _endBlock, _rewardAmount));
        IERC20(_rewardsToken).safeTransferFrom(msg.sender, tokenMine, _rewardAmount);
        Address.sendValue(feeAddress, fee);

        emit Deploy(tokenMine, msg.sender, _name, _stakingToken, _rewardsToken, _startBlock, _endBlock, _rewardAmount, _isStakingLPToken);

        return tokenMine;
    }
}