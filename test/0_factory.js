const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const MockERC20 = artifacts.require('MockERC20');
const TokenMineFactory = artifacts.require("TokenMineFactory");

contract('TokenMineFactory', ([alice, bob, carol, dev, minter]) => {
    // beforeEach(async () => {
    // });

    it('should set correct state variables', async () => {
        this.nsp = await MockERC20.new('NSP', 'NSP', '100000000', { from: minter });
        this.factory = await TokenMineFactory.new(this.nsp.address, bob, {from: alice});
        
        assert.equal(await this.factory.nsp(), this.nsp.address);
        assert.equal((await this.factory.fee())/1e18, 10);
        assert.equal(await this.factory.feeAddress(), bob);
    });

    it('should allow owner and only owner to setFee', async () => {   
        await expectRevert(this.factory.setFee('100', {from: dev}),'Ownable: caller is not the owner');
        await this.factory.setFee('100', {from: alice});

        assert.equal(await this.factory.fee(), '100');
    });

    it('should allow owner and only owner to setFeeAddress', async () => {   
        await expectRevert(this.factory.setFeeAddress(dev, {from: dev}),'Ownable: caller is not the owner');
        await this.factory.setFeeAddress(dev, {from: alice});
        assert.equal(await this.factory.feeAddress(), dev);
    });
  
    it('should succeed deploy tokenMine', async () => {
        const stakingToken = await MockERC20.new('SToken', 'SToken', '100000000', { from: minter });
        const rewardsToken = await MockERC20.new('RToken', 'RTokenSP', '100000000', { from: minter });
        await this.nsp.transfer(bob, '1000', { from: minter });
        await this.nsp.approve(this.factory.address, '1000', { from: bob });
        await rewardsToken.transfer(bob, '1000', { from: minter });
        await rewardsToken.approve(this.factory.address, '1000', { from: bob });

        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const endBlock = number+1000
        const rewardAmount = 100
        const miningFee = 10
        const tx = await this.factory.deploy(name, stakingToken.address, rewardsToken.address, startBlock, endBlock, rewardAmount, miningFee, {from: bob});
        // console.log(tx)
        // console.log(tx.logs[2])
        assert.equal(tx.logs[2].args._owner, bob);
        assert.equal(tx.logs[2].args._name, name);
        assert.equal(tx.logs[2].args._stakingToken, stakingToken.address);
        assert.equal(tx.logs[2].args._rewardsToken, rewardsToken.address);
        assert.equal(tx.logs[2].args._startBlock, startBlock);
        assert.equal(tx.logs[2].args._endBlock, endBlock);
        assert.equal(tx.logs[2].args._rewardAmount, rewardAmount);
        assert.equal(tx.logs[2].args._miningFee, miningFee);

        assert.equal(await this.nsp.balanceOf(bob), '900');
        assert.equal(await this.nsp.balanceOf(dev), '100');
        assert.equal(await rewardsToken.balanceOf(bob), '900');
        assert.equal(await rewardsToken.balanceOf(tx.logs[2].args._tokenMineAddress), '100');
    });
});
