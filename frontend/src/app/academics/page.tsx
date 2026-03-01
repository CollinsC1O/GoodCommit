"use client";

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useGToken } from '@/hooks/useGToken';
import { useStaking } from '@/hooks/useStaking';
import { useFaceVerification } from '@/hooks/useFaceVerification';
import { HabitType, PlantStatus } from '@/config/abis';
import { formatUnits } from 'viem';
import FaceVerification from '@/components/FaceVerification';

type QuizStage = 'upload' | 'quiz' | 'results' | 'options';
type Question = {
  question: string;
  options: string[];
  correctAnswer: number;
  userAnswer?: number;
};

function AcademicsPage() {
  const { isConnected, address } = useAccount();
  const { balance, approveStaking, isApproving, isApproved } = useGToken();
  const { stakeInfo, plantSeed, isPlanting, isPlanted, refetchStake } = useStaking(HabitType.Academics);
  const { isVerified, isLoading: isVerificationLoading, markAsVerified } = useFaceVerification();
  
  // Quiz state
  const [quizStage, setQuizStage] = useState<QuizStage>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [totalPoints, setTotalPoints] = useState(10); // Starting seed points
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  
  // Plant growth state
  const [plantGrowthStage, setPlantGrowthStage] = useState<'seed' | 'sprout' | 'growing' | 'mature' | 'fruiting'>('seed');
  
  useEffect(() => {
    if (isPlanted) {
      refetchStake();
    }
  }, [isPlanted, refetchStake]);
  
  // Update plant growth based on points
  useEffect(() => {
    if (totalPoints <= 10) setPlantGrowthStage('seed');
    else if (totalPoints <= 30) setPlantGrowthStage('sprout');
    else if (totalPoints <= 60) setPlantGrowthStage('growing');
    else if (totalPoints <= 90) setPlantGrowthStage('mature');
    else setPlantGrowthStage('fruiting');
  }, [totalPoints]);
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setUploadedFile(file);
    } else {
      alert('Please upload a PDF file');
    }
  };
  
  const generateQuiz = async () => {
    if (!uploadedFile) return;
    
    setIsGeneratingQuiz(true);
    
    // TODO: Send PDF to backend for AI quiz generation
    // For now, generating mock questions
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const mockQuestions: Question[] = [
      {
        question: "What is the primary function of mitochondria in a cell?",
        options: ["Protein synthesis", "Energy production", "DNA replication", "Cell division"],
        correctAnswer: 1
      },
      {
        question: "Which of the following is NOT a renewable energy source?",
        options: ["Solar power", "Wind power", "Natural gas", "Hydroelectric power"],
        correctAnswer: 2
      },
      {
        question: "What is the capital of Nigeria?",
        options: ["Lagos", "Abuja", "Kano", "Port Harcourt"],
        correctAnswer: 1
      },
      {
        question: "In mathematics, what is the value of π (pi) approximately?",
        options: ["2.14", "3.14", "4.14", "5.14"],
        correctAnswer: 1
      },
      {
        question: "Who wrote the play 'Romeo and Juliet'?",
        options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"],
        correctAnswer: 1
      },
      {
        question: "What is the chemical symbol for gold?",
        options: ["Go", "Gd", "Au", "Ag"],
        correctAnswer: 2
      },
      {
        question: "Which planet is known as the Red Planet?",
        options: ["Venus", "Jupiter", "Mars", "Saturn"],
        correctAnswer: 2
      },
      {
        question: "What is the largest ocean on Earth?",
        options: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean"],
        correctAnswer: 3
      },
      {
        question: "In which year did Nigeria gain independence?",
        options: ["1958", "1960", "1962", "1963"],
        correctAnswer: 1
      },
      {
        question: "What is the square root of 144?",
        options: ["10", "11", "12", "13"],
        correctAnswer: 2
      }
    ];
    
    setQuestions(mockQuestions);
    setIsGeneratingQuiz(false);
    setQuizStage('quiz');
    setCurrentQuestionIndex(0);
    setEarnedPoints(0);
    setCorrectAnswers(0);
    setWrongAnswers(0);
  };
  
  const handleAnswerSelect = (answerIndex: number) => {
    const updatedQuestions = [...questions];
    updatedQuestions[currentQuestionIndex].userAnswer = answerIndex;
    setQuestions(updatedQuestions);
  };
  
  const submitAnswer = () => {
    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = currentQuestion.userAnswer === currentQuestion.correctAnswer;
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setEarnedPoints(prev => prev + 10); // 10 points per correct answer
    } else {
      setWrongAnswers(prev => prev + 1);
    }
    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // Quiz complete
      finishQuiz();
    }
  };
  
  const finishQuiz = () => {
    const finalCorrect = correctAnswers + (questions[currentQuestionIndex].userAnswer === questions[currentQuestionIndex].correctAnswer ? 1 : 0);
    const finalWrong = questions.length - finalCorrect;
    
    // Calculate final points
    let pointsToAdd = finalCorrect * 10;
    
    // Penalty: If all answers wrong, minus 3 points
    if (finalCorrect === 0) {
      pointsToAdd = -3;
    }
    
    setTotalPoints(prev => Math.max(0, prev + pointsToAdd));
    setQuizStage('results');
  };
  
  const handleClaimAll = () => {
    // TODO: Sign transaction to claim all points
    alert(`Claiming ${totalPoints} points to wallet!`);
    setTotalPoints(10); // Reset to seed amount
    setQuizStage('upload');
    setUploadedFile(null);
  };
  
  const handleStakeAndClaim = (stakeAmount: number) => {
    // TODO: Sign transaction to stake portion and claim rest
    const claimAmount = totalPoints - stakeAmount;
    alert(`Staking ${stakeAmount} points and claiming ${claimAmount} points!`);
    setTotalPoints(stakeAmount + 5); // Staked amount + bonus
    setQuizStage('upload');
    setUploadedFile(null);
  };
  
  const handleStakeAll = () => {
    // TODO: Sign transaction to stake all points
    const bonus = Math.floor(totalPoints * 0.1); // 10% bonus
    alert(`Staking all ${totalPoints} points! Bonus: ${bonus} points`);
    setTotalPoints(totalPoints + bonus);
    setQuizStage('upload');
    setUploadedFile(null);
  };
  
  const getPlantEmoji = () => {
    switch (plantGrowthStage) {
      case 'seed': return '🌱';
      case 'sprout': return '🪴';
      case 'growing': return '🌿';
      case 'mature': return '🌳';
      case 'fruiting': return '🍎';
      default: return '🌱';
    }
  };
  
  const getPlantStatusText = () => {
    switch (plantGrowthStage) {
      case 'seed': return 'Seed Stage';
      case 'sprout': return 'Sprouting';
      case 'growing': return 'Growing Strong';
      case 'mature': return 'Mature Plant';
      case 'fruiting': return 'Bearing Fruit!';
      default: return 'Seed Stage';
    }
  };
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Face Verification Modal */}
      {isConnected && !isVerificationLoading && !isVerified && (
        <FaceVerification onVerified={markAsVerified} />
      )}
      
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
          ) : !isVerified ? (
            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-center">
              <div className="text-6xl mb-4">🔐</div>
              <h3 className="text-xl font-bold text-white mb-2">Verification Required</h3>
              <p className="text-slate-400">Please complete Face Verification to continue</p>
            </div>
          ) : quizStage === 'upload' ? (
            <div className="space-y-6">
              <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
                <h3 className="text-xl font-bold text-white mb-4">Upload Study Material</h3>
                <p className="text-slate-400 text-sm mb-6">
                  Upload a PDF document and we'll generate AI-powered quiz questions to test your knowledge.
                </p>
                
                <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-purple-500/50 transition-all">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="pdf-upload"
                  />
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
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating Quiz...
                      </span>
                    ) : (
                      'Generate Quiz 🧠'
                    )}
                  </button>
                )}
              </div>
              
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                <h4 className="text-purple-400 font-bold mb-2">How it works:</h4>
                <ul className="text-slate-300 text-sm space-y-2">
                  <li>✓ Upload your study material (PDF)</li>
                  <li>✓ AI generates 10 quiz questions</li>
                  <li>✓ Earn 10 points per correct answer</li>
                  <li>✓ Watch your plant grow with each correct answer</li>
                  <li>✓ Claim or stake your points when plant bears fruit</li>
                  <li>⚠️ All wrong answers = -3 points penalty</li>
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
                    Points: {totalPoints + earnedPoints}
                  </div>
                </div>
                
                <div className="mb-6">
                  <div className="w-full bg-slate-800 rounded-full h-2 mb-2">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-pink-600 h-2 rounded-full transition-all"
                      style={{ width: `${((currentQuestionIndex) / questions.length) * 100}%` }}
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
                  {correctAnswers >= questions.length * 0.7 ? '🎉' : correctAnswers > 0 ? '📚' : '😔'}
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
                    <div className="text-2xl font-bold text-purple-400">{earnedPoints}</div>
                    <div className="text-xs text-slate-400">Points Earned</div>
                  </div>
                </div>
                
                <div className="bg-purple-500/20 border border-purple-500/30 rounded-xl p-6 mb-6">
                  <div className="text-sm text-slate-400 mb-2">Total Points</div>
                  <div className="text-5xl font-bold text-purple-400">{totalPoints}</div>
                </div>
                
                {plantGrowthStage === 'fruiting' ? (
                  <div>
                    <h4 className="text-lg font-bold text-white mb-4">🎊 Your Plant is Bearing Fruit!</h4>
                    <p className="text-slate-400 text-sm mb-6">Choose what to do with your accumulated points:</p>
                    
                    <div className="space-y-3">
                      <button
                        onClick={handleClaimAll}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:shadow-lg transition-all"
                      >
                        Claim All Points ({totalPoints} pts) → Wallet
                      </button>
                      
                      <button
                        onClick={() => handleStakeAndClaim(Math.floor(totalPoints * 0.5))}
                        className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-bold py-4 rounded-xl hover:shadow-lg transition-all"
                      >
                        Stake 50% ({Math.floor(totalPoints * 0.5)} pts) + Claim Rest
                      </button>
                      
                      <button
                        onClick={handleStakeAll}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold py-4 rounded-xl hover:shadow-lg transition-all"
                      >
                        Stake All + 10% Bonus ({Math.floor(totalPoints * 1.1)} pts)
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setQuizStage('upload');
                      setUploadedFile(null);
                    }}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold text-lg py-4 rounded-xl hover:shadow-lg transition-all"
                  >
                    Take Another Quiz
                  </button>
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
                plantGrowthStage === 'fruiting' ? 'border-purple-500 shadow-lg shadow-purple-500/30' : 
                'border-slate-700'
              } flex items-center justify-center shadow-inner mb-8 relative overflow-hidden`}>
                <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${
                  plantGrowthStage === 'fruiting' ? 'from-purple-500/30' : 'from-purple-500/10'
                } to-transparent`} />
                <span className="text-8xl z-10">{getPlantEmoji()}</span>
              </div>
              
              <h4 className="text-2xl font-semibold text-slate-300 mb-3">{getPlantStatusText()}</h4>
              
              <div className="space-y-2">
                <div className="bg-slate-950/50 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-1">Total Points</div>
                  <div className="text-3xl font-bold text-purple-400">{totalPoints}</div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-950/50 rounded-xl p-3">
                    <div className="text-xs text-slate-400">Growth</div>
                    <div className="text-lg font-bold text-white">{Math.min(100, Math.floor((totalPoints / 100) * 100))}%</div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-3">
                    <div className="text-xs text-slate-400">Stage</div>
                    <div className="text-lg font-bold text-white">{plantGrowthStage}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
            <h4 className="text-purple-400 font-bold mb-2 text-sm">Growth Stages:</h4>
            <div className="space-y-1 text-xs text-slate-400">
              <div className={totalPoints <= 10 ? 'text-purple-400 font-bold' : ''}>🌱 Seed (0-10 pts)</div>
              <div className={totalPoints > 10 && totalPoints <= 30 ? 'text-purple-400 font-bold' : ''}>🪴 Sprout (11-30 pts)</div>
              <div className={totalPoints > 30 && totalPoints <= 60 ? 'text-purple-400 font-bold' : ''}>🌿 Growing (31-60 pts)</div>
              <div className={totalPoints > 60 && totalPoints <= 90 ? 'text-purple-400 font-bold' : ''}>🌳 Mature (61-90 pts)</div>
              <div className={totalPoints > 90 ? 'text-purple-400 font-bold' : ''}>🍎 Fruiting (90+ pts)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AcademicsPage;
