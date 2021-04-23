const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const MockERC20 = artifacts.require('MockERC20');
const IUniswapV2Factory = artifacts.require("IUniswapV2Factory");
const TokenMineFactory = artifacts.require("TokenMineFactory");

contract('TokenMineFactory', ([alice, bob, carol, dev, minter]) => {
    // beforeEach(async () => {
    // });

    it('should set correct state variables', async () => {
        this.factory = await TokenMineFactory.new(dev, bob, {from: alice});    
        assert.equal(await this.factory.swapFactoryAddress(), dev);
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

    it('should allow owner and only owner to setSwapFactoryAddress', async () => {   
        await expectRevert(this.factory.setSwapFactoryAddress(minter, {from: dev}),'Ownable: caller is not the owner');
        await this.factory.setSwapFactoryAddress(minter, {from: alice});
        assert.equal(await this.factory.swapFactoryAddress(), minter);
    });

    it('should succeed deploy tokenMine when staking nrc6 token', async () => {
        const stakingToken = await MockERC20.new('SToken', 'SToken', '100000000', { from: minter });
        const rewardsToken = await MockERC20.new('RToken', 'RTokenSP', '100000000', { from: minter });
        const currentTimestamp = await time.latest();
        const name = "TokenFarm"
        const startTime = parseInt(currentTimestamp)+100
        const endTime = startTime+1000
        const rewardAmount = 10000

        await expectRevert(this.factory.deploy(name, stakingToken.address, 
            rewardsToken.address, startTime+1000, endTime, rewardAmount, 
            false, {from: bob}),'Deploy: genesis too late');

        await expectRevert(this.factory.deploy(name, stakingToken.address, 
            rewardsToken.address, startTime, endTime, rewardAmount, 
            false, {from: bob}),'ERC20: transfer amount exceeds balance');

        await rewardsToken.transfer(bob, '10000', { from: minter });
        await rewardsToken.approve(this.factory.address, '10000', { from: bob });
        await expectRevert(this.factory.deploy(name, stakingToken.address, 
            rewardsToken.address, startTime, endTime, rewardAmount, 
            false, {from: bob}),'Address: insufficient balance');

        const devBalance = await web3.eth.getBalance(dev);
        const tx = await this.factory.deploy(name, stakingToken.address, 
            rewardsToken.address, startTime, endTime, rewardAmount, 
            false, {from: bob,value: web3.utils.toWei('5', 'ether')});
        
        // console.log(tx)
        // console.log(tx.logs[2])
        assert.equal(tx.logs[2].args.owner, bob);
        assert.equal(tx.logs[2].args.name, name);
        assert.equal(tx.logs[2].args.stakingToken, stakingToken.address);
        assert.equal(tx.logs[2].args.rewardsToken, rewardsToken.address);
        assert.equal(tx.logs[2].args.startTime, startTime);
        assert.equal(tx.logs[2].args.endTime, endTime);
        assert.equal(tx.logs[2].args.rewardAmount, rewardAmount);
        assert.equal(tx.logs[2].args.isStakingLPToken, false);

        assert.equal(await rewardsToken.balanceOf(bob), '0');
        assert.equal(await rewardsToken.balanceOf(tx.logs[2].args.tokenMineAddress), '10000');
        const devBalance2 = await web3.eth.getBalance(dev);
        assert.equal(devBalance2/1e18-devBalance/1e18, 5);
        assert.equal(await this.factory.tokenMineCount(), 1);
    });

    it('should succeed deploy tokenMine when staking LPToken', async () => {
        // deploy tokens
        const token0 = await MockERC20.new('Token01', 'Token01', '100000000', { from: minter });
        const token1 = await MockERC20.new('Token02', 'Token02', '100000000', { from: minter });
        
        // 本地部署的UniswapV2Factory
        const swapFactoryAddress = "0x797d06150e36164494588aE0ce06920A3C9976d2"
        await this.factory.setSwapFactoryAddress(swapFactoryAddress, {from: alice});

        const uniswapV2Factory = await IUniswapV2Factory.at(swapFactoryAddress);  
        await uniswapV2Factory.createPair(token0.address, token1.address);
        const pairAddress = await uniswapV2Factory.getPair(token0.address, token1.address);
        // console.log("pairAddress: " + pairAddress);

        const rewardsToken = await MockERC20.new('RToken', 'RTokenSP', '100000000', { from: minter });
        const currentTimestamp = await time.latest();
        const name = "TokenFarm"
        const startTime = parseInt(currentTimestamp)+100
        const endTime = startTime+1000
        const rewardAmount = 10000

        await expectRevert(this.factory.deploy(name, token0.address, 
            rewardsToken.address, startTime+1000, endTime, rewardAmount, 
            true, {from: bob}),'Deploy: genesis too late');

        await expectRevert.unspecified(this.factory.deploy(name, token0.address, 
            rewardsToken.address, startTime, endTime, rewardAmount, 
            true, {from: bob}));

        await expectRevert(this.factory.deploy(name, pairAddress, 
            rewardsToken.address, startTime, endTime, rewardAmount, 
            true, {from: bob}),'ERC20: transfer amount exceeds balance');

        await rewardsToken.transfer(bob, '10000', { from: minter });
        await rewardsToken.approve(this.factory.address, '10000', { from: bob });
        await expectRevert(this.factory.deploy(name, pairAddress, 
            rewardsToken.address, startTime, endTime, rewardAmount, 
            true, {from: bob}),'Address: insufficient balance');

        const devBalance = await web3.eth.getBalance(dev);
        const tx = await this.factory.deploy(name, pairAddress, 
            rewardsToken.address, startTime, endTime, rewardAmount, 
            true, {from: bob,value: web3.utils.toWei('5', 'ether')});
        
        // console.log(tx)
        // console.log(tx.logs[2])
        assert.equal(tx.logs[2].args.owner, bob);
        assert.equal(tx.logs[2].args.name, name);
        assert.equal(tx.logs[2].args.stakingToken, pairAddress);
        assert.equal(tx.logs[2].args.rewardsToken, rewardsToken.address);
        assert.equal(tx.logs[2].args.startTime, startTime);
        assert.equal(tx.logs[2].args.endTime, endTime);
        assert.equal(tx.logs[2].args.rewardAmount, rewardAmount);
        assert.equal(tx.logs[2].args.isStakingLPToken, true);

        assert.equal(await rewardsToken.balanceOf(bob), '0');
        assert.equal(await rewardsToken.balanceOf(tx.logs[2].args.tokenMineAddress), '10000');
        const devBalance2 = await web3.eth.getBalance(dev);
        assert.equal(devBalance2/1e18-devBalance/1e18, 5);
        assert.equal(await this.factory.tokenMineCount(), 2);
    });

});