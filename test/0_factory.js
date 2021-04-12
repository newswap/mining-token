const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const MockERC20 = artifacts.require('MockERC20');
const TokenMineFactory = artifacts.require("TokenMineFactory");

contract('TokenMineFactory', ([alice, bob, carol, dev, minter]) => {
    // beforeEach(async () => {
    // });

    it('should set correct state variables', async () => {
        this.factory = await TokenMineFactory.new(bob, {from: alice});    
        assert.equal(await this.factory.feeAddress(), bob);
    });

    it('should allow owner and only owner to setFee', async () => {   
        await expectRevert(this.factory.setFee(web3.utils.toWei('5', 'ether'), {from: dev}),'Ownable: caller is not the owner');
        await this.factory.setFee(web3.utils.toWei('5', 'ether'), {from: alice});
        assert.equal(await this.factory.fee()/1e18, 5);
    });

    it('should allow owner and only owner to setFeeAddress', async () => {   
        await expectRevert(this.factory.setFeeAddress(dev, {from: dev}),'Ownable: caller is not the owner');
        await this.factory.setFeeAddress(dev, {from: alice});
        assert.equal(await this.factory.feeAddress(), dev);
    });

    it('should allow owner and only owner to setMaxIntervalForStart', async () => {   
        await expectRevert(this.factory.setMaxIntervalForStart(1000, {from: dev}),'Ownable: caller is not the owner');
        await this.factory.setMaxIntervalForStart(1000, {from: alice});
        assert.equal(await this.factory.maxIntervalForStart(), 1000);
    });

    it('should succeed deploy tokenMine', async () => {
        const stakingToken = await MockERC20.new('SToken', 'SToken', '100000000', { from: minter });
        const rewardsToken = await MockERC20.new('RToken', 'RTokenSP', '100000000', { from: minter });
        const number = await web3.eth.getBlockNumber();
        const name = "TokenFarm"
        const startBlock = number+100
        const endBlock = number+1000
        const rewardAmount = 100

        await expectRevert(this.factory.deploy(name, stakingToken.address, 
            rewardsToken.address, startBlock+1000, endBlock, rewardAmount, 
            true, {from: bob}),'Deploy: genesis too late');

        await expectRevert(this.factory.deploy(name, stakingToken.address, 
            rewardsToken.address, startBlock, endBlock, rewardAmount, 
            true, {from: bob}),'ERC20: transfer amount exceeds balance');

        await rewardsToken.transfer(bob, '1000', { from: minter });
        await rewardsToken.approve(this.factory.address, '1000', { from: bob });
        await expectRevert(this.factory.deploy(name, stakingToken.address, 
            rewardsToken.address, startBlock, endBlock, rewardAmount, 
            true, {from: bob}),'Address: insufficient balance');

        const devBalance = await web3.eth.getBalance(dev);
        const tx = await this.factory.deploy(name, stakingToken.address, 
            rewardsToken.address, startBlock, endBlock, rewardAmount, 
            true, {from: bob,value: web3.utils.toWei('5', 'ether')});
        
        // console.log(tx)
        // console.log(tx.logs[2])
        assert.equal(tx.logs[2].args._owner, bob);
        assert.equal(tx.logs[2].args._name, name);
        assert.equal(tx.logs[2].args._stakingToken, stakingToken.address);
        assert.equal(tx.logs[2].args._rewardsToken, rewardsToken.address);
        assert.equal(tx.logs[2].args._startBlock, startBlock);
        assert.equal(tx.logs[2].args._endBlock, endBlock);
        assert.equal(tx.logs[2].args._rewardAmount, rewardAmount);
        assert.equal(tx.logs[2].args._isStakingLPToken, true);

        assert.equal(await rewardsToken.balanceOf(bob), '900');
        assert.equal(await rewardsToken.balanceOf(tx.logs[2].args._tokenMineAddress), '100');
        const devBalance2 = await web3.eth.getBalance(dev);
        assert.equal(devBalance2/1e18-devBalance/1e18, 5);
    });
});