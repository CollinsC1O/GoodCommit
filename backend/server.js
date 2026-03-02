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
  }
});

const PORT = process.env.PORT || 3001;

// Initialize provider and verifier wallet
const provider = new ethers.JsonRpcProvider(
  process.env.NODE_ENV === 'production' 
    ? process.env.CELO_RPC_URL 
    : process.env.ALFAJORES_RPC_URL
);

const verifierWallet = process.env.VERIFIER_PRIVATE_KEY 
  ? new ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY, provider)
  : null;

// Updated Staking contract ABI with new functions
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    verifierWalletConfigured: !!verifierWallet,
    contractAddress: process.env.STAKING_CONTRACT_ADDRESS || 'not configured',
  });
});

// ==================== ACADEMICS ENDPOINTS ====================

// Upload PDF and generate quiz
app.post('/api/quiz/generate', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }
    
    const { userAddress } = req.body;
    const pdfBuffer = req.file.buffer;
    
    // TODO: Extract text from PDF using pdf-parse or similar
    // const pdfText = await extractTextFromPDF(pdfBuffer);
    
    // TODO: Generate quiz using OpenAI API
    // const quiz = await generateQuizWithAI(pdfText);
    
    // For now, return mock quiz
    const mockQuiz = {
      questions: generateMockQuestions(10),
      timeLimit: 600, // 10 minutes
      totalQuestions: 10,
      pointsPerQuestion: 10,
    };
    
    res.json(mockQuiz);
  } catch (error) {
    console.error('Quiz generation error:', error);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// Submit quiz results and record on-chain
app.post('/api/quiz/submit', async (req, res) => {
  try {
    const { userAddress, answers, totalQuestions } = req.body;
    
    if (!verifierWallet) {
      return res.status(500).json({ error: 'Verifier wallet not configured' });
    }
    
    // Calculate score
    const correctAnswers = calculateQuizScore(answers);
    const pointsEarned = correctAnswers * 10; // 10 points per correct answer
    
    // Calculate penalty if all wrong
    let pointsPenalty = 0;
    if (correctAnswers === 0) {
      pointsPenalty = -3; // Lose 3 points if all wrong
    }
    
    // Record quiz on blockchain
    const stakingContract = new ethers.Contract(
      process.env.STAKING_CONTRACT_ADDRESS,
      STAKING_ABI,
      verifierWallet
    );
    
    const tx = await stakingContract.recordQuiz(
      userAddress,
      1, // HabitType.Academics
      correctAnswers,
      totalQuestions,
      pointsEarned,
      pointsPenalty
    );
    
    const receipt = await tx.wait();
    
    res.json({ 
      success: true,
      correctAnswers,
      totalQuestions,
      pointsEarned,
      pointsPenalty,
      score: Math.round((correctAnswers / totalQuestions) * 100),
      txHash: receipt.hash,
      message: correctAnswers === 0 
        ? 'All wrong! -3 points penalty 😔' 
        : `Great job! +${pointsEarned} points 🎉`,
    });
  } catch (error) {
    console.error('Quiz submission error:', error);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// ==================== HEALTH & FITNESS ENDPOINTS ====================

// Record workout with GPS validation
app.post('/api/workout/record', async (req, res) => {
  try {
    const { 
      userAddress, 
      exerciseType, 
      duration, 
      gpsData, 
      distance, 
      speed 
    } = req.body;
    
    if (!verifierWallet) {
      return res.status(500).json({ error: 'Verifier wallet not configured' });
    }
    
    // Validate GPS data for walking/running
    if (exerciseType === 'walking' || exerciseType === 'running') {
      const validation = validateGPSData(gpsData, speed, exerciseType);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Invalid workout data',
          message: validation.reason,
        });
      }
    }
    
    // Calculate points based on duration (1 point per second)
    const pointsEarned = Math.floor(duration);
    
    // Record workout on blockchain
    const stakingContract = new ethers.Contract(
      process.env.STAKING_CONTRACT_ADDRESS,
      STAKING_ABI,
      verifierWallet
    );
    
    const tx = await stakingContract.recordWorkout(
      userAddress,
      0, // HabitType.Health
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
      message: `Workout recorded! +${pointsEarned} points 💪`,
    });
  } catch (error) {
    console.error('Workout recording error:', error);
    res.status(500).json({ error: 'Failed to record workout' });
  }
});

// ==================== ADMIN/MONITORING ENDPOINTS ====================

// Check for inactive users and slash stakes
app.post('/api/admin/check-inactive', async (req, res) => {
  try {
    const { adminKey, userAddresses } = req.body;
    
    // Simple admin authentication
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    if (!verifierWallet) {
      return res.status(500).json({ error: 'Verifier wallet not configured' });
    }
    
    const stakingContract = new ethers.Contract(
      process.env.STAKING_CONTRACT_ADDRESS,
      STAKING_ABI,
      verifierWallet
    );
    
    const results = [];
    
    for (const userAddress of userAddresses) {
      // Check both Health and Academics
      for (let habitType = 0; habitType <= 1; habitType++) {
        const isInactive = await stakingContract.isInactive(userAddress, habitType);
        
        if (isInactive) {
          try {
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
    }
    
    res.json({ 
      success: true,
      results,
      message: `Checked ${userAddresses.length} users`,
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
      question: "What is the primary function of mitochondria in a cell?",
      options: ["Protein synthesis", "Energy production", "DNA replication", "Cell division"],
      correctAnswer: 1
    },
    {
      id: 2,
      question: "Which of the following is NOT a renewable energy source?",
      options: ["Solar power", "Wind power", "Natural gas", "Hydroelectric power"],
      correctAnswer: 2
    },
    {
      id: 3,
      question: "What is the capital of Nigeria?",
      options: ["Lagos", "Abuja", "Kano", "Port Harcourt"],
      correctAnswer: 1
    },
    {
      id: 4,
      question: "In mathematics, what is the value of π (pi) approximately?",
      options: ["2.14", "3.14", "4.14", "5.14"],
      correctAnswer: 1
    },
    {
      id: 5,
      question: "Who wrote the play 'Romeo and Juliet'?",
      options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"],
      correctAnswer: 1
    },
    {
      id: 6,
      question: "What is the chemical symbol for gold?",
      options: ["Go", "Gd", "Au", "Ag"],
      correctAnswer: 2
    },
    {
      id: 7,
      question: "Which planet is known as the Red Planet?",
      options: ["Venus", "Jupiter", "Mars", "Saturn"],
      correctAnswer: 2
    },
    {
      id: 8,
      question: "What is the largest ocean on Earth?",
      options: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean"],
      correctAnswer: 3
    },
    {
      id: 9,
      question: "In which year did Nigeria gain independence?",
      options: ["1958", "1960", "1962", "1963"],
      correctAnswer: 1
    },
    {
      id: 10,
      question: "What is the square root of 144?",
      options: ["10", "11", "12", "13"],
      correctAnswer: 2
    }
  ];
  
  return questions.slice(0, count);
}

function calculateQuizScore(answers) {
  // answers is an array of user's selected answer indices
  const correctAnswers = generateMockQuestions(10);
  let correct = 0;
  
  answers.forEach((answer, index) => {
    if (answer === correctAnswers[index].correctAnswer) {
      correct++;
    }
  });
  
  return correct;
}

function validateGPSData(gpsData, speed, exerciseType) {
  if (!gpsData || !gpsData.length) {
    return { valid: false, reason: 'No GPS data provided' };
  }
  
  // Check speed limits
  const maxSpeed = exerciseType === 'running' ? 15 : 8; // km/h
  if (speed > maxSpeed) {
    return { 
      valid: false, 
      reason: `Speed too high (${speed} km/h). Are you driving? 🚗` 
    };
  }
  
  // TODO: More sophisticated checks:
  // - Check path consistency
  // - Verify timestamps
  // - Detect teleportation
  // - Check against known routes
  
  return { valid: true };
}

// ==================== CRON JOB FOR DECAY MONITORING ====================

// Run every hour to check for inactive users
setInterval(async () => {
  if (!verifierWallet || !process.env.STAKING_CONTRACT_ADDRESS) {
    return;
  }
  
  try {
    console.log('🔍 Checking for inactive users...');
    
    // TODO: Get list of active users from database
    // For now, this would need to be called manually via admin endpoint
    
  } catch (error) {
    console.error('Decay monitoring error:', error);
  }
}, 60 * 60 * 1000); // Every hour

app.listen(PORT, () => {
  console.log(`🚀 GoodCommit Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Verifier wallet configured: ${!!verifierWallet}`);
  console.log(`Contract address: ${process.env.STAKING_CONTRACT_ADDRESS || 'not configured'}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/quiz/generate - Generate quiz from PDF`);
  console.log(`  POST /api/quiz/submit - Submit quiz answers`);
  console.log(`  POST /api/workout/record - Record workout`);
  console.log(`  POST /api/admin/check-inactive - Check inactive users`);
});
