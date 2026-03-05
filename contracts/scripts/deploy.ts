import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

async function main() {
  console.log("🌱 Deploying GoodCommit Staking Contract...\n");

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "CELO\n");

  // Check balance
  if (balance < ethers.parseEther("0.01")) {
    console.error("❌ Insufficient balance! Need at least 0.01 CELO for gas");
    process.exit(1);
  }

  // Get addresses from environment
  const gTokenAddress = process.env.GTOKEN_ADDRESS;
  const ubiPoolAddress = process.env.UBI_POOL_ADDRESS;
  const rewardTreasuryAddress = process.env.REWARD_TREASURY_ADDRESS;
  const verifierAddress = process.env.VERIFIER_ADDRESS;

  // Validate addresses
  if (!gTokenAddress || !ubiPoolAddress || !rewardTreasuryAddress || !verifierAddress) {
    console.error("❌ Missing required environment variables!");
    console.log("Required: GTOKEN_ADDRESS, UBI_POOL_ADDRESS, REWARD_TREASURY_ADDRESS, VERIFIER_ADDRESS");
    process.exit(1);
  }

  console.log("Deployment Configuration:");
  console.log("├─ G$ Token:", gTokenAddress);
  console.log("├─ UBI Pool:", ubiPoolAddress);
  console.log("├─ Reward Treasury:", rewardTreasuryAddress);
  console.log("└─ Verifier:", verifierAddress);
  console.log();

  // Deploy GoodCommitStaking
  console.log("📦 Deploying GoodCommitStaking...");
  const GoodCommitStaking = await ethers.getContractFactory("GoodCommitStaking");
  
  const staking = await GoodCommitStaking.deploy(
    gTokenAddress,
    ubiPoolAddress,
    rewardTreasuryAddress,
    verifierAddress
  );

  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();

  console.log("✅ GoodCommitStaking deployed to:", stakingAddress);
  console.log();

  // Get network info
  const network = await ethers.provider.getNetwork();
  
  // Create deployment info object
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    contracts: {
      GoodCommitStaking: stakingAddress,
      GToken: gTokenAddress,
    },
    addresses: {
      deployer: deployer.address,
      ubiPool: ubiPoolAddress,
      rewardTreasury: rewardTreasuryAddress,
      verifier: verifierAddress,
    },
    timestamp: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  // Print to console
  console.log("📝 Deployment Summary:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log();

  // ============================================
  // 💾 SAVE TO FILE (NEW!)
  // ============================================
  
  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
    console.log("📁 Created deployments directory");
  }

  // Save to network-specific file
  const networkName = network.name === "unknown" ? `chain-${network.chainId}` : network.name;
  const deploymentFile = path.join(deploymentsDir, `${networkName}.json`);
  
  fs.writeFileSync(
    deploymentFile,
    JSON.stringify(deploymentInfo, null, 2),
    "utf-8"
  );
  
  console.log(`💾 Deployment info saved to: ${deploymentFile}`);
  console.log();

  // Also save to a timestamped file (history)
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const historyFile = path.join(deploymentsDir, `${networkName}-${timestamp}.json`);
  
  fs.writeFileSync(
    historyFile,
    JSON.stringify(deploymentInfo, null, 2),
    "utf-8"
  );
  
  console.log(`📜 History saved to: ${historyFile}`);
  console.log();

  // ============================================
  // Print next steps
  // ============================================
  
  console.log("🎯 Next Steps:");
  console.log("1. Fund reward treasury with G$ tokens");
  console.log("2. Approve staking contract from treasury:");
  console.log(`   gToken.approve("${stakingAddress}", amount)`);
  console.log("3. Update frontend config with contract address");
  console.log("4. Update backend .env with contract address and verifier key");
  console.log("5. Verify contract on CeloScan:");
  console.log(`   npx hardhat verify --network alfajores ${stakingAddress} ${gTokenAddress} ${ubiPoolAddress} ${rewardTreasuryAddress} ${verifierAddress}`);
  console.log();
  console.log("📂 Deployment files saved in: contracts/deployments/");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
