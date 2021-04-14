const TokenMineFactory = artifacts.require("TokenMineFactory");
const TokenMine = artifacts.require("TokenMine");
const MockERC20 = artifacts.require("MockERC20")

module.exports = async function (deployer, network, accounts) {
  console.log("accounts[0]:"+accounts[0]);
  const feeAddress = accounts[0]

  // // deploy TokenMineFactory 
  // const swapFactory = "0xef296e56b52cca904d75d396c017cef6d04a025c" //testnet
  // await deployer.deploy(TokenMineFactory, swapFactory, feeAddress)
  // const tokenMineFactory = await TokenMineFactory.deployed();
  // console.log("tokenMineFactory:"+ tokenMineFactory.address);

  // // testnet
  // const name = "NUSDT Mining"
  // const stakingToken = "0xf8a2db7aecac5968a68677f7b1aef2dd20a03ffb" // NUSDT_NEW
  // const rewardsToken = "0xc01a73fbf1c1953d18b48518259b36d70b07f277" //nusdt
  // const startBlock = await web3.eth.getBlockNumber() + 200; // 10分钟后开启    
  // const endBlock = startBlock + 365*24*60*20; //挖一年 
  // const rewardAmount = 1000*1000000
  // const isStakingLPToken = true

  // const nusdt = await MockERC20.at(rewardsToken)
  // const bal = await nusdt.balanceOf(accounts[0])
  // console.log(bal/1e6)
  // // // // 授权tokenMineFactory
  // await nusdt.approve(tokenMineFactory.address, web3.utils.toWei("1000000000", 'ether'));

  // const tx = await tokenMineFactory.deploy(name, stakingToken, rewardsToken, startBlock, endBlock, rewardAmount, isStakingLPToken, {value: web3.utils.toWei("100000", 'ether')})
  // // console.log(tx)
  // // console.log(tx.logs[0])
  // // console.log(tx.logs[1])
  // // console.log(tx.logs[2])
  // // console.log(tx.logs[2].args)
  // const tokenMineAddress = tx.logs[2].args['tokenMineAddress']
  // console.log("tokenMineAddress:" + tokenMineAddress)

  // testnet    block number:1037652
  // tokenMineFactory: 0x55090157f082b48317e76c7E845987dDa168cBce
  // NUSDT Mining _tokenMineAddress: 0x510819209D9B63511272e1Be5251418F9BEE8729
};

