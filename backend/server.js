require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Initialize provider and admin wallet
const provider = new ethers.JsonRpcProvider(
  process.env.NODE_ENV === 'production' 
    ? process.env.CELO_RPC_URL 
    : process.env.ALFAJORES_RPC_URL
);

const adminWallet = process.env.ADMIN_PRIVATE_KEY 
  ? new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider)
  : null;

// Staking contract ABI (minimal for checkIn)
const STAKING_ABI = [
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
    ],
    name: 'checkIn',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'habitType', type: 'uint8' },
    ],
    name: 'slashStake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    adminWalletConfigured: !!adminWallet,
  });
});

// Generate quiz for academics
app.post('/api/quiz/generate', async (req, res) => {
  try {
    const { subject, difficulty } = req.body;
    
    // TODO: Integrate with OpenAI or quiz database
    // For now, return mock quiz
    const mockQuiz = {
      questions: [
        {
          id: 1,
          question: "What is 2 + 2?",
          options: ["3", "4", "5", "6"],
          correctAnswer: 1,
        },
        {
          id: 2,
          question: "What is the capital of France?",
          options: ["London", "Berlin", "Paris", "Madrid"],
          correctAnswer: 2,
        },
        // Add 8 more questions...
      ],
      timeLimit: 600, // 10 minutes
      subject,
      difficulty,
    };
    
    res.json(mockQuiz);
  } catch (error) {
    console.error('Quiz generation error:', error);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// Submit quiz results and check in
app.post('/api/quiz/submit', async (req, res) => {
  try {
    const { userAddress, habitType, answers, quizId } = req.body;
    
    if (!adminWallet) {
      return res.status(500).json({ error: 'Admin wallet not configured' });
    }
    
    // Validate quiz answers
    const score = calculateScore(answers); // TODO: Implement
    const passed = score >= 70; // 70% passing grade
    
    if (!passed) {
      return res.status(400).json({ 
        error: 'Quiz failed',
        score,
        message: 'You need at least 70% to pass',
      });
    }
    
    // Call smart contract checkIn
    const stakingContract = new ethers.Contract(
      process.env.STAKING_CONTRACT_ADDRESS,
      STAKING_ABI,
      adminWallet
    );
    
    const tx = await stakingContract.checkIn(userAddress, habitType);
    const receipt = await tx.wait();
    
    res.json({ 
      success: true, 
      score,
      txHash: receipt.hash,
      message: 'Check-in successful! Your plant is growing 🌱',
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to process check-in' });
  }
});

// Verify fitness activity (GPS data)
app.post('/api/fitness/verify', async (req, res) => {
  try {
    const { userAddress, habitType, gpsData, steps } = req.body;
    
    if (!adminWallet) {
      return res.status(500).json({ error: 'Admin wallet not configured' });
    }
    
    // Validate GPS data
    const isValid = validateGPSData(gpsData); // TODO: Implement
    
    if (!isValid) {
      return res.status(400).json({ 
        error: 'Invalid GPS data',
        message: 'GPS data suggests cheating (e.g., driving instead of walking)',
      });
    }
    
    // Check step count
    if (steps < 5000) {
      return res.status(400).json({ 
        error: 'Insufficient steps',
        message: 'You need at least 5,000 steps',
      });
    }
    
    // Call smart contract checkIn
    const stakingContract = new ethers.Contract(
      process.env.STAKING_CONTRACT_ADDRESS,
      STAKING_ABI,
      adminWallet
    );
    
    const tx = await stakingContract.checkIn(userAddress, habitType);
    const receipt = await tx.wait();
    
    res.json({ 
      success: true, 
      steps,
      txHash: receipt.hash,
      message: 'Workout verified! Keep it up 💪',
    });
  } catch (error) {
    console.error('Fitness verification error:', error);
    res.status(500).json({ error: 'Failed to verify fitness activity' });
  }
});

// Verify gym selfie (Proof of Sweat)
app.post('/api/fitness/verify-selfie', async (req, res) => {
  try {
    const { userAddress, habitType, imageData, location } = req.body;
    
    // TODO: Implement image verification
    // - Check if image contains a person
    // - Verify location matches gym
    // - Check timestamp is recent
    
    res.json({ 
      success: true,
      message: 'Selfie verified! 📸',
    });
  } catch (error) {
    console.error('Selfie verification error:', error);
    res.status(500).json({ error: 'Failed to verify selfie' });
  }
});

// Admin endpoint to slash stake (for missed check-ins)
app.post('/api/admin/slash', async (req, res) => {
  try {
    const { userAddress, habitType, adminKey } = req.body;
    
    // Simple admin authentication (use proper auth in production)
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    if (!adminWallet) {
      return res.status(500).json({ error: 'Admin wallet not configured' });
    }
    
    const stakingContract = new ethers.Contract(
      process.env.STAKING_CONTRACT_ADDRESS,
      STAKING_ABI,
      adminWallet
    );
    
    const tx = await stakingContract.slashStake(userAddress, habitType);
    const receipt = await tx.wait();
    
    res.json({ 
      success: true, 
      txHash: receipt.hash,
      message: 'Stake slashed for missed check-in',
    });
  } catch (error) {
    console.error('Slash error:', error);
    res.status(500).json({ error: 'Failed to slash stake' });
  }
});

// Helper functions
function calculateScore(answers) {
  // TODO: Implement actual scoring logic
  return 85; // Mock score
}

function validateGPSData(gpsData) {
  // TODO: Implement GPS validation
  // - Check velocity (not driving)
  // - Check path consistency
  // - Verify timestamps
  return true; // Mock validation
}

app.listen(PORT, () => {
  console.log(`🚀 GoodCommit Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Admin wallet configured: ${!!adminWallet}`);
});
