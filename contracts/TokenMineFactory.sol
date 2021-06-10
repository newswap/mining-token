// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import './interfaces/IUniswapV2Factory.sol';
import './interfaces/IUniswapV2Pair.sol';
import './interfaces/IWETH.sol';
import './TokenMine.sol';

// TokenMineFactory is the deployer of tokenMine
contract TokenMineFactory is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    // mainnet wnew address     
    address public immutable WNEW = 0xf4905b9bc02Ce21C98Eac1803693A9357D5253bf;
    // deploy tokenMine fee, default 100000 NEW
    uint256 public fee = 100000 * 10 ** 18; 
    // fee transfer to this address
    address payable public feeAddress; 

    uint256 public maxIntervalForStart = 30 days;

    address public swapFactoryAddress;

    uint256 public tokenMineCount;

    constructor(
        address _swapFactoryAddress,
        address payable _feeAddress
    ) public {
        swapFactoryAddress = _swapFactoryAddress;
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

    function setSwapFactoryAddress(address _swapFactoryAddress) public onlyOwner {
        require(_swapFactoryAddress != address(0x0), "setSwapFactoryAddress: cannot zero address");
        swapFactoryAddress = _swapFactoryAddress;
    }

    event Deploy(address tokenMineAddress, address owner, string name, address stakingToken, 
                    address rewardsToken, uint256 startTime, uint256 endTime, uint256 rewardAmount, bool isStakingLPToken);
    
    // deploy a tokenMine contract
    function deploy(string memory _name, 
        address _stakingToken, 
        address _rewardsToken, 
        uint256 _startTime, 
        uint256 _endTime, 
        uint256 _rewardAmount, 
        bool _isStakingLPToken) public payable returns (address) {
        require(_startTime.sub(block.timestamp) <= maxIntervalForStart, 'Deploy: genesis too late');

        if(_isStakingLPToken) {
            IUniswapV2Pair pair = IUniswapV2Pair(_stakingToken);
            IUniswapV2Factory factory = IUniswapV2Factory(swapFactoryAddress);
            
            require(factory.getPair(pair.token0(),pair.token1()) == address(pair), "Deploy: stakingToken isn't LPToken");
        }

        address tokenMine = address(new TokenMine(msg.sender, _name, _stakingToken, _rewardsToken, _startTime, _endTime, _rewardAmount));
        if(_rewardsToken == WNEW) {
            IWETH(WNEW).deposit{value: _rewardAmount}();
            assert(IWETH(WNEW).transfer(tokenMine, _rewardAmount));
        } else {
            IERC20(_rewardsToken).safeTransferFrom(msg.sender, tokenMine, _rewardAmount);
        }
 
        Address.sendValue(feeAddress, fee);
        tokenMineCount = tokenMineCount.add(1);
        
        emit Deploy(tokenMine, msg.sender, _name, _stakingToken, _rewardsToken, _startTime, _endTime, _rewardAmount, _isStakingLPToken);

        return tokenMine;
    }
}