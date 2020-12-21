const TokenMineFactory = artifacts.require("TokenMineFactory");
const TokenMine = artifacts.require("TokenMine");
const MockERC20 = artifacts.require("MockERC20")

module.exports = async function (deployer, network, accounts) {
  // console.log("accounts[0]:"+accounts[0]);

  // const nstAddress = "0xea8c987f9bf1688c714a5b9d9e2f4f9ef294f328"
  // const nspAddress = "0xf3FC63F6293B5E33E87351CB3bfDd21E1348a9C1"
  // const nspFeeAddress = accounts[2]

  // const nst = await MockERC20.at(nstAddress)
  // const nst_bal = await nst.balanceOf(accounts[0])
  // console.log(nst_bal/1e18)

  // const nsp = await MockERC20.at(nspAddress)
  // const nsp_bal = await nsp.balanceOf(accounts[0])
  // console.log(nsp_bal/1e18)

  // // 部署TokenMineFactory
  // await deployer.deploy(TokenMineFactory, nspAddress, nspFeeAddress)
  // const tokenMineFactory = await TokenMineFactory.deployed();
  // console.log("tokenMineFactory:"+ tokenMineFactory.address);

  // // TODO 
  // const name = "NST Mining"
  // const stakingToken = "0xffb1f3c23fe8ec28cd4e11711f6321f828f9cb60" // NST_NEW
  // const rewardsToken = nstAddress // NST
  // const startBlock = await web3.eth.getBlockNumber() + 200; // 10分钟后开启    
  // const endBlock = startBlock + 365*24*60*20; //挖一年 
  // const rewardAmount = web3.utils.toWei("10000", 'ether')
  // const miningFee = web3.utils.toWei("10", 'ether')  // 10 NEW

  // // 授权消耗nst和nsp
  // await nst.approve(tokenMineFactory.address, web3.utils.toWei("1000000000", 'ether'));
  // await nsp.approve(tokenMineFactory.address, web3.utils.toWei("1000000000", 'ether'));

  // const tx = await tokenMineFactory.deploy(name, stakingToken, rewardsToken, startBlock, endBlock, rewardAmount, miningFee)
  // // console.log(tx)
  // // console.log(tx.logs[2])
  // console.log(tx.logs[2].args)
  // const tokenMineAddress = tx.logs[2].args['_tokenMineAddress']
  // console.log("_tokenMineAddress:" + tokenMineAddress)


};

