// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// TokenMine is the master of NewFarm. He can distribute New and he is a fair guy.
contract TokenMine is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of New
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * accTokenPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accTokenPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each user that stakingToken.
    mapping (address => UserInfo) public userInfo;
    // Address of rewards token contract.
    IERC20 public rewardsToken;

    // Address of staking token contract.
    IERC20 public stakingToken;
    // Last block number that New distribution occurs.
    uint256 public lastRewardBlock;
    // Accumulated rewardsToken per share, times 1e12. See below.
    uint256 public accTokenPerShare;

    uint256 public rewardsTokenSupply;
    // reward tokens created per block.
    uint256 public rewardsTokenPerBlock;

    // The block number when New mining finish.
    uint256 public endBlock;

    string public name;
    uint256 public miningFee;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);

    constructor(
        address _owner,
        string memory _name,
        address _stakingToken,
        address _rewardsToken,
        uint256 _startBlock, 
        uint256 _endBlock,
        uint256 _rewardAmount, 
        uint256 _miningFee
    ) public {
        require(_startBlock >= block.number, 'Deploy: genesis too soon');
        require(_endBlock > _startBlock, 'Deploy: endBlock must be greater than startBlock');
        require(_rewardAmount > 0, 'Deploy: cannot reward 0');

        name = _name;
        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardsToken);
        lastRewardBlock = _startBlock;
        endBlock = _endBlock;
        rewardsTokenPerBlock = _rewardAmount.div(_endBlock.sub(_startBlock));
        miningFee = _miningFee;

        transferOwnership(_owner);
    }

    // Update reward variables of the pool to be up-to-date.
    function updatePool() public {
        if (block.number <= lastRewardBlock) {
            return;
        }
        uint256 stakingSupply = stakingToken.balanceOf(address(this));
        if (stakingSupply == 0) {
            // TODO 此处需要注释掉，否则某些区块没有人挖矿，这些区块对应的矿就永远被锁在合约里了
            // lastRewardBlock = block.number;
            return;
        }

        uint256 tokenReward = getMultiplier(lastRewardBlock, block.number);
        rewardsTokenSupply = rewardsTokenSupply.add(tokenReward);
        accTokenPerShare = accTokenPerShare.add(tokenReward.mul(1e12).div(stakingSupply));
        lastRewardBlock = block.number;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        if (_to <= endBlock) {
            return _to.sub(_from).mul(rewardsTokenPerBlock);
        } else if (_from >= endBlock) {
            return 0;
        } else {
            return endBlock.sub(_from).mul(rewardsTokenPerBlock);
        }
    }

    ///////////////////////////////////////////////////
    //       function for Miner                      //
    ///////////////////////////////////////////////////

    // 收割用这个函数或withdraw，_amount=0即可
    // Deposit LP tokens to NewMine for NEW allocation.
    function deposit(uint256 _amount) public payable {
        UserInfo storage user = userInfo[msg.sender];
        updatePool();
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(accTokenPerShare).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                safeRewardsTokenTransfer(msg.sender, pending);
            }
        }

        if(_amount > 0) {
            stakingToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }

        if(miningFee > 0){
            // TODO 确定此处owner收到了new
            Address.sendValue(address(uint160(owner())), miningFee);
        }

        user.rewardDebt = user.amount.mul(accTokenPerShare).div(1e12);
        emit Deposit(msg.sender, _amount);        
    }

    // 收割用这个函数或deposit，_amount=0即可
    // Withdraw LP tokens from NewMine.
    function withdraw(uint256 _amount) public {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool();
        uint256 pending = user.amount.mul(accTokenPerShare).div(1e12).sub(user.rewardDebt);
        if(pending > 0) {
            safeRewardsTokenTransfer(msg.sender, pending);
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            stakingToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(accTokenPerShare).div(1e12);
        emit Withdraw(msg.sender, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw() public {
        UserInfo storage user = userInfo[msg.sender];
        stakingToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // View function to see pending New on frontend.
    function pendingRewardsToken(address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        uint256 accToken = accTokenPerShare;
        uint256 lpSupply = stakingToken.balanceOf(address(this));
        if (block.number > lastRewardBlock && lpSupply != 0) {
            uint256 tokenReward = getMultiplier(lastRewardBlock, block.number);
            accToken = accToken.add(tokenReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accToken).div(1e12).sub(user.rewardDebt);
    }

    // Safe rewardsToken transfer function, just in case if rounding error causes pool to not have enough rewardsToken.
    function safeRewardsTokenTransfer(address _to, uint256 _amount) internal {
        uint256 bal = rewardsToken.balanceOf(address(this));
        if (_amount > bal) {
            stakingToken.safeTransfer(_to, bal);
        } else {
            stakingToken.safeTransfer(_to, _amount);
        }
    }
}
