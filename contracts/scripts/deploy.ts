import { ethers } from "hardhat";

async function main() {
  console.log("🌱 Deploying GoodCommit Staking Contract...\n");

  // GoodDollar G$ Token addresses
  const G_TOKEN_ALFAJORES = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A"; // Will Update if different on testnet
  const G_TOKEN_MAINNET = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";
  
  // Get network
  const network = await ethers.provider.getNetwork();
  const isMainnet = network.chainId === 42220n;
  
  const gTokenAddress = isMainnet ? G_TOKEN_MAINNET : G_TOKEN_ALFAJORES;
  
  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
  console.log(`G$ Token Address: ${gTokenAddress}\n`);
  
  // For testnet, use deployer address as UBI pool and treasury
  // For mainnet, use actual GoodDollar UBI pool address
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} CELO\n`);
  
  // TODO: Update these addresses for mainnet deployment
  const ubiPoolAddress = isMainnet 
    ? "0x0000000000000000000000000000000000000000" // Replace with actual GoodDollar UBI pool
    : deployer.address; // Use deployer for testnet
    
  const rewardTreasuryAddress = deployer.address; // Can be multisig later
  
  // Deploy contract
  const GoodCommitStaking = await ethers.getContractFactory("GoodCommitStaking");
  const staking = await GoodCommitStaking.deploy(
    gTokenAddress,
    ubiPoolAddress,
    rewardTreasuryAddress
  );
  
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  
  console.log("✅ GoodCommitStaking deployed to:", stakingAddress);
  console.log(`   UBI Pool: ${ubiPoolAddress}`);
  console.log(`   Reward Treasury: ${rewardTreasuryAddress}\n`);
  
  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    stakingContract: stakingAddress,
    gToken: gTokenAddress,
    ubiPool: ubiPoolAddress,
    rewardTreasury: rewardTreasuryAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };
  
  console.log("📝 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  
  console.log("\n⚠️  Next Steps:");
  console.log("1. Save the contract address to your frontend config");
  console.log("2. Approve the staking contract to spend G$ tokens");
  console.log("3. Fund the reward treasury with G$ for yield distribution");
  if (isMainnet) {
    console.log("4. Update UBI pool address to actual GoodDollar UBI contract");
    console.log("5. Consider transferring ownership to a multisig");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
