"use client";

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useGToken } from '@/hooks/useGToken';
import { useStaking } from '@/hooks/useStaking';
import { HabitType, PlantStatus } from '@/config/abis';
import { formatUnits } from 'viem';

function AcademicsPage() {
  const { isConnected } = useAccount();
  const { balance, approveStaking, isApproving, isApproved } = useGToken();
  const { stakeInfo, plantSeed, isPlanting, isPlanted, refetchStake } = useStaking(HabitType.Academics);
  
  const [duration, setDuration] = useState(30);
  const [stakeAmount, setStakeAmount] = useState('1000');
  const [subject, setSubject] = useState('JAMB - Mathematics');
  
  useEffect(() => {
    if (isPlanted) {
      refetchStake();
    }
  }, [isPlanted, refetchStake]);
  
  const handleApprove = async () => {
    try {
      await approveStaking(stakeAmount);
    } catch (error) {
      console.error('Approval failed:', error);
    }
  };
  
  const handlePlantSeed = async () => {
    try {
      await plantSeed(stakeAmount, duration);
    } catch (error) {
      console.error('Planting failed:', error);
    }
  };
  
  const hasStake = stakeInfo && stakeInfo[0] > BigInt(0);
  const stakedAmount = hasStake ? formatUnits(stakeInfo[0], 18) : '0';
  const currentStreak = hasStake ? Number(stakeInfo[2]) : 0;
  const status = hasStake ? stakeInfo[3] : PlantStatus.Active;
  const accumulatedRewards = hasStake ? formatUnits(stakeInfo[4], 18) : '0';
  
  const getPlantEmoji = () => {
    if (!hasStake) return '📖';
    if (status === PlantStatus.Withered) return '📕';
    if (status === PlantStatus.Mature) return '📚';
    if (currentStreak >= duration / 2) return '📗';
    return '📘';
  };
  
  const getStatusText = () => {
    if (!hasStake) return 'Ready to Study';
    if (status === PlantStatus.Withered) return 'Study Streak Lost';
    if (status === PlantStatus.Mature) return 'Master Scholar';
    return `Studying (Day ${currentStreak}/${duration})`;
  };
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <Link href="/" className="text-sm font-medium text-slate-400 hover:text-white mb-8 inline-flex items-center gap-2 transition-colors">
        ← Back to Garden
      </Link>
      
      <div className="flex flex-col md:flex-row gap-12 items-start mt-4">
        <div className="flex-1">
          <div className="inline-block px-3 py-1 mb-4 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-semibold tracking-wide uppercase">
            Academics
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 text-white">
            Learn and <span className="bg-clip-text text-gradient bg-gradient-to-r from-purple-400 to-pink-600">Flourish</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed mb-8">
            Lock in your G$ and take daily, AI-generated quizzes to prepare for exams. Stay focused—tab switching will instantly slash your stake.
          </p>
          
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            {!isConnected ? (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">Connect your wallet to start</p>
              </div>
            ) : hasStake ? (
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white mb-4">Your Study Plant</h3>
                <div className="bg-slate-950/50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Staked:</span>
                    <span className="text-white font-mono">{parseFloat(stakedAmount).toFixed(2)} G$</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Study Days:</span>
                    <span className="text-white font-bold">{currentStreak} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rewards:</span>
                    <span className="text-purple-400 font-mono">{parseFloat(accumulatedRewards).toFixed(4)} G$</span>
                  </div>
                </div>
                <p className="text-sm text-slate-500 text-center">Complete daily quizzes to keep growing!</p>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-white mb-4">Plant a new Seed</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Subject / Exam Type</label>
                    <select 
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none"
                    >
                      <option>JAMB - Mathematics</option>
                      <option>WAEC - Physics</option>
                      <option>University Syllabus (Custom Upload)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Select Duration</label>
                    <div className="flex gap-3">
                      {[7, 14, 30].map((days) => (
                        <button 
                          key={days}
                          onClick={() => setDuration(days)}
                          className={`flex-1 py-3 rounded-xl border font-medium transition-all ${
                            duration === days 
                              ? 'bg-purple-500/20 border-purple-500 text-purple-400' 
                              : 'bg-slate-800/50 border-white/5 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                          }`}
                        >
                          {days} Days
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      G$ Stake Amount (Balance: {parseFloat(balance).toFixed(2)})
                    </label>
                    <input 
                      type="number" 
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 placeholder-slate-600 transition-all font-mono text-lg"
                    />
                  </div>
                  
                  {!isApproved ? (
                    <button 
                      onClick={handleApprove}
                      disabled={isApproving}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold text-lg py-4 rounded-xl mt-4 hover:shadow-lg hover:shadow-purple-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isApproving ? 'Approving...' : 'Approve G$ Spending'}
                    </button>
                  ) : (
                    <button 
                      onClick={handlePlantSeed}
                      disabled={isPlanting}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold text-lg py-4 rounded-xl mt-4 hover:shadow-lg hover:shadow-purple-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPlanting ? 'Planting...' : 'Plant Seed 🌱'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 w-full bg-slate-900/50 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5" />
          
          <div className="relative z-10 text-center">
            <div className={`w-32 h-32 mx-auto bg-slate-800 rounded-full border-4 ${
              status === PlantStatus.Mature ? 'border-purple-500' : 
              status === PlantStatus.Withered ? 'border-red-500' : 
              'border-slate-700'
            } flex items-center justify-center shadow-inner mb-6 relative overflow-hidden`}>
               <div className={`absolute inset-0 bg-gradient-to-t ${
                 status === PlantStatus.Mature ? 'from-purple-900/40' : 'from-purple-900/20'
               } to-transparent`} />
               <span className="text-6xl z-10">{getPlantEmoji()}</span>
            </div>
            <h4 className="text-xl font-semibold text-slate-300">{getStatusText()}</h4>
            {hasStake && (
              <p className="text-sm text-slate-500 mt-2">10 Questions / Day</p>
            )}
            {!hasStake && (
              <p className="text-sm text-slate-500 mt-2">10 Questions / Day</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AcademicsPage;
