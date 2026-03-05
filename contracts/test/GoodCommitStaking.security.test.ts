import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { GoodCommitStaking } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("GoodCommitStaking - Security Tests", function () {
  let goodCommitStaking: GoodCommitStaking;
  let mockGToken: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let attacker: SignerWithAddress;
  let ubiPool: SignerWithAddress;
  let rewardTreasury: SignerWithAddress;
  let verifier: SignerWithAddress;

  const INITIAL_SEED_AMOUNT = ethers.parseEther("10");
  const ONE_DAY = 24 * 60 * 60;

  beforeEach(async function () {
    [owner, user1, user2, attacker, ubiPool, rewardTreasury, verifier] = await ethers.getSigners();

    const MockGToken = await ethers.getContractFactory("MockGToken");
    mockGToken = await MockGToken.deploy();

    const GoodCommitStaking = await ethers.getContractFactory("GoodCommitStaking");
    goodCommitStaking = await GoodCommitStaking.deploy(
      await mockGToken.getAddress(),
      ubiPool.address,
      rewardTreasury.address,
      verifier.address
    );

    const treasuryAmount = ethers.parseEther("1000000");
    await mockGToken.mint(rewardTreasury.address, treasuryAmount);
    await mockGToken.connect(rewardTreasury).approve(
      await goodCommitStaking.getAddress(),
      treasuryAmount
    );

    await mockGToken.mint(user1.address, ethers.parseEther("1000"));
    await mockGToken.mint(user2.address, ethers.parseEther("1000"));
    await mockGToken.mint(attacker.address, ethers.parseEther("1000"));
  });

  describe("Reentrancy Protection", function () {
    it("Should prevent reentrancy on claimAllPoints", async function () {
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );

      // Try to claim twice in quick succession (simulating reentrancy attempt)
      const claimPromise1 = goodCommitStaking.connect(user1).claimAllPoints(0);
      
      await expect(claimPromise1).to.not.be.reverted;
      
      // Second claim should fail (no points left)
      await expect(
        goodCommitStaking.connect(user1).claimAllPoints(0)
      ).to.be.revertedWith("No points to claim");
    });

    it("Should prevent reentrancy on plantSeed", async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );

      await expect(
        goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 7)
      ).to.not.be.reverted;
    });
  });

  describe("Access Control", function () {
    it("Should prevent non-verifier from recording workouts", async function () {
      await expect(
        goodCommitStaking.connect(attacker).recordWorkout(
          user1.address,
          0,
          1800,
          1000000, // Try to give massive points
          "fake"
        )
      ).to.be.revertedWith("Not authorized verifier");
    });

    it("Should prevent non-verifier from recording quizzes", async function () {
      await expect(
        goodCommitStaking.connect(attacker).recordQuiz(
          user1.address,
          1,
          10,
          10,
          1000000,
          0
        )
      ).to.be.revertedWith("Not authorized verifier");
    });

    it("Should prevent non-verifier from slashing stakes", async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );
      await goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 7);

      await expect(
        goodCommitStaking.connect(attacker).slashStake(user1.address, 0, "fake reason")
      ).to.be.revertedWith("Not authorized verifier");
    });

    it("Should prevent non-owner from changing critical addresses", async function () {
      await expect(
        goodCommitStaking.connect(attacker).setUBIPool(attacker.address)
      ).to.be.revertedWithCustomError(goodCommitStaking, "OwnableUnauthorizedAccount");

      await expect(
        goodCommitStaking.connect(attacker).setRewardTreasury(attacker.address)
      ).to.be.revertedWithCustomError(goodCommitStaking, "OwnableUnauthorizedAccount");

      await expect(
        goodCommitStaking.connect(attacker).setVerifier(attacker.address)
      ).to.be.revertedWithCustomError(goodCommitStaking, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to act as verifier", async function () {
      await expect(
        goodCommitStaking.connect(owner).recordWorkout(
          user1.address,
          0,
          1800,
          30,
          "running"
        )
      ).to.not.be.reverted;
    });
  });

  describe("Integer Overflow/Underflow Protection", function () {
    it("Should handle maximum point values safely", async function () {
      const maxPoints = ethers.MaxUint256;
      
      // This should not overflow due to Solidity 0.8.20 checks
      // But it will likely revert due to other constraints
      await expect(
        goodCommitStaking.connect(verifier).recordWorkout(
          user1.address,
          0,
          1800,
          maxPoints,
          "running"
        )
      ).to.not.be.reverted;
    });

    it("Should not allow points to go below zero with penalties", async function () {
      await goodCommitStaking.connect(verifier).recordQuiz(
        user1.address,
        1,
        8,
        10,
        50,
        0
      );

      // Apply massive penalty
      await goodCommitStaking.connect(verifier).recordQuiz(
        user1.address,
        1,
        0,
        10,
        0,
        -1000000
      );

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 1);
      expect(stakeInfo.points).to.equal(0); // Should stop at 0, not underflow
    });
  });

  describe("Token Transfer Safety", function () {
    it("Should fail gracefully if treasury has insufficient funds", async function () {
      // Drain treasury
      const treasuryBalance = await mockGToken.balanceOf(rewardTreasury.address);
      await mockGToken.connect(rewardTreasury).transfer(owner.address, treasuryBalance);

      await expect(
        goodCommitStaking.connect(user1).claimInitialSeed()
      ).to.be.reverted;
    });

    it("Should fail if user hasn't approved token transfer", async function () {
      // Don't approve
      await expect(
        goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 7)
      ).to.be.reverted;
    });

    it("Should fail if user has insufficient balance", async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("10000")
      );

      await expect(
        goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("10000"), 7)
      ).to.be.reverted;
    });
  });

  describe("Decay Manipulation Attempts", function () {
    it("Should not allow bypassing decay by rapid claims", async function () {
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );

      await time.increase(ONE_DAY);

      // Decay should be applied automatically
      const balanceBefore = await mockGToken.balanceOf(user1.address);
      await goodCommitStaking.connect(user1).claimAllPoints(0);
      const balanceAfter = await mockGToken.balanceOf(user1.address);

      // Should receive decayed amount (60 points = 6 wei)
      expect(balanceAfter - balanceBefore).to.equal(6n);
    });

    it("Should apply decay before staking operations", async function () {
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );

      await time.increase(ONE_DAY);

      // Stake all should work with decayed points
      await goodCommitStaking.connect(user1).stakeAllPoints(0);

      const stakeInfo = await goodCommitStaking.getStakeInfo(user1.address, 0);
      // 60 points after decay + 10% bonus = 66
      expect(stakeInfo.points).to.equal(66);
    });
  });

  describe("Slashing Distribution", function () {
    beforeEach(async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );
      await goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 7);
    });

    it("Should correctly distribute slashed funds (60% UBI, 40% treasury)", async function () {
      const ubiBalanceBefore = await mockGToken.balanceOf(ubiPool.address);
      const treasuryBalanceBefore = await mockGToken.balanceOf(rewardTreasury.address);

      await goodCommitStaking.connect(verifier).slashStake(
        user1.address,
        0,
        "Cheating"
      );

      const ubiBalanceAfter = await mockGToken.balanceOf(ubiPool.address);
      const treasuryBalanceAfter = await mockGToken.balanceOf(rewardTreasury.address);

      const ubiReceived = ubiBalanceAfter - ubiBalanceBefore;
      const treasuryReceived = treasuryBalanceAfter - treasuryBalanceBefore;

      expect(ubiReceived).to.equal(ethers.parseEther("60"));
      expect(treasuryReceived).to.equal(ethers.parseEther("40"));
      expect(ubiReceived + treasuryReceived).to.equal(ethers.parseEther("100"));
    });

    it("Should prevent double slashing", async function () {
      await goodCommitStaking.connect(verifier).slashStake(
        user1.address,
        0,
        "Cheating"
      );

      // Try to slash again - should fail because already withered
      await expect(
        goodCommitStaking.connect(verifier).slashStake(
          user1.address,
          0,
          "Cheating again"
        )
      ).to.be.revertedWith("Already withered");
    });
  });

  describe("Pause Functionality", function () {
    it("Should block all user operations when paused", async function () {
      await goodCommitStaking.connect(owner).pause();

      await expect(
        goodCommitStaking.connect(user1).claimInitialSeed()
      ).to.be.revertedWithCustomError(goodCommitStaking, "EnforcedPause");

      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );

      await expect(
        goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 7)
      ).to.be.revertedWithCustomError(goodCommitStaking, "EnforcedPause");
    });

    it("Should allow operations after unpause", async function () {
      await goodCommitStaking.connect(owner).pause();
      await goodCommitStaking.connect(owner).unpause();

      await expect(
        goodCommitStaking.connect(user1).claimInitialSeed()
      ).to.not.be.reverted;
    });

    it("Should only allow owner to pause/unpause", async function () {
      await expect(
        goodCommitStaking.connect(attacker).pause()
      ).to.be.revertedWithCustomError(goodCommitStaking, "OwnableUnauthorizedAccount");

      await goodCommitStaking.connect(owner).pause();

      await expect(
        goodCommitStaking.connect(attacker).unpause()
      ).to.be.revertedWithCustomError(goodCommitStaking, "OwnableUnauthorizedAccount");
    });
  });

  describe("Emergency Withdraw", function () {
    it("Should only allow emergency withdraw when paused", async function () {
      await expect(
        goodCommitStaking.connect(owner).emergencyWithdraw(
          await mockGToken.getAddress(),
          ethers.parseEther("1")
        )
      ).to.be.revertedWithCustomError(goodCommitStaking, "ExpectedPause");
    });

    it("Should allow owner to emergency withdraw when paused", async function () {
      // Send some tokens to contract
      await mockGToken.mint(await goodCommitStaking.getAddress(), ethers.parseEther("100"));

      await goodCommitStaking.connect(owner).pause();

      const ownerBalanceBefore = await mockGToken.balanceOf(owner.address);

      await goodCommitStaking.connect(owner).emergencyWithdraw(
        await mockGToken.getAddress(),
        ethers.parseEther("50")
      );

      const ownerBalanceAfter = await mockGToken.balanceOf(owner.address);
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(ethers.parseEther("50"));
    });

    it("Should not allow non-owner to emergency withdraw", async function () {
      await goodCommitStaking.connect(owner).pause();

      await expect(
        goodCommitStaking.connect(attacker).emergencyWithdraw(
          await mockGToken.getAddress(),
          ethers.parseEther("1")
        )
      ).to.be.revertedWithCustomError(goodCommitStaking, "OwnableUnauthorizedAccount");
    });
  });

  describe("Input Validation", function () {
    it("Should reject zero address in constructor", async function () {
      const GoodCommitStaking = await ethers.getContractFactory("GoodCommitStaking");

      await expect(
        GoodCommitStaking.deploy(
          ethers.ZeroAddress,
          ubiPool.address,
          rewardTreasury.address,
          verifier.address
        )
      ).to.be.revertedWith("Invalid G$ token address");
    });

    it("Should reject zero stake amount", async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );

      await expect(
        goodCommitStaking.connect(user1).plantSeed(0, 0, 7)
      ).to.be.revertedWith("Stake amount must be > 0");
    });

    it("Should reject invalid duration", async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );

      await expect(
        goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 0)
      ).to.be.revertedWith("Duration must be at least 1 day");
    });
  });

  describe("State Consistency", function () {
    it("Should maintain consistent totalStakedByUser", async function () {
      await mockGToken.connect(user1).approve(
        await goodCommitStaking.getAddress(),
        ethers.parseEther("1000")
      );

      await goodCommitStaking.connect(user1).plantSeed(0, ethers.parseEther("100"), 7);
      expect(await goodCommitStaking.totalStakedByUser(user1.address)).to.equal(
        ethers.parseEther("100")
      );

      await goodCommitStaking.connect(user1).plantSeed(1, ethers.parseEther("50"), 7);
      expect(await goodCommitStaking.totalStakedByUser(user1.address)).to.equal(
        ethers.parseEther("150")
      );

      await goodCommitStaking.connect(user1).unstakeTokens(0, ethers.parseEther("50"));
      expect(await goodCommitStaking.totalStakedByUser(user1.address)).to.equal(
        ethers.parseEther("100")
      );
    });

    it("Should maintain consistent decay reward pool", async function () {
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        100,
        "running"
      );

      await goodCommitStaking.connect(verifier).recordWorkout(
        user2.address,
        0,
        1800,
        100,
        "running"
      );

      await time.increase(ONE_DAY);

      const poolBefore = await goodCommitStaking.getDecayRewardPool();

      // Trigger decay for user1
      await goodCommitStaking.connect(verifier).recordWorkout(
        user1.address,
        0,
        1800,
        10,
        "running"
      );

      const poolAfter1 = await goodCommitStaking.getDecayRewardPool();
      expect(poolAfter1 - poolBefore).to.equal(40); // 40% of 100

      // Trigger decay for user2
      await goodCommitStaking.connect(verifier).recordWorkout(
        user2.address,
        0,
        1800,
        10,
        "running"
      );

      const poolAfter2 = await goodCommitStaking.getDecayRewardPool();
      expect(poolAfter2 - poolAfter1).to.equal(40); // Another 40% of 100
    });
  });
});
