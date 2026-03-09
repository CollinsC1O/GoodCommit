require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Global request timeout — if any route takes longer than 45s, close it cleanly
app.use((req, res, next) => {
  res.setTimeout(45_000, () => {
    if (!res.headersSent) {
      res.status(503).json({ verified: false, rpcError: true, error: 'Request timed out' });
    }
  });
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed'));
  },
});

const PORT = process.env.PORT || 3001;

// ==================== STAKING ABI (declared early — used in multiple routes) ====================

const STAKING_ABI = [
  { inputs: [{ name: 'user', type: 'address' }, { name: 'habitType', type: 'uint8' }, { name: 'duration', type: 'uint256' }, { name: 'pointsEarned', type: 'uint256' }, { name: 'exerciseType', type: 'string' }], name: 'recordWorkout', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'habitType', type: 'uint8' }, { name: 'correctAnswers', type: 'uint8' }, { name: 'totalQuestions', type: 'uint8' }, { name: 'pointsEarned', type: 'uint256' }, { name: 'pointsPenalty', type: 'int256' }], name: 'recordQuiz', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'habitType', type: 'uint8' }, { name: 'reason', type: 'string' }], name: 'slashStake', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'habitType', type: 'uint8' }], name: 'isInactive', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
];

// ==================== PROVIDERS ====================

/**
 * Multiple fallback RPCs for Celo mainnet.
 * forno.celo.org is free but rate-limited and occasionally slow.
 * We try each in order until one responds.
 */
const CELO_MAINNET_RPCS = [
  process.env.CELO_RPC_URL || 'https://forno.celo.org',
  'https://celo.drpc.org',
  'https://rpc.ankr.com/celo',
].filter(Boolean);

/**
 * Build a provider with generous timeout settings.
 * ethers v6 JsonRpcProvider default timeout is 30s — we extend it and
 * add static network to skip the eth_chainId discovery call on every request.
 */
function makeProvider(url) {
  return new ethers.JsonRpcProvider(url, {
    chainId: 42220,
    name:    'celo',
  }, {
    staticNetwork:    true,   // skip chainId probe on every call
    polling:          false,
    batchMaxCount:    1,      // disable batching — forno rejects batched calls
  });
}

/**
 * Try each RPC in sequence until one succeeds.
 * Returns the result of contractFn() or throws if all fail.
 */
async function withFallback(contractFn) {
  let lastErr;
  for (const rpcUrl of CELO_MAINNET_RPCS) {
    try {
      const provider = makeProvider(rpcUrl);
      return await contractFn(provider);
    } catch (err) {
      console.warn(`[RPC] ${rpcUrl} failed: ${err.shortMessage || err.message}`);
      lastErr = err;
    }
  }
  throw lastErr;
}

// Staking provider (testnet in dev, mainnet in prod)
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
 * https://celoscan.io/address/0xC361A6E67822a0EDc17D899227dd9FC50BD62F42
 *
 * IMPORTANT — why we use getWhitelistedRoot() instead of isWhitelisted():
 *
 * A GoodDollar user can verify with wallet A and then connect wallet B
 * to their account via GoodDollar's "connectedAccounts" feature.
 * isWhitelisted(walletB) returns FALSE even though the user is verified.
 * getWhitelistedRoot(walletB) correctly traverses the linked-account chain
 * and returns walletA (the root), proving the user IS verified.
 *
 * If we only call isWhitelisted() we'll incorrectly block every user whose
 * connected MetaMask wallet is not the same address they registered with.
 */
const IDENTITY_ADDRESS = '0xC361A6E67822a0EDc17D899227dd9FC50BD62F42';

const IDENTITY_ABI = [
  // Primary check — resolves linked/connected accounts to the verified root
  'function getWhitelistedRoot(address account) external view returns (address)',
  // Expiry data
  'function lastAuthenticated(address account) external view returns (uint256)',
  'function authenticationPeriod() external view returns (uint256)',
  // Direct whitelist check (used as fallback confirmation)
  'function isWhitelisted(address account) external view returns (bool)',
];

// ── In-memory cache ────────────────────────────────────────────────────────
const verificationCache = new Map(); // address → { result, expiresAt }
const POSITIVE_CACHE_MS = 10 * 60 * 1000; // 10 minutes
const NEGATIVE_CACHE_MS = 15 * 1000;      // 15 seconds — short so re-verification is detected fast

function getCached(address) {
  const entry = verificationCache.get(address.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { verificationCache.delete(address.toLowerCase()); return null; }
  return entry.result;
}
function setCache(address, result) {
  verificationCache.set(address.toLowerCase(), {
    result,
    expiresAt: Date.now() + (result.verified ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS),
  });
}

// ── Core verification function ─────────────────────────────────────────────

/**
 * Checks GoodDollar face verification using getWhitelistedRoot() so that
 * connected/linked wallet addresses are handled correctly.
 *
 * Flow:
 *  1. getWhitelistedRoot(addr) → returns the verified root address, or 0x0 if none
 *  2. If root is 0x0 → not verified
 *  3. lastAuthenticated(root) + authenticationPeriod() → check expiry
 *
 * Uses multi-RPC fallback + per-call timeout. Fails closed on errors.
 */
async function checkGoodDollarVerification(userAddress) {
  let addr;
  try {
    addr = ethers.getAddress(userAddress);
  } catch {
    return { verified: false, lastAuthenticated: null, reason: 'Invalid wallet address.' };
  }

  const cached = getCached(addr);
  if (cached) {
    console.log(`[Identity] cache hit for ${addr}: ${cached.verified}`);
    return cached;
  }

  const withTimeout = (promise, ms = 12000) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms`)), ms)),
    ]);

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  try {
    const result = await withFallback(async (provider) => {
      const contract = new ethers.Contract(IDENTITY_ADDRESS, IDENTITY_ABI, provider);

      // Step 1: resolve to whitelisted root (handles linked/connected accounts)
      const root = await withTimeout(contract.getWhitelistedRoot(addr));

      if (!root || root === ZERO_ADDRESS) {
        return {
          verified: false,
          lastAuthenticated: null,
          reason: 'Address has not completed GoodDollar face verification.',
        };
      }

      // Step 2: check expiry using the ROOT address (not the connected address)
      const [lastAuthTs, periodDays] = await withTimeout(
        Promise.all([
          contract.lastAuthenticated(root),
          contract.authenticationPeriod(),
        ])
      );

      const lastAuthMs   = Number(lastAuthTs) * 1000;
      const periodMs     = Number(periodDays) * 86_400_000;
      const expiryMs     = lastAuthMs + periodMs;
      const lastAuthDate = new Date(lastAuthMs);

      if (Date.now() > expiryMs) {
        const daysAgo = Math.floor((Date.now() - expiryMs) / 86_400_000);
        return {
          verified: false,
          lastAuthenticated: lastAuthDate.toISOString(),
          reason: `Face verification expired ${daysAgo} day(s) ago. Please re-verify with GoodDollar.`,
        };
      }

      console.log(`[Identity] ✅ ${addr} verified via root ${root}, expires in ${Math.floor((expiryMs - Date.now()) / 86_400_000)}d`);

      return {
        verified: true,
        lastAuthenticated: lastAuthDate.toISOString(),
        expiresInDays: Math.floor((expiryMs - Date.now()) / 86_400_000),
        rootAddress: root,   // useful for debugging
        reason: 'Verified',
      };
    });

    setCache(addr, result);
    return result;

  } catch (err) {
    console.error(`[Identity] all RPCs failed for ${addr}: ${err.shortMessage || err.message}`);
    return {
      verified: false,
      lastAuthenticated: null,
      reason: 'Could not read on-chain status — RPC unavailable. Please try again shortly.',
      rpcError: true,
    };
  }
}

// ── Middleware ─────────────────────────────────────────────────────────────

async function requireFaceVerification(req, res, next) {
  const userAddress = req.body?.userAddress || req.query?.userAddress;
  if (!userAddress) {
    return res.status(400).json({ error: 'Missing userAddress' });
  }

  const result = await checkGoodDollarVerification(userAddress);

  if (!result.verified) {
    // If it's an RPC error (transient), return 503 so the frontend knows to retry
    const status = result.rpcError ? 503 : 403;
    console.warn(`🚫 Blocked ${userAddress}: ${result.reason}`);
    return res.status(status).json({
      error:           'Face verification required',
      message:         result.reason,
      rpcError:        result.rpcError || false,
      verificationUrl: 'https://gooddollar.org',
    });
  }

  req.verificationInfo = result;
  next();
}

// ==================== ROUTES ====================

app.get('/health', (req, res) => {
  res.json({
    status:              'ok',
    timestamp:           new Date().toISOString(),
    environment:         process.env.NODE_ENV || 'development',
    verifierWallet:      verifierWallet
      ? { configured: true, address: verifierWallet.address }
      : { configured: false },
    stakingContract:     process.env.STAKING_CONTRACT_ADDRESS || 'not configured',
    identityContract:    IDENTITY_ADDRESS,
    identityNetwork:     'Celo mainnet',
    rpcFallbacks:        CELO_MAINNET_RPCS,
    faceVerificationGate: 'ACTIVE ✅',
    cacheSize:           verificationCache.size,
  });
});

/**
 * GET /api/verify/status/:address
 *
 * Public endpoint — frontend polls this after returning from GoodDollar.
 *
 * Returns:
 *   { verified: true,  lastAuthenticated, expiresInDays }  — confirmed on-chain
 *   { verified: false, reason }                            — not verified
 *   { verified: false, rpcError: true, reason }            — transient RPC error, retry
 */
app.get('/api/verify/status/:address', async (req, res) => {
  try {
    const result = await checkGoodDollarVerification(req.params.address);
    // Use 503 for transient RPC errors so the frontend's fetch doesn't treat it as a
    // definitive "not verified" and clear the localStorage cache prematurely.
    const status = result.rpcError ? 503 : 200;
    res.status(status).json(result);
  } catch (err) {
    console.error('Verify status error:', err.message);
    res.status(503).json({
      verified:  false,
      rpcError:  true,
      error:     'Failed to check verification status. Please try again.',
    });
  }
});

// ── Academics ────────────────────────────────────────────────────────────────

app.post('/api/quiz/generate', upload.single('pdf'), requireFaceVerification, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    res.json({
      questions:      generateMockQuestions(10),
      timeLimit:      600,
      totalQuestions: 10,
      pointsPerQuestion: 1,
    });
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

    const numQ    = totalQuestions || answers.length;
    const correct = calculateQuizScore(answers);
    const earned  = correct;
    const penalty = correct === 0 ? -3 : 0;

    const sc      = new ethers.Contract(process.env.STAKING_CONTRACT_ADDRESS, STAKING_ABI, verifierWallet);
    const tx      = await sc.recordQuiz(userAddress, 1, correct, numQ, earned, penalty);
    const receipt = await tx.wait();

    res.json({
      success:        true,
      correctAnswers: correct,
      wrongAnswers:   numQ - correct,
      totalQuestions: numQ,
      pointsEarned:   earned,
      pointsPenalty:  penalty,
      netPoints:      earned + penalty,
      score:          Math.round((correct / numQ) * 100),
      txHash:         receipt.hash,
      verifiedSince:  req.verificationInfo.lastAuthenticated,
      message:
        correct === 0    ? `All wrong! -3 pts 😔`
        : correct === numQ ? `Perfect! +${earned} pts 🎉`
        :                    `+${earned} pts 📚`,
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

    const pts     = Math.floor(duration);
    const sc      = new ethers.Contract(process.env.STAKING_CONTRACT_ADDRESS, STAKING_ABI, verifierWallet);
    const tx      = await sc.recordWorkout(userAddress, 0, duration, pts, exerciseType);
    const receipt = await tx.wait();

    res.json({
      success:       true,
      pointsEarned:  pts,
      duration,
      exerciseType,
      txHash:        receipt.hash,
      verifiedSince: req.verificationInfo.lastAuthenticated,
      message:       `Workout recorded! +${pts} pts 💪`,
    });
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

    const sc      = new ethers.Contract(process.env.STAKING_CONTRACT_ADDRESS, STAKING_ABI, verifierWallet);
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

    res.json({
      success: true,
      results,
      summary: {
        usersChecked:  userAddresses.length,
        stakesSlashed: results.filter((r) => r.slashed).length,
      },
    });
  } catch (err) {
    console.error('Admin check error:', err);
    res.status(500).json({ error: 'Failed to check inactive users' });
  }
});

// ── Cache management (dev/admin only) ────────────────────────────────────────

app.post('/api/admin/clear-cache', (req, res) => {
  const { adminKey, address } = req.body;
  if (adminKey !== process.env.ADMIN_API_KEY) return res.status(403).json({ error: 'Unauthorized' });

  if (address) {
    verificationCache.delete(address.toLowerCase());
    res.json({ cleared: address });
  } else {
    verificationCache.clear();
    res.json({ cleared: 'all' });
  }
});

// ==================== HELPERS ====================

function generateMockQuestions(count) {
  return [
    { id: 1,  question: 'What is the primary function of mitochondria in a cell?', options: ['Protein synthesis', 'Energy production', 'DNA replication', 'Cell division'],         correctAnswer: 1 },
    { id: 2,  question: 'Which is NOT a renewable energy source?',                  options: ['Solar power', 'Wind power', 'Natural gas', 'Hydroelectric power'],                   correctAnswer: 2 },
    { id: 3,  question: 'What is the capital of Nigeria?',                          options: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt'],                                            correctAnswer: 1 },
    { id: 4,  question: 'What is the value of π (pi) approximately?',              options: ['2.14', '3.14', '4.14', '5.14'],                                                        correctAnswer: 1 },
    { id: 5,  question: "Who wrote 'Romeo and Juliet'?",                            options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'],                correctAnswer: 1 },
    { id: 6,  question: 'What is the chemical symbol for gold?',                   options: ['Go', 'Gd', 'Au', 'Ag'],                                                               correctAnswer: 2 },
    { id: 7,  question: 'Which planet is the Red Planet?',                         options: ['Venus', 'Jupiter', 'Mars', 'Saturn'],                                                  correctAnswer: 2 },
    { id: 8,  question: 'What is the largest ocean on Earth?',                     options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'],                                             correctAnswer: 3 },
    { id: 9,  question: 'When did Nigeria gain independence?',                     options: ['1958', '1960', '1962', '1963'],                                                         correctAnswer: 1 },
    { id: 10, question: 'What is the square root of 144?',                         options: ['10', '11', '12', '13'],                                                               correctAnswer: 2 },
  ].slice(0, count);
}

function calculateQuizScore(answers) {
  const questions = generateMockQuestions(10);
  return answers.reduce(
    (acc, ans, i) => acc + (i < questions.length && ans === questions[i].correctAnswer ? 1 : 0),
    0,
  );
}

function validateGPS(gpsData, speed, exerciseType) {
  if (!gpsData?.length) return { valid: false, reason: 'No GPS data provided' };
  const max = exerciseType === 'running' ? 15 : 8;
  if (speed > max) return { valid: false, reason: `Speed too high (${speed} km/h). Are you in a vehicle? 🚗` };
  return { valid: true };
}

// ==================== START ====================

app.listen(PORT, () => {
  console.log(`\n🚀  GoodCommit Backend — port ${PORT}`);
  console.log(`Env:              ${process.env.NODE_ENV || 'development'}`);
  console.log(`Verifier wallet:  ${verifierWallet?.address || '❌ not configured'}`);
  console.log(`Staking contract: ${process.env.STAKING_CONTRACT_ADDRESS || '❌ not configured'}`);
  console.log(`Identity:         ${IDENTITY_ADDRESS}  (Celo mainnet)`);
  console.log(`RPC fallbacks:    ${CELO_MAINNET_RPCS.join(' → ')}`);
  console.log(`\n🔐  Face verification gate: ✅ ACTIVE\n`);
  console.log(`GET  /health`);
  console.log(`GET  /api/verify/status/:address`);
  console.log(`POST /api/quiz/generate      [verified]`);
  console.log(`POST /api/quiz/submit        [verified]`);
  console.log(`POST /api/workout/record     [verified]`);
  console.log(`POST /api/admin/check-inactive`);
  console.log(`POST /api/admin/clear-cache\n`);
});
