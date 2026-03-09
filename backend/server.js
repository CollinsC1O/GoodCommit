require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed'));
  },
});

const PORT = process.env.PORT || 3001;

// ==================== PROVIDERS ====================

/**
 * Identity checks ALWAYS use Celo mainnet — GoodDollar's Identity contract
 * only exists on Celo mainnet (and Fuse), never on Alfajores testnet.
 */
const CELO_MAINNET_RPC = process.env.CELO_RPC_URL || 'https://forno.celo.org';
const identityProvider = new ethers.JsonRpcProvider(CELO_MAINNET_RPC);

/**
 * Staking/verifier wallet uses testnet in dev, mainnet in prod.
 * These are intentionally separate from the identity provider.
 */
const STAKING_RPC =
  process.env.NODE_ENV === 'production'
    ? (process.env.CELO_RPC_URL || 'https://forno.celo.org')
    : (process.env.ALFAJORES_RPC_URL || 'https://alfajores-forno.celo-testnet.org');

// ==================== VERIFIER WALLET ====================

let verifierWallet = null;

if (!process.env.VERIFIER_PRIVATE_KEY || process.env.VERIFIER_PRIVATE_KEY.includes('your_')) {
  console.error('❌  VERIFIER_PRIVATE_KEY not set — blockchain transactions disabled.');
} else {
  try {
    const stakingProvider = new ethers.JsonRpcProvider(STAKING_RPC);
    verifierWallet = new ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY, stakingProvider);
    console.log(`✅  Verifier wallet: ${verifierWallet.address}`);
  } catch (err) {
    console.error('❌  Invalid VERIFIER_PRIVATE_KEY:', err.shortMessage || err.message);
  }
}

// ==================== GOODDOLLAR IDENTITY CONTRACT ====================

/**
 * PRODUCTION Identity contract on Celo mainnet.
 *
 * Source: https://docs.gooddollar.org/for-developers/apis-and-sdks/sybil-resistance/identity-viem-wagmi
 * Verified: https://celoscan.io/address/0xC361A6E67822a0EDc17D899227dd9FC50BD62F42
 *
 * This is the SAME address the @goodsdks/citizen-sdk targets when you pass
 * env: 'production' in IdentitySDK.init() on the frontend.
 *
 * ❌  WRONG (Alfajores testnet): 0x53A537b6917fAFC6bFE1Ae0d54874A225Ce25bA1
 *    Querying this on a Celo mainnet RPC returns empty bytes (0x), causing the
 *    "BAD_DATA / could not decode result data" error you saw originally.
 *
 * ✅  CORRECT (Celo mainnet production): 0xC361A6E67822a0EDc17D899227dd9FC50BD62F42
 */
const IDENTITY_ADDRESS = '0xC361A6E67822a0EDc17D899227dd9FC50BD62F42';

/**
 * ABI for GoodDollar IdentityV2 (UUPS proxy on Celo mainnet).
 * Source: https://github.com/GoodDollar/GoodProtocol/blob/master/contracts/identity/IdentityV2.sol
 *
 * We include authenticationPeriod() so we can compute expiry dynamically
 * instead of hard-coding a number of days.
 */
const IDENTITY_ABI = [
  'function isWhitelisted(address account) external view returns (bool)',
  'function lastAuthenticated(address account) external view returns (uint256)',
  'function authenticationPeriod() external view returns (uint256)',
];

const identityContract = new ethers.Contract(IDENTITY_ADDRESS, IDENTITY_ABI, identityProvider);

// ==================== STAKING CONTRACT ABI ====================

const STAKING_ABI = [
  { inputs: [{ name: 'user', type: 'address' }, { name: 'habitType', type: 'uint8' }, { name: 'duration', type: 'uint256' }, { name: 'pointsEarned', type: 'uint256' }, { name: 'exerciseType', type: 'string' }], name: 'recordWorkout', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'habitType', type: 'uint8' }, { name: 'correctAnswers', type: 'uint8' }, { name: 'totalQuestions', type: 'uint8' }, { name: 'pointsEarned', type: 'uint256' }, { name: 'pointsPenalty', type: 'int256' }], name: 'recordQuiz', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'habitType', type: 'uint8' }, { name: 'reason', type: 'string' }], name: 'slashStake', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'habitType', type: 'uint8' }], name: 'isInactive', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
];

// ==================== FACE VERIFICATION ====================

/**
 * Checks GoodDollar face verification by reading IdentityV2 on Celo mainnet.
 *
 * FAIL CLOSED: any RPC/contract error returns verified: false so a broken
 * provider never accidentally grants access.
 *
 * Flow:
 *  1. isWhitelisted(address) → fast reject if not in whitelist
 *  2. lastAuthenticated(address) → unix timestamp of last face scan
 *  3. authenticationPeriod() → days a scan remains valid (~14 days)
 *  4. Check that now < lastAuth + period (not expired)
 */
async function checkGoodDollarVerification(userAddress) {
  try {
    const addr = ethers.getAddress(userAddress); // validates + checksums

    const [isWhitelisted, lastAuthTs, periodDays] = await Promise.all([
      identityContract.isWhitelisted(addr),
      identityContract.lastAuthenticated(addr),
      identityContract.authenticationPeriod(),
    ]);

    if (!isWhitelisted) {
      return { verified: false, lastAuthenticated: null, reason: 'Address has not completed GoodDollar face verification.' };
    }

    const lastAuthMs = Number(lastAuthTs) * 1000;
    const periodMs   = Number(periodDays) * 86_400_000;
    const expiryMs   = lastAuthMs + periodMs;
    const lastAuthDate = new Date(lastAuthMs);

    if (Date.now() > expiryMs) {
      const daysAgo = Math.floor((Date.now() - expiryMs) / 86_400_000);
      return {
        verified: false,
        lastAuthenticated: lastAuthDate.toISOString(),
        reason: `Face verification expired ${daysAgo} day(s) ago. Please re-verify with GoodDollar.`,
      };
    }

    return {
      verified: true,
      lastAuthenticated: lastAuthDate.toISOString(),
      expiresInDays: Math.floor((expiryMs - Date.now()) / 86_400_000),
      reason: 'Verified',
    };

  } catch (err) {
    if (err.code === 'INVALID_ARGUMENT') {
      return { verified: false, lastAuthenticated: null, reason: 'Invalid wallet address.' };
    }
    // Log BAD_DATA etc. so you can debug quickly
    console.error(`[Identity] ${userAddress}: ${err.code || ''} ${err.shortMessage || err.message}`);
    return { verified: false, lastAuthenticated: null, reason: 'Could not read on-chain status. Please try again.' };
  }
}

/** Middleware: blocks unverified wallets from protected routes */
async function requireFaceVerification(req, res, next) {
  const userAddress = req.body?.userAddress || req.query?.userAddress;
  if (!userAddress) {
    return res.status(400).json({ error: 'Missing userAddress' });
  }
  const result = await checkGoodDollarVerification(userAddress);
  if (!result.verified) {
    console.warn(`🚫 Blocked ${userAddress}: ${result.reason}`);
    return res.status(403).json({ error: 'Face verification required', message: result.reason, verificationUrl: 'https://gooddollar.org' });
  }
  req.verificationInfo = result;
  next();
}

// ==================== ROUTES ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    verifierWallet: verifierWallet ? { configured: true, address: verifierWallet.address } : { configured: false },
    stakingContract: process.env.STAKING_CONTRACT_ADDRESS || 'not configured',
    identityContract: IDENTITY_ADDRESS,
    identityNetwork: 'Celo mainnet (forno.celo.org)',
    faceVerificationGate: 'ACTIVE ✅',
  });
});

/** Public — frontend polls this after popup closes */
app.get('/api/verify/status/:address', async (req, res) => {
  try {
    const result = await checkGoodDollarVerification(req.params.address);
    res.json(result);
  } catch (err) {
    console.error('Verify status error:', err.message);
    res.status(500).json({ verified: false, error: 'Failed to check verification status.' });
  }
});

// ── Academics ────────────────────────────────────────────────────────────────

app.post('/api/quiz/generate', upload.single('pdf'), requireFaceVerification, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    res.json({ questions: generateMockQuestions(10), timeLimit: 600, totalQuestions: 10, pointsPerQuestion: 1 });
  } catch (err) {
    console.error('Quiz generation error:', err);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

app.post('/api/quiz/submit', requireFaceVerification, async (req, res) => {
  try {
    const { userAddress, answers, totalQuestions } = req.body;
    if (!verifierWallet) return res.status(500).json({ error: 'Verifier wallet not configured' });
    if (!Array.isArray(answers) || !answers.length) return res.status(400).json({ error: 'answers array required' });

    const numQ     = totalQuestions || answers.length;
    const correct  = calculateQuizScore(answers);
    const earned   = correct;
    const penalty  = correct === 0 ? -3 : 0;

    const sc = new ethers.Contract(process.env.STAKING_CONTRACT_ADDRESS, STAKING_ABI, verifierWallet);
    const tx = await sc.recordQuiz(userAddress, 1, correct, numQ, earned, penalty);
    const receipt = await tx.wait();

    res.json({
      success: true,
      correctAnswers: correct,
      wrongAnswers: numQ - correct,
      totalQuestions: numQ,
      pointsEarned: earned,
      pointsPenalty: penalty,
      netPoints: earned + penalty,
      score: Math.round((correct / numQ) * 100),
      txHash: receipt.hash,
      verifiedSince: req.verificationInfo.lastAuthenticated,
      message: correct === 0 ? `All wrong! -3 pts 😔` : correct === numQ ? `Perfect! +${earned} pts 🎉` : `+${earned} pts 📚`,
    });
  } catch (err) {
    console.error('Quiz submit error:', err);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// ── Health & Fitness ─────────────────────────────────────────────────────────

app.post('/api/workout/record', requireFaceVerification, async (req, res) => {
  try {
    const { userAddress, exerciseType, duration, gpsData, speed } = req.body;
    if (!verifierWallet) return res.status(500).json({ error: 'Verifier wallet not configured' });
    if (!exerciseType || duration === undefined) return res.status(400).json({ error: 'exerciseType and duration required' });

    if (['walking', 'running'].includes(exerciseType)) {
      const v = validateGPS(gpsData, speed, exerciseType);
      if (!v.valid) return res.status(400).json({ error: 'Invalid workout data', message: v.reason });
    }

    const pts = Math.floor(duration);
    const sc  = new ethers.Contract(process.env.STAKING_CONTRACT_ADDRESS, STAKING_ABI, verifierWallet);
    const tx  = await sc.recordWorkout(userAddress, 0, duration, pts, exerciseType);
    const receipt = await tx.wait();

    res.json({ success: true, pointsEarned: pts, duration, exerciseType, txHash: receipt.hash, verifiedSince: req.verificationInfo.lastAuthenticated, message: `Workout recorded! +${pts} pts 💪` });
  } catch (err) {
    console.error('Workout error:', err);
    res.status(500).json({ error: 'Failed to record workout' });
  }
});

// ── Admin ────────────────────────────────────────────────────────────────────

app.post('/api/admin/check-inactive', async (req, res) => {
  try {
    const { adminKey, userAddresses } = req.body;
    if (adminKey !== process.env.ADMIN_API_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!verifierWallet) return res.status(500).json({ error: 'Verifier wallet not configured' });
    if (!Array.isArray(userAddresses) || !userAddresses.length) return res.status(400).json({ error: 'userAddresses required' });

    const sc = new ethers.Contract(process.env.STAKING_CONTRACT_ADDRESS, STAKING_ABI, verifierWallet);
    const results = [];

    for (const ua of userAddresses) {
      for (let ht = 0; ht <= 1; ht++) {
        try {
          const inactive = await sc.isInactive(ua, ht);
          if (inactive) {
            const tx = await sc.slashStake(ua, ht, 'Inactive for 3+ days');
            const r  = await tx.wait();
            results.push({ userAddress: ua, habitType: ht === 0 ? 'Health' : 'Academics', slashed: true, txHash: r.hash });
          } else {
            results.push({ userAddress: ua, habitType: ht === 0 ? 'Health' : 'Academics', slashed: false });
          }
        } catch (e) {
          results.push({ userAddress: ua, habitType: ht === 0 ? 'Health' : 'Academics', slashed: false, error: e.message });
        }
      }
    }

    res.json({ success: true, results, summary: { usersChecked: userAddresses.length, stakesSlashed: results.filter((r) => r.slashed).length } });
  } catch (err) {
    console.error('Admin check error:', err);
    res.status(500).json({ error: 'Failed to check inactive users' });
  }
});

// ==================== HELPERS ====================

function generateMockQuestions(count) {
  return [
    { id: 1, question: 'What is the primary function of mitochondria in a cell?', options: ['Protein synthesis', 'Energy production', 'DNA replication', 'Cell division'], correctAnswer: 1 },
    { id: 2, question: 'Which is NOT a renewable energy source?', options: ['Solar power', 'Wind power', 'Natural gas', 'Hydroelectric power'], correctAnswer: 2 },
    { id: 3, question: 'What is the capital of Nigeria?', options: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt'], correctAnswer: 1 },
    { id: 4, question: 'What is the value of π (pi) approximately?', options: ['2.14', '3.14', '4.14', '5.14'], correctAnswer: 1 },
    { id: 5, question: "Who wrote 'Romeo and Juliet'?", options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'], correctAnswer: 1 },
    { id: 6, question: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], correctAnswer: 2 },
    { id: 7, question: 'Which planet is the Red Planet?', options: ['Venus', 'Jupiter', 'Mars', 'Saturn'], correctAnswer: 2 },
    { id: 8, question: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correctAnswer: 3 },
    { id: 9, question: 'When did Nigeria gain independence?', options: ['1958', '1960', '1962', '1963'], correctAnswer: 1 },
    { id: 10, question: 'What is the square root of 144?', options: ['10', '11', '12', '13'], correctAnswer: 2 },
  ].slice(0, count);
}

function calculateQuizScore(answers) {
  const questions = generateMockQuestions(10);
  return answers.reduce((acc, ans, i) => acc + (i < questions.length && ans === questions[i].correctAnswer ? 1 : 0), 0);
}

function validateGPS(gpsData, speed, exerciseType) {
  if (!gpsData?.length) return { valid: false, reason: 'No GPS data provided' };
  const max = exerciseType === 'running' ? 15 : 8;
  if (speed > max) return { valid: false, reason: `Speed too high (${speed} km/h). Are you in a vehicle? 🚗` };
  return { valid: true };
}

// ==================== CRON ====================

setInterval(() => {
  if (!verifierWallet || !process.env.STAKING_CONTRACT_ADDRESS) return;
  // TODO: Fetch tracked users from DB and slash inactive ones
}, 60 * 60 * 1000);

// ==================== START ====================

app.listen(PORT, () => {
  console.log(`\n🚀  GoodCommit Backend — port ${PORT}`);
  console.log(`Env:              ${process.env.NODE_ENV || 'development'}`);
  console.log(`Verifier wallet:  ${verifierWallet?.address || '❌ not configured'}`);
  console.log(`Staking contract: ${process.env.STAKING_CONTRACT_ADDRESS || '❌ not configured'}`);
  console.log(`Identity:         ${IDENTITY_ADDRESS}  (Celo mainnet)`);
  console.log(`\n🔐  Face verification gate: ✅ ACTIVE\n`);
  console.log(`GET  /health`);
  console.log(`GET  /api/verify/status/:address`);
  console.log(`POST /api/quiz/generate      [verified]`);
  console.log(`POST /api/quiz/submit        [verified]`);
  console.log(`POST /api/workout/record     [verified]`);
  console.log(`POST /api/admin/check-inactive\n`);
});