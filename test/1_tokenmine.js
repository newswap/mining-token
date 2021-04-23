const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const MockERC20 = artifacts.require('MockERC20');
const TokenMineFactory = artifacts.require("TokenMineFactory");
const TokenMine = artifacts.require("TokenMine");

contract('TokenMine', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.stakingToken = await MockERC20.new('SToken', 'SToken', '100000000', { from: minter });
        this.rewardsToken = await MockERC20.new('RToken', 'RTokenSP', '100000000', { from: minter });
        this.factory = await TokenMineFactory.new(minter, dev, {from: minter});
        await this.factory.setFee(web3.utils.toWei('1', 'ether'), {from: minter});

        await this.rewardsToken.transfer(alice, '1000000', { from: minter });
        await this.rewardsToken.approve(this.factory.address, '1000000', { from: alice });
        await this.stakingToken.transfer(bob, '1000', { from: minter });
        await this.stakingToken.transfer(carol, '1000', { from: minter });
        await this.stakingToken.transfer(dev, '1000', { from: minter });
    });

    it('should set correct state variables', async () => {
        const name = "TokenFarm"
        const timestamp = parseInt(await time.latest());
        const startTime = timestamp+100
        const endTime = startTime+300
        const rewardAmount = 1000000

        const aliceBalance = await web3.eth.getBalance(alice);
        const devBalance = await web3.eth.getBalance(dev);
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startTime, endTime, rewardAmount, 
            false, {from: alice, value: web3.utils.toWei('1', 'ether')});
        // console.log(tx)
        // console.log(tx.logs[2])
        const tokenMineAddress = tx.logs[2].args.tokenMineAddress;      
        const aliceBalance2 = await web3.eth.getBalance(alice);
        const devBalance2 = await web3.eth.getBalance(dev);
        assert.equal(parseInt(aliceBalance/1e18-aliceBalance2/1e18), 1);
        assert.equal(parseInt(devBalance2/1e18-devBalance/1e18), 1);
        assert.equal(await this.rewardsToken.balanceOf(alice), '0');
        assert.equal(await this.rewardsToken.balanceOf(tokenMineAddress), rewardAmount);

        this.tokenMine = await TokenMine.at(tokenMineAddress);
        assert.equal(await this.tokenMine.owner(), alice);
        assert.equal(await this.tokenMine.name(), name);
        assert.equal(await this.tokenMine.stakingToken(), this.stakingToken.address);
        assert.equal(await this.tokenMine.rewardsToken(), this.rewardsToken.address);
        assert.equal(await this.tokenMine.lastRewardTime(), startTime);
        assert.equal(await this.tokenMine.endTime(), endTime);
        assert.equal((await this.tokenMine.rewardsTokenPerSecond()).valueOf(), '3333');
    });

    it('should allow emergency withdraw', async () => {
        const name = "TokenFarm"
        const timestamp = parseInt(await time.latest());
        const startTime = timestamp+100
        const rewardAmount = 100000
        // 100 per second farming rate starting at startTime with bonus until startTime+1000
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startTime, startTime+1000, rewardAmount, 
            false, {from: alice, value: web3.utils.toWei('1', 'ether')});

        this.tokenMine = await TokenMine.at(tx.logs[2].args.tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);
        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        
        await this.tokenMine.deposit('100', { from: bob});
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '900');
        await this.tokenMine.emergencyWithdraw({ from: bob });
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '1000');
    });

    it('should give out token only after farming time', async () => {
        let timestamp = parseInt(await time.latest());
        const name = "TokenFarm"
        const startTime = timestamp+100
        const rewardAmount = 100000
        // 100 per second farming rate starting at startTime with bonus until startTime+500
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startTime, startTime+1000, rewardAmount, 
            false, {from: alice, value: web3.utils.toWei('1', 'ether')});
        this.tokenMine = await TokenMine.at(tx.logs[2].args.tokenMineAddress);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        await this.tokenMine.deposit('100', { from: bob});

        await time.increaseTo(timestamp+90)
        await this.tokenMine.deposit('0', { from: bob }); // Harvest   timestamp+90
        assert.equal(parseInt(await time.latest()), timestamp+90)
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '0');
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        await time.increaseTo(timestamp+95)
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '0');
        await time.increaseTo(timestamp+100)
        await this.tokenMine.deposit('0', { from: bob }); // timestamp+100
        assert.equal(parseInt(await time.latest()), timestamp+100)
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), 0);
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        await time.increaseTo(timestamp+105)
        await this.tokenMine.deposit('0', { from: bob }); // timestamp+105
        assert.equal(parseInt(await time.latest()), timestamp+105)
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), (parseInt(await time.latest())-startTime)*100);
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), (parseInt(await time.latest())-startTime)*100);
        await time.increaseTo(timestamp+110)
        await this.tokenMine.deposit('0', { from: bob }); // timestamp+110
        assert.equal(parseInt(await time.latest()), timestamp+110)
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '1000');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '1000');
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '900');
        assert.equal((await this.stakingToken.balanceOf(this.tokenMine.address)).valueOf(), '100');
    });

    it('should not distribute token if no one deposit', async () => {
        let timestamp = parseInt(await time.latest());
        const name = "TokenFarm"
        const startTime = timestamp+100
        const rewardAmount = 100000
        // 100 per second farming rate starting at startTime with bonus until startTime+1000
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startTime, startTime+1000, rewardAmount, 
            false, {from: alice, value: web3.utils.toWei('1', 'ether')}); 
        this.tokenMine = await TokenMine.at(tx.logs[2].args.tokenMineAddress);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        await time.increaseTo(timestamp+99)
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '0');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount);
        await time.increaseTo(timestamp+104);
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount);
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '0');
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        await time.increaseTo(timestamp+110);
        await this.tokenMine.deposit('100', { from: bob}); // timestamp+110
        assert.equal(parseInt(await time.latest()), timestamp+110)
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount);
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '0');
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '900');
        assert.equal((await this.stakingToken.balanceOf(this.tokenMine.address)).valueOf(), '100');

        await time.increaseTo(timestamp+120);
        await this.tokenMine.withdraw('90', { from: bob }); // timestamp+120
        assert.equal(parseInt(await time.latest()), timestamp+120)
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount-1000);
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '1000');
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '990');
        assert.equal((await this.stakingToken.balanceOf(this.tokenMine.address)).valueOf(), '10');
    });

    it('should distribute token properly for each staker', async () => {
        let timestamp = parseInt(await time.latest());
        const name = "TokenFarm"
        const startTime = timestamp+100
        const rewardAmount = 1000000
        // 1000 per second farming rate starting at startTime with bonus until startTime+1000
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startTime, startTime+1000, rewardAmount, 
            false, {from: alice, value: web3.utils.toWei('1', 'ether')});
        this.tokenMine = await TokenMine.at(tx.logs[2].args.tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: dev });
        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: carol });
        // dev deposits 10 LPs at time+110
        await time.increaseTo(timestamp+110);
        await this.tokenMine.deposit('10', { from: dev}); // number+110
        assert.equal(parseInt(await time.latest()), timestamp+110)
        // Bob deposits 20 LPs at time+114
        await time.increaseTo(timestamp+114);
        await this.tokenMine.deposit('20', { from: bob}); 
        assert.equal(parseInt(await time.latest()), timestamp+114)
        // Carol deposits 30 LPs at time+118
        await time.increaseTo(timestamp+118);
        await this.tokenMine.deposit('30', { from: carol}); 
        assert.equal(parseInt(await time.latest()), timestamp+118)

        // dev deposits 10 more LPs at time+120. At this point:
        //   dev should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
        //   tokenMine should have the remaining: 1000000 - 5666 = 994900
        await time.increaseTo(timestamp+120);
        await this.tokenMine.deposit('10', { from: dev}); 
        assert.equal(parseInt(await time.latest()), timestamp+120)
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(dev)).valueOf(), '5666');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '0');
        assert.equal((await this.rewardsToken.balanceOf(carol)).valueOf(), '0');
        assert.equal(parseInt((await this.rewardsToken.balanceOf(this.tokenMine.address))), rewardAmount-5666);

        // Bob withdraws 5 LPs at time+ 130. At this point:
        //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
        await time.increaseTo(timestamp+130);
        await this.tokenMine.withdraw('10', { from: bob });
        assert.equal(parseInt(await time.latest()), timestamp+130)
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '20000');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '6190');
        assert.equal((await this.rewardsToken.balanceOf(carol)).valueOf(), '0');
        assert.equal(parseInt((await this.rewardsToken.balanceOf(this.tokenMine.address))), rewardAmount-5666-6190);
        // carol should have: 2*3/6*1000 + 10*3/7*1000=5286
        assert.equal((await this.tokenMine.pendingRewardsToken(carol)).valueOf(), '5286');
        // dev should have: 10*2/7*1000=2857
        assert.equal((await this.tokenMine.pendingRewardsToken(dev)).valueOf(), '2857');

        // dev withdraws all LPs at time+140.
        // Bob withdraws all LPs at time+150.
        // Carol withdraws all LPs at time+160.
        await time.increaseTo(timestamp+140);
        await this.tokenMine.withdraw('20', { from: dev });
        assert.equal(parseInt(await time.latest()), timestamp+140)
        await time.increaseTo(timestamp+150);
        await this.tokenMine.withdraw('10', { from: bob });
        assert.equal(parseInt(await time.latest()), timestamp+150)
        await time.increaseTo(timestamp+160);
        await this.tokenMine.withdraw('30', { from: carol });
        assert.equal(parseInt(await time.latest()), timestamp+160)

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

    it('should stop giving bonus token after the endTime', async () => {     
        let timestamp = parseInt(await time.latest());
        const name = "TokenFarm"
        const startTime = timestamp+100
        const endTime = startTime + 10
        const rewardAmount = 10000
        // 1000 per second farming rate starting at startTime with bonus until startTime+10
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startTime, endTime, rewardAmount, 
            false, {from: alice, value: web3.utils.toWei('1', 'ether')});
        this.tokenMine = await TokenMine.at(tx.logs[2].args.tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        // bob deposits 10 LPs at timestamp+ 100
        await time.increaseTo(timestamp+100);
        await this.tokenMine.deposit('10', { from: bob}); // timestamp+100
        assert.equal(parseInt(await time.latest()), timestamp+100)

        await time.increaseTo(timestamp+105);
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '5000');
        assert.equal(parseInt(await time.latest()), timestamp+105)

        // At timestamp+ 110, stop giving bonus token
        await time.increaseTo(timestamp+110);
        await this.tokenMine.deposit('0', { from: bob}); // timestamp+110
        assert.equal(parseInt(await time.latest()), timestamp+110)
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), '0');
        await time.increaseTo(timestamp+120);
        await this.tokenMine.deposit('0', { from: bob}); // timestamp+120
        assert.equal(parseInt(await time.latest()), timestamp+120)
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), '0');
        await time.increaseTo(timestamp+130);
        await this.tokenMine.withdraw('10', { from: bob}); // timestamp+130
        assert.equal(parseInt(await time.latest()), timestamp+130)
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '10000');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '10000');
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '1000');    
    });

    it('should allow owner withdraw after mining over', async () => {     
        let timestamp = parseInt(await time.latest());
        const name = "TokenFarm"
        const startTime = timestamp+100
        const endTime = startTime + 30
        const rewardAmount = 10000
        // 333 per second farming rate starting at startTime with bonus until startTime+30
        const tx = await this.factory.deploy(name, this.stakingToken.address, 
            this.rewardsToken.address, startTime, endTime, rewardAmount, 
            false, {from: alice, value: web3.utils.toWei('1', 'ether')});
        
        this.tokenMine = await TokenMine.at(tx.logs[2].args.tokenMineAddress);
        assert.equal((await this.tokenMine.rewardsTokenPerSecond()).valueOf(), '333');
        assert.equal((await this.tokenMine.endTime()).valueOf(), endTime);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        // bob deposits 10 LPs at timestamp 105
        await time.increaseTo(timestamp+105);
        await this.tokenMine.deposit('10', { from: bob}); // number+105
        assert.equal(parseInt(await time.latest()), timestamp+105)

        await time.increaseTo(timestamp+110);
        assert.equal(parseInt(await time.latest()), timestamp+110)
        // bob should have: 5*333 = 1665
        assert.equal(parseInt(await this.tokenMine.pendingRewardsToken(bob)), '1665');

        // At timestamp 120, withdraw all staking token
        await time.increaseTo(timestamp+120);
        await this.tokenMine.withdraw('5', { from: bob}); // number+120
        assert.equal(parseInt(await time.latest()), timestamp+120)
        // bob should have: 15*333 = 4995
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '4995');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '4995');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount-4995);
    
        // owner withdraw LPs before mining over
        await expectRevert(this.tokenMine.ownerWithdrawAfterEnd({from: alice}),'ownerWithdrawAfterEnd: mining is not over')
        // mining is over
        await time.increaseTo(timestamp+131);
        assert.equal(parseInt(await time.latest()), timestamp+131)
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
