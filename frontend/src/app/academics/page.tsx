"use client";

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useGToken } from '@/hooks/useGToken';
import { useStaking } from '@/hooks/useStaking';
import { HabitType, PlantStatus } from '@/config/abis';

type QuizStage = 'upload' | 'quiz' | 'results';

type Question = {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  userAnswer?: number;
};

// ─── CONTRACT THRESHOLD CONSTANTS (mirrors GoodCommitStaking.sol exactly) ────
// SEED_THRESHOLD     = 10   → status: Seed    (points < 30)
// SPROUT_THRESHOLD   = 30   → status: Sprout  (30 ≤ points < 60)
// GROWING_THRESHOLD  = 60   → status: Growing (60 ≤ points < 90)
// MATURE_THRESHOLD   = 90   → status: Mature  (90 ≤ points < 100)
// FRUITING_THRESHOLD = 100  → status: Fruiting (points ≥ 100) ← harvest unlocks HERE
// ─────────────────────────────────────────────────────────────────────────────

function AcademicsPage() {
  const { isConnected, address } = useAccount();
  const { balance, approveStaking, isApproving, isApproved } = useGToken();
  const {
    stakeInfo,
    plantSeed,
    isPlanting,
    isPlanted,
    refetchStake,
    claimAllPoints,
    stakePartialAndClaim,
    stakeAllPoints,
  } = useStaking(HabitType.Academics);

  const [quizStage, setQuizStage] = useState<QuizStage>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [netPointsLastQuiz, setNetPointsLastQuiz] = useState<number | null>(null);

  const quizSubmitted = useRef(false);

  useEffect(() => {
    if (isPlanted) refetchStake();
  }, [isPlanted, refetchStake]);

  // ── On-chain data (single source of truth) ───────────────────────────────
  // stakeInfo: [stakedAmount, points, duration, currentStreak, status, lastActivity]
  const hasStake = stakeInfo && stakeInfo[0] > BigInt(0);
  const onChainPoints = hasStake ? Number(stakeInfo[1]) : 0;

  // stakeInfo[4] is PlantStatus enum directly from contract
  // We use this — NOT a local threshold computation — to avoid drift
  const contractStatus: PlantStatus = hasStake
    ? (stakeInfo[4] as PlantStatus)
    : PlantStatus.Seed;

  // Harvest only available when contract says Fruiting (≥ 100 pts)
  const canHarvest = contractStatus === PlantStatus.Fruiting;

  const getPlantEmoji = () => {
    switch (contractStatus) {
      case PlantStatus.Withered:  return '🥀';
      case PlantStatus.Fruiting:  return '🍎';
      case PlantStatus.Mature:    return '🌳';
      case PlantStatus.Growing:   return '🌿';
      case PlantStatus.Sprout:    return '🪴';
      default:                    return '🌱';
    }
  };

  const getPlantStatusText = () => {
    switch (contractStatus) {
      case PlantStatus.Withered:  return 'Withered';
      case PlantStatus.Fruiting:  return 'Bearing Fruit! 🎉';
      case PlantStatus.Mature:    return 'Mature Plant';
      case PlantStatus.Growing:   return 'Growing Strong';
      case PlantStatus.Sprout:    return 'Sprouting';
      default:                    return 'Seed Stage';
    }
  };

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setUploadedFile(file);
    } else {
      alert('Please upload a PDF file');
    }
  };

  // ── Generate quiz ─────────────────────────────────────────────────────────
  const generateQuiz = async () => {
    if (!uploadedFile) return;
    setIsGeneratingQuiz(true);
    try {
      const formData = new FormData();
      formData.append('pdf', uploadedFile);
      formData.append('userAddress', address || '');

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/quiz/generate`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate quiz');

      setQuestions(data.questions);
      setCurrentQuestionIndex(0);
      setCorrectAnswers(0);
      setWrongAnswers(0);
      setNetPointsLastQuiz(null);
      quizSubmitted.current = false;
      setQuizStage('quiz');
    } catch (error) {
      console.error('Quiz generation error:', error);
      alert('Failed to generate quiz. Please try again.');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleAnswerSelect = (answerIndex: number) => {
    const updated = [...questions];
    updated[currentQuestionIndex].userAnswer = answerIndex;
    setQuestions(updated);
  };

  // ── PENALTY LOGIC — aligned with contract recordQuiz if/else ─────────────
  //
  // Contract if/else (GoodCommitStaking.sol ~line 230):
  //   if (pointsPenalty < 0) {
  //     deduction = uint256(-pointsPenalty)        // converts -3 → 3
  //     stake.points -= deduction                  // ONLY deducts, ignores pointsEarned
  //   } else {
  //     stake.points += pointsEarned               // ONLY adds, no penalty
  //   }
  //
  // Rule: NEVER send pointsEarned > 0 AND pointsPenalty < 0 together —
  // the contract would silently ignore pointsEarned in that case.
  //
  // Our logic (per spec):
  //   All 10 wrong  → pointsEarned=0,       pointsPenalty=-3  → contract deducts 3 ✅
  //   ≥1 correct    → pointsEarned=<count>, pointsPenalty=0   → contract adds count ✅
  // ─────────────────────────────────────────────────────────────────────────
  const computeQuizResult = (finalQuestions: Question[]) => {
    const total = finalQuestions.length;
    const correct = finalQuestions.filter(
      (q) => q.userAnswer !== undefined && q.userAnswer === q.correctAnswer
    ).length;
    const wrong = total - correct;
    const pointsEarned = correct;               // 1 pt per correct answer
    const pointsPenalty = correct === 0 ? -3 : 0; // -3 only if ALL wrong
    const netPoints = pointsEarned + pointsPenalty;
    return { correct, wrong, pointsEarned, pointsPenalty, netPoints };
  };

  const submitAnswer = () => {
    const isLast = currentQuestionIndex === questions.length - 1;
    if (!isLast) {
      const current = questions[currentQuestionIndex];
      if (current.userAnswer === current.correctAnswer) {
        setCorrectAnswers((p) => p + 1);
      } else {
        setWrongAnswers((p) => p + 1);
      }
      setCurrentQuestionIndex((p) => p + 1);
    } else {
      finishQuiz();
    }
  };

  const finishQuiz = async () => {
    if (quizSubmitted.current) return;
    quizSubmitted.current = true;

    const finalQuestions = [...questions];
    const { correct, wrong, pointsEarned, pointsPenalty, netPoints } =
      computeQuizResult(finalQuestions);

    setCorrectAnswers(correct);
    setWrongAnswers(wrong);
    setNetPointsLastQuiz(netPoints);

    try {
      const answers = finalQuestions.map((q) => q.userAnswer ?? -1);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

      const response = await fetch(`${backendUrl}/api/quiz/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          answers,
          totalQuestions: finalQuestions.length,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Quiz submission failed:', data.error);
        alert(`Failed to submit quiz: ${data.message || data.error}`);
      } else {
        console.log('Quiz submitted on-chain:', data);
        refetchStake(); // Refresh plant status from contract
      }
    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert('Failed to submit quiz. Please try again.');
    }

    setQuizStage('results');
  };

  // ── Harvest actions ───────────────────────────────────────────────────────
  const handleClaimAll = async () => {
    try {
      await claimAllPoints();
      setQuizStage('upload');
      setUploadedFile(null);
      refetchStake();
    } catch (error) {
      console.error('Claim failed:', error);
      alert('Failed to claim points. Please try again.');
    }
  };

  const handleStakeAndClaim = async (pointsToStake: number) => {
    try {
      await stakePartialAndClaim(BigInt(pointsToStake));
      setQuizStage('upload');
      setUploadedFile(null);
      refetchStake();
    } catch (error) {
      console.error('Stake and claim failed:', error);
      alert('Failed to stake and claim. Please try again.');
    }
  };

  const handleStakeAll = async () => {
    try {
      await stakeAllPoints();
      setQuizStage('upload');
      setUploadedFile(null);
      refetchStake();
    } catch (error) {
      console.error('Stake all failed:', error);
      alert('Failed to stake all points. Please try again.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Link href="/" className="text-sm font-medium text-slate-400 hover:text-white mb-8 inline-flex items-center gap-2 transition-colors">
        ← Back to Garden
      </Link>

      <div className="flex flex-col lg:flex-row gap-8 items-start mt-4">

        {/* Left: Quiz Interface */}
        <div className="flex-1 w-full">
          <div className="inline-block px-3 py-1 mb-4 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-semibold tracking-wide uppercase">
            Academics
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 text-white">
            Learn and <span className="text-purple-400">Flourish</span>
          </h1>

          {!isConnected ? (
            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-center">
              <p className="text-slate-400 mb-4">Connect your wallet to start learning</p>
            </div>

          ) : quizStage === 'upload' ? (
            <div className="space-y-6">
              <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
                <h3 className="text-xl font-bold text-white mb-4">Upload Study Material</h3>
                <p className="text-slate-400 text-sm mb-6">
                  Upload a PDF document and we'll generate AI-powered quiz questions to test your knowledge.
                </p>

                <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-purple-500/50 transition-all">
                  <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" id="pdf-upload" />
                  <label htmlFor="pdf-upload" className="cursor-pointer">
                    <div className="text-6xl mb-4">📄</div>
                    <p className="text-white font-medium mb-2">
                      {uploadedFile ? uploadedFile.name : 'Click to upload PDF'}
                    </p>
                    <p className="text-slate-500 text-sm">
                      {uploadedFile ? 'File ready for quiz generation' : 'PDF files only, max 10MB'}
                    </p>
                  </label>
                </div>

                {uploadedFile && (
                  <button
                    onClick={generateQuiz}
                    disabled={isGeneratingQuiz}
                    className="w-full mt-6 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold text-lg py-4 rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isGeneratingQuiz ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                        Generating Quiz…
                      </span>
                    ) : 'Generate Quiz 🧠'}
                  </button>
                )}
              </div>

              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                <h4 className="text-purple-400 font-bold mb-2">How it works:</h4>
                <ul className="text-slate-300 text-sm space-y-2">
                  <li>✓ Upload your study material (PDF)</li>
                  <li>✓ AI generates 10 quiz questions</li>
                  <li>✓ Earn 1 point per correct answer (10 pts max per quiz)</li>
                  <li>✓ Reach 100 points to fruit your plant and harvest G$</li>
                  <li>✓ Claim or stake your points when plant bears fruit</li>
                  <li>⚠️ Answer all 10 wrong = −3 points penalty</li>
                </ul>
              </div>
            </div>

          ) : quizStage === 'quiz' ? (
            <div className="space-y-6">
              <div className="bg-slate-900/80 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-8">
                <div className="flex justify-between items-center mb-6">
                  <div className="text-sm text-slate-400">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </div>
                  <div className="text-sm font-bold text-purple-400">
                    Correct so far: {correctAnswers}
                  </div>
                </div>

                <div className="mb-6">
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-600 h-2 rounded-full transition-all"
                      style={{ width: `${(currentQuestionIndex / questions.length) * 100}%` }}
                    />
                  </div>
                </div>

                <h3 className="text-2xl font-bold text-white mb-6">
                  {questions[currentQuestionIndex]?.question}
                </h3>

                <div className="space-y-3 mb-8">
                  {questions[currentQuestionIndex]?.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnswerSelect(index)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        questions[currentQuestionIndex].userAnswer === index
                          ? 'bg-purple-500/20 border-purple-500 text-white'
                          : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <span className="font-bold mr-3">{String.fromCharCode(65 + index)}.</span>
                      {option}
                    </button>
                  ))}
                </div>

                <button
                  onClick={submitAnswer}
                  disabled={questions[currentQuestionIndex]?.userAnswer === undefined}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold text-lg py-4 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {currentQuestionIndex < questions.length - 1 ? 'Next Question →' : 'Finish Quiz'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">{correctAnswers}</div>
                  <div className="text-xs text-slate-400">Correct</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">{wrongAnswers}</div>
                  <div className="text-xs text-slate-400">Wrong</div>
                </div>
              </div>
            </div>

          ) : quizStage === 'results' ? (
            <div className="space-y-6">
              <div className="bg-slate-900/80 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-8 text-center">
                <div className="text-6xl mb-4">
                  {correctAnswers === questions.length ? '🎉' : correctAnswers > 0 ? '📚' : '😔'}
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">Quiz Complete!</h3>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-950/50 rounded-xl p-4">
                    <div className="text-2xl font-bold text-green-400">{correctAnswers}</div>
                    <div className="text-xs text-slate-400">Correct</div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-4">
                    <div className="text-2xl font-bold text-red-400">{wrongAnswers}</div>
                    <div className="text-xs text-slate-400">Wrong</div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-4">
                    <div className={`text-2xl font-bold ${(netPointsLastQuiz ?? 0) >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                      {(netPointsLastQuiz ?? 0) >= 0 ? '+' : ''}{netPointsLastQuiz ?? 0}
                    </div>
                    <div className="text-xs text-slate-400">Net Points</div>
                  </div>
                </div>

                <div className="bg-purple-500/20 border border-purple-500/30 rounded-xl p-4 mb-6">
                  <p className="text-slate-300 text-sm">
                    {correctAnswers === 0
                      ? '😔 All wrong — 3 points deducted as penalty.'
                      : correctAnswers === questions.length
                      ? `🎉 Perfect score! +${correctAnswers} points earned.`
                      : `📚 ${correctAnswers} correct → +${correctAnswers} pts earned. No penalty while you're getting some right!`}
                  </p>
                </div>

                <div className="bg-purple-500/20 border border-purple-500/30 rounded-xl p-6 mb-6">
                  <div className="text-sm text-slate-400 mb-2">Total Points (on-chain)</div>
                  <div className="text-5xl font-bold text-purple-400">{onChainPoints}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    ≈ {(onChainPoints * 0.1).toFixed(1)} G$ at harvest
                  </div>
                </div>

                {/* Harvest UI — only when contract says Fruiting (≥ 100 pts) */}
                {canHarvest ? (
                  <div>
                    <h4 className="text-lg font-bold text-white mb-4">🎊 Your Plant is Bearing Fruit!</h4>
                    <p className="text-slate-400 text-sm mb-6">Choose what to do with your accumulated points:</p>
                    <div className="space-y-3">
                      <button
                        onClick={handleClaimAll}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:shadow-lg transition-all"
                      >
                        Claim All ({onChainPoints} pts → {(onChainPoints * 0.1).toFixed(1)} G$) → Wallet
                      </button>
                      <button
                        onClick={() => handleStakeAndClaim(Math.floor(onChainPoints * 0.5))}
                        className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-bold py-4 rounded-xl hover:shadow-lg transition-all"
                      >
                        Stake 50% ({Math.floor(onChainPoints * 0.5)} pts) + Claim Rest (+5% bonus)
                      </button>
                      <button
                        onClick={handleStakeAll}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold py-4 rounded-xl hover:shadow-lg transition-all"
                      >
                        Stake All + 10% Bonus ({Math.floor(onChainPoints * 1.1)} pts)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="bg-slate-800/50 rounded-xl p-4 mb-4">
                      <div className="text-xs text-slate-400 mb-2">Progress to harvest (100 pts needed)</div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, onChainPoints)}%` }}
                        />
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {onChainPoints} / 100 pts — {Math.max(0, 100 - onChainPoints)} more needed
                      </div>
                    </div>
                    <button
                      onClick={() => { setQuizStage('upload'); setUploadedFile(null); }}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold text-lg py-4 rounded-xl hover:shadow-lg transition-all"
                    >
                      Take Another Quiz
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: Plant Growth Visualization */}
        <div className="w-full lg:w-96 space-y-6">
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[550px] relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5" />
            <div className="relative z-10 text-center">
              <div className={`w-48 h-48 mx-auto bg-slate-800 rounded-full border-4 ${
                contractStatus === PlantStatus.Fruiting ? 'border-purple-500 shadow-lg shadow-purple-500/30' :
                contractStatus === PlantStatus.Withered ? 'border-red-500' : 'border-slate-700'
              } flex items-center justify-center shadow-inner mb-8 relative overflow-hidden`}>
                <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${
                  contractStatus === PlantStatus.Fruiting ? 'from-purple-500/30' : 'from-purple-500/10'
                } to-transparent`} />
                <span className="text-8xl z-10">{getPlantEmoji()}</span>
              </div>

              <h4 className="text-2xl font-semibold text-slate-300 mb-3">{getPlantStatusText()}</h4>

              <div className="space-y-2">
                <div className="bg-slate-950/50 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-1">Total Points (on-chain)</div>
                  <div className="text-3xl font-bold text-purple-400">{onChainPoints}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    ≈ {(onChainPoints * 0.1).toFixed(1)} G$ at harvest
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-950/50 rounded-xl p-3">
                    <div className="text-xs text-slate-400">To Fruit</div>
                    <div className="text-lg font-bold text-white">
                      {Math.max(0, 100 - onChainPoints)} pts
                    </div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-3">
                    <div className="text-xs text-slate-400">Stage</div>
                    <div className="text-lg font-bold text-white">
                      {getPlantStatusText().split(' ')[0]}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Growth stage guide — exact contract thresholds */}
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
            <h4 className="text-purple-400 font-bold mb-2 text-sm">Growth Stages:</h4>
            <div className="space-y-1 text-xs text-slate-400">
              <div className={contractStatus === PlantStatus.Seed     ? 'text-purple-400 font-bold' : ''}>🌱 Seed     (0–29 pts)</div>
              <div className={contractStatus === PlantStatus.Sprout   ? 'text-purple-400 font-bold' : ''}>🪴 Sprout   (30–59 pts)</div>
              <div className={contractStatus === PlantStatus.Growing  ? 'text-purple-400 font-bold' : ''}>🌿 Growing  (60–89 pts)</div>
              <div className={contractStatus === PlantStatus.Mature   ? 'text-purple-400 font-bold' : ''}>🌳 Mature   (90–99 pts)</div>
              <div className={contractStatus === PlantStatus.Fruiting ? 'text-purple-400 font-bold' : ''}>🍎 Fruiting (100+ pts) — Harvest ready!</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default AcademicsPage;
