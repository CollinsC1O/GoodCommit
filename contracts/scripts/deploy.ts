import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

async function main() {
  console.log("🌱 Deploying GoodCommit Staking Contract (V3)...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "CELO\n");

  if (balance < ethers.parseEther("0.1")) {
    console.error("❌ Insufficient balance! Need at least 0.1 CELO for gas");
    process.exit(1);
  }

  // ── Pull all 5 required addresses from env ──────────────────────────────
  const gTokenAddress       = process.env.GTOKEN_ADDRESS;
  const identityAddress     = process.env.IDENTITY_CONTRACT_ADDRESS;
  const verifierAddress     = process.env.VERIFIER_ADDRESS;
  const rewardTreasury      = process.env.REWARD_TREASURY_ADDRESS;
  const ubiPoolAddress      = process.env.UBI_POOL_ADDRESS;

  // ── Validate all 5 are present ───────────────────────────────────────────
  const missing = [
    ["GTOKEN_ADDRESS",            gTokenAddress],
    ["IDENTITY_CONTRACT_ADDRESS", identityAddress],
    ["VERIFIER_ADDRESS",          verifierAddress],
    ["REWARD_TREASURY_ADDRESS",   rewardTreasury],
    ["UBI_POOL_ADDRESS",          ubiPoolAddress],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error("❌ Missing required env vars:", missing.join(", "));
    process.exit(1);
  }

  // ── Validate all addresses are checksummed/valid ─────────────────────────
  const addresses = { gTokenAddress, identityAddress, verifierAddress, rewardTreasury, ubiPoolAddress };
  for (const [name, addr] of Object.entries(addresses)) {
    try {
      ethers.getAddress(addr!);
    } catch {
      console.error(`❌ Invalid address for ${name}: ${addr}`);
      process.exit(1);
    }
  }

  console.log("Deployment Configuration:");
  console.log("├─ G$ Token:          ", gTokenAddress);
  console.log("├─ Identity Contract: ", identityAddress);
  console.log("├─ Verifier:          ", verifierAddress);
  console.log("├─ Reward Treasury:   ", rewardTreasury);
  console.log("└─ UBI Pool:          ", ubiPoolAddress);
  console.log();

  // ── Deploy ───────────────────────────────────────────────────────────────
  console.log("📦 Deploying GoodCommitStaking...");
  const Factory = await ethers.getContractFactory("GoodCommitStaking");

  const staking = await Factory.deploy(
    gTokenAddress,
    identityAddress,   // ← V3 addition — was missing from old deploy script
    verifierAddress,
    rewardTreasury,
    ubiPoolAddress
  );

  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();

  console.log("✅ GoodCommitStaking deployed to:", stakingAddress);

  // ── Save deployment info ─────────────────────────────────────────────────
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? `chain-${network.chainId}` : network.name;

  const deploymentInfo = {
    network: networkName,
    chainId: network.chainId.toString(),
    contracts: {
      GoodCommitStaking:  stakingAddress,
      GToken:             gTokenAddress,
      IdentityContract:   identityAddress,
    },
    addresses: {
      deployer:        deployer.address,
      verifier:        verifierAddress,
      rewardTreasury:  rewardTreasury,
      ubiPool:         ubiPoolAddress,
    },
    timestamp:   new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const deploymentFile = path.join(deploymentsDir, `${networkName}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 Saved to: ${deploymentFile}`);

  // ── Post-deploy checklist ────────────────────────────────────────────────
  console.log("\n🎯 IMPORTANT — Do these steps now:");
  console.log(`\n1. Fund the contract with G$ so it can pay seed claims and point payouts:`);
  console.log(`   On Celo Explorer, call fundContract() with at least 1000 G$`);
  console.log(`   Contract must hold G$ or claimInitialSeed() and claimPoints() will revert`);
  console.log(`\n2. Update your backend .env:`);
  console.log(`   STAKING_CONTRACT_ADDRESS=${stakingAddress}`);
  console.log(`\n3. Update your frontend config:`);
  console.log(`   NEXT_PUBLIC_STAKING_CONTRACT=${stakingAddress}`);
  console.log(`\n4. Verify on CeloScan:`);
  console.log(
    `   npx hardhat verify --network celo ${stakingAddress}`,
    gTokenAddress, identityAddress, verifierAddress, rewardTreasury, ubiPoolAddress
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });