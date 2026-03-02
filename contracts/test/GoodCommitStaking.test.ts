import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { GoodCommitStaking, IGoodDollar } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("GoodCommitStaking", function () {
  let goodCommitStaking: GoodCommitStaking;
  let mockGToken: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let ubiPool: SignerWithAddress;
  let rewardTreasury: SignerWithAddress;
  let verifier: SignerWithAddress;

  const INITIAL_SEED_AMOUNT = ethers.parseEther("10");
  const POINTS_TO_GTOKEN_RATE = ethers.parseEther("0.1");
  const ONE_DAY = 24 * 60 * 60;

  beforeEach(async function () {
    [owner, user1, user2, ubiPool, rewardTreasury, verifier] = await ethers.getSigners();

    // Deploy mock G$ token
    const MockGToken = await ethers.getContractFactory("MockGToken");
    mockGToken = await MockGToken.deploy();

    // Deploy GoodCommitStaking
    const GoodCommitStaking = await ethers.getContractFactory("GoodCommitStaking");
    goodCommitStaking = await GoodCommitStaking.deploy(
      await mockGToken.getAddress(),
      ubiPool.address,
      rewardTreasury.address,
      verifier.address
    );

    // Mint tokens to treasury and approve contract
    const treasuryAmount = ethers.parseEther("1000000");
    await mockGToken.mint(rewardTreasury.address, treasuryAmount);
    await mockGToken.connect(rewardTreasury).approve(
      await goodCommitStaking.getAddress(),
      treasuryAmount
    );

    // Mint tokens to users for staking
    await mockGToken.mint(user1.address, ethers.parseEther("1000"));
    await mockGToken.mint(user2.address, ethers.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should set the correct addresses", async function () {
      expect(await goodCommitStaking.gToken()).to.equal(await mockGToken.getAddress());
      expect(await goodCommitStaking.ubiPool()).to.equal(ubiPool.address);
      expect(await goodCommitStaking.rewardTreasury()).to.equal(rewardTreasury.address);
      expect(await goodCommitStaking.verifier()).to.equal(verifier.address);
    });

    it("Should set the correct constants", async function () {
      expect(await goodCommitStaking.INITIAL_SEED_AMOUNT()).to.equal(INITIAL_SEED_AMOUNT);
      expect(await goodCommitStaking.POINTS_TO_GTOKEN_RATE()).to.equal(POINTS_TO_GTOKEN_RATE);
      expect(await goodCommitStaking.DAILY_DECAY_PERCENTAGE()).to.equal(40);
      expect(await goodCommitStaking.STAKE_ALL_BONUS()).to.equal(10);
      expect(await goodCommitStaking.STAKE_PARTIAL_BONUS()).to.equal(5);
    });
  });

  describe("Claim Initial Seed", function () {
    it("Should allow user to claim initial seed", async function () {
      await expect(goodCommitStaking.connect(user1).claimInitialSeed())
        .to.emit(goodCommitStaking, "SeedClaimed")
        .withArgs(user1.address, INITIAL_SEED_AMOUNT);

      const balance = await mockGToken.balanceOf(user1.address);
      expect(balance).to.be.gt(ethers.parseEther("1000")); // Original + seed
    });

    it("Should not allow claiming seed twice", async function () {
      await goodCommitStaking.connect(user1).claimInitialSeed();
      await expect(goodCommitStaking.connect(user1).claimInitialSeed())
        .to.be.revertedWith("Seed already claimed");
    });

    it("Should update user profile after claiming seed", async function () {
      await goodCommitStaking.connect(user1).claimInitialSeed();
      const profile = await goodCommitStaking.getUserProfile(user1.address);
      expect(profile.initialized).to.be.true;
      expect(profile.hasClaimedSeed).to.be.true;
    });
  });

  describe("Plant Seed (Staking)", function () {
    beforeEach(async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );
    });

    it("Should allow user to plant seed with G$ stake", async function () {
      const stakeAmount = ethers.parseEther("100");
      await expect(goodCommitStaking.connect(user1).plantSeed(0, stakeAmount, 7))
        .to.emit(goodCommitStaking, "StakePlanted")
        .withArgs(user1.address, 0, stakeAmount, 7);

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.stakedAmount).to.equal(stakeAmount);
      expect(stakeInfo.status).to.equal(0); // Seed status
    });

    it("Should reject zero stake amount", async function () {
      await expect(goodCommitStaking.connect(user1).plantSeed(0, 0, 7))
        .to.be.revertedWith("Stake amount must be > 0");
    });

    it("Should reject duration less than 1 day", async function () {
      await expect(goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 0))
        .to.be.revertedWith("Duration must be at least 1 day");
    });

    it("Should allow adding more stake to existing habit", async function () {
      await goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 7);
      await goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("50"), 7);

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.stakedAmount).to.equal(ethers.parseEther("150"));
    });
  });

  describe("Record Workout", function () {
    it("Should allow verifier to record workout and add points", async function () {
      await expect(
        goodCommitStaking.connect(verifier).recordWorkout(
          user1.address,
          0, // Health
          1800, // 30 minutes
          30, // 30 points
          "running"
        )
      )
        .to.emit(goodCommitStaking, "PointsAdded")
        .withArgs(user1.address, 0, 30, 30)
        .and.to.emit(goodCommitStaking, "WorkoutRecorded");

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.points).to.equal(30);
      expect(stakeInfo.currentStreak).to.equal(1);
    });

    it("Should reject non-verifier recording workout", async function () {
      await expect(
        goodCommitStaking.connect(user2).recordWorkout(
          user1.address,
          0,
          1800,
          30,
          "running"
        )
      ).to.be.revertedWith("Not authorized verifier");
    });

    it("Should reject recording workout for Academics habit type", async function () {
      await expect(
        goodCommitStaking.connect(verifier).recordWorkout(
          user1.address,
          1, // Academics
          1800,
          30,
          "running"
        )
      ).to.be.revertedWith("Must be Health habit");
    });

    it("Should update plant status based on points", async function () {
      // Add points to reach Sprout threshold (30)
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        35,
        "running"
      );

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.status).to.equal(1); // Sprout status
    });
  });

  describe("Record Quiz", function () {
    it("Should allow verifier to record quiz and add points", async function () {
      await expect(
        goodCommitStaking.connect(verifier).recordQuiz(
          user1.address,
          1, // Academics
          8, // correct answers
          10, // total questions
          80, // points earned
          0 // no penalty
        )
      )
        .to.emit(goodCommitStaking, "PointsAdded")
        .withArgs(user1.address, 1, 80, 80)
        .and.to.emit(goodCommitStaking, "QuizRecorded");

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 1);
      expect(stakeInfo.points).to.equal(80);
    });

    it("Should apply penalty for poor quiz performance", async function () {
      // First add some points
      await goodCommitStaking.connect(verifier).recordQuiz(
        user1.address,
        1,
        8,
        10,
        80,
        0
      );

      // Then apply penalty
      await goodCommitStaking.connect(verifier).recordQuiz(
        user1.address,
        1,
        0,
        10,
        0,
        -10 // penalty
      );

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 1);
      expect(stakeInfo.points).to.equal(70); // 80 - 10
    });

    it("Should not allow points to go below zero", async function () {
      await goodCommitStaking.connect(verifier).recordQuiz(
        user1.address,
        1,
        0,
        10,
        0,
        -100 // large penalty
      );

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 1);
      expect(stakeInfo.points).to.equal(0);
    });

    it("Should reject recording quiz for Health habit type", async function () {
      await expect(
        goodCommitStaking.connect(verifier).recordQuiz(
          user1.address,
          0, // Health
          8,
          10,
          80,
          0
        )
      ).to.be.revertedWith("Must be Academics habit");
    });
  });

  describe("Point Decay System", function () {
    it("Should apply 40% decay after 1 day of inactivity", async function () {
      // Add 100 points
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );

      // Fast forward 1 day
      await time.increase(ONE_DAY);

      // Check decay status
      const decayStatus = await goodCommitStaking.checkDecayStatus(user1.address, 0);
      expect(decayStatus.daysMissed).to.equal(1);
      expect(decayStatus.decayAmount).to.equal(40); // 40% of 100
      expect(decayStatus.pointsAfterDecay).to.equal(60);

      // Trigger decay by recording new workout
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        10,
        "running"
      );

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.points).to.equal(70); // 60 after decay + 10 new
    });

    it("Should apply compound decay over multiple days", async function () {
      // Add 100 points
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );

      // Fast forward 2 days
      await time.increase(2 * ONE_DAY);

      const decayStatus = await goodCommitStaking.checkDecayStatus(user1.address, 0);
      expect(decayStatus.daysMissed).to.equal(2);
      // Day 1: 100 * 0.6 = 60
      // Day 2: 60 * 0.6 = 36
      expect(decayStatus.pointsAfterDecay).to.equal(36);
    });

    it("Should wither plant after complete decay", async function () {
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );

      // Fast forward 8 days (complete wither)
      await time.increase(8 * ONE_DAY);

      // Trigger decay
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        10,
        "running"
      );

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.points).to.equal(10); // Only new points, old ones decayed
    });

    it("Should add decayed points to reward pool", async function () {
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );

      const poolBefore = await goodCommitStaking.getDecayRewardPool();

      await time.increase(ONE_DAY);

      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        10,
        "running"
      );

      const poolAfter = await goodCommitStaking.getDecayRewardPool();
      expect(poolAfter - poolBefore).to.equal(40); // 40% decayed
    });
  });

  describe("Claim All Points", function () {
    beforeEach(async function () {
      // Add 100 points
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );
    });

    it("Should allow user to claim all points", async function () {
      const balanceBefore = await mockGToken.balanceOf(user1.address);

      await expect(goodCommitStaking.connect(user1).claimAllPoints(0))
        .to.emit(goodCommitStaking, "PointsClaimed");

      const balanceAfter = await mockGToken.balanceOf(user1.address);
      const expectedGToken = ethers.parseEther("10"); // 100 points * 0.1 G$/point
      expect(balanceAfter - balanceBefore).to.equal(expectedGToken);

      // Should reset to seed
      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.points).to.equal(0);
      expect(stakeInfo.status).to.equal(0); // Seed
    });

    it("Should reject claiming with no points", async function () {
      await goodCommitStaking.connect(user1).claimAllPoints(0);
      await expect(goodCommitStaking.connect(user1).claimAllPoints(0))
        .to.be.revertedWith("No points to claim");
    });

    it("Should apply decay before claiming", async function () {
      await time.increase(ONE_DAY);

      const balanceBefore = await mockGToken.balanceOf(user1.address);
      await goodCommitStaking.connect(user1).claimAllPoints(0);
      const balanceAfter = await mockGToken.balanceOf(user1.address);

      // Should claim 60 points (after 40% decay)
      const expectedGToken = ethers.parseEther("6"); // 60 points * 0.1
      expect(balanceAfter - balanceBefore).to.equal(expectedGToken);
    });
  });

  describe("Stake Partial and Claim", function () {
    beforeEach(async function () {
      // Add 100 points
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );
    });

    it("Should allow staking partial points with 5% bonus", async function () {
      const balanceBefore = await mockGToken.balanceOf(user1.address);

      await goodCommitStaking.connect(user1).stakePartialAndClaim(0, 50);

      // Should claim 50 points = 5 G$
      const balanceAfter = await mockGToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("5"));

      // Should have 50 + 5% bonus = 52.5 points staked
      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.points).to.equal(52); // 50 + 2 (5% of 50, rounded down)
    });

    it("Should reject staking all points", async function () {
      await expect(goodCommitStaking.connect(user1).stakePartialAndClaim(0, 100))
        .to.be.revertedWith("Invalid stake amount");
    });

    it("Should reject staking zero points", async function () {
      await expect(goodCommitStaking.connect(user1).stakePartialAndClaim(0, 0))
        .to.be.revertedWith("Invalid stake amount");
    });
  });

  describe("Stake All Points", function () {
    beforeEach(async function () {
      // Add 100 points
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );
    });

    it("Should allow staking all points with 10% bonus", async function () {
      await expect(goodCommitStaking.connect(user1).stakeAllPoints(0))
        .to.emit(goodCommitStaking, "PointsStaked")
        .withArgs(user1.address, 0, 100, 10);

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.points).to.equal(110); // 100 + 10% bonus
    });

    it("Should reject staking with no points", async function () {
      await goodCommitStaking.connect(user1).claimAllPoints(0);
      await expect(goodCommitStaking.connect(user1).stakeAllPoints(0))
        .to.be.revertedWith("No points to stake");
    });
  });

  describe("Unstake Tokens", function () {
    beforeEach(async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );
      await goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 7);
    });

    it("Should allow unstaking tokens", async function () {
      const balanceBefore = await mockGToken.balanceOf(user1.address);

      await goodCommitStaking.connect(user1).unstakeTokens(0, ethers.parseEther("50"));

      const balanceAfter = await mockGToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("50"));

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.stakedAmount).to.equal(ethers.parseEther("50"));
    });

    it("Should reject unstaking more than staked", async function () {
      await expect(
        goodCommitStaking.connect(user1).unstakeTokens(0, ethers.parseEther("200"))
      ).to.be.revertedWith("Invalid unstake amount");
    });
  });

  describe("Slash Stake", function () {
    beforeEach(async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );
      await goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 7);
    });

    it("Should allow verifier to slash stake", async function () {
      const ubiBalanceBefore = await mockGToken.balanceOf(ubiPool.address);
      const treasuryBalanceBefore = await mockGToken.balanceOf(rewardTreasury.address);

      await expect(
        goodCommitStaking.connect(verifier).slashStake(user1.address, 0, "Cheating detected")
      )
        .to.emit(goodCommitStaking, "StakeSlashed")
        .withArgs(user1.address, 0, ethers.parseEther("100"));

      // Check distribution: 60% to UBI, 40% to treasury
      const ubiBalanceAfter = await mockGToken.balanceOf(ubiPool.address);
      const treasuryBalanceAfter = await mockGToken.balanceOf(rewardTreasury.address);

      expect(ubiBalanceAfter - ubiBalanceBefore).to.equal(ethers.parseEther("60"));
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(ethers.parseEther("40"));

      // Plant should be withered
      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.status).to.equal(5); // Withered
      expect(stakeInfo.stakedAmount).to.equal(0);
    });

    it("Should reject slashing by non-verifier", async function () {
      await expect(
        goodCommitStaking.connect(user2).slashStake(user1.address, 0, "Cheating")
      ).to.be.revertedWith("Not authorized verifier");
    });
  });

  describe("Plant Growth Stages", function () {
    it("Should progress through all growth stages", async function () {
      // Seed (0-10 points)
      let stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.status).to.equal(0);

      // Sprout (30+ points)
      await goodCommitStaking.connect(verifier).recordWorkout(user1.address, 0, 1800, 35, "running");
      stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.status).to.equal(1);

      // Growing (60+ points)
      await goodCommitStaking.connect(verifier).recordWorkout(user1.address, 0, 1800, 30, "running");
      stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.status).to.equal(2);

      // Mature (90+ points)
      await goodCommitStaking.connect(verifier).recordWorkout(user1.address, 0, 1800, 35, "running");
      stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.status).to.equal(3);

      // Fruiting (100+ points)
      await goodCommitStaking.connect(verifier).recordWorkout(user1.address, 0, 1800, 15, "running");
      stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      expect(stakeInfo.status).to.equal(4);
    });
  });

  describe("View Functions", function () {
    it("Should return correct points to G$ conversion", async function () {
      const result = await goodCommitStaking.pointsToGToken(100);
      expect(result).to.equal(ethers.parseEther("10"));
      const result2 = await goodCommitStaking.pointsToGToken(50);
      expect(result2).to.equal(ethers.parseEther("5"));
    });

    it("Should return correct G$ to points conversion", async function () {
      const result = await goodCommitStaking.gTokenToPoints(ethers.parseEther("10"));
      expect(result).to.equal(100);
      const result2 = await goodCommitStaking.gTokenToPoints(ethers.parseEther("5"));
      expect(result2).to.equal(50);
    });

    it("Should return workout history", async function () {
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        30,
        "running"
      );

      const count = await goodCommitStaking.getWorkoutCount(user1.address, 0);
      expect(count).to.equal(1);

      const workout = await goodCommitStaking.getWorkoutResult(user1.address, 0, 0);
      expect(workout.duration).to.equal(1800);
      expect(workout.pointsEarned).to.equal(30);
      expect(workout.exerciseType).to.equal("running");
    });

    it("Should return quiz history", async function () {
      await goodCommitStaking.connect(verifier).recordQuiz(
        user1.address,
        1,
        8,
        10,
        80,
        0
      );

      const count = await goodCommitStaking.getQuizCount(user1.address, 1);
      expect(count).to.equal(1);

      const quiz = await goodCommitStaking.getQuizResult(user1.address, 1, 0);
      expect(quiz.correctAnswers).to.equal(8);
      expect(quiz.totalQuestions).to.equal(10);
      expect(quiz.pointsEarned).to.equal(80);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set UBI pool", async function () {
      await goodCommitStaking.connect(owner).setUBIPool(user2.address);
      expect(await goodCommitStaking.ubiPool()).to.equal(user2.address);
    });

    it("Should allow owner to set reward treasury", async function () {
      await goodCommitStaking.connect(owner).setRewardTreasury(user2.address);
      expect(await goodCommitStaking.rewardTreasury()).to.equal(user2.address);
    });

    it("Should allow owner to set verifier", async function () {
      await goodCommitStaking.connect(owner).setVerifier(user2.address);
      expect(await goodCommitStaking.verifier()).to.equal(user2.address);
    });

    it("Should allow owner to pause contract", async function () {
      await goodCommitStaking.connect(owner).pause();
      await expect(
        goodCommitStaking.connect(user1).claimInitialSeed()
      ).to.be.revertedWithCustomError(goodCommitStaking, "EnforcedPause");
    });

    it("Should allow owner to unpause contract", async function () {
      await goodCommitStaking.connect(owner).pause();
      await goodCommitStaking.connect(owner).unpause();
      await expect(goodCommitStaking.connect(user1).claimInitialSeed()).to.not.be.reverted;
    });

    it("Should reject non-owner admin functions", async function () {
      await expect(
        goodCommitStaking.connect(user1).setUBIPool(user2.address)
      ).to.be.revertedWithCustomError(goodCommitStaking, "OwnableUnauthorizedAccount");
    });
  });

  describe("Inactivity Check", function () {
    beforeEach(async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );
      await goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 7);
    });

    it("Should detect inactive user after 3 days", async function () {
      expect(await goodCommitStaking.isInactive(user1.address, 0)).to.be.false;

      await time.increase(3 * ONE_DAY + 1);

      expect(await goodCommitStaking.isInactive(user1.address, 0)).to.be.true;
    });

    it("Should not detect inactive user with recent activity", async function () {
      await time.increase(2 * ONE_DAY);

      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        30,
        "running"
      );

      expect(await goodCommitStaking.isInactive(user1.address, 0)).to.be.false;
    });
  });
});
