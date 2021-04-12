const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const MockERC20 = artifacts.require('MockERC20');
const TokenMineFactory = artifacts.require("TokenMineFactory");
const TokenMine = artifacts.require("TokenMine");

contract('TokenMine', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.stakingToken = await MockERC20.new('SToken', 'SToken', '100000000', { from: minter });
        this.rewardsToken = await MockERC20.new('RToken', 'RTokenSP', '100000000', { from: minter });
        this.factory = await TokenMineFactory.new(dev, {from: minter});
        await this.factory.setFee(web3.utils.toWei('5', 'ether'), {from: minter});

        await this.rewardsToken.transfer(alice, '1000000', { from: minter });
        await this.rewardsToken.approve(this.factory.address, '1000000', { from: alice });
        await this.stakingToken.transfer(bob, '1000', { from: minter });
        await this.stakingToken.transfer(carol, '1000', { from: minter });
        await this.stakingToken.transfer(dev, '1000', { from: minter });
    });

    it('should set correct state variables', async () => {
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const endBlock = startBlock+500
        const rewardAmount = 1000000

        const aliceBalance = await web3.eth.getBalance(alice);
        const devBalance = await web3.eth.getBalance(dev);
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startBlock, endBlock, rewardAmount, 
            true, {from: alice, value: web3.utils.toWei('5', 'ether')});
        // console.log(tx)
        // console.log(tx.logs[2])
        const tokenMineAddress = tx.logs[2].args._tokenMineAddress;      
        const aliceBalance2 = await web3.eth.getBalance(alice);
        const devBalance2 = await web3.eth.getBalance(dev);
        assert.equal(parseInt(aliceBalance/1e18-aliceBalance2/1e18), 5);
        assert.equal(parseInt(devBalance2/1e18-devBalance/1e18), 5);
        assert.equal(await this.rewardsToken.balanceOf(alice), '0');
        assert.equal(await this.rewardsToken.balanceOf(tokenMineAddress), rewardAmount);

        this.tokenMine = await TokenMine.at(tokenMineAddress);
        assert.equal(await this.tokenMine.owner(), alice);
        assert.equal(await this.tokenMine.name(), name);
        assert.equal(await this.tokenMine.stakingToken(), this.stakingToken.address);
        assert.equal(await this.tokenMine.rewardsToken(), this.rewardsToken.address);
        assert.equal(await this.tokenMine.lastRewardBlock(), startBlock);
        assert.equal(await this.tokenMine.endBlock(), endBlock);
        assert.equal((await this.tokenMine.rewardsTokenPerBlock()).valueOf(), '2000');
    });

    it('should allow emergency withdraw', async () => {
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const rewardAmount = 100000
        // 100 per block farming rate starting at startBlock with bonus until block startBlock+1000
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startBlock, startBlock+1000, rewardAmount, 
            true, {from: alice, value: web3.utils.toWei('5', 'ether')});

        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);
        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        
        await this.tokenMine.deposit('100', { from: bob});
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '900');
        await this.tokenMine.emergencyWithdraw({ from: bob });
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '1000');
    });

    it('should give out token only after farming time', async () => {
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const rewardAmount = 100000
        // 100 per block farming rate starting at startBlock with bonus until block startBlock+500
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startBlock, startBlock+1000, rewardAmount, 
            true, {from: alice, value: web3.utils.toWei('5', 'ether')});
        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        await this.tokenMine.deposit('100', { from: bob});
        await time.advanceBlockTo(number+89);
        await this.tokenMine.deposit('0', { from: bob }); // Harvest   block number+90
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '0');
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        await time.advanceBlockTo(number+94);
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '0');
        await time.advanceBlockTo(number+99);
        await this.tokenMine.deposit('0', { from: bob }); // block number+100
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), 0);
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        await time.advanceBlockTo(number+100);
        await this.tokenMine.deposit('0', { from: bob }); // block number+101
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '100');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '100');
        await time.advanceBlockTo(number+104);
        await this.tokenMine.deposit('0', { from: bob }); // block 105
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '500');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '500');
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '900');
        assert.equal((await this.stakingToken.balanceOf(this.tokenMine.address)).valueOf(), '100');
    });

    it('should not distribute token if no one deposit', async () => {
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const rewardAmount = 100000
        // 100 per block farming rate starting at startBlock with bonus until block startBlock+500
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startBlock, startBlock+1000, rewardAmount, 
            true, {from: alice, value: web3.utils.toWei('5', 'ether')}); 
        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        await time.advanceBlockTo(number+99);
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '0');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount);
        await time.advanceBlockTo(number+104);
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount);
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '0');
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        await time.advanceBlockTo(number+109);
        await this.tokenMine.deposit('100', { from: bob}); // block 110
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount);
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '0');
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '900');
        assert.equal((await this.stakingToken.balanceOf(this.tokenMine.address)).valueOf(), '100');
        await time.advanceBlockTo(number+119);
        await this.tokenMine.withdraw('90', { from: bob }); // block 120
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount-1000);
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '1000');
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '990');
        assert.equal((await this.stakingToken.balanceOf(this.tokenMine.address)).valueOf(), '10');

        await time.advanceBlockTo(number+130);
        await this.tokenMine.deposit('10', { from: bob}); // block 110
    });

    it('should distribute token properly for each staker', async () => {
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const rewardAmount = 1000000
        // 1000 per block farming rate starting at startBlock with bonus until block startBlock+500
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startBlock, startBlock+1000, rewardAmount, 
            true, {from: alice, value: web3.utils.toWei('5', 'ether')});
        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: dev });
        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: carol });
        // dev deposits 10 LPs at block 110
        await time.advanceBlockTo(number+109);
        await this.tokenMine.deposit('10', { from: dev}); // number+110
        // Bob deposits 20 LPs at block 114
        await time.advanceBlockTo(number+113);
        await this.tokenMine.deposit('20', { from: bob}); 
        // Carol deposits 30 LPs at block 118
        await time.advanceBlockTo(number+117);
        await this.tokenMine.deposit('30', { from: carol}); 

        // dev deposits 10 more LPs at block 120. At this point:
        //   dev should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
        //   tokenMine should have the remaining: 1000000 - 5666 = 994900
        await time.advanceBlockTo(number+119)
        await this.tokenMine.deposit('10', { from: dev}); 
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(dev)).valueOf(), '5666');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '0');
        assert.equal((await this.rewardsToken.balanceOf(carol)).valueOf(), '0');
        assert.equal(parseInt((await this.rewardsToken.balanceOf(this.tokenMine.address))), rewardAmount-5666);

        // Bob withdraws 5 LPs at block 330. At this point:
        //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
        await time.advanceBlockTo(number+129)
        await this.tokenMine.withdraw('10', { from: bob });
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '20000');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '6190');
        assert.equal((await this.rewardsToken.balanceOf(carol)).valueOf(), '0');
        assert.equal(parseInt((await this.rewardsToken.balanceOf(this.tokenMine.address))), rewardAmount-5666-6190);
        // carol should have: 2*3/6*1000 + 10*3/7*1000=5286
        assert.equal((await this.tokenMine.pendingRewardsToken(carol)).valueOf(), '5286');
        // dev should have: 10*2/7*1000=2857
        assert.equal((await this.tokenMine.pendingRewardsToken(dev)).valueOf(), '2857');

        // dev withdraws all LPs at block 140.
        // Bob withdraws all LPs at block 150.
        // Carol withdraws all LPs at block 160.
        await time.advanceBlockTo(number+139)
        await this.tokenMine.withdraw('20', { from: dev });
        await time.advanceBlockTo(number+149)
        await this.tokenMine.withdraw('10', { from: bob });
        await time.advanceBlockTo(number+159)
        await this.tokenMine.withdraw('30', { from: carol });
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '50000');
        // dev should have: 5666 + 10*2/7*1000 + 10*2/6*1000 = 11856
        assert.equal((await this.rewardsToken.balanceOf(dev)).valueOf(), '11856');
        // Bob should have: 6190 + 10*1/6*1000 + 10*1/4*1000 = 10356
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '10356');
        // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6*1000 + 10*3/4*1000 + 10*1000 = 27786
        assert.equal((await this.rewardsToken.balanceOf(carol)).valueOf(), '27786');

        // All of them should have 1000 LPs back.
        assert.equal((await this.stakingToken.balanceOf(dev)).valueOf(), '1000');
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '1000');
        assert.equal((await this.stakingToken.balanceOf(carol)).valueOf(), '1000');
    });

    it('should stop giving bonus token after the endblock', async () => {     
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const endBlock = startBlock + 10
        const rewardAmount = 10000
        // 1000 per block farming rate starting at startBlock with bonus until block startBlock+10
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startBlock, endBlock, rewardAmount, 
            true, {from: alice, value: web3.utils.toWei('5', 'ether')});
        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        // bob deposits 10 LPs at block 100
        await time.advanceBlockTo(number+99);
        await this.tokenMine.deposit('10', { from: bob}); // number+100
        await time.advanceBlockTo(number+105);
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '5000');
        // At block 110, stop giving bonus token
        await time.advanceBlockTo(number+109);
        await this.tokenMine.deposit('0', { from: bob}); // number+110
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), '0');
        await time.advanceBlockTo(number+119);
        await this.tokenMine.deposit('0', { from: bob}); // number+120
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), '0');
        await time.advanceBlockTo(number+129);
        await this.tokenMine.withdraw('10', { from: bob}); // number+130
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '10000');
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '1000');    
    });

    it('should allow owner withdraw after mining over', async () => {     
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const endBlock = startBlock + 30
        const rewardAmount = 10000
        // 333 per block farming rate starting at startBlock with bonus until block startBlock+30
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startBlock, endBlock, rewardAmount, 
            true, {from: alice, value: web3.utils.toWei('5', 'ether')});
        
        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);
        assert.equal((await this.tokenMine.rewardsTokenPerBlock()).valueOf(), '333');
        assert.equal((await this.tokenMine.endBlock()).valueOf(), endBlock);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        // bob deposits 10 LPs at block 105
        await time.advanceBlockTo(number+104);
        await this.tokenMine.deposit('10', { from: bob}); // number+105
        await time.advanceBlockTo(number+110);
        // bob should have: 5*333 = 1665
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '1665');
        // At block 120, withdraw all staking token
        await time.advanceBlockTo(number+119);
        await this.tokenMine.withdraw('5', { from: bob}); // number+120
        // bob should have: 15*333 = 4995
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '4995');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '4995');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount-4995);
    
        // owner withdraw LPs before mining over
        await expectRevert(this.tokenMine.ownerWithdrawAfterEnd({from: alice}),'ownerWithdrawAfterEnd: mining is not over')
        // mining is over
        await time.advanceBlockTo(number+130)
        await expectRevert(this.tokenMine.ownerWithdrawAfterEnd({from: bob}),'Ownable: caller is not the owner')     
        const aliceRTBal = await this.rewardsToken.balanceOf(alice).valueOf()
        await this.tokenMine.ownerWithdrawAfterEnd({from: alice})
        const aliceRTBal2 = await this.rewardsToken.balanceOf(alice).valueOf()
        assert.equal(aliceRTBal2-aliceRTBal, 1675);
        
        // bob should have: 25*333= 8325
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '8325');
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '3330');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '4995');
        await this.tokenMine.withdraw('5', { from: bob});
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '1000');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '8325');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '8325');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), '0');
        assert.equal((await this.stakingToken.balanceOf(this.tokenMine.address)).valueOf(), '0');

        await expectRevert(this.tokenMine.ownerWithdrawAfterEnd({from: alice}),'ownerWithdrawAfterEnd: isOwnerWithdrawAfterEnd != false')
    });

});
