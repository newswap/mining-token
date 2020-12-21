const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const MockERC20 = artifacts.require('MockERC20');
const TokenMineFactory = artifacts.require("TokenMineFactory");
const TokenMine = artifacts.require("TokenMine");

contract('TokenMine', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.nsp = await MockERC20.new('NSP', 'NSP', web3.utils.toWei('1000', 'ether'), { from: minter });
        this.stakingToken = await MockERC20.new('SToken', 'SToken', '100000000', { from: minter });
        this.rewardsToken = await MockERC20.new('RToken', 'RTokenSP', '100000000', { from: minter });
        this.factory = await TokenMineFactory.new(this.nsp.address, dev, {from: minter});

        await this.nsp.transfer(alice, web3.utils.toWei('100', 'ether'), { from: minter });
        await this.nsp.approve(this.factory.address, web3.utils.toWei('100', 'ether'), { from: alice });
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
        const miningFee = web3.utils.toWei('1', 'ether')
        const tx = await this.factory.deploy(name, this.stakingToken.address, this.rewardsToken.address, startBlock, endBlock, rewardAmount, miningFee, {from: alice});
        // console.log(tx)
        // console.log(tx.logs[2])
        const tokenMineAddress = tx.logs[2].args._tokenMineAddress;
        assert.equal((await this.nsp.balanceOf(alice))/1e18, '90');
        assert.equal((await this.nsp.balanceOf(dev))/1e18, '10');
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
        assert.equal((await this.tokenMine.miningFee()).valueOf(), miningFee);
    });

    it('should allow emergency withdraw', async () => {
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const rewardAmount = 100000
        const miningFee = web3.utils.toWei('1', 'ether')
        // 100 per block farming rate starting at startBlock with bonus until block startBlock+1000
        const tx = await this.factory.deploy(name, this.stakingToken.address, this.rewardsToken.address, startBlock, startBlock+1000, rewardAmount, miningFee, {from: alice});
        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);
        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        
        const bobBalance = await web3.eth.getBalance(bob);
        const bobTX = await this.tokenMine.deposit('100', { from: bob, value: miningFee});
        var bobTXUsed = parseInt(bobTX.receipt.gasUsed) * 20000000000;
        assert.equal(parseInt((Number(bobBalance)+bobTXUsed-await web3.eth.getBalance(bob))/1e18),miningFee/1e18)
        assert.equal((await web3.eth.getBalance(alice)).valueOf(), Number(aliceBalance)+Number(miningFee));

        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '900');
        await this.tokenMine.emergencyWithdraw({ from: bob });
        assert.equal((await this.stakingToken.balanceOf(bob)).valueOf(), '1000');
    });

    it('should give out token only after farming time', async () => {
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const rewardAmount = 100000
        const miningFee = web3.utils.toWei('1', 'ether')
        // 100 per block farming rate starting at startBlock with bonus until block startBlock+500
        const tx = await this.factory.deploy(name, this.stakingToken.address, this.rewardsToken.address, startBlock, startBlock+1000, rewardAmount, miningFee, {from: alice});
        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        await this.tokenMine.deposit('100', { from: bob, value: miningFee});
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
        assert.equal((await web3.eth.getBalance(alice)).valueOf(), Number(aliceBalance)+Number(miningFee));
    });

    it('should not distribute token if no one deposit', async () => {
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const rewardAmount = 100000
        const miningFee = web3.utils.toWei('1', 'ether')
        // 100 per block farming rate starting at startBlock with bonus until block startBlock+500
        const tx = await this.factory.deploy(name, this.stakingToken.address, this.rewardsToken.address, startBlock, startBlock+1000, rewardAmount, miningFee, {from: alice});
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
        await this.tokenMine.deposit('100', { from: bob, value: miningFee}); // block 110
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
        await this.tokenMine.deposit('10', { from: bob, value: miningFee}); // block 110
        assert.equal((await web3.eth.getBalance(alice)).valueOf(), Number(aliceBalance)+ 2*Number(miningFee));
    });

    it('should distribute token properly for each staker', async () => {
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const rewardAmount = 1000000
        const miningFee = web3.utils.toWei('1', 'ether')
        // 1000 per block farming rate starting at startBlock with bonus until block startBlock+500
        const tx = await this.factory.deploy(name, this.stakingToken.address, this.rewardsToken.address, startBlock, startBlock+1000, rewardAmount, miningFee, {from: alice});
        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: dev });
        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: carol });
        // dev deposits 10 LPs at block 110
        await time.advanceBlockTo(number+109);
        await this.tokenMine.deposit('10', { from: dev, value: miningFee}); // number+110
        // Bob deposits 20 LPs at block 114
        await time.advanceBlockTo(number+113);
        await this.tokenMine.deposit('20', { from: bob, value: miningFee}); 
        // Carol deposits 30 LPs at block 118
        await time.advanceBlockTo(number+117);
        await this.tokenMine.deposit('30', { from: carol, value: miningFee}); 

        // dev deposits 10 more LPs at block 120. At this point:
        //   dev should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
        //   tokenMine should have the remaining: 1000000 - 5666 = 994900
        await time.advanceBlockTo(number+119)
        await this.tokenMine.deposit('10', { from: dev, value: miningFee}); 
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
  
        assert.equal((await web3.eth.getBalance(alice)).valueOf(), Number(aliceBalance)+ 4*Number(miningFee));
    });

    it('should stop giving bonus token after the endblock', async () => {     
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const endBlock = startBlock + 10
        const rewardAmount = 10000
        const miningFee = web3.utils.toWei('1', 'ether')
        // 1000 per block farming rate starting at startBlock with bonus until block startBlock+10
        const tx = await this.factory.deploy(name, this.stakingToken.address, this.rewardsToken.address, startBlock, endBlock, rewardAmount, miningFee, {from: alice});
        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);
        const aliceBalance = await web3.eth.getBalance(alice);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        // bob deposits 10 LPs at block 100
        await time.advanceBlockTo(number+99);
        await this.tokenMine.deposit('10', { from: bob, value: miningFee}); // number+100
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
        assert.equal((await web3.eth.getBalance(alice)).valueOf(), Number(aliceBalance)+ Number(miningFee));
    });

    it('should extend endblock if stakingSupply == 0', async () => {     
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const endBlock = startBlock + 30
        const rewardAmount = 10000
        const miningFee = web3.utils.toWei('1', 'ether')
        // 333 per block farming rate starting at startBlock with bonus until block startBlock+30
        const tx = await this.factory.deploy(name, this.stakingToken.address, this.rewardsToken.address, startBlock, endBlock, rewardAmount, miningFee, {from: alice});
        this.tokenMine = await TokenMine.at(tx.logs[2].args._tokenMineAddress);
        assert.equal((await this.tokenMine.rewardsTokenPerBlock()).valueOf(), '333');
        assert.equal((await this.tokenMine.endBlock()).valueOf(), endBlock);
        const aliceBalance = await web3.eth.getBalance(alice);

        await this.stakingToken.approve(this.tokenMine.address, '1000', { from: bob });
        // bob deposits 10 LPs at block 105
        await time.advanceBlockTo(number+104);
        await this.tokenMine.deposit('10', { from: bob, value: miningFee}); // number+105
        // extend endblock + 5 => number+135
        assert.equal((await this.tokenMine.endBlock()).valueOf(), number+135);
        await time.advanceBlockTo(number+110);
        // dev should have: 5*333 = 1665
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '1665');
        // At block 120, withdraw all staking token
        await time.advanceBlockTo(number+119);
        await this.tokenMine.withdraw('10', { from: bob}); // number+120
        // dev should have: 15*333 = 4995
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '4995');
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '4995');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), rewardAmount-4995);
        // bob deposits 10 LPs at block 140
        await time.advanceBlockTo(number+139);
        await this.tokenMine.deposit('10', { from: bob, value: miningFee}); // number+140
        // extend endblock + 20  =》 number+155
        assert.equal((await this.tokenMine.endBlock()).valueOf(), number+155);
        await time.advanceBlockTo(number+153);
        await this.tokenMine.withdraw('10', { from: bob}); // number+154
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '9657');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '9657');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), '343');

        await time.advanceBlockTo(number+154);
        await this.tokenMine.deposit('10', { from: bob, value: miningFee}); // number+155
        // extend endblock + 1  =》 number+156
        assert.equal((await this.tokenMine.endBlock()).valueOf(), number+156);
        await time.advanceBlockTo(number+159);
        await this.tokenMine.withdraw('10', { from: bob}); // number+160
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '9990');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '9990');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), '10');

        // stop giving bonus token 
        await time.advanceBlockTo(number+169);
        await this.tokenMine.deposit('10', { from: bob, value: miningFee}); // number+170  
        assert.equal((await this.tokenMine.endBlock()).valueOf(), number+156);
        await time.advanceBlockTo(number+179);
        assert.equal((await this.tokenMine.pendingRewardsToken(bob)).valueOf(), '0');
        await this.tokenMine.withdraw('10', { from: bob}); // number+180
        assert.equal((await this.tokenMine.endBlock()).valueOf(), number+156);
        assert.equal((await this.tokenMine.rewardsTokenSupply()).valueOf(), '9990');
        assert.equal((await this.rewardsToken.balanceOf(bob)).valueOf(), '9990');
        assert.equal((await this.rewardsToken.balanceOf(this.tokenMine.address)).valueOf(), '10');
  

        assert.equal((await web3.eth.getBalance(alice)).valueOf(), Number(aliceBalance)+ 4*Number(miningFee));
    });

});
