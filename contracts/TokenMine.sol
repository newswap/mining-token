// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import './interfaces/IWETH.sol';

// TokenMine is the user-defined mining. He can distribute token and he is a fair guy.
contract TokenMine is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    // mainnet wnew address     
    address public immutable WNEW = 0xf4905b9bc02Ce21C98Eac1803693A9357D5253bf;

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
        //   1. The pool's `accTokenPerShare` (and `lastRewardTime`) gets updated.
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
    // Last timestamp that rewardsToken distribution occurs.
    uint256 public lastRewardTime;
    // Accumulated rewardsToken per share, times 1e18. See below.
    uint256 public accTokenPerShare;

    uint256 public rewardsTokenSupply;
    // reward tokens created per second.
    uint256 public rewardsTokenPerSecond;
    // owner transfer  amount of rewards token
    uint256 public rewardAmount;

    // Miner deposit stakingToken supply
    uint256 public stakingSupply = 0;

    // The timestamp when New mining finish.
    uint256 public endTime;

    bool public isOwnerWithdrawAfterEnd;

    string public name;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);

    constructor(
        address _owner,
        string memory _name,
        address _stakingToken,
        address _rewardsToken,
        uint256 _startTime, 
        uint256 _endTime,
        uint256 _rewardAmount
    ) public {
        require(_startTime >= block.timestamp, 'Deploy: genesis too soon');
        require(_endTime > _startTime, 'Deploy: endTime must be greater than startTime');

        name = _name;
        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardsToken);
        lastRewardTime = _startTime;
        endTime = _endTime;
        rewardAmount = _rewardAmount;
        rewardsTokenPerSecond = _rewardAmount.div(_endTime.sub(_startTime));
        require(rewardsTokenPerSecond > 0, 'Deploy: cannot reward 0');

        transferOwnership(_owner);
    }

    function ownerWithdrawAfterEnd() public onlyOwner {
        require(block.timestamp > endTime, 'ownerWithdrawAfterEnd: mining is not over');
        require(!isOwnerWithdrawAfterEnd, 'ownerWithdrawAfterEnd: isOwnerWithdrawAfterEnd != false');

        updatePool();
        if (rewardAmount.sub(rewardsTokenSupply) > 0) {
            isOwnerWithdrawAfterEnd = true;
            safeRewardsTokenTransfer(owner(),rewardAmount.sub(rewardsTokenSupply));
        }
    }

    // Update reward variables of the pool to be up-to-date.
    function updatePool() public {
        if (block.timestamp <= lastRewardTime) {
            return;
        }
        if (stakingSupply == 0) {
            lastRewardTime = block.timestamp;
            return;
        }

        uint256 tokenReward = getReward(lastRewardTime, block.timestamp);
        rewardsTokenSupply = rewardsTokenSupply.add(tokenReward);
        accTokenPerShare = accTokenPerShare.add(tokenReward.mul(1e18).div(stakingSupply));
        lastRewardTime = block.timestamp;
    }

    // Return reward multiplier over the given _from to _to timestamp.
    function getReward(uint256 _from, uint256 _to) public view returns (uint256) {
        if (_to <= endTime) {
            return _to.sub(_from).mul(rewardsTokenPerSecond);
        } else if (_from >= endTime) {
            return 0;
        } else {
            return endTime.sub(_from).mul(rewardsTokenPerSecond);
        }
    }

    // View function to see remaining rewards on frontend.
    function getRemainingRewards() external view returns (uint256) {
        if (block.timestamp > lastRewardTime && stakingSupply != 0) {
            uint256 tokenReward = getReward(lastRewardTime, block.timestamp);
            uint256 rewardsSupply = rewardsTokenSupply.add(tokenReward);
            return rewardAmount.sub(rewardsSupply);
        } else {
            return rewardAmount.sub(rewardsTokenSupply);
        }
    }

    ///////////////////////////////////////////////////
    //       function for Miner                      //
    ///////////////////////////////////////////////////


    function depositFor(address _user, uint256 _amount) public payable {
        UserInfo storage user = userInfo[_user];
        updatePool();
        
        uint256 pending = user.amount.mul(accTokenPerShare).div(1e18).sub(user.rewardDebt);

        if(_amount > 0) {
            if(address(stakingToken) == WNEW) {
                require(address(this).balance >= _amount, "deposit: insufficient balance");
                IWETH(WNEW).deposit{value: _amount}();
            } else {
                stakingToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            }
  
            user.amount = user.amount.add(_amount);
            stakingSupply = stakingSupply.add(_amount);
        }

        user.rewardDebt = user.amount.mul(accTokenPerShare).div(1e18);
        if(pending > 0) {
            safeRewardsTokenTransfer(_user, pending);
        }
        emit Deposit(_user, _amount);        
    }

    // Deposit LP tokens to TokenMine for token allocation.
    function deposit(uint256 _amount) public payable {
        depositFor(msg.sender, _amount);
    }

    // Withdraw LP tokens from TokenMine.
    function withdraw(uint256 _amount) public {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool();

        uint256 pending = user.amount.mul(accTokenPerShare).div(1e18).sub(user.rewardDebt);

        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            stakingSupply = stakingSupply.sub(_amount);

            if(address(stakingToken) == WNEW) {
                IWETH(WNEW).withdraw(_amount);
                Address.sendValue(msg.sender, _amount);
            } else {
                stakingToken.safeTransfer(address(msg.sender), _amount);
            }
        }

        user.rewardDebt = user.amount.mul(accTokenPerShare).div(1e18);
        if(pending > 0) {
            safeRewardsTokenTransfer(msg.sender, pending);
        }
        emit Withdraw(msg.sender, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw() public {
        UserInfo storage user = userInfo[msg.sender];
        uint256 transferAmount = user.amount;
        stakingSupply = stakingSupply.sub(transferAmount);
        user.amount = 0;
        user.rewardDebt = 0;

        if(address(stakingToken) == WNEW) {
            IWETH(WNEW).withdraw(transferAmount);
            Address.sendValue(msg.sender, transferAmount);
        } else {
            stakingToken.safeTransfer(address(msg.sender), transferAmount);
        }

        emit EmergencyWithdraw(msg.sender, transferAmount);
    }

    // View function to see pending New on frontend.
    function pendingRewardsToken(address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        uint256 accToken = accTokenPerShare;
        if (block.timestamp > lastRewardTime && stakingSupply != 0) {
            uint256 tokenReward = getReward(lastRewardTime, block.timestamp);
            accToken = accToken.add(tokenReward.mul(1e18).div(stakingSupply));
        }
        return user.amount.mul(accToken).div(1e18).sub(user.rewardDebt);
    }

    // Safe rewardsToken transfer function, just in case if rounding error causes pool to not have enough rewardsToken.
    function safeRewardsTokenTransfer(address _to, uint256 _amount) internal {
        uint256 bal = rewardsToken.balanceOf(address(this));
        if(address(rewardsToken) == address(stakingToken)) {
            bal = bal.sub(stakingSupply);
        }

        uint256 transferAmount = _amount > bal ? bal : _amount;
        if(address(rewardsToken) == WNEW) {
            IWETH(WNEW).withdraw(transferAmount);
            Address.sendValue(payable(_to), transferAmount);
        } else {            
            rewardsToken.safeTransfer(_to, transferAmount);
        }
    }

    receive () external payable { }
}