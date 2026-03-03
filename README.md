# GoodCommit - The Habit Garden 🌱

> Stake on yourself. Build real-world healthy habits. Grow your digital garden. Earn rewards.

A Web3 self-improvement platform that transforms GoodDollar (G$) into a powerful accountability engine. Users stake G$ tokens on their commitment to daily habits—workouts, study sessions, or personal goals. Success means rewards and a flourishing digital plant. Failure means your stake funds the global UBI pool, helping others while you restart your journey.

## 🎯 What We're Building

GoodCommit is a full-stack decentralized application that gamifies habit formation through financial commitment and visual growth metaphors. We're creating a system where:

- **Your habits become investments** - Stake G$ tokens on your commitment to daily activities
- **Your progress is visible** - Watch your digital plant grow from seed to fruiting tree as you build streaks
- **Your failures help others** - Missed commitments redirect your stake to GoodDollar's UBI pool
- **Your success is rewarded** - Consistent effort earns you points convertible back to G$ with bonuses

### The Core Concept: Habit Plants

Every habit you commit to becomes a living plant in your digital garden:

1. **Plant a Seed** - Stake G$ tokens and set your commitment duration
2. **Daily Care** - Complete verified activities (workouts, quizzes) to earn points
3. **Watch It Grow** - Your plant evolves through 5 stages: Seed → Sprout → Growing → Mature → Fruiting
4. **Harvest Rewards** - Convert accumulated points to G$ tokens, or stake them for bonus multipliers
5. **Avoid Withering** - Miss days and watch your plant decay (40% daily point loss)

## 🏗️ Three-Layer Architecture

#### 1. Smart Contracts (Celo Blockchain)

**File**: `contracts/contracts/GoodCommitStaking.sol`

A sophisticated staking system with:

- **Point-Based Rewards**: Earn points for verified activities, convert to G$ at 10 points = 1 G$
- **Decay Mechanism**: 40% daily point decay for inactivity, creating urgency and accountability
- **Flexible Harvesting**: Three options when your plant bears fruit:
  - Claim all points → Convert to G$ and restart
  - Stake partial + claim rest → 5% bonus on staked portion
  - Stake all points → 10% bonus for maximum commitment
- **Slashing System**: Failed commitments split 60% to UBI pool, 40% to reward treasury
- **Dual Habit Types**: Separate tracking for Health (workouts) and Academics (quizzes)
- **Plant Growth Stages**: Visual progression tied to point thresholds
- **Comprehensive Testing**: 75+ test cases 

**Key Features**:

- One-time seed claim (10 G$ to get started)
- Verifier-based activity recording (backend validates, contract records)
- Decay reward pool (redistributes lost points to active users)
- Emergency pause functionality
- Full OpenZeppelin v5 security standards

#### 2. Backend API (Node.js + Express)

**File**: `backend/server.js`

Verification and validation layer:

- **Workout Validation**: GPS tracking, speed verification, duration checks
- **Quiz Generation**: AI-powered quiz creation from uploaded PDFs
- **Quiz Validation**: Answer checking, tab-switching detection, time limits
- **Face Verification**: Integration with GoodDollar's Sybil-resistance system
- **Inactive User Monitoring**: Automated detection and slashing triggers
- **Smart Contract Integration**: Secure communication with on-chain logic

**Security Measures**:

- GPS spoofing detection (speed limits, location consistency)
- Camera verification for gym workouts
- Quiz integrity checks (no tab switching, timed sessions)
- Rate limiting and input validation

#### 3. Frontend (Next.js 14 + React)

**Files**: `frontend/src/app/`

Beautiful, responsive user interface:

- **Wallet Integration**: RainbowKit for seamless Celo wallet connection
- **Real-Time Balance**: Live G$ token balance display
- **Theme System**: Automatic light/dark mode based on device preferences
- **Two Habit Paths**:
  - **Health & Fitness**: Track workouts with GPS, earn points for exercise
  - **Academics (ExamEdge)**: Upload study materials, take AI quizzes, grow through learning
- **Plant Visualization**: Animated growth stages with emoji representations
- **Activity History**: Complete workout and quiz logs
- **Responsive Design**: Beautiful gradients, smooth transitions, mobile-friendly

**User Experience**:

- Face verification modal on first use
- Intuitive staking interface with duration selectors
- Real-time workout tracking with GPS simulation
- PDF upload for quiz generation
- Point accumulation visualization
- Harvest options with clear bonus explanations

## 🎮 How It Works

### For Health & Fitness Users

1. **Connect Wallet** - Link your Celo wallet with RainbowKit
2. **Verify Identity** - Complete GoodDollar Face Verification (one-time)
3. **Plant Your Seed** - Stake G$ tokens, set commitment duration (days)
4. **Choose Exercise** - Walking, running, gym workouts (squats, weights, cardio)
5. **Start Workout** - In-app timer with GPS tracking for outdoor activities
6. **Earn Points** - 1 point per second of verified activity
7. **Watch Growth** - Your plant evolves as you build streaks
8. **Harvest** - Convert points to G$ when your plant reaches fruiting stage

### For Academic Users (ExamEdge)

1. **Upload Study Material** - PDF documents (textbooks, notes, syllabi)
2. **AI Quiz Generation** - Backend creates 10 questions from your content
3. **Take Timed Quiz** - No tab-switching allowed, earn 10 points per correct answer
4. **Penalty System** - All wrong answers = -3 points (accountability!)
5. **Plant Growth** - Progress through stages: 10pts (Seed) → 100pts (Fruiting)
6. **Harvest Options** - Claim, partial stake, or full stake with bonuses

### The Decay System (Accountability Engine)

Miss a day? Your points decay:

- **Day 1 missed**: Lose 40% of points (keep 60%)
- **Day 2 missed**: Lose 40% of remaining (keep 36% of original)
- **Day 8 missed**: Complete withering (all points lost)

Decayed points go to a reward pool, redistributed to active users. This creates:

- **Urgency**: Can't procrastinate without consequences
- **Fairness**: Inactive users don't hoard rewards
- **Community**: Your failures help fund others' success

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Celo wallet (MetaMask, Valora)
- CELO for gas fees
- G$ tokens for staking

### Installation

```bash
# Clone repository
git clone <https://github.com/CollinsC1O/GoodCommit.git>
cd GoodCommit

# Install all dependencies
npm install --prefix frontend
npm install --prefix backend
npm install --prefix contracts
```

### Running the Application

```bash
# Terminal 1: Backend
cd backend
npm start

# Terminal 2: Frontend
cd frontend
npm run dev

# Visit http://localhost:3000
```

### Deploying Contracts

```bash
cd contracts

# Compile
npm run compile

# Test (75+ tests)
npm test

# Deploy to Alfajores testnet
npm run deploy:alfajores

# Deploy to Celo mainnet
npm run deploy:celo
```

## 🔐 Security & Verification

### GoodDollar Face Verification

- **Sybil Resistance**: One person = one account
- **Privacy-First**: Biometric data never stored
- **Seamless UX**: Modal-based verification flow
- **Integration**: `@gooddollar/good-design` SDK

### Smart Contract Security

- **OpenZeppelin Standards**: ReentrancyGuard, Pausable, Ownable
- **Access Control**: Verifier role for activity recording
- **Emergency Functions**: Pause/unpause, emergency withdraw
- **Tested**: 75+ test cases covering edge cases

### Backend Validation

- **GPS Verification**: Speed limits, location consistency
- **Camera Proof**: Selfie verification for gym workouts
- **Quiz Integrity**: Tab-switching detection, time limits
- **Rate Limiting**: Prevents spam and abuse

## 📊 Key Metrics & Impact

### For Users

- **Accountability**: Financial stake creates real commitment
- **Visualization**: Plant growth provides satisfying progress feedback
- **Flexibility**: Choose your own commitment duration and amount
- **Rewards**: Earn up to 10% bonus for full commitment

### For GoodDollar Ecosystem

- **G$ Velocity**: Daily transactions from stake/harvest/slash cycles
- **UBI Contribution**: 60% of failed stakes fund universal basic income
- **User Engagement**: Gamification drives daily active usage
- **Network Effects**: Success stories inspire more participants

### Current Status

- ✅ Smart contracts deployed and tested (85% test coverage)
- ✅ Backend API with workout/quiz validation
- ✅ Frontend with wallet integration and face verification
- ✅ Theme system with automatic light/dark mode
- 🔄 Testnet deployment in progress
- 🔄 Mobile optimization ongoing

## 🗺️ Roadmap

### Phase 1: Foundation (Complete)

- ✅ Core smart contract with decay mechanism
- ✅ Backend validation system
- ✅ Frontend UI with wallet integration
- ✅ Face verification integration
- ✅ Comprehensive test suite

### Phase 2: Enhancement (Current)

- 🔄 Deploy to Alfajores testnet
- 🔄 Mobile-responsive optimizations
- 🔄 Advanced quiz AI (GPT integration)
- 🔄 GPS tracking
- 🔄 Social features (leaderboards, friend challenges)

### Phase 3: Launch (Next 3 Months)

- 📅 Security audit
- 📅 Mainnet deployment
- 📅 Marketing campaign
- 📅 Community building
- 📅 Partnership with fitness/education platforms and institutions

### Phase 4: Scale

- 📅 Additional habit categories (meditation, reading, coding)
- 📅 NFT plant collections
- 📅 Multiplayer gardens (family/team challenges)
- 📅 Integration with wearables (Fitbit, Apple Watch, Oraimo Watch)

## 🤝 Contributing

We welcome contributions! Areas where you can help:

- **Smart Contracts**: Gas optimization, additional features
- **Backend**: New validation methods, AI improvements
- **Frontend**: UI/UX enhancements, animations
- **Testing**: More test coverage, edge case discovery
- **Documentation**: Tutorials, guides, translations

## 🔗 Links & Resources

- **Our-App (GoodCommit)**: https://good-commit.netlify.app/

- **GoodDollar**: https://gooddollar.org
- **GoodBuilders Program**: https://ubi.gd/goodbuilders
- **Celo Network**: https://celo.org
- **Celo Explorer**: https://explorer.celo.org

## Address

- **G$ Token**: `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A`


## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

Built for **GoodBuilders Season 3** - Supporting the GoodDollar mission of universal basic income through innovative Web3 applications.

Special thanks to:

- GoodDollar team for the Face Verification SDK
- Celo Foundation for the robust blockchain infrastructure
- OpenZeppelin for security-first smart contract libraries

---

**Built with 💚 for the GoodDollar ecosystem**

_"The best time to plant a tree was 20 years ago. The second best time is now."_ 
Built with 💚 for the GoodDollar ecosystem
