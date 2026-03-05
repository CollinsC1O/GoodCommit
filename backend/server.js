require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configure multer for PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files allowed'));
    }
  },
});

const PORT = process.env.PORT || 3001;

// ==================== PROVIDER SETUP ====================

const provider = new ethers.JsonRpcProvider(
  process.env.NODE_ENV === 'production'
    ? process.env.CELO_RPC_URL
    : process.env.ALFAJORES_RPC_URL
);

// Graceful wallet initialisation.
// If VERIFIER_PRIVATE_KEY is missing the server still starts — blockchain
// transactions will be disabled with a clear error rather than a crash.
let verifierWallet = null;

if (!process.env.VERIFIER_PRIVATE_KEY || process.env.VERIFIER_PRIVATE_KEY.includes('your_')) {
  console.error('❌ VERIFIER_PRIVATE_KEY is missing or still a placeholder in .env');
  console.error('   Export your verifier wallet private key from MetaMask and add it to backend/.env');
  console.error('   Server will start but all blockchain transactions will be disabled.');
} else {
  try {
    verifierWallet = new ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY, provider);
    console.log(`✅ Verifier wallet loaded: ${verifierWallet.address}`);
  } catch (error) {
    console.error('❌ Invalid VERIFIER_PRIVATE_KEY in .env:', error.shortMessage || error.message);
    console.error('   Make sure you copied the full 64-character hex private key without the 0x prefix.');
    console.error('   Server will start but all blockchain transactions will be disabled.');
  }
}

// ==================== GOODDOLLAR IDENTITY CONTRACT SETUP ====================

/**
 * GoodDollar Identity Contract Addresses
 *
 * Alfajores (testnet): 0x53A537b6917fAFC6bFE1Ae0d54874A225Ce25bA1
 * Verify at: https://alfajores.celoscan.io/address/0x53A537b6917fAFC6bFE1Ae0d54874A225Ce25bA1
 */
const GOODDOLLAR_IDENTITY_ADDRESSES = {
  alfajores: '0x53A537b6917fAFC6bFE1Ae0d54874A225Ce25bA1',
  celo: process.env.GOODDOLLAR_IDENTITY_ADDRESS_MAINNET || '',
};

// Minimal ABI — only the two read functions we need from the Identity contract
const IDENTITY_ABI = [
  'function isWhitelisted(address account) public view returns (bool)',
  'function lastAuthenticated(address account) public view returns (uint256)',
];

const identityAddress =
  process.env.NODE_ENV === 'production'
    ? GOODDOLLAR_IDENTITY_ADDRESSES.celo
    : GOODDOLLAR_IDENTITY_ADDRESSES.alfajores;

// Read-only contract instance — no wallet needed to query the whitelist
const identityContract = identityAddress
  ? new ethers.Contract(identityAddress, IDENTITY_ABI, provider)
  : null;

// ==================== STAKING CONTRACT ABI ====================

const STAKING_ABI = [
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
      { name: 'duration', type: 'uint256' },
      { name: 'pointsEarned', type: 'uint256' },
      { name: 'exerciseType', type: 'string' },
    ],
    name: 'recordWorkout',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
      { name: 'correctAnswers', type: 'uint8' },
      { name: 'totalQuestions', type: 'uint8' },
      { name: 'pointsEarned', type: 'uint256' },
      { name: 'pointsPenalty', type: 'int256' },
    ],
    name: 'recordQuiz',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
      { name: 'reason', type: 'string' },
    ],
    name: 'slashStake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
    ],
    name: 'isInactive',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// ==================== FACE VERIFICATION HELPER ====================

/**
 * Checks if a wallet address has passed GoodDollar face verification
 * by querying GoodDollar's Identity contract directly on-chain.
 *
 * SECURITY: Cannot be bypassed from the frontend — reads from the blockchain,
 * not from any local state, session, or cookie.
 *
 * FAIL CLOSED: Any error returns verified: false. We never accidentally
 * let someone through.
 */
async function checkGoodDollarVerification(userAddress) {
  if (!identityContract) {
    console.error(
      '⚠️  SECURITY WARNING: GoodDollar Identity contract not configured. ' +
        'Defaulting to BLOCKED for safety.'
    );
    return {
      verified: false,
      lastAuthenticated: null,
      reason: 'Identity contract not configured on this server',
    };
  }

  try {
    const checksumAddress = ethers.getAddress(userAddress);

    const [isWhitelisted, lastAuthTimestamp] = await Promise.all([
      identityContract.isWhitelisted(checksumAddress),
      identityContract.lastAuthenticated(checksumAddress),
    ]);

    if (!isWhitelisted) {
      return {
        verified: false,
        lastAuthenticated: null,
        reason: 'Address has not completed GoodDollar face verification',
      };
    }

    const lastAuthDate = new Date(Number(lastAuthTimestamp) * 1000);
    const daysSinceAuth = (Date.now() - lastAuthDate.getTime()) / (1000 * 60 * 60 * 24);

    // GoodDollar's authenticationPeriod is ~365 days
    if (daysSinceAuth > 365) {
      return {
        verified: false,
        lastAuthenticated: lastAuthDate.toISOString(),
        reason: 'Face verification has expired. Please re-verify with GoodDollar.',
      };
    }

    return {
      verified: true,
      lastAuthenticated: lastAuthDate.toISOString(),
      reason: 'Verified',
    };
  } catch (error) {
    if (error.code === 'INVALID_ARGUMENT') {
      return {
        verified: false,
        lastAuthenticated: null,
        reason: 'Invalid wallet address format',
      };
    }

    console.error('Error checking GoodDollar verification:', error.message);
    return {
      verified: false,
      lastAuthenticated: null,
      reason: 'Could not verify face verification status. Please try again.',
    };
  }
}

/**
 * Express middleware — blocks any unverified wallet from protected routes.
 *
 * Reads userAddress from req.body OR req.query so it works correctly
 * whether it runs before or after multer, and for JSON or multipart requests.
 */
async function requireFaceVerification(req, res, next) {
  const userAddress = req.body?.userAddress || req.query?.userAddress;

  if (!userAddress) {
    return res.status(400).json({
      error: 'Missing userAddress',
      message: 'A wallet address must be provided in the request body or query string',
    });
  }

  const result = await checkGoodDollarVerification(userAddress);

  if (!result.verified) {
    console.warn(`🚫 Blocked unverified user: ${userAddress} — ${result.reason}`);
    return res.status(403).json({
      error: 'Face verification required',
      message: result.reason,
      verificationUrl: 'https://gooddollar.org',
    });
  }

  req.verificationInfo = result;
  next();
}

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    verifierWallet: verifierWallet
      ? { configured: true, address: verifierWallet.address }
      : { configured: false, address: null },
    stakingContract: process.env.STAKING_CONTRACT_ADDRESS || 'not configured',
    identityContract: identityAddress || 'not configured',
    faceVerificationGate: identityContract ? 'ACTIVE ✅' : 'INACTIVE ❌',
  });
});

/**
 * Public endpoint — lets the frontend poll on-chain verification status.
 *
 * Used by useFaceVerification hook and FaceVerification component to check
 * whether GoodDollar's whitelist update has propagated on-chain after the
 * user completes the face scan popup.
 */
app.get('/api/verify/status/:address', async (req, res) => {
  try {
    const result = await checkGoodDollarVerification(req.params.address);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check verification status' });
  }
});

// ==================== ACADEMICS ENDPOINTS ====================

/**
 * Generate a quiz from an uploaded PDF.
 *
 * Multer runs FIRST to parse the multipart body, then requireFaceVerification
 * runs SECOND so it can read userAddress from the now-populated req.body.
 */
app.post(
  '/api/quiz/generate',
  upload.single('pdf'),       // ← multer FIRST: parses multipart, populates req.body
  requireFaceVerification,    // ← middleware SECOND: can now read req.body.userAddress
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No PDF file uploaded' });
      }

      // TODO: Extract text from PDF with a library like pdf-parse
      // const pdfText = await extractTextFromPDF(req.file.buffer);

      // TODO: Generate quiz with AI (OpenAI / local model)
      // const quiz = await generateQuizWithAI(pdfText);

      // Mock quiz for development
      const mockQuiz = {
        questions: generateMockQuestions(10),
        timeLimit: 600,        // 10 minutes in seconds
        totalQuestions: 10,
        pointsPerQuestion: 1,  // ✅ 1 point per correct answer
      };

      res.json(mockQuiz);
    } catch (error) {
      console.error('Quiz generation error:', error);
      res.status(500).json({ error: 'Failed to generate quiz' });
    }
  }
);

/**
 * Submit quiz answers and record the result on-chain via the verifier wallet.
 *
 * ✅ CORRECT PENALTY LOGIC:
 *   - 1 point per correct answer (not 10)
 *   - No deduction as long as at least 1 answer is correct
 *   - If ALL answers are wrong → deduct exactly 3 points (pointsPenalty = -3)
 *
 * This matches the contract's recordQuiz(pointsEarned uint256, pointsPenalty int256)
 * where a negative int256 causes the contract to deduct from accumulated points.
 */
app.post('/api/quiz/submit', requireFaceVerification, async (req, res) => {
  try {
    const { userAddress, answers, totalQuestions } = req.body;

    if (!verifierWallet) {
      return res.status(500).json({ error: 'Verifier wallet not configured' });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'answers array is required' });
    }

    const numQuestions = totalQuestions || answers.length;
    const correctCount = calculateQuizScore(answers);

    // ✅ 1 point per correct answer
    const pointsEarned = correctCount;

    // ✅ -3 ONLY when ALL answers are wrong; 0 otherwise
    const pointsPenalty = correctCount === 0 ? -3 : 0;

    const netPoints = pointsEarned + pointsPenalty;

    const stakingContract = new ethers.Contract(
      process.env.STAKING_CONTRACT_ADDRESS,
      STAKING_ABI,
      verifierWallet
    );

    const tx = await stakingContract.recordQuiz(
      userAddress,
      1,              // HabitType.Academics = 1
      correctCount,
      numQuestions,
      pointsEarned,   // uint256 — always ≥ 0
      pointsPenalty   // int256  — 0 or -3
    );

    const receipt = await tx.wait();

    const wrongCount = numQuestions - correctCount;

    res.json({
      success: true,
      correctAnswers: correctCount,
      wrongAnswers: wrongCount,
      totalQuestions: numQuestions,
      pointsEarned,
      pointsPenalty,
      netPoints,
      score: Math.round((correctCount / numQuestions) * 100),
      txHash: receipt.hash,
      verifiedSince: req.verificationInfo.lastAuthenticated,
      message:
        correctCount === 0
          ? `All wrong! -3 points penalty applied 😔`
          : correctCount === numQuestions
          ? `Perfect score! +${pointsEarned} points earned 🎉`
          : `Quiz complete! +${pointsEarned} pts earned, no penalty (you got some right!) 📚`,
    });
  } catch (error) {
    console.error('Quiz submission error:', error);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// ==================== HEALTH & FITNESS ENDPOINTS ====================

/**
 * Validate and record a workout on-chain.
 * Points = 1 per second of verified activity (matches contract recordWorkout).
 * GPS validation is applied for walking and running activities.
 */
app.post('/api/workout/record', requireFaceVerification, async (req, res) => {
  try {
    const { userAddress, exerciseType, duration, gpsData, distance, speed } = req.body;

    if (!verifierWallet) {
      return res.status(500).json({ error: 'Verifier wallet not configured' });
    }

    if (!exerciseType || duration === undefined) {
      return res.status(400).json({ error: 'exerciseType and duration are required' });
    }

    // Validate GPS data for outdoor activities
    if (exerciseType === 'walking' || exerciseType === 'running') {
      const validation = validateGPSData(gpsData, speed, exerciseType);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid workout data',
          message: validation.reason,
        });
      }
    }

    // 1 point per second of verified activity
    const pointsEarned = Math.floor(duration);

    const stakingContract = new ethers.Contract(
      process.env.STAKING_CONTRACT_ADDRESS,
      STAKING_ABI,
      verifierWallet
    );

    const tx = await stakingContract.recordWorkout(
      userAddress,
      0,            // HabitType.Health = 0
      duration,
      pointsEarned,
      exerciseType
    );

    const receipt = await tx.wait();

    res.json({
      success: true,
      pointsEarned,
      duration,
      exerciseType,
      txHash: receipt.hash,
      verifiedSince: req.verificationInfo.lastAuthenticated,
      message: `Workout recorded! +${pointsEarned} points 💪`,
    });
  } catch (error) {
    console.error('Workout recording error:', error);
    res.status(500).json({ error: 'Failed to record workout' });
  }
});

// ==================== ADMIN/MONITORING ENDPOINTS ====================

/**
 * Scan a list of user addresses and slash any inactive stakes.
 * Protected by ADMIN_API_KEY — no face verification required.
 */
app.post('/api/admin/check-inactive', async (req, res) => {
  try {
    const { adminKey, userAddresses } = req.body;

    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!verifierWallet) {
      return res.status(500).json({ error: 'Verifier wallet not configured' });
    }

    if (!Array.isArray(userAddresses) || userAddresses.length === 0) {
      return res.status(400).json({ error: 'userAddresses array is required' });
    }

    const stakingContract = new ethers.Contract(
      process.env.STAKING_CONTRACT_ADDRESS,
      STAKING_ABI,
      verifierWallet
    );

    const results = [];

    for (const userAddress of userAddresses) {
      for (let habitType = 0; habitType <= 1; habitType++) {
        try {
          const inactive = await stakingContract.isInactive(userAddress, habitType);

          if (inactive) {
            const tx = await stakingContract.slashStake(
              userAddress,
              habitType,
              'Inactive for 3+ days'
            );
            const receipt = await tx.wait();

            results.push({
              userAddress,
              habitType: habitType === 0 ? 'Health' : 'Academics',
              slashed: true,
              txHash: receipt.hash,
            });
          } else {
            results.push({
              userAddress,
              habitType: habitType === 0 ? 'Health' : 'Academics',
              slashed: false,
              reason: 'User is active',
            });
          }
        } catch (error) {
          results.push({
            userAddress,
            habitType: habitType === 0 ? 'Health' : 'Academics',
            slashed: false,
            error: error.message,
          });
        }
      }
    }

    res.json({
      success: true,
      results,
      summary: {
        usersChecked: userAddresses.length,
        stakesSlashed: results.filter((r) => r.slashed).length,
      },
    });
  } catch (error) {
    console.error('Inactive check error:', error);
    res.status(500).json({ error: 'Failed to check inactive users' });
  }
});

// ==================== HELPER FUNCTIONS ====================

function generateMockQuestions(count) {
  const questions = [
    {
      id: 1,
      question: 'What is the primary function of mitochondria in a cell?',
      options: ['Protein synthesis', 'Energy production', 'DNA replication', 'Cell division'],
      correctAnswer: 1,
    },
    {
      id: 2,
      question: 'Which of the following is NOT a renewable energy source?',
      options: ['Solar power', 'Wind power', 'Natural gas', 'Hydroelectric power'],
      correctAnswer: 2,
    },
    {
      id: 3,
      question: 'What is the capital of Nigeria?',
      options: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt'],
      correctAnswer: 1,
    },
    {
      id: 4,
      question: 'In mathematics, what is the value of π (pi) approximately?',
      options: ['2.14', '3.14', '4.14', '5.14'],
      correctAnswer: 1,
    },
    {
      id: 5,
      question: "Who wrote the play 'Romeo and Juliet'?",
      options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'],
      correctAnswer: 1,
    },
    {
      id: 6,
      question: 'What is the chemical symbol for gold?',
      options: ['Go', 'Gd', 'Au', 'Ag'],
      correctAnswer: 2,
    },
    {
      id: 7,
      question: 'Which planet is known as the Red Planet?',
      options: ['Venus', 'Jupiter', 'Mars', 'Saturn'],
      correctAnswer: 2,
    },
    {
      id: 8,
      question: 'What is the largest ocean on Earth?',
      options: ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean', 'Pacific Ocean'],
      correctAnswer: 3,
    },
    {
      id: 9,
      question: 'In which year did Nigeria gain independence?',
      options: ['1958', '1960', '1962', '1963'],
      correctAnswer: 1,
    },
    {
      id: 10,
      question: 'What is the square root of 144?',
      options: ['10', '11', '12', '13'],
      correctAnswer: 2,
    },
  ];

  return questions.slice(0, count);
}

/**
 * Scores submitted answers against the mock question bank.
 * Returns the number of correct answers.
 */
function calculateQuizScore(answers) {
  const questions = generateMockQuestions(10);
  let correct = 0;

  answers.forEach((answer, index) => {
    if (index < questions.length && answer === questions[index].correctAnswer) {
      correct++;
    }
  });

  return correct;
}

function validateGPSData(gpsData, speed, exerciseType) {
  if (!gpsData || !gpsData.length) {
    return { valid: false, reason: 'No GPS data provided' };
  }

  // Speed caps: walking ≤ 8 km/h, running ≤ 15 km/h
  const maxSpeed = exerciseType === 'running' ? 15 : 8;
  if (speed > maxSpeed) {
    return {
      valid: false,
      reason: `Speed too high (${speed} km/h). Are you in a vehicle? 🚗`,
    };
  }

  // TODO: Add path consistency checks, teleportation detection, timestamp gap analysis

  return { valid: true };
}

// ==================== CRON JOB FOR DECAY MONITORING ====================

setInterval(async () => {
  if (!verifierWallet || !process.env.STAKING_CONTRACT_ADDRESS) return;

  try {
    console.log('🔍 Running scheduled inactive user check…');
    // TODO: Fetch tracked user addresses from a persistent store (database/cache)
    // then iterate and call slashStake() for any inactive ones
  } catch (error) {
    console.error('Decay monitoring error:', error);
  }
}, 60 * 60 * 1000); // Runs every hour

// ==================== SERVER START ====================

app.listen(PORT, () => {
  console.log(`\n🚀 GoodCommit Backend running on port ${PORT}`);
  console.log(`Environment:         ${process.env.NODE_ENV || 'development'}`);
  console.log(`Verifier wallet:     ${verifierWallet ? verifierWallet.address : '❌ not configured'}`);
  console.log(`Staking contract:    ${process.env.STAKING_CONTRACT_ADDRESS || '❌ not configured'}`);
  console.log(`Identity contract:   ${identityAddress || '❌ not configured'}`);
  console.log(`\n🔐 Face verification gate: ${identityContract ? '✅ ACTIVE' : '❌ INACTIVE'}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health                       - Server health & config check`);
  console.log(`  GET  /api/verify/status/:address   - On-chain face verification status`);
  console.log(`  POST /api/quiz/generate            - Generate quiz from PDF  [verified only]`);
  console.log(`  POST /api/quiz/submit              - Submit quiz answers     [verified only]`);
  console.log(`  POST /api/workout/record           - Record verified workout [verified only]`);
  console.log(`  POST /api/admin/check-inactive     - Slash inactive stakes   [admin only]\n`);
});
