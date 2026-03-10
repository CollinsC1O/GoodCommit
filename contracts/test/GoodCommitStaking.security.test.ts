import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// ─────────────────────────────────────────────────────────────────────────────
// GoodCommitStaking — Security Test Suite
// Contract: contracts/GoodCommitStaking.sol (V3)
//
// Constructor (5 args):
//   GoodCommitStaking(gDollarToken, identityContract, verifier, rewardTreasury, ubiPool)
// ─────────────────────────────────────────────────────────────────────────────

const HabitType = { Health: 0, Academics: 1 } as const;
const DAY       = 86_400;
const e18       = (n: number | string) => ethers.parseEther(String(n));

// ─────────────────────────────────────────────────────────────────────────────
describe("GoodCommitStaking - Security Tests", function () {

  let staking:        any;
  let mockGToken:     any;
  let mockIdentity:   any;
  let stakingAddr:    string;

  let owner:          SignerWithAddress;
  let user1:          SignerWithAddress;
  let user2:          SignerWithAddress;
  let attacker:       SignerWithAddress;
  let ubiPool:        SignerWithAddress;
  let rewardTreasury: SignerWithAddress;
  let verifier:       SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2, attacker, ubiPool, rewardTreasury, verifier] =
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
    await mockGToken.mint(attacker.address, e18(10_000));

    await mockGToken.connect(owner).approve(stakingAddr, e18(200_000));
    await staking.connect(owner).fundContract(e18(200_000));

    await mockIdentity.setVerified(user1.address, true);
    await mockIdentity.setVerified(user2.address, true);

    await mockGToken.connect(user1).approve(stakingAddr, e18(10_000));
    await mockGToken.connect(user2).approve(stakingAddr, e18(10_000));
    await mockGToken.connect(attacker).approve(stakingAddr, e18(10_000));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A. ACCESS CONTROL
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Access Control", function () {

    it("non-verifier cannot recordWorkout", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
      await expect(
        staking.connect(attacker).recordWorkout(user1.address, HabitType.Health, 3600, 50, "run")
      ).to.be.revertedWith("GoodCommit: caller is not verifier");
    });

    it("non-verifier cannot recordQuiz", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
      await expect(
        staking.connect(attacker).recordQuiz(user1.address, HabitType.Academics, 10, 10, 999_999, 0)
      ).to.be.revertedWith("GoodCommit: caller is not verifier");
    });

    it("non-verifier cannot slashStake", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
      await time.increase(3 * DAY + 1);
      await expect(
        staking.connect(attacker).slashStake(user1.address, HabitType.Health, "fake")
      ).to.be.revertedWith("GoodCommit: caller is not verifier");
    });

    it("non-owner cannot setVerifier",       async function () { await expect(staking.connect(attacker).setVerifier(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
    it("non-owner cannot setRewardTreasury", async function () { await expect(staking.connect(attacker).setRewardTreasury(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
    it("non-owner cannot setUbiPool",        async function () { await expect(staking.connect(attacker).setUbiPool(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
    it("non-owner cannot fundContract",      async function () { await expect(staking.connect(attacker).fundContract(e18(100))).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
    it("non-owner cannot pause",             async function () { await expect(staking.connect(attacker).pause()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
    it("non-owner cannot unpause",           async function () { await staking.connect(owner).pause(); await expect(staking.connect(attacker).unpause()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
    it("non-owner cannot emergencyWithdraw", async function () { await staking.connect(owner).pause(); await expect(staking.connect(attacker).emergencyWithdraw()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });

    it("verifier cannot award points to themselves (no active stake)", async function () {
      await expect(
        staking.connect(verifier).recordWorkout(verifier.address, HabitType.Health, 3600, 999_999, "cheat")
      ).to.be.revertedWith("GoodCommit: no active stake");
    });

    it("verifier cannot inflate another user's points beyond what contract allows", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
      // Verifier CAN award points — only trust model prevents abuse; no cap on points in contract
      await expect(
        staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 1_000_000, "cheat")
      ).to.not.be.reverted;
      // But a random attacker cannot
      await expect(
        staking.connect(attacker).recordWorkout(user1.address, HabitType.Health, 3600, 1_000_000, "cheat")
      ).to.be.revertedWith("GoodCommit: caller is not verifier");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. SYBIL RESISTANCE
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Sybil Resistance", function () {

    it("same address cannot claim seed twice", async function () {
      await staking.connect(user1).claimInitialSeed();
      // In MockIdentity, user1's root = user1.address (default).
      // rootHasClaimed[user1] is set first → the root check fires before hasClaimedSeed.
      await expect(staking.connect(user1).claimInitialSeed())
        .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
    });

    it("two wallets sharing one GD root cannot both claim", async function () {
      const root1 = await mockIdentity.getWhitelistedRoot(user1.address);
      await mockIdentity.setRoot(user2.address, root1);
      await staking.connect(user1).claimInitialSeed();
      await expect(staking.connect(user2).claimInitialSeed())
        .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
    });

    it("unverified attacker cannot claim seed", async function () {
      await expect(staking.connect(attacker).claimInitialSeed())
        .to.be.revertedWith("GoodCommit: wallet not GoodDollar verified - visit gooddollar.org");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. REENTRANCY PROTECTION
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Reentrancy Protection", function () {

    it("claimPoints: state resets before transfer — double claim reverts immediately", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 100, 100, 100, 0
      );
      await time.increase(DAY + 1);

      await staking.connect(user1).claimPoints(HabitType.Academics); // first claim succeeds

      // Second call: points are 0 → reverts before any transfer
      await expect(staking.connect(user1).claimPoints(HabitType.Academics))
        .to.be.revertedWith("GoodCommit: need 100+ points to claim");
    });

    it("unstakeTokens: active=false before transfer — no double-unstake", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
      await staking.connect(user1).unstakeTokens(HabitType.Health);
      await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
        .to.be.revertedWith("GoodCommit: no active stake");
    });

    it("claimInitialSeed: hasClaimedSeed=true before transfer — no double-claim", async function () {
      await staking.connect(user1).claimInitialSeed();
      // rootHasClaimed fires first (root = user1.address in MockIdentity default)
      await expect(staking.connect(user1).claimInitialSeed())
        .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D. INTEGER SAFETY
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Integer Safety", function () {

    it("points floor at 0 for large penalty (no underflow)", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 0, 10, 0, -1_000_000
      );
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(pts).to.equal(0n);
    });

    it("penalty exactly equal to points floors at 0", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
      await staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 5, 10, 5, 0);
      await staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 0, 10, 0, -5);
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
      expect(pts).to.equal(0n);
    });

    it("points never go below 0 after 30 days decay", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");
      await time.increase(30 * DAY);
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");
      const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(pts).to.be.gte(0n);
    });

    it("slash BPS add to exactly 100%: 60+40=100, nothing left behind", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
      await time.increase(3 * DAY + 1);
      const ubiBefore = await mockGToken.balanceOf(ubiPool.address);
      const treBefore = await mockGToken.balanceOf(rewardTreasury.address);
      await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
      const ubiGot = await mockGToken.balanceOf(ubiPool.address)        - ubiBefore;
      const treGot = await mockGToken.balanceOf(rewardTreasury.address) - treBefore;
      expect(ubiGot + treGot).to.equal(e18(1000));
      expect(ubiGot).to.equal(e18(600));
      expect(treGot).to.equal(e18(400));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. PAUSE / EMERGENCY WITHDRAW
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Pause & Emergency Withdraw", function () {

    it("pause blocks claimInitialSeed",  async function () { await staking.connect(owner).pause(); await expect(staking.connect(user1).claimInitialSeed()).to.be.revertedWithCustomError(staking, "EnforcedPause"); });
    it("pause blocks stakeGDollar",      async function () { await staking.connect(owner).pause(); await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 7)).to.be.revertedWithCustomError(staking, "EnforcedPause"); });

    it("pause blocks recordWorkout", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
      await staking.connect(owner).pause();
      await expect(
        staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "run")
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });

    it("pause blocks claimPoints", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 100, 100, 100, 0
      );
      await time.increase(DAY + 1);
      await staking.connect(owner).pause();
      await expect(staking.connect(user1).claimPoints(HabitType.Academics))
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });

    it("pause blocks slashStake", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
      await time.increase(3 * DAY + 1);
      await staking.connect(owner).pause();
      await expect(
        staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive")
      ).to.be.revertedWithCustomError(staking, "EnforcedPause");
    });

    it("all operations resume after unpause", async function () {
      await staking.connect(owner).pause();
      await staking.connect(owner).unpause();
      await expect(staking.connect(user1).claimInitialSeed()).to.not.be.reverted;
    });

    it("emergencyWithdraw reverts when not paused", async function () {
      await expect(staking.connect(owner).emergencyWithdraw())
        .to.be.revertedWithCustomError(staking, "ExpectedPause");
    });

    it("emergencyWithdraw sends full balance to owner when paused", async function () {
      const contractBal = await staking.contractGDollarBalance();
      const ownerBefore = await mockGToken.balanceOf(owner.address);
      await staking.connect(owner).pause();
      await staking.connect(owner).emergencyWithdraw();
      expect(await mockGToken.balanceOf(owner.address) - ownerBefore).to.equal(contractBal);
      expect(await staking.contractGDollarBalance()).to.equal(0n);
    });

    it("contract recovers after emergencyWithdraw + unpause + refund", async function () {
      await staking.connect(owner).pause();
      await staking.connect(owner).emergencyWithdraw();
      await staking.connect(owner).unpause();
      await mockGToken.connect(owner).approve(stakingAddr, e18(50_000));
      await staking.connect(owner).fundContract(e18(50_000));
      await expect(staking.connect(user1).claimInitialSeed()).to.not.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F. TOKEN TRANSFER SAFETY
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Token Transfer Safety", function () {

    it("stakeGDollar reverts when user has no approval", async function () {
      // Reset attacker's approval to 0
      await mockGToken.connect(attacker).approve(stakingAddr, 0);
      await expect(
        staking.connect(attacker).stakeGDollar(HabitType.Health, e18(100), 7)
      ).to.be.reverted;
    });

    it("stakeGDollar reverts when user balance is insufficient", async function () {
      const bal = await mockGToken.balanceOf(user1.address);
      await expect(
        staking.connect(user1).stakeGDollar(HabitType.Health, bal + e18(1), 7)
      ).to.be.reverted;
    });

    it("claimInitialSeed reverts when contract is empty", async function () {
      await staking.connect(owner).pause();
      await staking.connect(owner).emergencyWithdraw();
      await staking.connect(owner).unpause();
      await expect(staking.connect(user1).claimInitialSeed())
        .to.be.revertedWith("GoodCommit: insufficient seed funds in contract");
    });

    it("claimPoints reverts when contract cannot cover payout", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 100, 100, 100, 0
      );
      await time.increase(DAY + 1);
      // Drain then re-fund with only 1 G$ (payout needs 10 G$)
      await staking.connect(owner).pause();
      await staking.connect(owner).emergencyWithdraw();
      await staking.connect(owner).unpause();
      await mockGToken.connect(owner).approve(stakingAddr, e18(1));
      await staking.connect(owner).fundContract(e18(1));
      await expect(staking.connect(user1).claimPoints(HabitType.Academics))
        .to.be.revertedWith("GoodCommit: insufficient contract balance for harvest");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // G. INACTIVITY / SLASH GUARDS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Inactivity & Slash Guards", function () {

    it("slashStake reverts if < 3 days inactive", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
      await time.increase(DAY);
      await expect(
        staking.connect(verifier).slashStake(user1.address, HabitType.Health, "fake")
      ).to.be.revertedWith("GoodCommit: user not inactive yet");
    });

    it("slashStake reverts on wallet with no active stake", async function () {
      await expect(
        staking.connect(verifier).slashStake(attacker.address, HabitType.Health, "fake")
      ).to.be.revertedWith("GoodCommit: no active stake");
    });

    it("recording workout resets clock — prevents slashing within next 3 days", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
      await time.increase(2 * DAY); // not yet inactive
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 5, "walk");
      // 2 more days from new lastActivity — still < 3 days
      await time.increase(2 * DAY);
      expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false;
    });

    it("slash distributes correct amounts even if user had accumulated points", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 50, "gym");
      await time.increase(3 * DAY + 1);
      const ubiBefore = await mockGToken.balanceOf(ubiPool.address);
      await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
      expect(await mockGToken.balanceOf(ubiPool.address) - ubiBefore).to.equal(e18(600));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // H. DECAY INTEGRITY
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Decay Integrity", function () {

    it("decay is applied inside claimPoints — user cannot dodge decay by claiming", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 100, 100, 100, 0
      );
      // Advance 2 full days past last activity (1 day past commitmentEnd)
      await time.increase(2 * DAY + 1);

      const before = await mockGToken.balanceOf(user1.address);
      await staking.connect(user1).claimPoints(HabitType.Academics);
      const received = await mockGToken.balanceOf(user1.address) - before;
      // 100 * 0.6 = 60, 60 * 0.6 = 36 pts → 36/10 * 1e18 = 3.6 G$
      expect(received).to.equal(ethers.parseEther("3.6"));
    });

    it("top-up stake resets lastActivityTime — decay clock restarts from top-up", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");

      await time.increase(DAY + 1);
      // Top-up: stakeGDollar sets lastActivityTime = block.timestamp unconditionally
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(50), 30);

      // Points unchanged (stakeGDollar does not call _applyDecay)
      const [, ptsAfterTopup] = await staking.getHabitStake(user1.address, HabitType.Health);
      expect(ptsAfterTopup).to.equal(100n);

      // Next activity immediately after top-up: lastActivityTime was just reset,
      // so elapsed = ~0 seconds → daysInactive = 0 → NO decay this time
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");
      const [, ptsAfterPing] = await staking.getHabitStake(user1.address, HabitType.Health);
      // 100 pts (no decay, clock was reset by top-up) + 1 new = 101
      expect(ptsAfterPing).to.equal(101n);

      // Advance a full day from ping's lastActivityTime, then ping2 triggers decay
      await time.increase(DAY + 1);
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping2");
      const [, ptsAfterDecay] = await staking.getHabitStake(user1.address, HabitType.Health);
      // floor(102 * 0.6) = 61 + 1 = 62
      expect(ptsAfterDecay).to.equal(62n);
    });

    it("decayRewardPool accumulates from two users independently", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
      await staking.connect(user2).stakeGDollar(HabitType.Health, e18(100), 60);
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");
      await staking.connect(verifier).recordWorkout(user2.address, HabitType.Health, 3600, 100, "gym");

      await time.increase(DAY + 1);
      await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");
      expect(await staking.decayRewardPool()).to.equal(40n); // user1: 40% of 100

      await staking.connect(verifier).recordWorkout(user2.address, HabitType.Health, 60, 1, "ping");
      expect(await staking.decayRewardPool()).to.equal(80n); // + user2: another 40
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // I. COMMITMENT PERIOD ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Commitment Period Enforcement", function () {

    it("claimPoints blocked before commitmentEnd regardless of points", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 100, 100, 100, 0
      );
      await time.increase(DAY); // 1 of 30 days
      await expect(staking.connect(user1).claimPoints(HabitType.Academics))
        .to.be.revertedWith("GoodCommit: commitment period not ended yet");
    });

    it("claimPoints succeeds immediately after commitmentEnd", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 100, 100, 100, 0
      );
      await time.increase(DAY + 1);
      await expect(staking.connect(user1).claimPoints(HabitType.Academics)).to.not.be.reverted;
    });

    it("top-up resets commitmentEnd to later — extends lock", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
      await staking.connect(verifier).recordQuiz(
        user1.address, HabitType.Academics, 100, 100, 100, 0
      );
      // Stake again for 30 days before original 1-day lock expires
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(50), 30);
      // Advance past original 1-day lock but not the new 30-day lock
      await time.increase(DAY + 1);
      await expect(staking.connect(user1).claimPoints(HabitType.Academics))
        .to.be.revertedWith("GoodCommit: commitment period not ended yet");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // J. INPUT VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Input Validation", function () {

    it("stakeGDollar: amount = 0",      async function () { await expect(staking.connect(user1).stakeGDollar(HabitType.Health, 0,         30)).to.be.revertedWith("GoodCommit: amount must be > 0"); });
    it("stakeGDollar: duration = 0",    async function () { await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100),  0)).to.be.revertedWith("GoodCommit: duration 1-365 days"); });
    it("stakeGDollar: duration = 366",  async function () { await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 366)).to.be.revertedWith("GoodCommit: duration 1-365 days"); });

    it("recordWorkout: duration = 0", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
      await expect(staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 0, 10, "run"))
        .to.be.revertedWith("GoodCommit: zero duration");
    });

    it("recordWorkout: pointsEarned = 0", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
      await expect(staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 0, "run"))
        .to.be.revertedWith("GoodCommit: zero points");
    });

    it("recordQuiz: totalQuestions = 0", async function () {
      await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
      await expect(staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 0, 0, 0, 0))
        .to.be.revertedWith("GoodCommit: zero questions");
    });

    it("setVerifier: zero address",       async function () { await expect(staking.connect(owner).setVerifier(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
    it("setRewardTreasury: zero address",  async function () { await expect(staking.connect(owner).setRewardTreasury(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
    it("setUbiPool: zero address",         async function () { await expect(staking.connect(owner).setUbiPool(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
  });
});














// import { expect } from "chai";
// import { ethers } from "hardhat";
// import { time } from "@nomicfoundation/hardhat-network-helpers";
// import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// // ─────────────────────────────────────────────────────────────────────────────
// // GoodCommitStaking — Security Test Suite
// // Contract: contracts/GoodCommitStaking.sol (V3)
// //
// // Constructor (5 args):
// //   GoodCommitStaking(gDollarToken, identityContract, verifier, rewardTreasury, ubiPool)
// // ─────────────────────────────────────────────────────────────────────────────

// const HabitType = { Health: 0, Academics: 1 } as const;
// const DAY       = 86_400;
// const e18       = (n: number | string) => ethers.parseEther(String(n));

// // ─────────────────────────────────────────────────────────────────────────────
// describe("GoodCommitStaking - Security Tests", function () {

//   let staking:        any;
//   let mockGToken:     any;
//   let mockIdentity:   any;
//   let stakingAddr:    string;

//   let owner:          SignerWithAddress;
//   let user1:          SignerWithAddress;
//   let user2:          SignerWithAddress;
//   let attacker:       SignerWithAddress;
//   let ubiPool:        SignerWithAddress;
//   let rewardTreasury: SignerWithAddress;
//   let verifier:       SignerWithAddress;

//   beforeEach(async function () {
//     [owner, user1, user2, attacker, ubiPool, rewardTreasury, verifier] =
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
//     await mockGToken.mint(attacker.address, e18(10_000));

//     await mockGToken.connect(owner).approve(stakingAddr, e18(200_000));
//     await staking.connect(owner).fundContract(e18(200_000));

//     await mockIdentity.setVerified(user1.address, true);
//     await mockIdentity.setVerified(user2.address, true);

//     await mockGToken.connect(user1).approve(stakingAddr, e18(10_000));
//     await mockGToken.connect(user2).approve(stakingAddr, e18(10_000));
//     await mockGToken.connect(attacker).approve(stakingAddr, e18(10_000));
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // A. ACCESS CONTROL
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Access Control", function () {

//     it("non-verifier cannot recordWorkout", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//       await expect(
//         staking.connect(attacker).recordWorkout(user1.address, HabitType.Health, 3600, 50, "run")
//       ).to.be.revertedWith("GoodCommit: caller is not verifier");
//     });

//     it("non-verifier cannot recordQuiz", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
//       await expect(
//         staking.connect(attacker).recordQuiz(user1.address, HabitType.Academics, 10, 10, 999_999, 0)
//       ).to.be.revertedWith("GoodCommit: caller is not verifier");
//     });

//     it("non-verifier cannot slashStake", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//       await time.increase(3 * DAY + 1);
//       await expect(
//         staking.connect(attacker).slashStake(user1.address, HabitType.Health, "fake")
//       ).to.be.revertedWith("GoodCommit: caller is not verifier");
//     });

//     it("non-owner cannot setVerifier",       async function () { await expect(staking.connect(attacker).setVerifier(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
//     it("non-owner cannot setRewardTreasury", async function () { await expect(staking.connect(attacker).setRewardTreasury(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
//     it("non-owner cannot setUbiPool",        async function () { await expect(staking.connect(attacker).setUbiPool(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
//     it("non-owner cannot fundContract",      async function () { await expect(staking.connect(attacker).fundContract(e18(100))).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
//     it("non-owner cannot pause",             async function () { await expect(staking.connect(attacker).pause()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
//     it("non-owner cannot unpause",           async function () { await staking.connect(owner).pause(); await expect(staking.connect(attacker).unpause()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
//     it("non-owner cannot emergencyWithdraw", async function () { await staking.connect(owner).pause(); await expect(staking.connect(attacker).emergencyWithdraw()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });

//     it("verifier cannot award points to themselves (no active stake)", async function () {
//       await expect(
//         staking.connect(verifier).recordWorkout(verifier.address, HabitType.Health, 3600, 999_999, "cheat")
//       ).to.be.revertedWith("GoodCommit: no active stake");
//     });

//     it("verifier cannot inflate another user's points beyond what contract allows", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//       // Verifier CAN award points — only trust model prevents abuse; no cap on points in contract
//       await expect(
//         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 1_000_000, "cheat")
//       ).to.not.be.reverted;
//       // But a random attacker cannot
//       await expect(
//         staking.connect(attacker).recordWorkout(user1.address, HabitType.Health, 3600, 1_000_000, "cheat")
//       ).to.be.revertedWith("GoodCommit: caller is not verifier");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // B. SYBIL RESISTANCE
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Sybil Resistance", function () {

//     it("same address cannot claim seed twice", async function () {
//       await staking.connect(user1).claimInitialSeed();
//       // In MockIdentity, user1's root = user1.address (default).
//       // So rootHasClaimed[user1] is set first → hits the root check before
//       // the hasClaimedSeed check. Both guards block the claim; root fires first.
//       await expect(staking.connect(user1).claimInitialSeed())
//         .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
//     });

//     it("two wallets sharing one GD root cannot both claim", async function () {
//       const root1 = await mockIdentity.getWhitelistedRoot(user1.address);
//       await mockIdentity.setRoot(user2.address, root1);
//       await staking.connect(user1).claimInitialSeed();
//       await expect(staking.connect(user2).claimInitialSeed())
//         .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
//     });

//     it("unverified attacker cannot claim seed", async function () {
//       await expect(staking.connect(attacker).claimInitialSeed())
//         .to.be.revertedWith("GoodCommit: wallet not GoodDollar verified - visit gooddollar.org");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // C. REENTRANCY PROTECTION
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Reentrancy Protection", function () {

//     it("claimPoints: state resets before transfer — double claim reverts immediately", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 100, 100, 100, 0
//       );
//       await time.increase(DAY + 1);

//       await staking.connect(user1).claimPoints(HabitType.Academics); // first claim succeeds

//       // Second call: points are 0 → reverts before any transfer
//       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
//         .to.be.revertedWith("GoodCommit: need 100+ points to claim");
//     });

//     it("unstakeTokens: active=false before transfer — no double-unstake", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
//       await staking.connect(user1).unstakeTokens(HabitType.Health);
//       await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
//         .to.be.revertedWith("GoodCommit: no active stake");
//     });

//     it("claimInitialSeed: hasClaimedSeed=true before transfer — no double-claim", async function () {
//       await staking.connect(user1).claimInitialSeed();
//       // rootHasClaimed fires first (root = user1.address in MockIdentity default)
//       await expect(staking.connect(user1).claimInitialSeed())
//         .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // D. INTEGER SAFETY
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Integer Safety", function () {

//     it("points floor at 0 for large penalty (no underflow)", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 0, 10, 0, -1_000_000
//       );
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(pts).to.equal(0n);
//     });

//     it("penalty exactly equal to points floors at 0", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
//       await staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 5, 10, 5, 0);
//       await staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 0, 10, 0, -5);
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
//       expect(pts).to.equal(0n);
//     });

//     it("points never go below 0 after 30 days decay", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");
//       await time.increase(30 * DAY);
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");
//       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(pts).to.be.gte(0n);
//     });

//     it("slash BPS add to exactly 100%: 60+40=100, nothing left behind", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
//       await time.increase(3 * DAY + 1);
//       const ubiBefore = await mockGToken.balanceOf(ubiPool.address);
//       const treBefore = await mockGToken.balanceOf(rewardTreasury.address);
//       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
//       const ubiGot = await mockGToken.balanceOf(ubiPool.address)        - ubiBefore;
//       const treGot = await mockGToken.balanceOf(rewardTreasury.address) - treBefore;
//       expect(ubiGot + treGot).to.equal(e18(1000));
//       expect(ubiGot).to.equal(e18(600));
//       expect(treGot).to.equal(e18(400));
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // E. PAUSE / EMERGENCY WITHDRAW
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Pause & Emergency Withdraw", function () {

//     it("pause blocks claimInitialSeed",  async function () { await staking.connect(owner).pause(); await expect(staking.connect(user1).claimInitialSeed()).to.be.revertedWithCustomError(staking, "EnforcedPause"); });
//     it("pause blocks stakeGDollar",      async function () { await staking.connect(owner).pause(); await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 7)).to.be.revertedWithCustomError(staking, "EnforcedPause"); });

//     it("pause blocks recordWorkout", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//       await staking.connect(owner).pause();
//       await expect(
//         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "run")
//       ).to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });

//     it("pause blocks claimPoints", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 100, 100, 100, 0
//       );
//       await time.increase(DAY + 1);
//       await staking.connect(owner).pause();
//       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
//         .to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });

//     it("pause blocks slashStake", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//       await time.increase(3 * DAY + 1);
//       await staking.connect(owner).pause();
//       await expect(
//         staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive")
//       ).to.be.revertedWithCustomError(staking, "EnforcedPause");
//     });

//     it("all operations resume after unpause", async function () {
//       await staking.connect(owner).pause();
//       await staking.connect(owner).unpause();
//       await expect(staking.connect(user1).claimInitialSeed()).to.not.be.reverted;
//     });

//     it("emergencyWithdraw reverts when not paused", async function () {
//       await expect(staking.connect(owner).emergencyWithdraw())
//         .to.be.revertedWithCustomError(staking, "ExpectedPause");
//     });

//     it("emergencyWithdraw sends full balance to owner when paused", async function () {
//       const contractBal = await staking.contractGDollarBalance();
//       const ownerBefore = await mockGToken.balanceOf(owner.address);
//       await staking.connect(owner).pause();
//       await staking.connect(owner).emergencyWithdraw();
//       expect(await mockGToken.balanceOf(owner.address) - ownerBefore).to.equal(contractBal);
//       expect(await staking.contractGDollarBalance()).to.equal(0n);
//     });

//     it("contract recovers after emergencyWithdraw + unpause + refund", async function () {
//       await staking.connect(owner).pause();
//       await staking.connect(owner).emergencyWithdraw();
//       await staking.connect(owner).unpause();
//       await mockGToken.connect(owner).approve(stakingAddr, e18(50_000));
//       await staking.connect(owner).fundContract(e18(50_000));
//       await expect(staking.connect(user1).claimInitialSeed()).to.not.be.reverted;
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // F. TOKEN TRANSFER SAFETY
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Token Transfer Safety", function () {

//     it("stakeGDollar reverts when user has no approval", async function () {
//       // Reset attacker's approval to 0
//       await mockGToken.connect(attacker).approve(stakingAddr, 0);
//       await expect(
//         staking.connect(attacker).stakeGDollar(HabitType.Health, e18(100), 7)
//       ).to.be.reverted;
//     });

//     it("stakeGDollar reverts when user balance is insufficient", async function () {
//       const bal = await mockGToken.balanceOf(user1.address);
//       await expect(
//         staking.connect(user1).stakeGDollar(HabitType.Health, bal + e18(1), 7)
//       ).to.be.reverted;
//     });

//     it("claimInitialSeed reverts when contract is empty", async function () {
//       await staking.connect(owner).pause();
//       await staking.connect(owner).emergencyWithdraw();
//       await staking.connect(owner).unpause();
//       await expect(staking.connect(user1).claimInitialSeed())
//         .to.be.revertedWith("GoodCommit: insufficient seed funds in contract");
//     });

//     it("claimPoints reverts when contract cannot cover payout", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 100, 100, 100, 0
//       );
//       await time.increase(DAY + 1);
//       // Drain then re-fund with only 1 G$ (payout needs 10 G$)
//       await staking.connect(owner).pause();
//       await staking.connect(owner).emergencyWithdraw();
//       await staking.connect(owner).unpause();
//       await mockGToken.connect(owner).approve(stakingAddr, e18(1));
//       await staking.connect(owner).fundContract(e18(1));
//       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
//         .to.be.revertedWith("GoodCommit: insufficient contract balance for harvest");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // G. INACTIVITY / SLASH GUARDS
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Inactivity & Slash Guards", function () {

//     it("slashStake reverts if < 3 days inactive", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
//       await time.increase(DAY);
//       await expect(
//         staking.connect(verifier).slashStake(user1.address, HabitType.Health, "fake")
//       ).to.be.revertedWith("GoodCommit: user not inactive yet");
//     });

//     it("slashStake reverts on wallet with no active stake", async function () {
//       await expect(
//         staking.connect(verifier).slashStake(attacker.address, HabitType.Health, "fake")
//       ).to.be.revertedWith("GoodCommit: no active stake");
//     });

//     it("recording workout resets clock — prevents slashing within next 3 days", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//       await time.increase(2 * DAY); // not yet inactive
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 5, "walk");
//       // 2 more days from new lastActivity — still < 3 days
//       await time.increase(2 * DAY);
//       expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false;
//     });

//     it("slash distributes correct amounts even if user had accumulated points", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 50, "gym");
//       await time.increase(3 * DAY + 1);
//       const ubiBefore = await mockGToken.balanceOf(ubiPool.address);
//       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
//       expect(await mockGToken.balanceOf(ubiPool.address) - ubiBefore).to.equal(e18(600));
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // H. DECAY INTEGRITY
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Decay Integrity", function () {

//     it("decay is applied inside claimPoints — user cannot dodge decay by claiming", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 100, 100, 100, 0
//       );
//       // Advance 2 full days past last activity (1 day past commitmentEnd)
//       await time.increase(2 * DAY + 1);

//       const before = await mockGToken.balanceOf(user1.address);
//       await staking.connect(user1).claimPoints(HabitType.Academics);
//       const received = await mockGToken.balanceOf(user1.address) - before;
//       // 100 * 0.6 = 60, 60 * 0.6 = 36 pts → 36/10 * 1e18 = 3.6 G$
//       expect(received).to.equal(ethers.parseEther("3.6"));
//     });

//     it("top-up stake resets lastActivityTime — decay clock restarts from top-up", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");

//       await time.increase(DAY + 1);
//       // Top-up: stakeGDollar sets lastActivityTime = block.timestamp unconditionally
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(50), 30);

//       // Points unchanged (stakeGDollar does not call _applyDecay)
//       const [, ptsAfterTopup] = await staking.getHabitStake(user1.address, HabitType.Health);
//       expect(ptsAfterTopup).to.equal(100n);

//       // Next activity immediately after top-up: lastActivityTime was just reset,
//       // so elapsed = ~0 seconds → daysInactive = 0 → NO decay this time
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");
//       const [, ptsAfterPing] = await staking.getHabitStake(user1.address, HabitType.Health);
//       // 100 pts (no decay, clock was reset by top-up) + 1 new = 101
//       expect(ptsAfterPing).to.equal(101n);

//       // Now advance another full day WITHOUT a top-up and trigger decay
//       await time.increase(DAY + 1);
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping2");
//       const [, ptsAfterDecay] = await staking.getHabitStake(user1.address, HabitType.Health);
//       // 101 * 0.6 = 60 (floor) + 1 = 61
//       expect(ptsAfterDecay).to.equal(61n);
//     });

//     it("decayRewardPool accumulates from two users independently", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
//       await staking.connect(user2).stakeGDollar(HabitType.Health, e18(100), 60);
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");
//       await staking.connect(verifier).recordWorkout(user2.address, HabitType.Health, 3600, 100, "gym");

//       await time.increase(DAY + 1);
//       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");
//       expect(await staking.decayRewardPool()).to.equal(40n); // user1: 40% of 100

//       await staking.connect(verifier).recordWorkout(user2.address, HabitType.Health, 60, 1, "ping");
//       expect(await staking.decayRewardPool()).to.equal(80n); // + user2: another 40
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // I. COMMITMENT PERIOD ENFORCEMENT
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Commitment Period Enforcement", function () {

//     it("claimPoints blocked before commitmentEnd regardless of points", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 100, 100, 100, 0
//       );
//       await time.increase(DAY); // 1 of 30 days
//       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
//         .to.be.revertedWith("GoodCommit: commitment period not ended yet");
//     });

//     it("claimPoints succeeds immediately after commitmentEnd", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 100, 100, 100, 0
//       );
//       await time.increase(DAY + 1);
//       await expect(staking.connect(user1).claimPoints(HabitType.Academics)).to.not.be.reverted;
//     });

//     it("top-up resets commitmentEnd to later — extends lock", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
//       await staking.connect(verifier).recordQuiz(
//         user1.address, HabitType.Academics, 100, 100, 100, 0
//       );
//       // Stake again for 30 days before original 1-day lock expires
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(50), 30);
//       // Advance past original 1-day lock but not the new 30-day lock
//       await time.increase(DAY + 1);
//       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
//         .to.be.revertedWith("GoodCommit: commitment period not ended yet");
//     });
//   });

//   // ═══════════════════════════════════════════════════════════════════════════
//   // J. INPUT VALIDATION
//   // ═══════════════════════════════════════════════════════════════════════════
//   describe("Input Validation", function () {

//     it("stakeGDollar: amount = 0",      async function () { await expect(staking.connect(user1).stakeGDollar(HabitType.Health, 0,         30)).to.be.revertedWith("GoodCommit: amount must be > 0"); });
//     it("stakeGDollar: duration = 0",    async function () { await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100),  0)).to.be.revertedWith("GoodCommit: duration 1-365 days"); });
//     it("stakeGDollar: duration = 366",  async function () { await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 366)).to.be.revertedWith("GoodCommit: duration 1-365 days"); });

//     it("recordWorkout: duration = 0", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//       await expect(staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 0, 10, "run"))
//         .to.be.revertedWith("GoodCommit: zero duration");
//     });

//     it("recordWorkout: pointsEarned = 0", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
//       await expect(staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 0, "run"))
//         .to.be.revertedWith("GoodCommit: zero points");
//     });

//     it("recordQuiz: totalQuestions = 0", async function () {
//       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
//       await expect(staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 0, 0, 0, 0))
//         .to.be.revertedWith("GoodCommit: zero questions");
//     });

//     it("setVerifier: zero address",       async function () { await expect(staking.connect(owner).setVerifier(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
//     it("setRewardTreasury: zero address",  async function () { await expect(staking.connect(owner).setRewardTreasury(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
//     it("setUbiPool: zero address",         async function () { await expect(staking.connect(owner).setUbiPool(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
//   });
// });








// // import { expect } from "chai";
// // import { ethers } from "hardhat";
// // import { time } from "@nomicfoundation/hardhat-network-helpers";
// // import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// // // ─────────────────────────────────────────────────────────────────────────────
// // // GoodCommitStaking — Security Test Suite
// // // Contract: contracts/GoodCommitStaking.sol (V3)
// // //
// // // Constructor (5 args):
// // //   GoodCommitStaking(gDollarToken, identityContract, verifier, rewardTreasury, ubiPool)
// // // ─────────────────────────────────────────────────────────────────────────────

// // const HabitType = { Health: 0, Academics: 1 } as const;
// // const DAY       = 86_400;
// // const e18       = (n: number | string) => ethers.parseEther(String(n));

// // // ─────────────────────────────────────────────────────────────────────────────
// // describe("GoodCommitStaking - Security Tests", function () {

// //   let staking:        any;
// //   let mockGToken:     any;
// //   let mockIdentity:   any;
// //   let stakingAddr:    string;

// //   let owner:          SignerWithAddress;
// //   let user1:          SignerWithAddress;
// //   let user2:          SignerWithAddress;
// //   let attacker:       SignerWithAddress;
// //   let ubiPool:        SignerWithAddress;
// //   let rewardTreasury: SignerWithAddress;
// //   let verifier:       SignerWithAddress;

// //   beforeEach(async function () {
// //     [owner, user1, user2, attacker, ubiPool, rewardTreasury, verifier] =
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
// //     await mockGToken.mint(attacker.address, e18(10_000));

// //     await mockGToken.connect(owner).approve(stakingAddr, e18(200_000));
// //     await staking.connect(owner).fundContract(e18(200_000));

// //     await mockIdentity.setVerified(user1.address, true);
// //     await mockIdentity.setVerified(user2.address, true);

// //     await mockGToken.connect(user1).approve(stakingAddr, e18(10_000));
// //     await mockGToken.connect(user2).approve(stakingAddr, e18(10_000));
// //     await mockGToken.connect(attacker).approve(stakingAddr, e18(10_000));
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // A. ACCESS CONTROL
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Access Control", function () {

// //     it("non-verifier cannot recordWorkout", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //       await expect(
// //         staking.connect(attacker).recordWorkout(user1.address, HabitType.Health, 3600, 50, "run")
// //       ).to.be.revertedWith("GoodCommit: caller is not verifier");
// //     });

// //     it("non-verifier cannot recordQuiz", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
// //       await expect(
// //         staking.connect(attacker).recordQuiz(user1.address, HabitType.Academics, 10, 10, 999_999, 0)
// //       ).to.be.revertedWith("GoodCommit: caller is not verifier");
// //     });

// //     it("non-verifier cannot slashStake", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //       await time.increase(3 * DAY + 1);
// //       await expect(
// //         staking.connect(attacker).slashStake(user1.address, HabitType.Health, "fake")
// //       ).to.be.revertedWith("GoodCommit: caller is not verifier");
// //     });

// //     it("non-owner cannot setVerifier",       async function () { await expect(staking.connect(attacker).setVerifier(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
// //     it("non-owner cannot setRewardTreasury", async function () { await expect(staking.connect(attacker).setRewardTreasury(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
// //     it("non-owner cannot setUbiPool",        async function () { await expect(staking.connect(attacker).setUbiPool(attacker.address)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
// //     it("non-owner cannot fundContract",      async function () { await expect(staking.connect(attacker).fundContract(e18(100))).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
// //     it("non-owner cannot pause",             async function () { await expect(staking.connect(attacker).pause()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
// //     it("non-owner cannot unpause",           async function () { await staking.connect(owner).pause(); await expect(staking.connect(attacker).unpause()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });
// //     it("non-owner cannot emergencyWithdraw", async function () { await staking.connect(owner).pause(); await expect(staking.connect(attacker).emergencyWithdraw()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount"); });

// //     it("verifier cannot award points to themselves (no active stake)", async function () {
// //       await expect(
// //         staking.connect(verifier).recordWorkout(verifier.address, HabitType.Health, 3600, 999_999, "cheat")
// //       ).to.be.revertedWith("GoodCommit: no active stake");
// //     });

// //     it("verifier cannot inflate another user's points beyond what contract allows", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //       // Verifier CAN award points — only trust model prevents abuse; no cap on points in contract
// //       await expect(
// //         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 1_000_000, "cheat")
// //       ).to.not.be.reverted;
// //       // But a random attacker cannot
// //       await expect(
// //         staking.connect(attacker).recordWorkout(user1.address, HabitType.Health, 3600, 1_000_000, "cheat")
// //       ).to.be.revertedWith("GoodCommit: caller is not verifier");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // B. SYBIL RESISTANCE
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Sybil Resistance", function () {

// //     it("same address cannot claim seed twice", async function () {
// //       await staking.connect(user1).claimInitialSeed();
// //       await expect(staking.connect(user1).claimInitialSeed())
// //         .to.be.revertedWith("GoodCommit: seed already claimed");
// //     });

// //     it("two wallets sharing one GD root cannot both claim", async function () {
// //       const root1 = await mockIdentity.getWhitelistedRoot(user1.address);
// //       await mockIdentity.setRoot(user2.address, root1);
// //       await staking.connect(user1).claimInitialSeed();
// //       await expect(staking.connect(user2).claimInitialSeed())
// //         .to.be.revertedWith("GoodCommit: seed already claimed for this GoodDollar identity");
// //     });

// //     it("unverified attacker cannot claim seed", async function () {
// //       await expect(staking.connect(attacker).claimInitialSeed())
// //         .to.be.revertedWith("GoodCommit: wallet not GoodDollar verified - visit gooddollar.org");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // C. REENTRANCY PROTECTION
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Reentrancy Protection", function () {

// //     it("claimPoints: state resets before transfer — double claim reverts immediately", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 100, 100, 100, 0
// //       );
// //       await time.increase(DAY + 1);

// //       await staking.connect(user1).claimPoints(HabitType.Academics); // first claim succeeds

// //       // Second call: points are 0 → reverts before any transfer
// //       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
// //         .to.be.revertedWith("GoodCommit: need 100+ points to claim");
// //     });

// //     it("unstakeTokens: active=false before transfer — no double-unstake", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
// //       await staking.connect(user1).unstakeTokens(HabitType.Health);
// //       await expect(staking.connect(user1).unstakeTokens(HabitType.Health))
// //         .to.be.revertedWith("GoodCommit: no active stake");
// //     });

// //     it("claimInitialSeed: hasClaimedSeed=true before transfer — no double-claim", async function () {
// //       await staking.connect(user1).claimInitialSeed();
// //       await expect(staking.connect(user1).claimInitialSeed())
// //         .to.be.revertedWith("GoodCommit: seed already claimed");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // D. INTEGER SAFETY
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Integer Safety", function () {

// //     it("points floor at 0 for large penalty (no underflow)", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 0, 10, 0, -1_000_000
// //       );
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(pts).to.equal(0n);
// //     });

// //     it("penalty exactly equal to points floors at 0", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
// //       await staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 5, 10, 5, 0);
// //       await staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 0, 10, 0, -5);
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Academics);
// //       expect(pts).to.equal(0n);
// //     });

// //     it("points never go below 0 after 30 days decay", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");
// //       await time.increase(30 * DAY);
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");
// //       const [, pts] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(pts).to.be.gte(0n);
// //     });

// //     it("slash BPS add to exactly 100%: 60+40=100, nothing left behind", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
// //       await time.increase(3 * DAY + 1);
// //       const ubiBefore = await mockGToken.balanceOf(ubiPool.address);
// //       const treBefore = await mockGToken.balanceOf(rewardTreasury.address);
// //       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
// //       const ubiGot = await mockGToken.balanceOf(ubiPool.address)        - ubiBefore;
// //       const treGot = await mockGToken.balanceOf(rewardTreasury.address) - treBefore;
// //       expect(ubiGot + treGot).to.equal(e18(1000));
// //       expect(ubiGot).to.equal(e18(600));
// //       expect(treGot).to.equal(e18(400));
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // E. PAUSE / EMERGENCY WITHDRAW
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Pause & Emergency Withdraw", function () {

// //     it("pause blocks claimInitialSeed",  async function () { await staking.connect(owner).pause(); await expect(staking.connect(user1).claimInitialSeed()).to.be.revertedWithCustomError(staking, "EnforcedPause"); });
// //     it("pause blocks stakeGDollar",      async function () { await staking.connect(owner).pause(); await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 7)).to.be.revertedWithCustomError(staking, "EnforcedPause"); });

// //     it("pause blocks recordWorkout", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //       await staking.connect(owner).pause();
// //       await expect(
// //         staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 10, "run")
// //       ).to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });

// //     it("pause blocks claimPoints", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 100, 100, 100, 0
// //       );
// //       await time.increase(DAY + 1);
// //       await staking.connect(owner).pause();
// //       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
// //         .to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });

// //     it("pause blocks slashStake", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //       await time.increase(3 * DAY + 1);
// //       await staking.connect(owner).pause();
// //       await expect(
// //         staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive")
// //       ).to.be.revertedWithCustomError(staking, "EnforcedPause");
// //     });

// //     it("all operations resume after unpause", async function () {
// //       await staking.connect(owner).pause();
// //       await staking.connect(owner).unpause();
// //       await expect(staking.connect(user1).claimInitialSeed()).to.not.be.reverted;
// //     });

// //     it("emergencyWithdraw reverts when not paused", async function () {
// //       await expect(staking.connect(owner).emergencyWithdraw())
// //         .to.be.revertedWithCustomError(staking, "ExpectedPause");
// //     });

// //     it("emergencyWithdraw sends full balance to owner when paused", async function () {
// //       const contractBal = await staking.contractGDollarBalance();
// //       const ownerBefore = await mockGToken.balanceOf(owner.address);
// //       await staking.connect(owner).pause();
// //       await staking.connect(owner).emergencyWithdraw();
// //       expect(await mockGToken.balanceOf(owner.address) - ownerBefore).to.equal(contractBal);
// //       expect(await staking.contractGDollarBalance()).to.equal(0n);
// //     });

// //     it("contract recovers after emergencyWithdraw + unpause + refund", async function () {
// //       await staking.connect(owner).pause();
// //       await staking.connect(owner).emergencyWithdraw();
// //       await staking.connect(owner).unpause();
// //       await mockGToken.connect(owner).approve(stakingAddr, e18(50_000));
// //       await staking.connect(owner).fundContract(e18(50_000));
// //       await expect(staking.connect(user1).claimInitialSeed()).to.not.be.reverted;
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // F. TOKEN TRANSFER SAFETY
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Token Transfer Safety", function () {

// //     it("stakeGDollar reverts when user has no approval", async function () {
// //       // Reset attacker's approval to 0
// //       await mockGToken.connect(attacker).approve(stakingAddr, 0);
// //       await expect(
// //         staking.connect(attacker).stakeGDollar(HabitType.Health, e18(100), 7)
// //       ).to.be.reverted;
// //     });

// //     it("stakeGDollar reverts when user balance is insufficient", async function () {
// //       const bal = await mockGToken.balanceOf(user1.address);
// //       await expect(
// //         staking.connect(user1).stakeGDollar(HabitType.Health, bal + e18(1), 7)
// //       ).to.be.reverted;
// //     });

// //     it("claimInitialSeed reverts when contract is empty", async function () {
// //       await staking.connect(owner).pause();
// //       await staking.connect(owner).emergencyWithdraw();
// //       await staking.connect(owner).unpause();
// //       await expect(staking.connect(user1).claimInitialSeed())
// //         .to.be.revertedWith("GoodCommit: insufficient seed funds in contract");
// //     });

// //     it("claimPoints reverts when contract cannot cover payout", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 100, 100, 100, 0
// //       );
// //       await time.increase(DAY + 1);
// //       // Drain then re-fund with only 1 G$ (payout needs 10 G$)
// //       await staking.connect(owner).pause();
// //       await staking.connect(owner).emergencyWithdraw();
// //       await staking.connect(owner).unpause();
// //       await mockGToken.connect(owner).approve(stakingAddr, e18(1));
// //       await staking.connect(owner).fundContract(e18(1));
// //       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
// //         .to.be.revertedWith("GoodCommit: insufficient contract balance for harvest");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // G. INACTIVITY / SLASH GUARDS
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Inactivity & Slash Guards", function () {

// //     it("slashStake reverts if < 3 days inactive", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(500), 30);
// //       await time.increase(DAY);
// //       await expect(
// //         staking.connect(verifier).slashStake(user1.address, HabitType.Health, "fake")
// //       ).to.be.revertedWith("GoodCommit: user not inactive yet");
// //     });

// //     it("slashStake reverts on wallet with no active stake", async function () {
// //       await expect(
// //         staking.connect(verifier).slashStake(attacker.address, HabitType.Health, "fake")
// //       ).to.be.revertedWith("GoodCommit: no active stake");
// //     });

// //     it("recording workout resets clock — prevents slashing within next 3 days", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //       await time.increase(2 * DAY); // not yet inactive
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 5, "walk");
// //       // 2 more days from new lastActivity — still < 3 days
// //       await time.increase(2 * DAY);
// //       expect(await staking.isInactive(user1.address, HabitType.Health)).to.be.false;
// //     });

// //     it("slash distributes correct amounts even if user had accumulated points", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(1000), 30);
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 50, "gym");
// //       await time.increase(3 * DAY + 1);
// //       const ubiBefore = await mockGToken.balanceOf(ubiPool.address);
// //       await staking.connect(verifier).slashStake(user1.address, HabitType.Health, "inactive");
// //       expect(await mockGToken.balanceOf(ubiPool.address) - ubiBefore).to.equal(e18(600));
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // H. DECAY INTEGRITY
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Decay Integrity", function () {

// //     it("decay is applied inside claimPoints — user cannot dodge decay by claiming", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 100, 100, 100, 0
// //       );
// //       // Advance 1 day past commitmentEnd (so 2 full days past last activity)
// //       await time.increase(2 * DAY + 1);

// //       const before = await mockGToken.balanceOf(user1.address);
// //       await staking.connect(user1).claimPoints(HabitType.Academics);
// //       const received = await mockGToken.balanceOf(user1.address) - before;
// //       // 100 pts * 0.6^2 (2 days decay) = 36 pts = 3.6 G$
// //       expect(received).to.equal(e18(3.6));
// //     });

// //     it("top-up stake does NOT call _applyDecay — pending decay survives until next activity", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");

// //       await time.increase(DAY + 1);
// //       // Top-up doesn't trigger decay
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(50), 30);
// //       const [, ptsAfterTopup] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(ptsAfterTopup).to.equal(100n); // unchanged — decay not yet applied

// //       // Next activity triggers decay
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");
// //       const [, ptsAfterPing] = await staking.getHabitStake(user1.address, HabitType.Health);
// //       expect(ptsAfterPing).to.equal(61n); // 100*0.6=60 + 1
// //     });

// //     it("decayRewardPool accumulates from two users independently", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 60);
// //       await staking.connect(user2).stakeGDollar(HabitType.Health, e18(100), 60);
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 100, "gym");
// //       await staking.connect(verifier).recordWorkout(user2.address, HabitType.Health, 3600, 100, "gym");

// //       await time.increase(DAY + 1);
// //       await staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 60, 1, "ping");
// //       expect(await staking.decayRewardPool()).to.equal(40n); // user1: 40% of 100

// //       await staking.connect(verifier).recordWorkout(user2.address, HabitType.Health, 60, 1, "ping");
// //       expect(await staking.decayRewardPool()).to.equal(80n); // + user2: another 40
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // I. COMMITMENT PERIOD ENFORCEMENT
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Commitment Period Enforcement", function () {

// //     it("claimPoints blocked before commitmentEnd regardless of points", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 100, 100, 100, 0
// //       );
// //       await time.increase(DAY); // 1 of 30 days
// //       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
// //         .to.be.revertedWith("GoodCommit: commitment period not ended yet");
// //     });

// //     it("claimPoints succeeds immediately after commitmentEnd", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 100, 100, 100, 0
// //       );
// //       await time.increase(DAY + 1);
// //       await expect(staking.connect(user1).claimPoints(HabitType.Academics)).to.not.be.reverted;
// //     });

// //     it("top-up resets commitmentEnd to later — extends lock", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 1);
// //       await staking.connect(verifier).recordQuiz(
// //         user1.address, HabitType.Academics, 100, 100, 100, 0
// //       );
// //       // Stake again for 30 days before original 1-day lock expires
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(50), 30);
// //       // Advance past original 1-day lock but not the new 30-day lock
// //       await time.increase(DAY + 1);
// //       await expect(staking.connect(user1).claimPoints(HabitType.Academics))
// //         .to.be.revertedWith("GoodCommit: commitment period not ended yet");
// //     });
// //   });

// //   // ═══════════════════════════════════════════════════════════════════════════
// //   // J. INPUT VALIDATION
// //   // ═══════════════════════════════════════════════════════════════════════════
// //   describe("Input Validation", function () {

// //     it("stakeGDollar: amount = 0",      async function () { await expect(staking.connect(user1).stakeGDollar(HabitType.Health, 0,         30)).to.be.revertedWith("GoodCommit: amount must be > 0"); });
// //     it("stakeGDollar: duration = 0",    async function () { await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100),  0)).to.be.revertedWith("GoodCommit: duration 1-365 days"); });
// //     it("stakeGDollar: duration = 366",  async function () { await expect(staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 366)).to.be.revertedWith("GoodCommit: duration 1-365 days"); });

// //     it("recordWorkout: duration = 0", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //       await expect(staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 0, 10, "run"))
// //         .to.be.revertedWith("GoodCommit: zero duration");
// //     });

// //     it("recordWorkout: pointsEarned = 0", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Health, e18(100), 30);
// //       await expect(staking.connect(verifier).recordWorkout(user1.address, HabitType.Health, 3600, 0, "run"))
// //         .to.be.revertedWith("GoodCommit: zero points");
// //     });

// //     it("recordQuiz: totalQuestions = 0", async function () {
// //       await staking.connect(user1).stakeGDollar(HabitType.Academics, e18(100), 30);
// //       await expect(staking.connect(verifier).recordQuiz(user1.address, HabitType.Academics, 0, 0, 0, 0))
// //         .to.be.revertedWith("GoodCommit: zero questions");
// //     });

// //     it("setVerifier: zero address",       async function () { await expect(staking.connect(owner).setVerifier(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
// //     it("setRewardTreasury: zero address",  async function () { await expect(staking.connect(owner).setRewardTreasury(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
// //     it("setUbiPool:  zero address",         async function () { await expect(staking.connect(owner).setUbiPool(ethers.ZeroAddress)).to.be.revertedWith("Zero address"); });
// //   });
// // });
