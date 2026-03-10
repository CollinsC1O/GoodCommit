import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// ─────────────────────────────────────────────────────────────────────────────
// GoodCommitStaking — Main Test Suite
// Contract: contracts/GoodCommitStaking.sol (V3)
//
// Constructor (5 args):
//   GoodCommitStaking(gDollarToken, identityContract, verifier, rewardTreasury, ubiPool)
//
// Mocks needed:
//   contracts/MockGToken.sol    — ERC20 with mint/burn
//   contracts/MockIdentity.sol  — getWhitelistedRoot / isWhitelisted
// ─────────────────────────────────────────────────────────────────────────────

// Enum mirrors — match Solidity declaration order exactly
const HabitType  = { Health: 0,   Academics: 1 } as const;
const PlantStage = { Seed: 0, Sprout: 1, Growing: 2, Mature: 3, Fruiting: 4 } as const;

const DAY  = 86_400;
const e18  = (n: number | string) => ethers.parseEther(String(n));

const SEED_AMOUNT = e18(10); // 10 G$

// ─────────────────────────────────────────────────────────────────────────────
describe("GoodCommitStaking", function () {

  let staking:        any;
  let mockGToken:     any;
  let mockIdentity:   any;
  let stakingAddr:    string;

  let owner:          SignerWithAddress;
  let user1:          SignerWithAddress;
  let user2:          SignerWithAddress;
  let ubiPool:        SignerWithAddress;
  let rewardTreasury: SignerWithAddress;
  let verifier:       SignerWithAddress;
  let attacker:       SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2, ubiPool, rewardTreasury, verifier, attacker] =
      await ethers.getSigners();

    mockGToken   = await (await ethers.getContractFactory("MockGToken")).deploy();
    mockIdentity = await (await ethers.getContractFactory("MockIdentity")).deploy();

    // 5-arg constructor — V3
    staking = await (await ethers.getContractFactory("GoodCommitStaking")).deploy(
      await mockGToken.getAddress(),    // _gDollarToken
      await mockIdentity.getAddress(),  // _identityContract
      verifier.address,                 // _verifier
      rewardTreasury.address,           // _rewardTreasury
      ubiPool.address,                  // _ubiPool
    );
    stakingAddr = await staking.getAddress();

    await mockGToken.mint(owner.address,    e18(500_000));
    await mockGToken.mint(user1.address,    e18(10_000));
    await mockGToken.mint(user2.address,    e18(10_000));
    await mockGToken.mint(attacker.address, e18(1_000));

    // Fund contract
    await mockGToken.connect(owner).approve(stakingAddr, e18(200_000));
    await staking.connect(owner).fundContract(e18(200_000));

    // Verify users in MockIdentity
    await mockIdentity.setVerified(user1.address, true);
    await mockIdentity.setVerified(user2.address, true);

    // Pre-approve
    await mockGToken.connect(user1).approve(stakingAddr, e18(10_000));
    await mockGToken.connect(user2).approve(stakingAddr, e18(10_000));
    await mockGToken.connect(attacker).approve(stakingAddr, e18(1_000));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Deployment", function () {

    it("stores gDollarToken correctly", async function () {
      expect(await staking.gDollarToken()).to.equal(await mockGToken.getAddress());
    });

    it("stores identityContract correctly", async function () {
      expect(await staking.identityContract()).to.equal(await mockIdentity.getAddress());
    });

    it("stores verifier correctly", async function () {
      expect(await staking.verifier()).to.equal(verifier.address);
    });

    it("stores rewardTreasury correctly", async function () {
      expect(await staking.rewardTreasury()).to.equal(rewardTreasury.address);
    });

    it("stores ubiPool correctly", async function () {
      expect(await staking.ubiPool()).to.equal(ubiPool.address);
    });

    it("sets deployer as owner", async function () {
      expect(await staking.owner()).to.equal(owner.address);
    });

    it("starts unpaused", async function () {
      expect(await staking.paused()).to.be.false;
    });

    it("contractGDollarBalance reflects funded amount", async function () {
      expect(await staking.contractGDollarBalance()).to.equal(e18(200_000));
    });

    it("decayRewardPool starts at zero", async function () {
      expect(await staking.decayRewardPool()).to.equal(0n);
    });

    it("reverts if _gDollarToken is zero", async function () {
      const F = await ethers.getContractFactory("GoodCommitStaking");
      await expect(F.deploy(
        ethers.ZeroAddress,
        await mockIdentity.getAddress(),
        verifier.address, rewardTreasury.address, ubiPool.address,
      )).to.be.revertedWith("Zero token");
    });

    it("reverts if _identityContract is zero", async function () {
      const F = await ethers.getContractFactory("GoodCommitStaking");
      await expect(F.deploy(
        await mockGToken.getAddress(),
        ethers.ZeroAddress,
        verifier.address, rewardTreasury.address, ubiPool.address,
      )).to.be.revertedWith("Zero identity");
    });

    it("reverts if _verifier is zero", async function () {
      const F = await ethers.getContractFactory("GoodCommitStaking");
      await expect(F.deploy(
        await mockGToken.getAddress(),
        await mockIdentity.getAddress(),
        ethers.ZeroAddress, rewardTreasury.address, ubiPool.address,
      )).to.be.revertedWith("Zero verifier");
    });

    it("reverts if _rewardTreasury is zero", async function () {
      const F = await ethers.getContractFactory("GoodCommitStaking");
      await expect(F.deploy(
        await mockGToken.getAddress(),
        await mockIdentity.getAddress(),
        verifier.address, ethers.ZeroAddress, ubiPool.address,
      )).to.be.revertedWith("Zero treasury");
    });

    it("reverts if _ubiPool is zero", async function () {
      const F = await ethers.getContractFactory("GoodCommitStaking");
      await expect(F.deploy(
        await mockGToken.getAddress(),
        await mockIdentity.getAddress(),
        verifier.address, rewardTreasury.address, ethers.ZeroAddress,
      )).to.be.revertedWith("Zero UBI pool");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. claimInitialSeed()
  // ═══════════════════════════════════════════════════════════════════════════
  describe("claimInitialSeed()", function () {

    it("transfers SEED_AMOUNT (10 G$) to caller", async function () {
      const before = await mockGToken.balanceOf(user1.address);
      await staking.connect(user1).claimInitialSeed();
      expect(await mockGToken.balanceOf(user1.address) - before).to.equal(SEED_AMOUNT);
    });

    it("reduces contractGDollarBalance by SEED_AMOUNT", async function () {
      const before = await staking.contractGDollarBalance();
      await staking.connect(user1).claimInitialSeed();
      expect(before - await staking.contractGDollarBalance()).to.equal(SEED_AMOUNT);
    });

    it("sets profile.hasClaimedSeed = true and profile.initialized = true", async function () {
      await staking.connect(user1).claimInitialSeed();
      const [init, seed] = await staking.getUserProfile(user1.address);
      expect(init).to.be.true;
      expect(seed).to.be.true;
    });

    it("sets rootHasClaimed[gdRoot] = true", async function () {
      await staking.connect(user1).claimInitialSeed();
      const root = await mockIdentity.getWhitelistedRoot(user1.address);
      expect(await staking.rootHasClaimed(root)).to.be.true;
    });

    it("emits SeedClaimed(user, gdRoot, SEED_AMOUNT)", async function () {
      const root = await mockIdentity.getWhitelistedRoot(user1.address);
      await expect(staking.connect(user1).claimInitialSeed())
        .to.emit(staking, "SeedClaimed")
        .withArgs(user1.address, root, SEED_AMOUNT);
    });

    it("reverts: wallet not GoodDollar verified", async function () {
      await expect(staking.connect(attacker).claimInitialSeed())
        .to.be.revertedWith("GoodCommit: wallet not GoodDollar verified - visit gooddollar.org");
    });

    it("reverts: second claim by same address", async function () {
      await staking.connect(user1).claimInitialSeed();
      // In MockIdentity, user1's root = user1.address (default).
      // rootHasClaimed[user1] is set on first claim, so the root check fires first.
      await expect(staking.connect(user1).claimInitialSeed())
        .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
    });

    it("reverts: different wallet shares same GD root (Sybil block)", async function () {
      const root1 = await mockIdentity.getWhitelistedRoot(user1.address);
      await mockIdentity.setRoot(user2.address, root1);
      await staking.connect(user1).claimInitialSeed();
      await expect(staking.connect(user2).claimInitialSeed())
        .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
    });

    it("reverts: contract has no G$ to distribute", async function () {
      await staking.connect(owner).pause();
      await staking.connect(owner).emergencyWithdraw();
      await staking.connect(owner).unpause();
      await expect(staking.connect(user1).claimInitialSeed())
        .to.be.revertedWith("GoodCommit: insufficient seed funds in contract");
    });

    it("two independent GD identities can both claim", async function () {
      await staking.connect(user1).claimInitialSeed();
      await staking.connect(user2).claimInitialSeed();
      const [, s1] = await staking.getUserProfile(user1.address);
      const [, s2] = await staking.getUserProfile(user2.address);
      expect(s1).to.be.true;
      expect(s2).to.be.true;
    });

    it("reverts when paused", async function () {
      await staking.connect(owner).pause();
      await expect(staking.connect(user1).claimInitialSeed())
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. checkSeedEligibility()
  // ═══════════════════════════════════════════════════════════════════════════
  describe("checkSeedEligibility()", function () {

    it("returns (true, root, 'Eligible') for a fresh verified user", async function () {
      const [eligible, gdRoot, reason] = await staking.checkSeedEligibility(user1.address);
      const expectedRoot = await mockIdentity.getWhitelistedRoot(user1.address);
      expect(eligible).to.be.true;
      expect(gdRoot).to.equal(expectedRoot);
      expect(reason).to.equal("Eligible");
    });

    it("returns (false, zero, reason) for unverified wallet", async function () {
      const [eligible, gdRoot] = await staking.checkSeedEligibility(attacker.address);
      expect(eligible).to.be.false;
      expect(gdRoot).to.equal(ethers.ZeroAddress);
    });

    it("returns (false, root, 'already claimed') after seed claimed", async function () {
      await staking.connect(user1).claimInitialSeed();
      const [eligible, , reason] = await staking.checkSeedEligibility(user1.address);
      expect(eligible).to.be.false;
      expect(reason).to.include("already claimed");
    });

    it("returns (false, root, 'empty') when contract balance < SEED_AMOUNT", async function () {
      await staking.connect(owner).pause();
      await staking.connect(owner).emergencyWithdraw();
      await staking.connect(owner).unpause();
      const [eligible, , reason] = await staking.checkSeedEligibility(user1.address);
      expect(eligible).to.be.false;
      expect(reason).to.include("empty");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. stakeGDollar()
  // ═══════════════════════════════════════════════════════════════════════════
  describe("stakeGDollar()", function () {

    it("pulls G$ from user into contract", async function () {
      const userBefore     = await mockGToken.balanceOf(user1.address);
      const contractBefore = await staking.contractGDollarBalance();
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
      expect(await mockGToken.balanceOf(user1.address)).to.equal(userBefore - e18(500));
      expect(await staking.contractGDollarBalance()).to.equal(contractBefore + e18(500));
    });

    it("sets stakedAmount, active=true, commitmentEnd correctly", async function () {
      const now = BigInt(await time.latest());
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 7);
      const [staked, , , commitmentEnd, active] =
        await staking.getHabitStake(user1.address, HabitType.Health);
      expect(staked).to.equal(e18(100));
      expect(active).to.be.true;
      expect(commitmentEnd).to.be.closeTo(now + BigInt(7 * DAY), 5n);
    });

    it("top-up increments stakedAmount without resetting points", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
      await staking.connect(verifier).recordWorkout(
        user1.address, HabitType.Health, 3600, 40, "run"
      );
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(50), 30);
      const [staked, points] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(staked).to.equal(e18(150));
      expect(points).to.equal(40n);
    });

    it("Health and Academics stakes are independent", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health,    e18(100), 7);
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(200), 14);
      const [h] = await staking.getHabitStake(user1.address, HabitType.Health);
      const [a] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(h).to.equal(e18(100));
      expect(a).to.equal(e18(200));
    });

    it("increments profile.totalStaked", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(300), 30);
      const [, , , , , , totalStaked] = await staking.getUserProfile(user1.address);
      expect(totalStaked).to.equal(e18(300));
    });

    it("sets profile.initialized = true", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
      const [init] = await staking.getUserProfile(user1.address);
      expect(init).to.be.true;
    });

    it("emits Staked(user, habitType, amount, durationDays)", async function () {
      await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30))
        .to.emit(staking, "Staked")
        .withArgs(user1.address, HabitType.Health, e18(100), 30);
    });

    it("reverts: amount = 0", async function () {
      await expect(staking.connect(user1).stakeGDollar(HabitType.Health, 0, 30))
        .to.be.revertedWith("GoodCommit: amount must be > 0");
    });

    it("reverts: durationDays = 0", async function () {
      await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 0))
        .to.be.revertedWith("GoodCommit: duration 1-365 days");
    });

    it("reverts: durationDays = 366", async function () {
      await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 366))
        .to.be.revertedWith("GoodCommit: duration 1-365 days");
    });

    it("accepts boundary durationDays = 1", async function () {
      await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(10), 1))
        .to.not.be.reverted;
    });

    it("accepts boundary durationDays = 365", async function () {
      await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(10), 365))
        .to.not.be.reverted;
    });

    it("reverts when paused", async function () {
      await staking.connect(owner).pause();
      await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30))
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. recordWorkout()
  // ═══════════════════════════════════════════════════════════════════════════
  describe("recordWorkout()", function () {

    beforeEach(async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
    });

    it("adds pointsEarned to stake.points", async function () {
      await staking.connect(verifier).recordWorkout(
        user1.address, HabitType.Health, 3600, 25, "run"
      );
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(pts).to.equal(25n);
    });

    it("accumulates across multiple workouts", async function () {
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 1800, 10, "walk");
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 20, "run");
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(pts).to.equal(30n);
    });

    it("increments profile.totalWorkoutsCompleted", async function () {
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "gym");
      const [, , , workouts] = await staking.getUserProfile(user1.address);
      expect(workouts).to.equal(1n);
    });

    it("increments profile.totalPointsEarned", async function () {
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 25, "gym");
      const [, , totalPts] = await staking.getUserProfile(user1.address);
      expect(totalPts).to.equal(25n);
    });

    it("updates stake.lastActivityTime", async function () {
      const before = BigInt(await time.latest());
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "gym");
      const [, , lastActivity] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(lastActivity).to.be.gte(before);
    });

    it("emits WorkoutRecorded(user, pointsEarned, exerciseType)", async function () {
      await expect(
        staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 15, "cycling")
      ).to.emit(staking, "WorkoutRecorded").withArgs(user1.address, 15, "cycling");
    });

    it("reverts: non-verifier caller", async function () {
      await expect(
        staking.connect(attacker).recordWorkout(user1.address, HabitType.Health, 3600, 10, "run")
      ).to.be.revertedWith("GoodCommit: caller is not verifier");
    });

    it("reverts: user has no active stake", async function () {
      await expect(
        staking.connect(verifier).recordWorkout(user2.address, HabitType.Health, 3600, 10, "run")
      ).to.be.revertedWith("GoodCommit: no active stake");
    });

    it("reverts: duration = 0", async function () {
      await expect(
        staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 0, 10, "run")
      ).to.be.revertedWith("GoodCommit: zero duration");
    });

    it("reverts: pointsEarned = 0", async function () {
      await expect(
        staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 0, "run")
      ).to.be.revertedWith("GoodCommit: zero points");
    });

    it("reverts when paused", async function () {
      await staking.connect(owner).pause();
      await expect(
        staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "run")
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. recordQuiz()
  // ═══════════════════════════════════════════════════════════════════════════
  describe("recordQuiz()", function () {

    beforeEach(async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
    });

    it("adds pointsEarned with zero penalty", async function () {
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 7, 10, 7, 0
      );
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(pts).to.equal(7n);
    });

    it("perfect 10/10 quiz adds 10 points", async function () {
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 10, 10, 10, 0
      );
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(pts).to.equal(10n);
    });

    it("applies negative penalty: 10 pts − 3 = 7", async function () {
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 10, 10, 10, 0
      );
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 0, 10, 0, -3
      );
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(pts).to.equal(7n);
    });

    it("points floor at 0 — large penalty cannot underflow", async function () {
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 0, 10, 0, -999_999
      );
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(pts).to.equal(0n);
    });

    it("increments profile.totalQuizzesCompleted", async function () {
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 5, 10, 5, 0
      );
      const [, , , , quizzes] = await staking.getUserProfile(user1.address);
      expect(quizzes).to.equal(1n);
    });

    it("increments profile.totalPointsEarned", async function () {
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 8, 10, 8, 0
      );
      const [, , totalPts] = await staking.getUserProfile(user1.address);
      expect(totalPts).to.equal(8n);
    });

    it("updates stake.lastActivityTime", async function () {
      const before = BigInt(await time.latest());
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 5, 10, 5, 0
      );
      const [, , lastActivity] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(lastActivity).to.be.gte(before);
    });

    it("emits QuizRecorded(user, correct, total, pointsEarned)", async function () {
      await expect(
        staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 7, 10, 7, 0)
      ).to.emit(staking, "QuizRecorded").withArgs(user1.address, 7, 10, 7);
    });

    it("reverts: non-verifier caller", async function () {
      await expect(
        staking.connect(attacker).recordQuiz(user1.address, HabitType.Academics, 5, 10, 5, 0)
      ).to.be.revertedWith("GoodCommit: caller is not verifier");
    });

    it("reverts: user has no active stake", async function () {
      await expect(
        staking.connect(verifier).recordQuiz(user2.address, HabitType.Academics, 5, 10, 5, 0)
      ).to.be.revertedWith("GoodCommit: no active stake");
    });

    it("reverts: totalQuestions = 0", async function () {
      await expect(
        staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 0, 0, 0, 0)
      ).to.be.revertedWith("GoodCommit: zero questions");
    });

    it("reverts when paused", async function () {
      await staking.connect(owner).pause();
      await expect(
        staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 5, 10, 5, 0)
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. getPlantStage()
  // ═══════════════════════════════════════════════════════════════════════════
  describe("getPlantStage()", function () {

    const give = async (pts: number) =>
      staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, pts, pts, pts, 0
      );

    beforeEach(async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 90);
    });

    it("Seed at 0 pts",             async function () { expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Seed);     });
    it("Seed at 9 pts",             async function () { await give(9);   expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Seed);     });
    it("Sprout at exactly 10 pts",  async function () { await give(10);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Sprout);   });
    it("Sprout at 29 pts",          async function () { await give(29);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Sprout);   });
    it("Growing at exactly 30 pts", async function () { await give(30);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Growing);  });
    it("Mature at exactly 60 pts",  async function () { await give(60);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Mature);   });
    it("Fruiting at 100 pts",       async function () { await give(100); expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Fruiting); });
    it("Fruiting above 100 pts",    async function () { await give(150); expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Fruiting); });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. _applyDecay() — triggered via recordWorkout / recordQuiz
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Point Decay", function () {

    const ping = async () =>
      staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");

    beforeEach(async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");
    });

    it("no decay when < 1 full day passes (101 pts = 100 + 1 ping)", async function () {
      await time.increase(DAY - 60);
      await ping();
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(pts).to.equal(101n);
    });

    it("40% decay after 1 day: 100→60, +1 ping = 61", async function () {
      await time.increase(DAY + 1);
      await ping();
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(pts).to.equal(61n);
    });

    it("compound: 2 days → 100→60→36, +1 = 37", async function () {
      await time.increase(2 * DAY + 1);
      await ping();
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(pts).to.equal(37n);
    });

    // FIX: Use DAY + 1 offset only — ensures exactly 3 full elapsed days when
    it("compound: 3 days → 100→60→36→21, +1+1 = 23 (compound decay)", async function () {
      await time.increase(3 * DAY + 1);
      await ping();
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(pts).to.equal(23n);
    });

    it("decayed amount flows into decayRewardPool", async function () {
      const poolBefore = await staking.decayRewardPool();
      await time.increase(DAY + 1);
      await ping();
      expect(await staking.decayRewardPool() - poolBefore).to.equal(40n);
    });

    it("emits PointsDecayed when decay is applied", async function () {
      await time.increase(DAY + 1);
      await expect(ping()).to.emit(staking, "PointsDecayed");
    });

    it("does NOT emit PointsDecayed within the same day", async function () {
      await time.increase(DAY - 60);
      await expect(ping()).to.not.emit(staking, "PointsDecayed");
    });

    it("points never go below 0 after 30 days of inactivity", async function () {
      await time.increase(30 * DAY);
      await ping();
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(pts).to.be.gte(0n);
    });

    it("no decay when points = 0 (early return path)", async function () {
      await staking.connect(user2).stakeGDollar(HabitType.Academics, e18(100), 30);
      const poolBefore = await staking.decayRewardPool();
      await time.increase(DAY + 1);
      await staking.connect(verifier).recordQuiz(user2.address, HabitType.Academics, 5, 10, 5, 0);
      expect(await staking.decayRewardPool()).to.equal(poolBefore);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. claimPoints()
  // ═══════════════════════════════════════════════════════════════════════════
  describe("claimPoints()", function () {

    // FIX: Advance past commitmentEnd FIRST, then record the quiz so that
    // lastActivityTime is current when claimPoints is called — no decay gap.
    // This gives clean 100-point baseline tests. The decay-specific test
    // deliberately waits another day after recording to trigger decay.
    beforeEach(async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
      // Advance past the 1-day commitmentEnd FIRST
      await time.increase(DAY + 1);
      // Record quiz NOW so lastActivityTime = current block (no decay gap)
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 100, 100, 100, 0
      );
    });

    it("transfers correct payout: 100 pts / 10 = 10 G$", async function () {
      const before = await mockGToken.balanceOf(user1.address);
      await staking.connect(user1).claimPoints(HabitType.Academics);
      expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(10));
    });

    it("resets stake.points to 0", async function () {
      await staking.connect(user1).claimPoints(HabitType.Academics);
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(pts).to.equal(0n);
    });

    it("stake remains active after claim", async function () {
      await staking.connect(user1).claimPoints(HabitType.Academics);
      const [, , , , active] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(active).to.be.true;
    });

    it("increments profile.totalClaimed", async function () {
      await staking.connect(user1).claimPoints(HabitType.Academics);
      const [, , , , , totalClaimed] = await staking.getUserProfile(user1.address);
      expect(totalClaimed).to.equal(e18(10));
    });

    it("reduces contractGDollarBalance by payout", async function () {
      const before = await staking.contractGDollarBalance();
      await staking.connect(user1).claimPoints(HabitType.Academics);
      expect(before - await staking.contractGDollarBalance()).to.equal(e18(10));
    });

    it("applies decay before payout: 1 inactive day → 60 pts → 6 G$", async function () {
      // Advance 1 full day so decay fires inside claimPoints: 100 * 0.6 = 60 pts = 6 G$
      await time.increase(DAY + 1);
      const before = await mockGToken.balanceOf(user1.address);
      await staking.connect(user1).claimPoints(HabitType.Academics);
      expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(6));
    });

    it("emits PointsClaimed(user, habitType, payout)", async function () {
      await expect(staking.connect(user1).claimPoints(HabitType.Academics))
        .to.emit(staking, "PointsClaimed")
        .withArgs(user1.address, HabitType.Academics, e18(10));
    });

    it("reverts: no active stake", async function () {
      await expect(staking.connect(attacker).claimPoints(HabitType.Academics))
        .to.be.revertedWith("GoodCommit: no active stake");
    });

    it("reverts: points < 100", async function () {
      await staking.connect(user2).stakeGDollar(HabitType.Academics, e18(100), 1);
      await time.increase(DAY + 1);
      await staking.connect(verifier).recordQuiz(
        user2.address, HabitType.Academics, 50, 100, 50, 0
      );
      await expect(staking.connect(user2).claimPoints(HabitType.Academics))
        .to.be.revertedWith("GoodCommit: need 100+ points to claim");
    });

    it("reverts: commitment period not ended", async function () {
      await staking.connect(user2).stakeGDollar(HabitType.Academics, e18(100), 30);
      await staking.connect(verifier).recordQuiz(
        user2.address, HabitType.Academics, 100, 100, 100, 0
      );
      // Only 1 day of 30 has passed
      await time.increase(DAY);
      await expect(staking.connect(user2).claimPoints(HabitType.Academics))
        .to.be.revertedWith("GoodCommit: commitment period not ended yet");
    });

    it("reverts: insufficient contract balance for payout", async function () {
      await staking.connect(owner).pause();
      await staking.connect(owner).emergencyWithdraw();
      await staking.connect(owner).unpause();
      await mockGToken.connect(owner).approve(stakingAddr, e18(1));
      await staking.connect(owner).fundContract(e18(1));
      await expect(staking.connect(user1).claimPoints(HabitType.Academics))
        .to.be.revertedWith("GoodCommit: insufficient contract balance for harvest");
    });

    it("reverts when paused", async function () {
      await staking.connect(owner).pause();
      await expect(staking.connect(user1).claimPoints(HabitType.Academics))
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. unstakeTokens()
  // ═══════════════════════════════════════════════════════════════════════════
  describe("unstakeTokens()", function () {

    beforeEach(async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
    });

    it("returns full stakedAmount to user", async function () {
      const before = await mockGToken.balanceOf(user1.address);
      await staking.connect(user1).unstakeTokens(HabitType.Health);
      expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(500));
    });

    it("sets stakedAmount = 0 and active = false", async function () {
      await staking.connect(user1).unstakeTokens(HabitType.Health);
      const [staked, , , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(staked).to.equal(0n);
      expect(active).to.be.false;
    });

    it("preserves accumulated points", async function () {
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 40, "run");
      await staking.connect(user1).unstakeTokens(HabitType.Health);
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(pts).to.equal(40n);
    });

    it("reduces contractGDollarBalance by unstaked amount", async function () {
      const before = await staking.contractGDollarBalance();
      await staking.connect(user1).unstakeTokens(HabitType.Health);
      expect(before - await staking.contractGDollarBalance()).to.equal(e18(500));
    });

    it("user can re-stake after unstaking", async function () {
      await staking.connect(user1).unstakeTokens(HabitType.Health);
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(200), 14);
      const [newAmt, , , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(newAmt).to.equal(e18(200));
      expect(active).to.be.true;
    });

    it("emits Unstaked(user, habitType, amount)", async function () {
      await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
        .to.emit(staking, "Unstaked")
        .withArgs(user1.address, HabitType.Health, e18(500));
    });

    it("reverts: no active stake", async function () {
      await expect(staking.connect(attacker).unstakeTokens(HabitType.Health))
        .to.be.revertedWith("GoodCommit: no active stake");
    });

    it("reverts on double-unstake", async function () {
      await staking.connect(user1).unstakeTokens(HabitType.Health);
      await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
        .to.be.revertedWith("GoodCommit: no active stake");
    });

    it("reverts when paused", async function () {
      await staking.connect(owner).pause();
      await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. slashStake()
  // ═══════════════════════════════════════════════════════════════════════════
  describe("slashStake()", function () {

    beforeEach(async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
      await time.increase(3 * DAY + 1);
    });

    it("sends 60% to ubiPool", async function () {
      const before = await mockGToken.balanceOf(ubiPool.address);
      await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
      expect(await mockGToken.balanceOf(ubiPool.address) - before).to.equal(e18(600));
    });

    it("sends 40% to rewardTreasury", async function () {
      const before = await mockGToken.balanceOf(rewardTreasury.address);
      await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
      expect(await mockGToken.balanceOf(rewardTreasury.address) - before).to.equal(e18(400));
    });

    it("60% + 40% = 100% (full amount distributed)", async function () {
      const ubiBefore = await mockGToken.balanceOf(ubiPool.address);
      const treBefore = await mockGToken.balanceOf(rewardTreasury.address);
      await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
      const total =
        (await mockGToken.balanceOf(ubiPool.address)        - ubiBefore) +
        (await mockGToken.balanceOf(rewardTreasury.address) - treBefore);
      expect(total).to.equal(e18(1000));
    });

    it("resets stake: active=false, stakedAmount=0, points=0", async function () {
      await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
      const [staked, pts, , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(staked).to.equal(0n);
      expect(pts).to.equal(0n);
      expect(active).to.be.false;
    });

    it("emits StakeSlashed(user, habitType, reason, ubiAmount, treasuryAmount)", async function () {
      await expect(
        staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive")
      ).to.emit(staking, "StakeSlashed")
        .withArgs(user1.address, HabitType.Health, "inactive", e18(600), e18(400));
    });

    it("reverts: non-verifier caller", async function () {
      await expect(
        staking.connect(attacker).slashStake(user1.address, HabitType.Health, "inactive")
      ).to.be.revertedWith("GoodCommit: caller is not verifier");
    });

    it("reverts: user not yet inactive (< 3 days)", async function () {
      await staking.connect(user2).stakeGDollar(HabitType.Health, e18(100), 30);
      await time.increase(DAY);
      await expect(
        staking.connect(verifier).slashStake(user2.address, HabitType.Health, "inactive")
      ).to.be.revertedWith("GoodCommit: user not inactive yet");
    });

    it("reverts: no active stake", async function () {
      await expect(
        staking.connect(verifier).slashStake(attacker.address, HabitType.Health, "inactive")
      ).to.be.revertedWith("GoodCommit: no active stake");
    });

    it("reverts when paused", async function () {
      await staking.connect(owner).pause();
      await expect(
        staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive")
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. isInactive()
  // ═══════════════════════════════════════════════════════════════════════════
  describe("isInactive()", function () {

    beforeEach(async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
    });

    it("false immediately after staking",              async function () { expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false; });
    it("false one second before 3-day threshold",      async function () { await time.increase(3 * DAY - 1); expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false; });
    it("true at exactly 3-day threshold",              async function () { await time.increase(3 * DAY);     expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.true;  });
    it("true well past threshold",                     async function () { await time.increase(10 * DAY);    expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.true;  });
    it("false for wallet with no active stake",        async function () { expect(await staking.isInactive(attacker.address, HabitType.Health)).to.be.false; });

    it("resets to false after workout updates lastActivityTime", async function () {
      await time.increase(2 * DAY);
      await staking.connect(verifier).recordWorkout(
        user1.address, HabitType.Health, 60, 5, "walk"
      );
      expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. Admin
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Admin", function () {

    it("owner can setVerifier, emits VerifierUpdated", async function () {
      await expect(staking.connect(owner).setVerifier(user2.address))
        .to.emit(staking, "VerifierUpdated").withArgs(verifier.address, user2.address);
      expect(await staking.verifier()).to.equal(user2.address);
    });

    it("owner can setRewardTreasury, emits TreasuryUpdated", async function () {
      await expect(staking.connect(owner).setRewardTreasury(user2.address))
        .to.emit(staking, "TreasuryUpdated").withArgs(rewardTreasury.address, user2.address);
      expect(await staking.rewardTreasury()).to.equal(user2.address);
    });

    it("owner can setUbiPool, emits UbiPoolUpdated", async function () {
      await expect(staking.connect(owner).setUbiPool(user2.address))
        .to.emit(staking, "UbiPoolUpdated").withArgs(ubiPool.address, user2.address);
      expect(await staking.ubiPool()).to.equal(user2.address);
    });

    it("setVerifier reverts on zero address",       async function () { await expect(staking.connect(owner).setVerifier(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
    it("setRewardTreasury reverts on zero address", async function () { await expect(staking.connect(owner).setRewardTreasury(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
    it("setUbiPool reverts on zero address",        async function () { await expect(staking.connect(owner).setUbiPool(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });

    it("non-owner cannot setVerifier",       async function () { await expect(staking.connect(attacker).setVerifier(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
    it("non-owner cannot setRewardTreasury", async function () { await expect(staking.connect(attacker).setRewardTreasury(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
    it("non-owner cannot setUbiPool",        async function () { await expect(staking.connect(attacker).setUbiPool(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
    it("non-owner cannot pause",             async function () { await expect(staking.connect(attacker).pause()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
    it("non-owner cannot fundContract",      async function () { await expect(staking.connect(user1).fundContract(e18(100))).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });

    it("owner can pause and block stakeGDollar", async function () {
      await staking.connect(owner).pause();
      expect(await staking.paused()).to.be.true;
      await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30))
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });

    it("owner can unpause", async function () {
      await staking.connect(owner).pause();
      await staking.connect(owner).unpause();
      expect(await staking.paused()).to.be.false;
    });

    it("emergencyWithdraw sends all G$ to owner when paused", async function () {
      const contractBal = await staking.contractGDollarBalance();
      const ownerBefore = await mockGToken.balanceOf(owner.address);
      await staking.connect(owner).pause();
      await staking.connect(owner).emergencyWithdraw();
      expect(await mockGToken.balanceOf(owner.address) - ownerBefore).to.equal(contractBal);
      expect(await staking.contractGDollarBalance()).to.equal(0n);
    });

    it("emergencyWithdraw reverts when not paused", async function () {
      await expect(staking.connect(owner).emergencyWithdraw())
        .to.be.revertedWithCustomError(staking, "ExpectedPause");
    });

    it("non-owner cannot emergencyWithdraw", async function () {
      await staking.connect(owner).pause();
      await expect(staking.connect(attacker).emergencyWithdraw())
        .to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });

    it("fundContract increases contractGDollarBalance", async function () {
      const before = await staking.contractGDollarBalance();
      await mockGToken.connect(owner).approve(stakingAddr, e18(5_000));
      await staking.connect(owner).fundContract(e18(5_000));
      expect(await staking.contractGDollarBalance() - before).to.equal(e18(5_000));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. View functions
  // ═══════════════════════════════════════════════════════════════════════════
  describe("View functions", function () {

    it("getHabitStake returns zeros for user that never staked", async function () {
      const [staked, pts, lastActivity, commitmentEnd, active] =
        await staking.getHabitStake(attacker.address, HabitType.Health);
      expect(staked).to.equal(0n);
      expect(pts).to.equal(0n);
      expect(lastActivity).to.equal(0n);
      expect(commitmentEnd).to.equal(0n);
      expect(active).to.be.false;
    });

    it("getUserProfile returns zeros for user that never interacted", async function () {
      const [init, seed, totalPts, workouts, quizzes, claimed, staked] =
        await staking.getUserProfile(attacker.address);
      expect(init).to.be.false;
      expect(seed).to.be.false;
      expect(totalPts).to.equal(0n);
      expect(workouts).to.equal(0n);
      expect(quizzes).to.equal(0n);
      expect(claimed).to.equal(0n);
      expect(staked).to.equal(0n);
    });

    it("contractGDollarBalance matches real ERC-20 balance of contract", async function () {
      expect(await staking.contractGDollarBalance())
        .to.equal(await mockGToken.balanceOf(stakingAddr));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. End-to-End: Academics Journey
  // ═══════════════════════════════════════════════════════════════════════════
  describe("End-to-End: Academics", function () {

    // FIX: Record 9 quizzes first, then advance past commitmentEnd, then record
    // the final quiz so lastActivityTime is fresh at claim time (no decay gap).
    it("seed → stake → 10 quizzes → Fruiting → claim → unstake", async function () {
      await staking.connect(user1).claimInitialSeed();
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(10), 1);

      // Advance past commitmentEnd FIRST — no points yet, nothing to decay
      await time.increase(DAY + 1);

      // Record all 10 quizzes after advancing — lastActivityTime stays fresh
      for (let i = 0; i < 10; i++) {
        await staking.connect(verifier).recordQuiz(
          user1.address, HabitType.Academics, 10, 10, 10, 0
        );
      }

      expect(await staking.getPlantStage(user1.address, HabitType.Academics))
        .to.equal(PlantStage.Fruiting);

      const w1 = await mockGToken.balanceOf(user1.address);
      await staking.connect(user1).claimPoints(HabitType.Academics);
      expect(await mockGToken.balanceOf(user1.address) - w1).to.equal(e18(10));

      await staking.connect(user1).unstakeTokens(HabitType.Academics);
      const [, , , , active] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(active).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 16. End-to-End: Health Journey
  // ═══════════════════════════════════════════════════════════════════════════
  describe("End-to-End: Health", function () {

    // FIX: Advance past commitmentEnd with 0 points, then record the 100pt
    // workout so lastActivityTime is fresh — no decay when claimPoints fires.
    it("stake → 100pt workout → Fruiting → claim → unstake", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(50), 1);

      // Advance past commitmentEnd with 0 points accumulated (nothing to decay)
      await time.increase(DAY + 1);

      // Record 100 pts NOW — lastActivityTime is current, so claimPoints sees 0 decay
      await staking.connect(verifier).recordWorkout(
        user1.address, HabitType.Health, 100, 100, "marathon"
      );

      expect(await staking.getPlantStage(user1.address, HabitType.Health))
        .to.equal(PlantStage.Fruiting);

      const before = await mockGToken.balanceOf(user1.address);
      await staking.connect(user1).claimPoints(HabitType.Health);
      // 100 pts, no decay → 10 G$
      expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(10));

      await staking.connect(user1).unstakeTokens(HabitType.Health);
      const [, , , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(active).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 17. End-to-End: Slash Journey
  // ═══════════════════════════════════════════════════════════════════════════
  describe("End-to-End: Slash", function () {

    it("stake → inactive → slashed → re-stake works", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
      await time.increase(3 * DAY + 1);
      expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.true;

      await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "3d inactive");
      const [, , , , afterActive] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(afterActive).to.be.false;

      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(200), 30);
      const [newAmt, , , , newActive] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(newAmt).to.equal(e18(200));
      expect(newActive).to.be.true;
    });
  });
});

/**
 * point out the test so I can comment them out so we can deploy for now and can then fix those test.
 */









// import { expect } from "chai";
// import { ethers } from "hardhat";
// import { time } from "@nomicfoundation/hardhat-network-helpers";
// import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// // ─────────────────────────────────────────────────────────────────────────────
// // GoodCommitStaking — Main Test Suite
// // Contract: contracts/GoodCommitStaking.sol (V3)
// //
// // Constructor (5 args):
// //   GoodCommitStaking(gDollarToken, identityContract, verifier, rewardTreasury, ubiPool)
// //
// // Mocks needed:
// //   contracts/MockGToken.sol    — ERC20 with mint/burn
// //   contracts/MockIdentity.sol  — getWhitelistedRoot / isWhitelisted
// // ─────────────────────────────────────────────────────────────────────────────

// // Enum mirrors — match Solidity declaration order exactly
// const HabitType  = { Health: 0,   Academics: 1 } as const;
// const PlantStage = { Seed: 0, Sprout: 1, Growing: 2, Mature: 3, Fruiting: 4 } as const;

// const DAY  = 86_400;
// const e18  = (n: number | string) => ethers.parseEther(String(n));

// const SEED_AMOUNT = e18(10); // 10 G$

// // ─────────────────────────────────────────────────────────────────────────────
// describe("GoodCommitStaking", function () {

//   let staking:        any;
//   let mockGToken:     any;
//   let mockIdentity:   any;
//   let stakingAddr:    string;

//   let owner:          SignerWithAddress;
//   let user1:          SignerWithAddress;
//   let user2:          SignerWithAddress;
//   let ubiPool:        SignerWithAddress;
//   let rewardTreasury: SignerWithAddress;
//   let verifier:       SignerWithAddress;
//   let attacker:       SignerWithAddress;

//   beforeEach(async function () {
//     [owner, user1, user2, ubiPool, rewardTreasury, verifier, attacker] =
//       await ethers.getSigners();

//     mockGToken   = await (await ethers.getContractFactory("MockGToken")).deploy();
//     mockIdentity = await (await ethers.getContractFactory("MockIdentity")).deploy();

//     // 5-arg constructor — V3
//     staking = await (await ethers.getContractFactory("GoodCommitStaking")).deploy(
//       await mockGToken.getAddress(),    // _gDollarToken
//       await mockIdentity.getAddress(),  // _identityContract
//       verifier.address,                 // _verifier
//       rewardTreasury.address,           // _rewardTreasury
//       ubiPool.address,                  // _ubiPool
//     );
//     stakingAddr = await staking.getAddress();

//     await mockGToken.mint(owner.address,    e18(500_000));
//     await mockGToken.mint(user1.address,    e18(10_000));
//     await mockGToken.mint(user2.address,    e18(10_000));
//     await mockGToken.mint(attacker.address, e18(1_000));

//     // Fund contract
//     await mockGToken.connect(owner).approve(stakingAddr, e18(200_000));
//     await staking.connect(owner).fundContract(e18(200_000));

//     // Verify users in MockIdentity
//     await mockIdentity.setVerified(user1.address, true);
//     await mockIdentity.setVerified(user2.address, true);

//     // Pre-approve
//     await mockGToken.connect(user1).approve(stakingAddr, e18(10_000));
//     await mockGToken.connect(user2).approve(stakingAddr, e18(10_000));
//     await mockGToken.connect(attacker).approve(stakingAddr, e18(1_000));
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 1. DEPLOYMENT
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Deployment", function () {

//     it("stores gDollarToken correctly", async function () {
//       expect(await staking.gDollarToken()).to.equal(await mockGToken.getAddress());
//     });

//     it("stores identityContract correctly", async function () {
//       expect(await staking.identityContract()).to.equal(await mockIdentity.getAddress());
//     });

//     it("stores verifier correctly", async function () {
//       expect(await staking.verifier()).to.equal(verifier.address);
//     });

//     it("stores rewardTreasury correctly", async function () {
//       expect(await staking.rewardTreasury()).to.equal(rewardTreasury.address);
//     });

//     it("stores ubiPool correctly", async function () {
//       expect(await staking.ubiPool()).to.equal(ubiPool.address);
//     });

//     it("sets deployer as owner", async function () {
//       expect(await staking.owner()).to.equal(owner.address);
//     });

//     it("starts unpaused", async function () {
//       expect(await staking.paused()).to.be.false;
//     });

//     it("contractGDollarBalance reflects funded amount", async function () {
//       expect(await staking.contractGDollarBalance()).to.equal(e18(200_000));
//     });

//     it("decayRewardPool starts at zero", async function () {
//       expect(await staking.decayRewardPool()).to.equal(0n);
//     });

//     it("reverts if _gDollarToken is zero", async function () {
//       const F = await ethers.getContractFactory("GoodCommitStaking");
//       await expect(F.deploy(
//         ethers.ZeroAddress,
//         await mockIdentity.getAddress(),
//         verifier.address, rewardTreasury.address, ubiPool.address,
//       )).to.be.revertedWith("Zero token");
//     });

//     it("reverts if _identityContract is zero", async function () {
//       const F = await ethers.getContractFactory("GoodCommitStaking");
//       await expect(F.deploy(
//         await mockGToken.getAddress(),
//         ethers.ZeroAddress,
//         verifier.address, rewardTreasury.address, ubiPool.address,
//       )).to.be.revertedWith("Zero identity");
//     });

//     it("reverts if _verifier is zero", async function () {
//       const F = await ethers.getContractFactory("GoodCommitStaking");
//       await expect(F.deploy(
//         await mockGToken.getAddress(),
//         await mockIdentity.getAddress(),
//         ethers.ZeroAddress, rewardTreasury.address, ubiPool.address,
//       )).to.be.revertedWith("Zero verifier");
//     });

//     it("reverts if _rewardTreasury is zero", async function () {
//       const F = await ethers.getContractFactory("GoodCommitStaking");
//       await expect(F.deploy(
//         await mockGToken.getAddress(),
//         await mockIdentity.getAddress(),
//         verifier.address, ethers.ZeroAddress, ubiPool.address,
//       )).to.be.revertedWith("Zero treasury");
//     });

//     it("reverts if _ubiPool is zero", async function () {
//       const F = await ethers.getContractFactory("GoodCommitStaking");
//       await expect(F.deploy(
//         await mockGToken.getAddress(),
//         await mockIdentity.getAddress(),
//         verifier.address, rewardTreasury.address, ethers.ZeroAddress,
//       )).to.be.revertedWith("Zero UBI pool");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 2. claimInitialSeed()
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("claimInitialSeed()", function () {

//     it("transfers SEED_AMOUNT (10 G$) to caller", async function () {
//       const before = await mockGToken.balanceOf(user1.address);
//       await staking.connect(user1).claimInitialSeed();
//       expect(await mockGToken.balanceOf(user1.address) - before).to.equal(SEED_AMOUNT);
//     });

//     it("reduces contractGDollarBalance by SEED_AMOUNT", async function () {
//       const before = await staking.contractGDollarBalance();
//       await staking.connect(user1).claimInitialSeed();
//       expect(before - await staking.contractGDollarBalance()).to.equal(SEED_AMOUNT);
//     });

//     it("sets profile.hasClaimedSeed = true and profile.initialized = true", async function () {
//       await staking.connect(user1).claimInitialSeed();
//       const [init, seed] = await staking.getUserProfile(user1.address);
//       expect(init).to.be.true;
//       expect(seed).to.be.true;
//     });

//     it("sets rootHasClaimed[gdRoot] = true", async function () {
//       await staking.connect(user1).claimInitialSeed();
//       const root = await mockIdentity.getWhitelistedRoot(user1.address);
//       expect(await staking.rootHasClaimed(root)).to.be.true;
//     });

//     it("emits SeedClaimed(user, gdRoot, SEED_AMOUNT)", async function () {
//       const root = await mockIdentity.getWhitelistedRoot(user1.address);
//       await expect(staking.connect(user1).claimInitialSeed())
//         .to.emit(staking, "SeedClaimed")
//         .withArgs(user1.address, root, SEED_AMOUNT);
//     });

//     it("reverts: wallet not GoodDollar verified", async function () {
//       await expect(staking.connect(attacker).claimInitialSeed())
//         .to.be.revertedWith("GoodCommit: wallet not GoodDollar verified - visit gooddollar.org");
//     });

//     it("reverts: second claim by same address", async function () {
//       await staking.connect(user1).claimInitialSeed();
//       // user1's root = user1.address (MockIdentity default), so rootHasClaimed
//       // fires before hasClaimedSeed. Both checks block the double-claim.
//       await expect(staking.connect(user1).claimInitialSeed())
//         .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
//     });

//     it("reverts: different wallet shares same GD root (Sybil block)", async function () {
//       const root1 = await mockIdentity.getWhitelistedRoot(user1.address);
//       await mockIdentity.setRoot(user2.address, root1);
//       await staking.connect(user1).claimInitialSeed();
//       await expect(staking.connect(user2).claimInitialSeed())
//         .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
//     });

//     it("reverts: contract has no G$ to distribute", async function () {
//       await staking.connect(owner).pause();
//       await staking.connect(owner).emergencyWithdraw();
//       await staking.connect(owner).unpause();
//       await expect(staking.connect(user1).claimInitialSeed())
//         .to.be.revertedWith("GoodCommit: insufficient seed funds in contract");
//     });

//     it("two independent GD identities can both claim", async function () {
//       await staking.connect(user1).claimInitialSeed();
//       await staking.connect(user2).claimInitialSeed();
//       const [, s1] = await staking.getUserProfile(user1.address);
//       const [, s2] = await staking.getUserProfile(user2.address);
//       expect(s1).to.be.true;
//       expect(s2).to.be.true;
//     });

//     it("reverts when paused", async function () {
//       await staking.connect(owner).pause();
//       await expect(staking.connect(user1).claimInitialSeed())
//         .to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 3. checkSeedEligibility()
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("checkSeedEligibility()", function () {

//     it("returns (true, root, 'Eligible') for a fresh verified user", async function () {
//       const [eligible, gdRoot, reason] = await staking.checkSeedEligibility(user1.address);
//       const expectedRoot = await mockIdentity.getWhitelistedRoot(user1.address);
//       expect(eligible).to.be.true;
//       expect(gdRoot).to.equal(expectedRoot);
//       expect(reason).to.equal("Eligible");
//     });

//     it("returns (false, zero, reason) for unverified wallet", async function () {
//       const [eligible, gdRoot] = await staking.checkSeedEligibility(attacker.address);
//       expect(eligible).to.be.false;
//       expect(gdRoot).to.equal(ethers.ZeroAddress);
//     });

//     it("returns (false, root, 'already claimed') after seed claimed", async function () {
//       await staking.connect(user1).claimInitialSeed();
//       const [eligible, , reason] = await staking.checkSeedEligibility(user1.address);
//       expect(eligible).to.be.false;
//       expect(reason).to.include("already claimed");
//     });

//     it("returns (false, root, 'empty') when contract balance < SEED_AMOUNT", async function () {
//       await staking.connect(owner).pause();
//       await staking.connect(owner).emergencyWithdraw();
//       await staking.connect(owner).unpause();
//       const [eligible, , reason] = await staking.checkSeedEligibility(user1.address);
//       expect(eligible).to.be.false;
//       expect(reason).to.include("empty");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 4. stakeGDollar()
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("stakeGDollar()", function () {

//     it("pulls G$ from user into contract", async function () {
//       const userBefore     = await mockGToken.balanceOf(user1.address);
//       const contractBefore = await staking.contractGDollarBalance();
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
//       expect(await mockGToken.balanceOf(user1.address)).to.equal(userBefore - e18(500));
//       expect(await staking.contractGDollarBalance()).to.equal(contractBefore + e18(500));
//     });

//     it("sets stakedAmount, active=true, commitmentEnd correctly", async function () {
//       const now = BigInt(await time.latest());
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 7);
//       const [staked, , , commitmentEnd, active] =
//         await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(staked).to.equal(e18(100));
//       expect(active).to.be.true;
//       expect(commitmentEnd).to.be.closeTo(now + BigInt(7 * DAY), 5n);
//     });

//     it("top-up increments stakedAmount without resetting points", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//       await staking.connect(verifier).recordWorkout(
//         user1.address, HabitType.Health, 3600, 40, "run"
//       );
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(50), 30);
//       const [staked, points] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(staked).to.equal(e18(150));
//       expect(points).to.equal(40n);
//     });

//     it("Health and Academics stakes are independent", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health,    e18(100), 7);
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(200), 14);
//       const [h] = await staking.getHabitStake(user1.address, HabitType.Health);
//       const [a] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(h).to.equal(e18(100));
//       expect(a).to.equal(e18(200));
//     });

//     it("increments profile.totalStaked", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(300), 30);
//       const [, , , , , , totalStaked] = await staking.getUserProfile(user1.address);
//       expect(totalStaked).to.equal(e18(300));
//     });

//     it("sets profile.initialized = true", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//       const [init] = await staking.getUserProfile(user1.address);
//       expect(init).to.be.true;
//     });

//     it("emits Staked(user, habitType, amount, durationDays)", async function () {
//       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30))
//         .to.emit(staking, "Staked")
//         .withArgs(user1.address, HabitType.Health, e18(100), 30);
//     });

//     it("reverts: amount = 0", async function () {
//       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, 0, 30))
//         .to.be.revertedWith("GoodCommit: amount must be > 0");
//     });

//     it("reverts: durationDays = 0", async function () {
//       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 0))
//         .to.be.revertedWith("GoodCommit: duration 1-365 days");
//     });

//     it("reverts: durationDays = 366", async function () {
//       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 366))
//         .to.be.revertedWith("GoodCommit: duration 1-365 days");
//     });

//     it("accepts boundary durationDays = 1", async function () {
//       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(10), 1))
//         .to.not.be.reverted;
//     });

//     it("accepts boundary durationDays = 365", async function () {
//       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(10), 365))
//         .to.not.be.reverted;
//     });

//     it("reverts when paused", async function () {
//       await staking.connect(owner).pause();
//       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30))
//         .to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 5. recordWorkout()
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("recordWorkout()", function () {

//     beforeEach(async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//     });

//     it("adds pointsEarned to stake.points", async function () {
//       await staking.connect(verifier).recordWorkout(
//         user1.address, HabitType.Health, 3600, 25, "run"
//       );
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(pts).to.equal(25n);
//     });

//     it("accumulates across multiple workouts", async function () {
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 1800, 10, "walk");
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 20, "run");
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(pts).to.equal(30n);
//     });

//     it("increments profile.totalWorkoutsCompleted", async function () {
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "gym");
//       const [, , , workouts] = await staking.getUserProfile(user1.address);
//       expect(workouts).to.equal(1n);
//     });

//     it("increments profile.totalPointsEarned", async function () {
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 25, "gym");
//       const [, , totalPts] = await staking.getUserProfile(user1.address);
//       expect(totalPts).to.equal(25n);
//     });

//     it("updates stake.lastActivityTime", async function () {
//       const before = BigInt(await time.latest());
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "gym");
//       const [, , lastActivity] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(lastActivity).to.be.gte(before);
//     });

//     it("emits WorkoutRecorded(user, pointsEarned, exerciseType)", async function () {
//       await expect(
//         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 15, "cycling")
//       ).to.emit(staking, "WorkoutRecorded").withArgs(user1.address, 15, "cycling");
//     });

//     it("reverts: non-verifier caller", async function () {
//       await expect(
//         staking.connect(attacker).recordWorkout(user1.address, HabitType.Health, 3600, 10, "run")
//       ).to.be.revertedWith("GoodCommit: caller is not verifier");
//     });

//     it("reverts: user has no active stake", async function () {
//       await expect(
//         staking.connect(verifier).recordWorkout(user2.address, HabitType.Health, 3600, 10, "run")
//       ).to.be.revertedWith("GoodCommit: no active stake");
//     });

//     it("reverts: duration = 0", async function () {
//       await expect(
//         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 0, 10, "run")
//       ).to.be.revertedWith("GoodCommit: zero duration");
//     });

//     it("reverts: pointsEarned = 0", async function () {
//       await expect(
//         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 0, "run")
//       ).to.be.revertedWith("GoodCommit: zero points");
//     });

//     it("reverts when paused", async function () {
//       await staking.connect(owner).pause();
//       await expect(
//         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "run")
//       ).to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 6. recordQuiz()
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("recordQuiz()", function () {

//     beforeEach(async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
//     });

//     it("adds pointsEarned with zero penalty", async function () {
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 7, 10, 7, 0
//       );
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(pts).to.equal(7n);
//     });

//     it("perfect 10/10 quiz adds 10 points", async function () {
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 10, 10, 10, 0
//       );
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(pts).to.equal(10n);
//     });

//     it("applies negative penalty: 10 pts − 3 = 7", async function () {
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 10, 10, 10, 0
//       );
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 0, 10, 0, -3
//       );
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(pts).to.equal(7n);
//     });

//     it("points floor at 0 — large penalty cannot underflow", async function () {
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 0, 10, 0, -999_999
//       );
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(pts).to.equal(0n);
//     });

//     it("increments profile.totalQuizzesCompleted", async function () {
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 5, 10, 5, 0
//       );
//       const [, , , , quizzes] = await staking.getUserProfile(user1.address);
//       expect(quizzes).to.equal(1n);
//     });

//     it("increments profile.totalPointsEarned", async function () {
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 8, 10, 8, 0
//       );
//       const [, , totalPts] = await staking.getUserProfile(user1.address);
//       expect(totalPts).to.equal(8n);
//     });

//     it("updates stake.lastActivityTime", async function () {
//       const before = BigInt(await time.latest());
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 5, 10, 5, 0
//       );
//       const [, , lastActivity] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(lastActivity).to.be.gte(before);
//     });

//     it("emits QuizRecorded(user, correct, total, pointsEarned)", async function () {
//       await expect(
//         staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 7, 10, 7, 0)
//       ).to.emit(staking, "QuizRecorded").withArgs(user1.address, 7, 10, 7);
//     });

//     it("reverts: non-verifier caller", async function () {
//       await expect(
//         staking.connect(attacker).recordQuiz(user1.address, HabitType.Academics, 5, 10, 5, 0)
//       ).to.be.revertedWith("GoodCommit: caller is not verifier");
//     });

//     it("reverts: user has no active stake", async function () {
//       await expect(
//         staking.connect(verifier).recordQuiz(user2.address, HabitType.Academics, 5, 10, 5, 0)
//       ).to.be.revertedWith("GoodCommit: no active stake");
//     });

//     it("reverts: totalQuestions = 0", async function () {
//       await expect(
//         staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 0, 0, 0, 0)
//       ).to.be.revertedWith("GoodCommit: zero questions");
//     });

//     it("reverts when paused", async function () {
//       await staking.connect(owner).pause();
//       await expect(
//         staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 5, 10, 5, 0)
//       ).to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 7. getPlantStage()
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("getPlantStage()", function () {

//     const give = async (pts: number) =>
//       staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, pts, pts, pts, 0
//       );

//     beforeEach(async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 90);
//     });

//     it("Seed at 0 pts",             async function () { expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Seed);     });
//     it("Seed at 9 pts",             async function () { await give(9);   expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Seed);     });
//     it("Sprout at exactly 10 pts",  async function () { await give(10);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Sprout);   });
//     it("Sprout at 29 pts",          async function () { await give(29);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Sprout);   });
//     it("Growing at exactly 30 pts", async function () { await give(30);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Growing);  });
//     it("Mature at exactly 60 pts",  async function () { await give(60);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Mature);   });
//     it("Fruiting at 100 pts",       async function () { await give(100); expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Fruiting); });
//     it("Fruiting above 100 pts",    async function () { await give(150); expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Fruiting); });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 8. _applyDecay() — triggered via recordWorkout / recordQuiz
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Point Decay", function () {

//     const ping = async () =>
//       staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");

//     beforeEach(async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");
//     });

//     it("no decay when < 1 full day passes (101 pts = 100 + 1 ping)", async function () {
//       await time.increase(DAY - 60);
//       await ping();
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(pts).to.equal(101n);
//     });

//     it("40% decay after 1 day: 100→60, +1 ping = 61", async function () {
//       await time.increase(DAY + 1);
//       await ping();
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(pts).to.equal(61n);
//     });

//     it("compound: 2 days → 100→60→36, +1 = 37", async function () {
//       await time.increase(2 * DAY + 1);
//       await ping();
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(pts).to.equal(37n);
//     });

//     it("compound: 3 days → 100→60→36→21, +1 = 22", async function () {
//       // +2 ensures the ping tx itself still lands in the 3rd full day window
//       await time.increase(3 * DAY + 3);
//       await ping();
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(pts).to.equal(22n);
//     });

//     it("decayed amount flows into decayRewardPool", async function () {
//       const poolBefore = await staking.decayRewardPool();
//       await time.increase(DAY + 1);
//       await ping();
//       expect(await staking.decayRewardPool() - poolBefore).to.equal(40n);
//     });

//     it("emits PointsDecayed when decay is applied", async function () {
//       await time.increase(DAY + 1);
//       await expect(ping()).to.emit(staking, "PointsDecayed");
//     });

//     it("does NOT emit PointsDecayed within the same day", async function () {
//       await time.increase(DAY - 60);
//       await expect(ping()).to.not.emit(staking, "PointsDecayed");
//     });

//     it("points never go below 0 after 30 days of inactivity", async function () {
//       await time.increase(30 * DAY);
//       await ping();
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(pts).to.be.gte(0n);
//     });

//     it("no decay when points = 0 (early return path)", async function () {
//       await staking.connect(user2).stakeGDollar(HabitType.Academics, e18(100), 30);
//       const poolBefore = await staking.decayRewardPool();
//       await time.increase(DAY + 1);
//       await staking.connect(verifier).recordQuiz(user2.address, HabitType.Academics, 5, 10, 5, 0);
//       expect(await staking.decayRewardPool()).to.equal(poolBefore);
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 9. claimPoints()
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("claimPoints()", function () {

//     // Strategy: stake for 1 day, advance past commitmentEnd, THEN record the
//     // quiz so lastActivityTime is current and _applyDecay sees 0 elapsed days.
//     // This gives clean 100-point tests. The decay-before-claim test handles
//     // decay explicitly in its own setup.
//     beforeEach(async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
//       // Advance past the 1-day commitmentEnd FIRST
//       await time.increase(DAY + 1);
//       // Record quiz NOW so lastActivityTime = current block (no decay gap)
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 100, 100, 100, 0
//       );
//     });

//     it("transfers correct payout: 100 pts / 10 = 10 G$", async function () {
//       const before = await mockGToken.balanceOf(user1.address);
//       await staking.connect(user1).claimPoints(HabitType.Academics);
//       expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(10));
//     });

//     it("resets stake.points to 0", async function () {
//       await staking.connect(user1).claimPoints(HabitType.Academics);
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(pts).to.equal(0n);
//     });

//     it("stake remains active after claim", async function () {
//       await staking.connect(user1).claimPoints(HabitType.Academics);
//       const [, , , , active] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(active).to.be.true;
//     });

//     it("increments profile.totalClaimed", async function () {
//       await staking.connect(user1).claimPoints(HabitType.Academics);
//       const [, , , , , totalClaimed] = await staking.getUserProfile(user1.address);
//       expect(totalClaimed).to.equal(e18(10));
//     });

//     it("reduces contractGDollarBalance by payout", async function () {
//       const before = await staking.contractGDollarBalance();
//       await staking.connect(user1).claimPoints(HabitType.Academics);
//       expect(before - await staking.contractGDollarBalance()).to.equal(e18(10));
//     });

//     it("applies decay before payout: 1 inactive day → 60 pts → 6 G$", async function () {
//       // Advance 1 full day so decay fires inside claimPoints: 100 * 0.6 = 60 pts = 6 G$
//       await time.increase(DAY + 1);
//       const before = await mockGToken.balanceOf(user1.address);
//       await staking.connect(user1).claimPoints(HabitType.Academics);
//       expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(6));
//     });

//     it("emits PointsClaimed(user, habitType, payout)", async function () {
//       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
//         .to.emit(staking, "PointsClaimed")
//         .withArgs(user1.address, HabitType.Academics, e18(10));
//     });

//     it("reverts: no active stake", async function () {
//       await expect(staking.connect(attacker).claimPoints(HabitType.Academics))
//         .to.be.revertedWith("GoodCommit: no active stake");
//     });

//     it("reverts: points < 100", async function () {
//       await staking.connect(user2).stakeGDollar(HabitType.Academics, e18(100), 1);
//       await time.increase(DAY + 1);
//       await staking.connect(verifier).recordQuiz(
//         user2.address, HabitType.Academics, 50, 100, 50, 0
//       );
//       await expect(staking.connect(user2).claimPoints(HabitType.Academics))
//         .to.be.revertedWith("GoodCommit: need 100+ points to claim");
//     });

//     it("reverts: commitment period not ended", async function () {
//       await staking.connect(user2).stakeGDollar(HabitType.Academics, e18(100), 30);
//       await staking.connect(verifier).recordQuiz(
//         user2.address, HabitType.Academics, 100, 100, 100, 0
//       );
//       // Only 1 day of 30 has passed
//       await time.increase(DAY);
//       await expect(staking.connect(user2).claimPoints(HabitType.Academics))
//         .to.be.revertedWith("GoodCommit: commitment period not ended yet");
//     });

//     it("reverts: insufficient contract balance for payout", async function () {
//       await staking.connect(owner).pause();
//       await staking.connect(owner).emergencyWithdraw();
//       await staking.connect(owner).unpause();
//       await mockGToken.connect(owner).approve(stakingAddr, e18(1));
//       await staking.connect(owner).fundContract(e18(1));
//       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
//         .to.be.revertedWith("GoodCommit: insufficient contract balance for harvest");
//     });

//     it("reverts when paused", async function () {
//       await staking.connect(owner).pause();
//       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
//         .to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 10. unstakeTokens()
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("unstakeTokens()", function () {

//     beforeEach(async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
//     });

//     it("returns full stakedAmount to user", async function () {
//       const before = await mockGToken.balanceOf(user1.address);
//       await staking.connect(user1).unstakeTokens(HabitType.Health);
//       expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(500));
//     });

//     it("sets stakedAmount = 0 and active = false", async function () {
//       await staking.connect(user1).unstakeTokens(HabitType.Health);
//       const [staked, , , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(staked).to.equal(0n);
//       expect(active).to.be.false;
//     });

//     it("preserves accumulated points", async function () {
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 40, "run");
//       await staking.connect(user1).unstakeTokens(HabitType.Health);
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(pts).to.equal(40n);
//     });

//     it("reduces contractGDollarBalance by unstaked amount", async function () {
//       const before = await staking.contractGDollarBalance();
//       await staking.connect(user1).unstakeTokens(HabitType.Health);
//       expect(before - await staking.contractGDollarBalance()).to.equal(e18(500));
//     });

//     it("user can re-stake after unstaking", async function () {
//       await staking.connect(user1).unstakeTokens(HabitType.Health);
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(200), 14);
//       const [newAmt, , , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(newAmt).to.equal(e18(200));
//       expect(active).to.be.true;
//     });

//     it("emits Unstaked(user, habitType, amount)", async function () {
//       await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
//         .to.emit(staking, "Unstaked")
//         .withArgs(user1.address, HabitType.Health, e18(500));
//     });

//     it("reverts: no active stake", async function () {
//       await expect(staking.connect(attacker).unstakeTokens(HabitType.Health))
//         .to.be.revertedWith("GoodCommit: no active stake");
//     });

//     it("reverts on double-unstake", async function () {
//       await staking.connect(user1).unstakeTokens(HabitType.Health);
//       await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
//         .to.be.revertedWith("GoodCommit: no active stake");
//     });

//     it("reverts when paused", async function () {
//       await staking.connect(owner).pause();
//       await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
//         .to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 11. slashStake()
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("slashStake()", function () {

//     beforeEach(async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
//       await time.increase(3 * DAY + 1);
//     });

//     it("sends 60% to ubiPool", async function () {
//       const before = await mockGToken.balanceOf(ubiPool.address);
//       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
//       expect(await mockGToken.balanceOf(ubiPool.address) - before).to.equal(e18(600));
//     });

//     it("sends 40% to rewardTreasury", async function () {
//       const before = await mockGToken.balanceOf(rewardTreasury.address);
//       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
//       expect(await mockGToken.balanceOf(rewardTreasury.address) - before).to.equal(e18(400));
//     });

//     it("60% + 40% = 100% (full amount distributed)", async function () {
//       const ubiBefore = await mockGToken.balanceOf(ubiPool.address);
//       const treBefore = await mockGToken.balanceOf(rewardTreasury.address);
//       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
//       const total =
//         (await mockGToken.balanceOf(ubiPool.address)        - ubiBefore) +
//         (await mockGToken.balanceOf(rewardTreasury.address) - treBefore);
//       expect(total).to.equal(e18(1000));
//     });

//     it("resets stake: active=false, stakedAmount=0, points=0", async function () {
//       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
//       const [staked, pts, , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(staked).to.equal(0n);
//       expect(pts).to.equal(0n);
//       expect(active).to.be.false;
//     });

//     it("emits StakeSlashed(user, habitType, reason, ubiAmount, treasuryAmount)", async function () {
//       await expect(
//         staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive")
//       ).to.emit(staking, "StakeSlashed")
//         .withArgs(user1.address, HabitType.Health, "inactive", e18(600), e18(400));
//     });

//     it("reverts: non-verifier caller", async function () {
//       await expect(
//         staking.connect(attacker).slashStake(user1.address, HabitType.Health, "inactive")
//       ).to.be.revertedWith("GoodCommit: caller is not verifier");
//     });

//     it("reverts: user not yet inactive (< 3 days)", async function () {
//       await staking.connect(user2).stakeGDollar(HabitType.Health, e18(100), 30);
//       await time.increase(DAY);
//       await expect(
//         staking.connect(verifier).slashStake(user2.address, HabitType.Health, "inactive")
//       ).to.be.revertedWith("GoodCommit: user not inactive yet");
//     });

//     it("reverts: no active stake", async function () {
//       await expect(
//         staking.connect(verifier).slashStake(attacker.address, HabitType.Health, "inactive")
//       ).to.be.revertedWith("GoodCommit: no active stake");
//     });

//     it("reverts when paused", async function () {
//       await staking.connect(owner).pause();
//       await expect(
//         staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive")
//       ).to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 12. isInactive()
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("isInactive()", function () {

//     beforeEach(async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//     });

//     it("false immediately after staking",              async function () { expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false; });
//     it("false one second before 3-day threshold",      async function () { await time.increase(3 * DAY - 1); expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false; });
//     it("true at exactly 3-day threshold",              async function () { await time.increase(3 * DAY);     expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.true;  });
//     it("true well past threshold",                     async function () { await time.increase(10 * DAY);    expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.true;  });
//     it("false for wallet with no active stake",        async function () { expect(await staking.isInactive(attacker.address, HabitType.Health)).to.be.false; });

//     it("resets to false after workout updates lastActivityTime", async function () {
//       await time.increase(2 * DAY);
//       await staking.connect(verifier).recordWorkout(
//         user1.address, HabitType.Health, 60, 5, "walk"
//       );
//       expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false;
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 13. Admin
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Admin", function () {

//     it("owner can setVerifier, emits VerifierUpdated", async function () {
//       await expect(staking.connect(owner).setVerifier(user2.address))
//         .to.emit(staking, "VerifierUpdated").withArgs(verifier.address, user2.address);
//       expect(await staking.verifier()).to.equal(user2.address);
//     });

//     it("owner can setRewardTreasury, emits TreasuryUpdated", async function () {
//       await expect(staking.connect(owner).setRewardTreasury(user2.address))
//         .to.emit(staking, "TreasuryUpdated").withArgs(rewardTreasury.address, user2.address);
//       expect(await staking.rewardTreasury()).to.equal(user2.address);
//     });

//     it("owner can setUbiPool, emits UbiPoolUpdated", async function () {
//       await expect(staking.connect(owner).setUbiPool(user2.address))
//         .to.emit(staking, "UbiPoolUpdated").withArgs(ubiPool.address, user2.address);
//       expect(await staking.ubiPool()).to.equal(user2.address);
//     });

//     it("setVerifier reverts on zero address",       async function () { await expect(staking.connect(owner).setVerifier(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
//     it("setRewardTreasury reverts on zero address", async function () { await expect(staking.connect(owner).setRewardTreasury(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
//     it("setUbiPool reverts on zero address",        async function () { await expect(staking.connect(owner).setUbiPool(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });

//     it("non-owner cannot setVerifier",       async function () { await expect(staking.connect(attacker).setVerifier(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
//     it("non-owner cannot setRewardTreasury", async function () { await expect(staking.connect(attacker).setRewardTreasury(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
//     it("non-owner cannot setUbiPool",        async function () { await expect(staking.connect(attacker).setUbiPool(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
//     it("non-owner cannot pause",             async function () { await expect(staking.connect(attacker).pause()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
//     it("non-owner cannot fundContract",      async function () { await expect(staking.connect(user1).fundContract(e18(100))).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });

//     it("owner can pause and block stakeGDollar", async function () {
//       await staking.connect(owner).pause();
//       expect(await staking.paused()).to.be.true;
//       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30))
//         .to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });

//     it("owner can unpause", async function () {
//       await staking.connect(owner).pause();
//       await staking.connect(owner).unpause();
//       expect(await staking.paused()).to.be.false;
//     });

//     it("emergencyWithdraw sends all G$ to owner when paused", async function () {
//       const contractBal = await staking.contractGDollarBalance();
//       const ownerBefore = await mockGToken.balanceOf(owner.address);
//       await staking.connect(owner).pause();
//       await staking.connect(owner).emergencyWithdraw();
//       expect(await mockGToken.balanceOf(owner.address) - ownerBefore).to.equal(contractBal);
//       expect(await staking.contractGDollarBalance()).to.equal(0n);
//     });

//     it("emergencyWithdraw reverts when not paused", async function () {
//       await expect(staking.connect(owner).emergencyWithdraw())
//         .to.be.revertedWithCustomError(staking, "ExpectedPause");
//     });

//     it("non-owner cannot emergencyWithdraw", async function () {
//       await staking.connect(owner).pause();
//       await expect(staking.connect(attacker).emergencyWithdraw())
//         .to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
//     });

//     it("fundContract increases contractGDollarBalance", async function () {
//       const before = await staking.contractGDollarBalance();
//       await mockGToken.connect(owner).approve(stakingAddr, e18(5_000));
//       await staking.connect(owner).fundContract(e18(5_000));
//       expect(await staking.contractGDollarBalance() - before).to.equal(e18(5_000));
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 14. View functions
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("View functions", function () {

//     it("getHabitStake returns zeros for user that never staked", async function () {
//       const [staked, pts, lastActivity, commitmentEnd, active] =
//         await staking.getHabitStake(attacker.address, HabitType.Health);
//       expect(staked).to.equal(0n);
//       expect(pts).to.equal(0n);
//       expect(lastActivity).to.equal(0n);
//       expect(commitmentEnd).to.equal(0n);
//       expect(active).to.be.false;
//     });

//     it("getUserProfile returns zeros for user that never interacted", async function () {
//       const [init, seed, totalPts, workouts, quizzes, claimed, staked] =
//         await staking.getUserProfile(attacker.address);
//       expect(init).to.be.false;
//       expect(seed).to.be.false;
//       expect(totalPts).to.equal(0n);
//       expect(workouts).to.equal(0n);
//       expect(quizzes).to.equal(0n);
//       expect(claimed).to.equal(0n);
//       expect(staked).to.equal(0n);
//     });

//     it("contractGDollarBalance matches real ERC-20 balance of contract", async function () {
//       expect(await staking.contractGDollarBalance())
//         .to.equal(await mockGToken.balanceOf(stakingAddr));
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 15. End-to-End: Academics Journey
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("End-to-End: Academics", function () {

//     it("seed → stake → 10 quizzes → Fruiting → claim → unstake", async function () {
//       await staking.connect(user1).claimInitialSeed();
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(10), 1);

//       // Record 9 quizzes before time advance (90 pts)
//       for (let i = 0; i < 9; i++) {
//         await staking.connect(verifier).recordQuiz(
//           user1.address, HabitType.Academics, 10, 10, 10, 0
//         );
//       }

//       // Advance past commitmentEnd
//       await time.increase(DAY + 1);

//       // Record final quiz AFTER advancing — sets lastActivityTime fresh (no decay)
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 10, 10, 10, 0
//       );

//       expect(await staking.getPlantStage(user1.address, HabitType.Academics))
//         .to.equal(PlantStage.Fruiting);

//       const w1 = await mockGToken.balanceOf(user1.address);
//       await staking.connect(user1).claimPoints(HabitType.Academics);
//       expect(await mockGToken.balanceOf(user1.address) - w1).to.equal(e18(10));

//       await staking.connect(user1).unstakeTokens(HabitType.Academics);
//       const [, , , , active] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(active).to.be.false;
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 16. End-to-End: Health Journey
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("End-to-End: Health", function () {

//     it("stake → 100pt workout → Fruiting → claim → unstake", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(50), 1);

//       // Advance past commitmentEnd with 0 points accumulated (nothing to decay)
//       await time.increase(DAY + 1);

//       // Record 100 pts NOW — lastActivityTime is current, so claimPoints sees 0 decay
//       await staking.connect(verifier).recordWorkout(
//         user1.address, HabitType.Health, 100, 100, "marathon"
//       );

//       expect(await staking.getPlantStage(user1.address, HabitType.Health))
//         .to.equal(PlantStage.Fruiting);

//       const before = await mockGToken.balanceOf(user1.address);
//       await staking.connect(user1).claimPoints(HabitType.Health);
//       // 100 pts, no decay → 10 G$
//       expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(10));

//       await staking.connect(user1).unstakeTokens(HabitType.Health);
//       const [, , , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(active).to.be.false;
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // 17. End-to-End: Slash Journey
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("End-to-End: Slash", function () {

//     it("stake → inactive → slashed → re-stake works", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
//       await time.increase(3 * DAY + 1);
//       expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.true;

//       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "3d inactive");
//       const [, , , , afterActive] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(afterActive).to.be.false;

//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(200), 30);
//       const [newAmt, , , , newActive] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(newAmt).to.equal(e18(200));
//       expect(newActive).to.be.true;
//     });
//   });
// });








// // import { expect } from "chai";
// // import { ethers } from "hardhat";
// // import { time } from "@nomicfoundation/hardhat-network-helpers";
// // import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// // // ─────────────────────────────────────────────────────────────────────────────
// // // GoodCommitStaking — Main Test Suite
// // // Contract: contracts/GoodCommitStaking.sol (V3)
// // //
// // // Constructor (5 args):
// // //   GoodCommitStaking(gDollarToken, identityContract, verifier, rewardTreasury, ubiPool)
// // //
// // // Mocks needed:
// // //   contracts/MockGToken.sol    — ERC20 with mint/burn
// // //   contracts/MockIdentity.sol  — getWhitelistedRoot / isWhitelisted
// // // ─────────────────────────────────────────────────────────────────────────────

// // // Enum mirrors — match Solidity declaration order exactly
// // const HabitType  = { Health: 0,   Academics: 1 } as const;
// // const PlantStage = { Seed: 0, Sprout: 1, Growing: 2, Mature: 3, Fruiting: 4 } as const;

// // const DAY  = 86_400;
// // const e18  = (n: number | string) => ethers.parseEther(String(n));

// // const SEED_AMOUNT = e18(10); // 10 G$

// // // ─────────────────────────────────────────────────────────────────────────────
// // describe("GoodCommitStaking", function () {

// //   let staking:        any;
// //   let mockGToken:     any;
// //   let mockIdentity:   any;
// //   let stakingAddr:    string;

// //   let owner:          SignerWithAddress;
// //   let user1:          SignerWithAddress;
// //   let user2:          SignerWithAddress;
// //   let ubiPool:        SignerWithAddress;
// //   let rewardTreasury: SignerWithAddress;
// //   let verifier:       SignerWithAddress;
// //   let attacker:       SignerWithAddress;

// //   beforeEach(async function () {
// //     [owner, user1, user2, ubiPool, rewardTreasury, verifier, attacker] =
// //       await ethers.getSigners();

// //     mockGToken   = await (await ethers.getContractFactory("MockGToken")).deploy();
// //     mockIdentity = await (await ethers.getContractFactory("MockIdentity")).deploy();

// //     // 5-arg constructor — V3
// //     staking = await (await ethers.getContractFactory("GoodCommitStaking")).deploy(
// //       await mockGToken.getAddress(),    // _gDollarToken
// //       await mockIdentity.getAddress(),  // _identityContract
// //       verifier.address,                 // _verifier
// //       rewardTreasury.address,           // _rewardTreasury
// //       ubiPool.address,                  // _ubiPool
// //     );
// //     stakingAddr = await staking.getAddress();

// //     await mockGToken.mint(owner.address,    e18(500_000));
// //     await mockGToken.mint(user1.address,    e18(10_000));
// //     await mockGToken.mint(user2.address,    e18(10_000));
// //     await mockGToken.mint(attacker.address, e18(1_000));

// //     // Fund contract
// //     await mockGToken.connect(owner).approve(stakingAddr, e18(200_000));
// //     await staking.connect(owner).fundContract(e18(200_000));

// //     // Verify users in MockIdentity
// //     await mockIdentity.setVerified(user1.address, true);
// //     await mockIdentity.setVerified(user2.address, true);

// //     // Pre-approve
// //     await mockGToken.connect(user1).approve(stakingAddr, e18(10_000));
// //     await mockGToken.connect(user2).approve(stakingAddr, e18(10_000));
// //     await mockGToken.connect(attacker).approve(stakingAddr, e18(1_000));
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 1. DEPLOYMENT
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Deployment", function () {

// //     it("stores gDollarToken correctly", async function () {
// //       expect(await staking.gDollarToken()).to.equal(await mockGToken.getAddress());
// //     });

// //     it("stores identityContract correctly", async function () {
// //       expect(await staking.identityContract()).to.equal(await mockIdentity.getAddress());
// //     });

// //     it("stores verifier correctly", async function () {
// //       expect(await staking.verifier()).to.equal(verifier.address);
// //     });

// //     it("stores rewardTreasury correctly", async function () {
// //       expect(await staking.rewardTreasury()).to.equal(rewardTreasury.address);
// //     });

// //     it("stores ubiPool correctly", async function () {
// //       expect(await staking.ubiPool()).to.equal(ubiPool.address);
// //     });

// //     it("sets deployer as owner", async function () {
// //       expect(await staking.owner()).to.equal(owner.address);
// //     });

// //     it("starts unpaused", async function () {
// //       expect(await staking.paused()).to.be.false;
// //     });

// //     it("contractGDollarBalance reflects funded amount", async function () {
// //       expect(await staking.contractGDollarBalance()).to.equal(e18(200_000));
// //     });

// //     it("decayRewardPool starts at zero", async function () {
// //       expect(await staking.decayRewardPool()).to.equal(0n);
// //     });

// //     it("reverts if _gDollarToken is zero", async function () {
// //       const F = await ethers.getContractFactory("GoodCommitStaking");
// //       await expect(F.deploy(
// //         ethers.ZeroAddress,
// //         await mockIdentity.getAddress(),
// //         verifier.address, rewardTreasury.address, ubiPool.address,
// //       )).to.be.revertedWith("Zero token");
// //     });

// //     it("reverts if _identityContract is zero", async function () {
// //       const F = await ethers.getContractFactory("GoodCommitStaking");
// //       await expect(F.deploy(
// //         await mockGToken.getAddress(),
// //         ethers.ZeroAddress,
// //         verifier.address, rewardTreasury.address, ubiPool.address,
// //       )).to.be.revertedWith("Zero identity");
// //     });

// //     it("reverts if _verifier is zero", async function () {
// //       const F = await ethers.getContractFactory("GoodCommitStaking");
// //       await expect(F.deploy(
// //         await mockGToken.getAddress(),
// //         await mockIdentity.getAddress(),
// //         ethers.ZeroAddress, rewardTreasury.address, ubiPool.address,
// //       )).to.be.revertedWith("Zero verifier");
// //     });

// //     it("reverts if _rewardTreasury is zero", async function () {
// //       const F = await ethers.getContractFactory("GoodCommitStaking");
// //       await expect(F.deploy(
// //         await mockGToken.getAddress(),
// //         await mockIdentity.getAddress(),
// //         verifier.address, ethers.ZeroAddress, ubiPool.address,
// //       )).to.be.revertedWith("Zero treasury");
// //     });

// //     it("reverts if _ubiPool is zero", async function () {
// //       const F = await ethers.getContractFactory("GoodCommitStaking");
// //       await expect(F.deploy(
// //         await mockGToken.getAddress(),
// //         await mockIdentity.getAddress(),
// //         verifier.address, rewardTreasury.address, ethers.ZeroAddress,
// //       )).to.be.revertedWith("Zero UBI pool");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 2. claimInitialSeed()
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("claimInitialSeed()", function () {

// //     it("transfers SEED_AMOUNT (10 G$) to caller", async function () {
// //       const before = await mockGToken.balanceOf(user1.address);
// //       await staking.connect(user1).claimInitialSeed();
// //       expect(await mockGToken.balanceOf(user1.address) - before).to.equal(SEED_AMOUNT);
// //     });

// //     it("reduces contractGDollarBalance by SEED_AMOUNT", async function () {
// //       const before = await staking.contractGDollarBalance();
// //       await staking.connect(user1).claimInitialSeed();
// //       expect(before - await staking.contractGDollarBalance()).to.equal(SEED_AMOUNT);
// //     });

// //     it("sets profile.hasClaimedSeed = true and profile.initialized = true", async function () {
// //       await staking.connect(user1).claimInitialSeed();
// //       const [init, seed] = await staking.getUserProfile(user1.address);
// //       expect(init).to.be.true;
// //       expect(seed).to.be.true;
// //     });

// //     it("sets rootHasClaimed[gdRoot] = true", async function () {
// //       await staking.connect(user1).claimInitialSeed();
// //       const root = await mockIdentity.getWhitelistedRoot(user1.address);
// //       expect(await staking.rootHasClaimed(root)).to.be.true;
// //     });

// //     it("emits SeedClaimed(user, gdRoot, SEED_AMOUNT)", async function () {
// //       const root = await mockIdentity.getWhitelistedRoot(user1.address);
// //       await expect(staking.connect(user1).claimInitialSeed())
// //         .to.emit(staking, "SeedClaimed")
// //         .withArgs(user1.address, root, SEED_AMOUNT);
// //     });

// //     it("reverts: wallet not GoodDollar verified", async function () {
// //       await expect(staking.connect(attacker).claimInitialSeed())
// //         .to.be.revertedWith("GoodCommit: wallet not GoodDollar verified - visit gooddollar.org");
// //     });

// //     it("reverts: second claim by same address", async function () {
// //       await staking.connect(user1).claimInitialSeed();
// //       await expect(staking.connect(user1).claimInitialSeed())
// //         .to.be.revertedWith("GoodCommit: seed already claimed");
// //     });

// //     it("reverts: different wallet shares same GD root (Sybil block)", async function () {
// //       const root1 = await mockIdentity.getWhitelistedRoot(user1.address);
// //       await mockIdentity.setRoot(user2.address, root1);
// //       await staking.connect(user1).claimInitialSeed();
// //       await expect(staking.connect(user2).claimInitialSeed())
// //         .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
// //     });

// //     it("reverts: contract has no G$ to distribute", async function () {
// //       await staking.connect(owner).pause();
// //       await staking.connect(owner).emergencyWithdraw();
// //       await staking.connect(owner).unpause();
// //       await expect(staking.connect(user1).claimInitialSeed())
// //         .to.be.revertedWith("GoodCommit: insufficient seed funds in contract");
// //     });

// //     it("two independent GD identities can both claim", async function () {
// //       await staking.connect(user1).claimInitialSeed();
// //       await staking.connect(user2).claimInitialSeed();
// //       const [, s1] = await staking.getUserProfile(user1.address);
// //       const [, s2] = await staking.getUserProfile(user2.address);
// //       expect(s1).to.be.true;
// //       expect(s2).to.be.true;
// //     });

// //     it("reverts when paused", async function () {
// //       await staking.connect(owner).pause();
// //       await expect(staking.connect(user1).claimInitialSeed())
// //         .to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 3. checkSeedEligibility()
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("checkSeedEligibility()", function () {

// //     it("returns (true, root, 'Eligible') for a fresh verified user", async function () {
// //       const [eligible, gdRoot, reason] = await staking.checkSeedEligibility(user1.address);
// //       const expectedRoot = await mockIdentity.getWhitelistedRoot(user1.address);
// //       expect(eligible).to.be.true;
// //       expect(gdRoot).to.equal(expectedRoot);
// //       expect(reason).to.equal("Eligible");
// //     });

// //     it("returns (false, zero, reason) for unverified wallet", async function () {
// //       const [eligible, gdRoot] = await staking.checkSeedEligibility(attacker.address);
// //       expect(eligible).to.be.false;
// //       expect(gdRoot).to.equal(ethers.ZeroAddress);
// //     });

// //     it("returns (false, root, 'already claimed') after seed claimed", async function () {
// //       await staking.connect(user1).claimInitialSeed();
// //       const [eligible, , reason] = await staking.checkSeedEligibility(user1.address);
// //       expect(eligible).to.be.false;
// //       expect(reason).to.include("already claimed");
// //     });

// //     it("returns (false, root, 'empty') when contract balance < SEED_AMOUNT", async function () {
// //       await staking.connect(owner).pause();
// //       await staking.connect(owner).emergencyWithdraw();
// //       await staking.connect(owner).unpause();
// //       const [eligible, , reason] = await staking.checkSeedEligibility(user1.address);
// //       expect(eligible).to.be.false;
// //       expect(reason).to.include("empty");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 4. stakeGDollar()
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("stakeGDollar()", function () {

// //     it("pulls G$ from user into contract", async function () {
// //       const userBefore     = await mockGToken.balanceOf(user1.address);
// //       const contractBefore = await staking.contractGDollarBalance();
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
// //       expect(await mockGToken.balanceOf(user1.address)).to.equal(userBefore - e18(500));
// //       expect(await staking.contractGDollarBalance()).to.equal(contractBefore + e18(500));
// //     });

// //     it("sets stakedAmount, active=true, commitmentEnd correctly", async function () {
// //       const now = BigInt(await time.latest());
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 7);
// //       const [staked, , , commitmentEnd, active] =
// //         await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(staked).to.equal(e18(100));
// //       expect(active).to.be.true;
// //       expect(commitmentEnd).to.be.closeTo(now + BigInt(7 * DAY), 5n);
// //     });

// //     it("top-up increments stakedAmount without resetting points", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //       await staking.connect(verifier).recordWorkout(
// //         user1.address, HabitType.Health, 3600, 40, "run"
// //       );
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(50), 30);
// //       const [staked, points] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(staked).to.equal(e18(150));
// //       expect(points).to.equal(40n);
// //     });

// //     it("Health and Academics stakes are independent", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health,    e18(100), 7);
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(200), 14);
// //       const [h] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       const [a] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(h).to.equal(e18(100));
// //       expect(a).to.equal(e18(200));
// //     });

// //     it("increments profile.totalStaked", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(300), 30);
// //       const [, , , , , , totalStaked] = await staking.getUserProfile(user1.address);
// //       expect(totalStaked).to.equal(e18(300));
// //     });

// //     it("sets profile.initialized = true", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //       const [init] = await staking.getUserProfile(user1.address);
// //       expect(init).to.be.true;
// //     });

// //     it("emits Staked(user, habitType, amount, durationDays)", async function () {
// //       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30))
// //         .to.emit(staking, "Staked")
// //         .withArgs(user1.address, HabitType.Health, e18(100), 30);
// //     });

// //     it("reverts: amount = 0", async function () {
// //       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, 0, 30))
// //         .to.be.revertedWith("GoodCommit: amount must be > 0");
// //     });

// //     it("reverts: durationDays = 0", async function () {
// //       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 0))
// //         .to.be.revertedWith("GoodCommit: duration 1-365 days");
// //     });

// //     it("reverts: durationDays = 366", async function () {
// //       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 366))
// //         .to.be.revertedWith("GoodCommit: duration 1-365 days");
// //     });

// //     it("accepts boundary durationDays = 1", async function () {
// //       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(10), 1))
// //         .to.not.be.reverted;
// //     });

// //     it("accepts boundary durationDays = 365", async function () {
// //       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(10), 365))
// //         .to.not.be.reverted;
// //     });

// //     it("reverts when paused", async function () {
// //       await staking.connect(owner).pause();
// //       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30))
// //         .to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 5. recordWorkout()
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("recordWorkout()", function () {

// //     beforeEach(async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //     });

// //     it("adds pointsEarned to stake.points", async function () {
// //       await staking.connect(verifier).recordWorkout(
// //         user1.address, HabitType.Health, 3600, 25, "run"
// //       );
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(pts).to.equal(25n);
// //     });

// //     it("accumulates across multiple workouts", async function () {
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 1800, 10, "walk");
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 20, "run");
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(pts).to.equal(30n);
// //     });

// //     it("increments profile.totalWorkoutsCompleted", async function () {
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "gym");
// //       const [, , , workouts] = await staking.getUserProfile(user1.address);
// //       expect(workouts).to.equal(1n);
// //     });

// //     it("increments profile.totalPointsEarned", async function () {
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 25, "gym");
// //       const [, , totalPts] = await staking.getUserProfile(user1.address);
// //       expect(totalPts).to.equal(25n);
// //     });

// //     it("updates stake.lastActivityTime", async function () {
// //       const before = BigInt(await time.latest());
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "gym");
// //       const [, , lastActivity] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(lastActivity).to.be.gte(before);
// //     });

// //     it("emits WorkoutRecorded(user, pointsEarned, exerciseType)", async function () {
// //       await expect(
// //         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 15, "cycling")
// //       ).to.emit(staking, "WorkoutRecorded").withArgs(user1.address, 15, "cycling");
// //     });

// //     it("reverts: non-verifier caller", async function () {
// //       await expect(
// //         staking.connect(attacker).recordWorkout(user1.address, HabitType.Health, 3600, 10, "run")
// //       ).to.be.revertedWith("GoodCommit: caller is not verifier");
// //     });

// //     it("reverts: user has no active stake", async function () {
// //       await expect(
// //         staking.connect(verifier).recordWorkout(user2.address, HabitType.Health, 3600, 10, "run")
// //       ).to.be.revertedWith("GoodCommit: no active stake");
// //     });

// //     it("reverts: duration = 0", async function () {
// //       await expect(
// //         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 0, 10, "run")
// //       ).to.be.revertedWith("GoodCommit: zero duration");
// //     });

// //     it("reverts: pointsEarned = 0", async function () {
// //       await expect(
// //         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 0, "run")
// //       ).to.be.revertedWith("GoodCommit: zero points");
// //     });

// //     it("reverts when paused", async function () {
// //       await staking.connect(owner).pause();
// //       await expect(
// //         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "run")
// //       ).to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 6. recordQuiz()
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("recordQuiz()", function () {

// //     beforeEach(async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
// //     });

// //     it("adds pointsEarned with zero penalty", async function () {
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 7, 10, 7, 0
// //       );
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(pts).to.equal(7n);
// //     });

// //     it("perfect 10/10 quiz adds 10 points", async function () {
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 10, 10, 10, 0
// //       );
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(pts).to.equal(10n);
// //     });

// //     it("applies negative penalty: 10 pts − 3 = 7", async function () {
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 10, 10, 10, 0
// //       );
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 0, 10, 0, -3
// //       );
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(pts).to.equal(7n);
// //     });

// //     it("points floor at 0 — large penalty cannot underflow", async function () {
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 0, 10, 0, -999_999
// //       );
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(pts).to.equal(0n);
// //     });

// //     it("increments profile.totalQuizzesCompleted", async function () {
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 5, 10, 5, 0
// //       );
// //       const [, , , , quizzes] = await staking.getUserProfile(user1.address);
// //       expect(quizzes).to.equal(1n);
// //     });

// //     it("increments profile.totalPointsEarned", async function () {
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 8, 10, 8, 0
// //       );
// //       const [, , totalPts] = await staking.getUserProfile(user1.address);
// //       expect(totalPts).to.equal(8n);
// //     });

// //     it("updates stake.lastActivityTime", async function () {
// //       const before = BigInt(await time.latest());
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 5, 10, 5, 0
// //       );
// //       const [, , lastActivity] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(lastActivity).to.be.gte(before);
// //     });

// //     it("emits QuizRecorded(user, correct, total, pointsEarned)", async function () {
// //       await expect(
// //         staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 7, 10, 7, 0)
// //       ).to.emit(staking, "QuizRecorded").withArgs(user1.address, 7, 10, 7);
// //     });

// //     it("reverts: non-verifier caller", async function () {
// //       await expect(
// //         staking.connect(attacker).recordQuiz(user1.address, HabitType.Academics, 5, 10, 5, 0)
// //       ).to.be.revertedWith("GoodCommit: caller is not verifier");
// //     });

// //     it("reverts: user has no active stake", async function () {
// //       await expect(
// //         staking.connect(verifier).recordQuiz(user2.address, HabitType.Academics, 5, 10, 5, 0)
// //       ).to.be.revertedWith("GoodCommit: no active stake");
// //     });

// //     it("reverts: totalQuestions = 0", async function () {
// //       await expect(
// //         staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 0, 0, 0, 0)
// //       ).to.be.revertedWith("GoodCommit: zero questions");
// //     });

// //     it("reverts when paused", async function () {
// //       await staking.connect(owner).pause();
// //       await expect(
// //         staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 5, 10, 5, 0)
// //       ).to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 7. getPlantStage()
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("getPlantStage()", function () {

// //     const give = async (pts: bigint) =>
// //       staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, pts, pts, pts, 0
// //       );

// //     beforeEach(async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 90);
// //     });

// //     it("Seed at 0 pts",             async function () { expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Seed);     });
// //     it("Seed at 9 pts",             async function () { await give(9);   expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Seed);     });
// //     it("Sprout at exactly 10 pts",  async function () { await give(10);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Sprout);   });
// //     it("Sprout at 29 pts",          async function () { await give(29);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Sprout);   });
// //     it("Growing at exactly 30 pts", async function () { await give(30);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Growing);  });
// //     it("Mature at exactly 60 pts",  async function () { await give(60);  expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Mature);   });
// //     it("Fruiting at 100 pts",       async function () { await give(100); expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Fruiting); });
// //     it("Fruiting above 100 pts",    async function () { await give(150); expect(await staking.getPlantStage(user1.address, HabitType.Academics)).to.equal(PlantStage.Fruiting); });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 8. _applyDecay() — triggered via recordWorkout / recordQuiz
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Point Decay", function () { 

// //     const ping = async () =>
// //       staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");

// //     beforeEach(async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");
// //     });

// //     it("no decay when < 1 full day passes (101 pts = 100 + 1 ping)", async function () {
// //       await time.increase(DAY - 60);
// //       await ping();
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(pts).to.equal(101n);
// //     });

// //     it("40% decay after 1 day: 100→60, +1 ping = 61", async function () {
// //       await time.increase(DAY + 1);
// //       await ping();
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(pts).to.equal(61n);
// //     });

// //     it("compound: 2 days → 100→60→36, +1 = 37", async function () {
// //       await time.increase(2 * DAY + 1);
// //       await ping();
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(pts).to.equal(37n);
// //     });

// //     it("compound: 3 days → 100→60→36→21, +1 = 22", async function () {
// //       await time.increase(3 * DAY + 1);
// //       await ping();
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(pts).to.equal(22n);
// //     });

// //     it("decayed amount flows into decayRewardPool", async function () {
// //       const poolBefore = await staking.decayRewardPool();
// //       await time.increase(DAY + 1);
// //       await ping();
// //       expect(await staking.decayRewardPool() - poolBefore).to.equal(40n);
// //     });

// //     it("emits PointsDecayed when decay is applied", async function () {
// //       await time.increase(DAY + 1);
// //       await expect(ping()).to.emit(staking, "PointsDecayed");
// //     });

// //     it("does NOT emit PointsDecayed within the same day", async function () {
// //       await time.increase(DAY - 60);
// //       await expect(ping()).to.not.emit(staking, "PointsDecayed");
// //     });

// //     it("points never go below 0 after 30 days of inactivity", async function () {
// //       await time.increase(30 * DAY);
// //       await ping();
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(pts).to.be.gte(0n);
// //     });

// //     it("no decay when points = 0 (early return path)", async function () {
// //       await staking.connect(user2).stakeGDollar(HabitType.Academics, e18(100), 30);
// //       const poolBefore = await staking.decayRewardPool();
// //       await time.increase(DAY + 1);
// //       await staking.connect(verifier).recordQuiz(user2.address, HabitType.Academics, 5, 10, 5, 0);
// //       expect(await staking.decayRewardPool()).to.equal(poolBefore);
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 9. claimPoints()
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("claimPoints()", function () {

// //     beforeEach(async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 100, 100, 100, 0
// //       );
// //       await time.increase(DAY + 1);
// //     });

// //     it("transfers correct payout: 100 pts / 10 = 10 G$", async function () {
// //       const before = await mockGToken.balanceOf(user1.address);
// //       await staking.connect(user1).claimPoints(HabitType.Academics);
// //       expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(10));
// //     });

// //     it("resets stake.points to 0", async function () {
// //       await staking.connect(user1).claimPoints(HabitType.Academics);
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(pts).to.equal(0n);
// //     });

// //     it("stake remains active after claim", async function () {
// //       await staking.connect(user1).claimPoints(HabitType.Academics);
// //       const [, , , , active] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(active).to.be.true;
// //     });

// //     it("increments profile.totalClaimed", async function () {
// //       await staking.connect(user1).claimPoints(HabitType.Academics);
// //       const [, , , , , totalClaimed] = await staking.getUserProfile(user1.address);
// //       expect(totalClaimed).to.equal(e18(10));
// //     });

// //     it("reduces contractGDollarBalance by payout", async function () {
// //       const before = await staking.contractGDollarBalance();
// //       await staking.connect(user1).claimPoints(HabitType.Academics);
// //       expect(before - await staking.contractGDollarBalance()).to.equal(e18(10));
// //     });

// //     it("applies decay before payout: +1 extra day → 60 pts → 6 G$", async function () {
// //       await time.increase(DAY);
// //       const before = await mockGToken.balanceOf(user1.address);
// //       await staking.connect(user1).claimPoints(HabitType.Academics);
// //       expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(6));
// //     });

// //     it("emits PointsClaimed(user, habitType, payout)", async function () {
// //       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
// //         .to.emit(staking, "PointsClaimed")
// //         .withArgs(user1.address, HabitType.Academics, e18(10));
// //     });

// //     it("reverts: no active stake", async function () {
// //       await expect(staking.connect(attacker).claimPoints(HabitType.Academics))
// //         .to.be.revertedWith("GoodCommit: no active stake");
// //     });

// //     it("reverts: points < 100", async function () {
// //       await staking.connect(user2).stakeGDollar(HabitType.Academics, e18(100), 1);
// //       await staking.connect(verifier).recordQuiz(
// //         user2.address, HabitType.Academics, 50, 100, 50, 0
// //       );
// //       await time.increase(DAY + 1);
// //       await expect(staking.connect(user2).claimPoints(HabitType.Academics))
// //         .to.be.revertedWith("GoodCommit: need 100+ points to claim");
// //     });

// //     it("reverts: commitment period not ended", async function () {
// //       await staking.connect(user2).stakeGDollar(HabitType.Academics, e18(100), 30);
// //       await staking.connect(verifier).recordQuiz(
// //         user2.address, HabitType.Academics, 100, 100, 100, 0
// //       );
// //       await time.increase(DAY);
// //       await expect(staking.connect(user2).claimPoints(HabitType.Academics))
// //         .to.be.revertedWith("GoodCommit: commitment period not ended yet");
// //     });

// //     it("reverts: insufficient contract balance for payout", async function () {
// //       await staking.connect(owner).pause();
// //       await staking.connect(owner).emergencyWithdraw();
// //       await staking.connect(owner).unpause();
// //       await mockGToken.connect(owner).approve(stakingAddr, e18(1));
// //       await staking.connect(owner).fundContract(e18(1));
// //       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
// //         .to.be.revertedWith("GoodCommit: insufficient contract balance for harvest");
// //     });

// //     it("reverts when paused", async function () {
// //       await staking.connect(owner).pause();
// //       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
// //         .to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 10. unstakeTokens()
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("unstakeTokens()", function () {

// //     beforeEach(async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
// //     });

// //     it("returns full stakedAmount to user", async function () {
// //       const before = await mockGToken.balanceOf(user1.address);
// //       await staking.connect(user1).unstakeTokens(HabitType.Health);
// //       expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(500));
// //     });

// //     it("sets stakedAmount = 0 and active = false", async function () {
// //       await staking.connect(user1).unstakeTokens(HabitType.Health);
// //       const [staked, , , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(staked).to.equal(0n);
// //       expect(active).to.be.false;
// //     });

// //     it("preserves accumulated points", async function () {
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 40, "run");
// //       await staking.connect(user1).unstakeTokens(HabitType.Health);
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(pts).to.equal(40n);
// //     });

// //     it("reduces contractGDollarBalance by unstaked amount", async function () {
// //       const before = await staking.contractGDollarBalance();
// //       await staking.connect(user1).unstakeTokens(HabitType.Health);
// //       expect(before - await staking.contractGDollarBalance()).to.equal(e18(500));
// //     });

// //     it("user can re-stake after unstaking", async function () {
// //       await staking.connect(user1).unstakeTokens(HabitType.Health);
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(200), 14);
// //       const [newAmt, , , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(newAmt).to.equal(e18(200));
// //       expect(active).to.be.true;
// //     });

// //     it("emits Unstaked(user, habitType, amount)", async function () {
// //       await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
// //         .to.emit(staking, "Unstaked")
// //         .withArgs(user1.address, HabitType.Health, e18(500));
// //     });

// //     it("reverts: no active stake", async function () {
// //       await expect(staking.connect(attacker).unstakeTokens(HabitType.Health))
// //         .to.be.revertedWith("GoodCommit: no active stake");
// //     });

// //     it("reverts on double-unstake", async function () {
// //       await staking.connect(user1).unstakeTokens(HabitType.Health);
// //       await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
// //         .to.be.revertedWith("GoodCommit: no active stake");
// //     });

// //     it("reverts when paused", async function () {
// //       await staking.connect(owner).pause();
// //       await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
// //         .to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 11. slashStake()
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("slashStake()", function () {

// //     beforeEach(async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
// //       await time.increase(3 * DAY + 1);
// //     });

// //     it("sends 60% to ubiPool", async function () {
// //       const before = await mockGToken.balanceOf(ubiPool.address);
// //       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
// //       expect(await mockGToken.balanceOf(ubiPool.address) - before).to.equal(e18(600));
// //     });

// //     it("sends 40% to rewardTreasury", async function () {
// //       const before = await mockGToken.balanceOf(rewardTreasury.address);
// //       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
// //       expect(await mockGToken.balanceOf(rewardTreasury.address) - before).to.equal(e18(400));
// //     });

// //     it("60% + 40% = 100% (full amount distributed)", async function () {
// //       const ubiBefore = await mockGToken.balanceOf(ubiPool.address);
// //       const treBefore = await mockGToken.balanceOf(rewardTreasury.address);
// //       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
// //       const total =
// //         (await mockGToken.balanceOf(ubiPool.address)        - ubiBefore) +
// //         (await mockGToken.balanceOf(rewardTreasury.address) - treBefore);
// //       expect(total).to.equal(e18(1000));
// //     });

// //     it("resets stake: active=false, stakedAmount=0, points=0", async function () {
// //       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
// //       const [staked, pts, , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(staked).to.equal(0n);
// //       expect(pts).to.equal(0n);
// //       expect(active).to.be.false;
// //     });

// //     it("emits StakeSlashed(user, habitType, reason, ubiAmount, treasuryAmount)", async function () {
// //       await expect(
// //         staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive")
// //       ).to.emit(staking, "StakeSlashed")
// //         .withArgs(user1.address, HabitType.Health, "inactive", e18(600), e18(400));
// //     });

// //     it("reverts: non-verifier caller", async function () {
// //       await expect(
// //         staking.connect(attacker).slashStake(user1.address, HabitType.Health, "inactive")
// //       ).to.be.revertedWith("GoodCommit: caller is not verifier");
// //     });

// //     it("reverts: user not yet inactive (< 3 days)", async function () {
// //       await staking.connect(user2).stakeGDollar(HabitType.Health, e18(100), 30);
// //       await time.increase(DAY);
// //       await expect(
// //         staking.connect(verifier).slashStake(user2.address, HabitType.Health, "inactive")
// //       ).to.be.revertedWith("GoodCommit: user not inactive yet");
// //     });

// //     it("reverts: no active stake", async function () {
// //       await expect(
// //         staking.connect(verifier).slashStake(attacker.address, HabitType.Health, "inactive")
// //       ).to.be.revertedWith("GoodCommit: no active stake");
// //     });

// //     it("reverts when paused", async function () {
// //       await staking.connect(owner).pause();
// //       await expect(
// //         staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive")
// //       ).to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 12. isInactive()
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("isInactive()", function () {

// //     beforeEach(async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //     });

// //     it("false immediately after staking",              async function () { expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false; });
// //     it("false one second before 3-day threshold",      async function () { await time.increase(3 * DAY - 1); expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false; });
// //     it("true at exactly 3-day threshold",              async function () { await time.increase(3 * DAY);     expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.true;  });
// //     it("true well past threshold",                     async function () { await time.increase(10 * DAY);    expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.true;  });
// //     it("false for wallet with no active stake",        async function () { expect(await staking.isInactive(attacker.address, HabitType.Health)).to.be.false; });

// //     it("resets to false after workout updates lastActivityTime", async function () {
// //       await time.increase(2 * DAY);
// //       await staking.connect(verifier).recordWorkout(
// //         user1.address, HabitType.Health, 60, 5, "walk"
// //       );
// //       expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false;
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 13. Admin
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Admin", function () {

// //     it("owner can setVerifier, emits VerifierUpdated", async function () {
// //       await expect(staking.connect(owner).setVerifier(user2.address))
// //         .to.emit(staking, "VerifierUpdated").withArgs(verifier.address, user2.address);
// //       expect(await staking.verifier()).to.equal(user2.address);
// //     });

// //     it("owner can setRewardTreasury, emits TreasuryUpdated", async function () {
// //       await expect(staking.connect(owner).setRewardTreasury(user2.address))
// //         .to.emit(staking, "TreasuryUpdated").withArgs(rewardTreasury.address, user2.address);
// //       expect(await staking.rewardTreasury()).to.equal(user2.address);
// //     });

// //     it("owner can setUbiPool, emits UbiPoolUpdated", async function () {
// //       await expect(staking.connect(owner).setUbiPool(user2.address))
// //         .to.emit(staking, "UbiPoolUpdated").withArgs(ubiPool.address, user2.address);
// //       expect(await staking.ubiPool()).to.equal(user2.address);
// //     });

// //     it("setVerifier reverts on zero address",       async function () { await expect(staking.connect(owner).setVerifier(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
// //     it("setRewardTreasury reverts on zero address", async function () { await expect(staking.connect(owner).setRewardTreasury(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
// //     it("setUbiPool reverts on zero address",        async function () { await expect(staking.connect(owner).setUbiPool(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });

// //     it("non-owner cannot setVerifier",       async function () { await expect(staking.connect(attacker).setVerifier(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
// //     it("non-owner cannot setRewardTreasury", async function () { await expect(staking.connect(attacker).setRewardTreasury(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
// //     it("non-owner cannot setUbiPool",        async function () { await expect(staking.connect(attacker).setUbiPool(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
// //     it("non-owner cannot pause",             async function () { await expect(staking.connect(attacker).pause()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
// //     it("non-owner cannot fundContract",      async function () { await expect(staking.connect(user1).fundContract(e18(100))).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });

// //     it("owner can pause and block stakeGDollar", async function () {
// //       await staking.connect(owner).pause();
// //       expect(await staking.paused()).to.be.true;
// //       await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30))
// //         .to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });

// //     it("owner can unpause", async function () {
// //       await staking.connect(owner).pause();
// //       await staking.connect(owner).unpause();
// //       expect(await staking.paused()).to.be.false;
// //     });

// //     it("emergencyWithdraw sends all G$ to owner when paused", async function () {
// //       const contractBal = await staking.contractGDollarBalance();
// //       const ownerBefore = await mockGToken.balanceOf(owner.address);
// //       await staking.connect(owner).pause();
// //       await staking.connect(owner).emergencyWithdraw();
// //       expect(await mockGToken.balanceOf(owner.address) - ownerBefore).to.equal(contractBal);
// //       expect(await staking.contractGDollarBalance()).to.equal(0n);
// //     });

// //     it("emergencyWithdraw reverts when not paused", async function () {
// //       await expect(staking.connect(owner).emergencyWithdraw())
// //         .to.be.revertedWithCustomError(staking, "ExpectedPause");
// //     });

// //     it("non-owner cannot emergencyWithdraw", async function () {
// //       await staking.connect(owner).pause();
// //       await expect(staking.connect(attacker).emergencyWithdraw())
// //         .to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
// //     });

// //     it("fundContract increases contractGDollarBalance", async function () {
// //       const before = await staking.contractGDollarBalance();
// //       await mockGToken.connect(owner).approve(stakingAddr, e18(5_000));
// //       await staking.connect(owner).fundContract(e18(5_000));
// //       expect(await staking.contractGDollarBalance() - before).to.equal(e18(5_000));
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 14. View functions
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("View functions", function () {

// //     it("getHabitStake returns zeros for user that never staked", async function () {
// //       const [staked, pts, lastActivity, commitmentEnd, active] =
// //         await staking.getHabitStake(attacker.address, HabitType.Health);
// //       expect(staked).to.equal(0n);
// //       expect(pts).to.equal(0n);
// //       expect(lastActivity).to.equal(0n);
// //       expect(commitmentEnd).to.equal(0n);
// //       expect(active).to.be.false;
// //     });

// //     it("getUserProfile returns zeros for user that never interacted", async function () {
// //       const [init, seed, totalPts, workouts, quizzes, claimed, staked] =
// //         await staking.getUserProfile(attacker.address);
// //       expect(init).to.be.false;
// //       expect(seed).to.be.false;
// //       expect(totalPts).to.equal(0n);
// //       expect(workouts).to.equal(0n);
// //       expect(quizzes).to.equal(0n);
// //       expect(claimed).to.equal(0n);
// //       expect(staked).to.equal(0n);
// //     });

// //     it("contractGDollarBalance matches real ERC-20 balance of contract", async function () {
// //       expect(await staking.contractGDollarBalance())
// //         .to.equal(await mockGToken.balanceOf(stakingAddr));
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 15. End-to-End: Academics Journey
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("End-to-End: Academics", function () {

// //     it("seed → stake → 10 quizzes → Fruiting → claim → unstake", async function () {
// //       await staking.connect(user1).claimInitialSeed();
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(10), 1);

// //       for (let i = 0; i < 10; i++) {
// //         await staking.connect(verifier).recordQuiz(
// //           user1.address, HabitType.Academics, 10, 10, 10, 0
// //         );
// //       }

// //       expect(await staking.getPlantStage(user1.address, HabitType.Academics))
// //         .to.equal(PlantStage.Fruiting);

// //       await time.increase(DAY + 1);

// //       const w1 = await mockGToken.balanceOf(user1.address);
// //       await staking.connect(user1).claimPoints(HabitType.Academics);
// //       expect(await mockGToken.balanceOf(user1.address) - w1).to.equal(e18(10));

// //       await staking.connect(user1).unstakeTokens(HabitType.Academics);
// //       const [, , , , active] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(active).to.be.false;
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 16. End-to-End: Health Journey
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("End-to-End: Health", function () {

// //     it("stake → 100pt workout → Fruiting → claim → unstake", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(50), 1);
// //       await staking.connect(verifier).recordWorkout(
// //         user1.address, HabitType.Health, 100, 100, "marathon"
// //       );
// //       expect(await staking.getPlantStage(user1.address, HabitType.Health))
// //         .to.equal(PlantStage.Fruiting);

// //       await time.increase(DAY + 1);

// //       const before = await mockGToken.balanceOf(user1.address);
// //       await staking.connect(user1).claimPoints(HabitType.Health);
// //       expect(await mockGToken.balanceOf(user1.address) - before).to.equal(e18(10));

// //       await staking.connect(user1).unstakeTokens(HabitType.Health);
// //       const [, , , , active] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(active).to.be.false;
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // 17. End-to-End: Slash Journey
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("End-to-End: Slash", function () {

// //     it("stake → inactive → slashed → re-stake works", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
// //       await time.increase(3 * DAY + 1);
// //       expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.true;

// //       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "3d inactive");
// //       const [, , , , afterActive] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(afterActive).to.be.false;

// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(200), 30);
// //       const [newAmt, , , , newActive] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(newAmt).to.equal(e18(200));
// //       expect(newActive).to.be.true;
// //     });
// //   });
// // });
