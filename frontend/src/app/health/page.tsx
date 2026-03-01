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

type ExerciseType = 'walking' | 'running' | 'gym-squat' | 'gym-weights' | 'gym-cardio';
type WorkoutStage = 'select' | 'active' | 'complete';

function HealthPage() {
  const { isConnected, address } = useAccount();
  const { balance, approveStaking, isApproving, isApproved } = useGToken();
  const { stakeInfo, plantSeed, isPlanting, isPlanted, refetchStake } = useStaking(HabitType.Health);
  const { isVerified, isLoading: isVerificationLoading, markAsVerified } = useFaceVerification();
  
  // Staking state
  const [stakeDurationSeconds, setStakeDurationSeconds] = useState(0);
  const [stakeDurationMinutes, setStakeDurationMinutes] = useState(0);
  const [stakeDurationHours, setStakeDurationHours] = useState(168); // 7 days in hours
  const [stakeAmount, setStakeAmount] = useState('500');
  
  // Workout state
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType | null>(null);
  const [workoutDuration, setWorkoutDuration] = useState(30); // in seconds
  const [durationUnit, setDurationUnit] = useState<'seconds' | 'minutes' | 'hours'>('seconds');
  const [workoutStage, setWorkoutStage] = useState<WorkoutStage>('select');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [points, setPoints] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  
  // GPS/Sensor simulation
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [steps, setSteps] = useState(0);
  
  useEffect(() => {
    if (isPlanted) {
      refetchStake();
    }
  }, [isPlanted, refetchStake]);
  
  // Workout timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTracking && workoutStage === 'active') {
      interval = setInterval(() => {
        setElapsedTime(prev => {
          const newTime = prev + 1;
          // Simulate sensor data
          if (selectedExercise === 'walking' || selectedExercise === 'running') {
            setSpeed(selectedExercise === 'running' ? 8 + Math.random() * 2 : 4 + Math.random() * 1.5);
            setDistance(prev => prev + 0.002);
            setSteps(prev => prev + (selectedExercise === 'running' ? 2 : 1));
          }
          // Accumulate points (1 point per second)
          setPoints(prev => prev + 1);
          
          // Auto-complete when duration reached
          const totalSeconds = durationUnit === 'seconds' ? workoutDuration : 
                              durationUnit === 'minutes' ? workoutDuration * 60 : 
                              workoutDuration * 3600;
          if (newTime >= totalSeconds) {
            setIsTracking(false);
            setWorkoutStage('complete');
          }
          return newTime;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking, workoutStage, workoutDuration, selectedExercise]);
  
  const handleApprove = async () => {
    try {
      await approveStaking(stakeAmount);
    } catch (error) {
      console.error('Approval failed:', error);
    }
  };
  
  const handlePlantSeed = async () => {
    try {
      // Convert to total days for smart contract
      const totalSeconds = stakeDurationSeconds + (stakeDurationMinutes * 60) + (stakeDurationHours * 3600);
      const totalDays = Math.ceil(totalSeconds / 86400); // Convert to days
      await plantSeed(stakeAmount, totalDays);
    } catch (error) {
      console.error('Planting failed:', error);
    }
  };
  
  const startWorkout = () => {
    if (!selectedExercise) return;
    setWorkoutStage('active');
    setIsTracking(true);
    setElapsedTime(0);
    setPoints(0);
    setDistance(0);
    setSteps(0);
    // TODO: Sign transaction to start workout
  };
  
  const endWorkout = () => {
    setIsTracking(false);
    setWorkoutStage('complete');
    // TODO: Sign transaction to claim points
  };
  
  const resetWorkout = () => {
    setWorkoutStage('select');
    setSelectedExercise(null);
    setElapsedTime(0);
    setPoints(0);
    setDistance(0);
    setSteps(0);
    setSpeed(0);
  };
  
  const hasStake = stakeInfo && stakeInfo[0] > BigInt(0);
  const stakedAmount = hasStake ? formatUnits(stakeInfo[0], 18) : '0';
  const currentStreak = hasStake ? Number(stakeInfo[2]) : 0;
  const stakeDuration = hasStake ? Number(stakeInfo[1]) : 0;
  const status = hasStake ? stakeInfo[3] : PlantStatus.Active;
  const accumulatedRewards = hasStake ? formatUnits(stakeInfo[4], 18) : '0';
  
  const getPlantEmoji = () => {
    if (!hasStake) return '🌱';
    if (status === PlantStatus.Withered) return '🥀';
    if (status === PlantStatus.Mature) return '🌳';
    const progress = stakeDuration > 0 ? currentStreak / stakeDuration : 0;
    if (progress >= 0.8) return '🌲';
    if (progress >= 0.5) return '🌿';
    if (progress >= 0.3) return '🪴';
    return '🌱';
  };
  
  const getStatusText = () => {
    if (!hasStake) return 'Plant Your First Seed';
    if (status === PlantStatus.Withered) return 'Withered - Restart Your Journey';
    if (status === PlantStatus.Mature) return 'Mature Plant - Bearing Fruit!';
    return `Growing (Day ${currentStreak}/${stakeDuration})`;
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const exercises = [
    { id: 'walking' as ExerciseType, name: 'Walking', icon: '🚶', desc: 'GPS + Speed tracking' },
    { id: 'running' as ExerciseType, name: 'Running', icon: '🏃', desc: 'GPS + Speed tracking' },
    { id: 'gym-squat' as ExerciseType, name: 'Squats', icon: '🦵', desc: 'In-app tracking + Proof of Sweat' },
    { id: 'gym-weights' as ExerciseType, name: 'Weight Lifting', icon: '🏋️', desc: 'In-app tracking + Proof of Sweat' },
    { id: 'gym-cardio' as ExerciseType, name: 'Gym Cardio', icon: '💪', desc: 'In-app tracking + Proof of Sweat' },
  ];

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
        {/* Left: Workout Interface */}
        <div className="flex-1 w-full">
          <div className="inline-block px-3 py-1 mb-4 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-semibold tracking-wide uppercase">
            Health & Fitness
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 text-white">
            Sweat for your <span className="text-green-400">Garden</span>
          </h1>
          
          {!isConnected ? (
            <div className="space-y-6 max-w-lg">
              <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-center">
                <p className="text-slate-400 mb-4">Connect your wallet to start your fitness journey</p>
              </div>
              
              {/* Plant Your Seed Panel - Shows when not connected */}
              <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Plant Your Seed</h3>
                <div className="space-y-4 opacity-50 pointer-events-none">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-3">Stake Duration</label>
                    
                    {/* Seconds Adjuster */}
                    <div className="mb-3">
                      <div className="text-xs text-slate-500 mb-1">Seconds (0-60)</div>
                      <div className="flex items-center gap-2">
                        <button className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold">−</button>
                        <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-center">
                          <span className="text-2xl font-bold text-white">0</span>
                          <span className="text-sm text-slate-400 ml-1">s</span>
                        </div>
                        <button className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold">+</button>
                      </div>
                    </div>
                    
                    {/* Minutes Adjuster */}
                    <div className="mb-3">
                      <div className="text-xs text-slate-500 mb-1">Minutes (0-60)</div>
                      <div className="flex items-center gap-2">
                        <button className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold">−</button>
                        <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-center">
                          <span className="text-2xl font-bold text-white">0</span>
                          <span className="text-sm text-slate-400 ml-1">m</span>
                        </div>
                        <button className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold">+</button>
                      </div>
                    </div>
                    
                    {/* Hours Adjuster */}
                    <div className="mb-3">
                      <div className="text-xs text-slate-500 mb-1">Hours (0-24)</div>
                      <div className="flex items-center gap-2">
                        <button className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold">−</button>
                        <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-center">
                          <span className="text-2xl font-bold text-white">168</span>
                          <span className="text-sm text-slate-400 ml-1">h</span>
                        </div>
                        <button className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold">+</button>
                      </div>
                    </div>
                    
                    {/* Total Duration Display */}
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
                      <div className="text-xs text-slate-400 mb-1">Total Duration</div>
                      <div className="text-base font-bold text-green-400">7 days</div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Stake Amount</label>
                    <input 
                      type="number" 
                      value="500"
                      disabled
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2.5 text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Balance: 0.00 G$</p>
                  </div>
                  
                  <button 
                    disabled
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 rounded-xl opacity-50"
                  >
                    Approve G$
                  </button>
                </div>
              </div>
            </div>
          ) : !isVerified ? (
            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-center">
              <div className="text-6xl mb-4">🔐</div>
              <h3 className="text-xl font-bold text-white mb-2">Verification Required</h3>
              <p className="text-slate-400">Please complete Face Verification to continue</p>
            </div>
          ) : workoutStage === 'select' ? (
            <div className="space-y-6">
              <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
                <h3 className="text-xl font-bold text-white mb-4">Select Your Exercise</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {exercises.map((exercise) => (
                    <button
                      key={exercise.id}
                      onClick={() => setSelectedExercise(exercise.id)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        selectedExercise === exercise.id
                          ? 'bg-green-500/20 border-green-500 shadow-lg shadow-green-500/20'
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">{exercise.icon}</span>
                        <div>
                          <div className="font-bold text-white">{exercise.name}</div>
                          <div className="text-xs text-slate-400">{exercise.desc}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
                <h3 className="text-xl font-bold text-white mb-4">Workout Duration</h3>
                
                {/* Unit Selector */}
                <div className="flex gap-2 mb-4">
                  {(['seconds', 'minutes', 'hours'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => {
                        setDurationUnit(unit);
                        setWorkoutDuration(unit === 'seconds' ? 30 : unit === 'minutes' ? 15 : 1);
                      }}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                        durationUnit === unit
                          ? 'bg-green-500/20 border-green-500 text-green-400'
                          : 'bg-slate-800/50 border-white/5 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
                
                {/* Custom Duration Input with Increment/Decrement */}
                <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                  <div className="flex items-center justify-between gap-4">
                    <button
                      onClick={() => setWorkoutDuration(prev => Math.max(1, prev - 1))}
                      className="w-12 h-12 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xl transition-all active:scale-95"
                    >
                      −
                    </button>
                    
                    <div className="flex-1 text-center">
                      <div className="text-4xl font-bold text-white mb-1">
                        {workoutDuration}
                      </div>
                      <div className="text-sm text-slate-400">
                        {durationUnit}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => setWorkoutDuration(prev => prev + 1)}
                      className="w-12 h-12 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xl transition-all active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </div>
                
                {/* Quick Presets */}
                <div className="mt-4">
                  <div className="text-xs text-slate-500 mb-2">Quick presets:</div>
                  <div className="flex gap-2">
                    {durationUnit === 'seconds' && [30, 60, 90, 120].map((secs) => (
                      <button
                        key={secs}
                        onClick={() => setWorkoutDuration(secs)}
                        className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-all ${
                          workoutDuration === secs
                            ? 'bg-green-500/20 border-green-500 text-green-400'
                            : 'bg-slate-800/50 border-white/5 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {secs}s
                      </button>
                    ))}
                    {durationUnit === 'minutes' && [15, 30, 45, 60].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setWorkoutDuration(mins)}
                        className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-all ${
                          workoutDuration === mins
                            ? 'bg-green-500/20 border-green-500 text-green-400'
                            : 'bg-slate-800/50 border-white/5 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                    {durationUnit === 'hours' && [1, 2, 3, 4].map((hrs) => (
                      <button
                        key={hrs}
                        onClick={() => setWorkoutDuration(hrs)}
                        className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-all ${
                          workoutDuration === hrs
                            ? 'bg-green-500/20 border-green-500 text-green-400'
                            : 'bg-slate-800/50 border-white/5 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {hrs}h
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <button
                onClick={startWorkout}
                disabled={!selectedExercise}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg py-4 rounded-xl hover:shadow-lg hover:shadow-green-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Workout 🏃‍♂️
              </button>
            </div>
          ) : workoutStage === 'active' ? (
            <div className="space-y-6">
              <div className="bg-slate-900/80 backdrop-blur-xl border border-green-500/30 rounded-3xl p-8">
                <div className="text-center mb-6">
                  <div className="text-6xl mb-4">{exercises.find(e => e.id === selectedExercise)?.icon}</div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {exercises.find(e => e.id === selectedExercise)?.name}
                  </h3>
                  <div className="text-5xl font-mono font-bold text-green-400 mb-2">
                    {formatTime(elapsedTime)}
                  </div>
                  <div className="text-sm text-slate-400">
                    of {workoutDuration} {durationUnit}
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-950/50 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-white">{points}</div>
                    <div className="text-xs text-slate-400">Points</div>
                  </div>
                  {(selectedExercise === 'walking' || selectedExercise === 'running') && (
                    <>
                      <div className="bg-slate-950/50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-white">{speed.toFixed(1)}</div>
                        <div className="text-xs text-slate-400">km/h</div>
                      </div>
                      <div className="bg-slate-950/50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-white">{distance.toFixed(2)}</div>
                        <div className="text-xs text-slate-400">km</div>
                      </div>
                    </>
                  )}
                </div>
                
                {(selectedExercise === 'walking' || selectedExercise === 'running') && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 text-sm text-green-400">
                      <span>📍</span>
                      <span>GPS Active - Speed: {speed > 15 ? '⚠️ Too fast (driving?)' : '✓ Valid'}</span>
                    </div>
                  </div>
                )}
                
                <button
                  onClick={endWorkout}
                  className="w-full bg-gradient-to-r from-red-500 to-orange-600 text-white font-bold text-lg py-4 rounded-xl hover:shadow-lg transition-all"
                >
                  End Workout & Claim Points
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-slate-900/80 backdrop-blur-xl border border-green-500/30 rounded-3xl p-8 text-center">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold text-white mb-4">Workout Complete!</h3>
                <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-6 mb-6">
                  <div className="text-5xl font-bold text-green-400 mb-2">+{points}</div>
                  <div className="text-slate-300">Points Earned</div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6 text-left">
                  <div className="bg-slate-950/50 rounded-xl p-4">
                    <div className="text-slate-400 text-sm">Duration</div>
                    <div className="text-white font-bold">{formatTime(elapsedTime)}</div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-4">
                    <div className="text-slate-400 text-sm">Exercise</div>
                    <div className="text-white font-bold">{exercises.find(e => e.id === selectedExercise)?.name}</div>
                  </div>
                  {(selectedExercise === 'walking' || selectedExercise === 'running') && (
                    <>
                      <div className="bg-slate-950/50 rounded-xl p-4">
                        <div className="text-slate-400 text-sm">Distance</div>
                        <div className="text-white font-bold">{distance.toFixed(2)} km</div>
                      </div>
                      <div className="bg-slate-950/50 rounded-xl p-4">
                        <div className="text-slate-400 text-sm">Avg Speed</div>
                        <div className="text-white font-bold">{speed.toFixed(1)} km/h</div>
                      </div>
                    </>
                  )}
                </div>
                
                <button
                  onClick={resetWorkout}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg py-4 rounded-xl hover:shadow-lg transition-all"
                >
                  Start Another Workout
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Plant Growth & Staking */}
        <div className="w-full lg:w-96 space-y-6">
          {/* Plant Visualization */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[550px] relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5" />
            
            <div className="relative z-10 text-center">
              <div className={`w-48 h-48 mx-auto bg-slate-800 rounded-full border-4 ${
                status === PlantStatus.Mature ? 'border-green-500 shadow-lg shadow-green-500/30' : 
                status === PlantStatus.Withered ? 'border-red-500' : 
                'border-slate-700'
              } flex items-center justify-center shadow-inner mb-8 relative overflow-hidden`}>
                <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${
                  status === PlantStatus.Mature ? 'from-green-500/30' : 'from-green-500/10'
                } to-transparent`} />
                <span className={`text-8xl z-10 ${!hasStake ? 'opacity-50 blur-[2px] filter grayscale' : ''}`}>
                  {getPlantEmoji()}
                </span>
              </div>
              <h4 className="text-2xl font-semibold text-slate-300 mb-3">{getStatusText()}</h4>
              {hasStake && (
                <div className="space-y-2">
                  <p className="text-base text-slate-500">Streak: {currentStreak} days</p>
                  <p className="text-base text-emerald-400 font-mono">Rewards: {parseFloat(accumulatedRewards).toFixed(4)} G$</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Staking Panel - Only shows when connected and no stake */}
          {!hasStake && isConnected && (
            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">Plant Your Seed</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-3">Stake Duration</label>
                  
                  {/* Seconds Adjuster */}
                  <div className="mb-3">
                    <div className="text-xs text-slate-500 mb-1">Seconds (0-60)</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStakeDurationSeconds(prev => Math.max(0, prev - 1))}
                        className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold transition-all active:scale-95"
                      >
                        −
                      </button>
                      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-center">
                        <span className="text-2xl font-bold text-white">{stakeDurationSeconds}</span>
                        <span className="text-sm text-slate-400 ml-1">s</span>
                      </div>
                      <button
                        onClick={() => setStakeDurationSeconds(prev => Math.min(60, prev + 1))}
                        className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold transition-all active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  {/* Minutes Adjuster */}
                  <div className="mb-3">
                    <div className="text-xs text-slate-500 mb-1">Minutes (0-60)</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStakeDurationMinutes(prev => Math.max(0, prev - 1))}
                        className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold transition-all active:scale-95"
                      >
                        −
                      </button>
                      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-center">
                        <span className="text-2xl font-bold text-white">{stakeDurationMinutes}</span>
                        <span className="text-sm text-slate-400 ml-1">m</span>
                      </div>
                      <button
                        onClick={() => setStakeDurationMinutes(prev => Math.min(60, prev + 1))}
                        className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold transition-all active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  {/* Hours Adjuster */}
                  <div className="mb-3">
                    <div className="text-xs text-slate-500 mb-1">Hours (0-24)</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStakeDurationHours(prev => Math.max(0, prev - 1))}
                        className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold transition-all active:scale-95"
                      >
                        −
                      </button>
                      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-center">
                        <span className="text-2xl font-bold text-white">{stakeDurationHours}</span>
                        <span className="text-sm text-slate-400 ml-1">h</span>
                      </div>
                      <button
                        onClick={() => setStakeDurationHours(prev => Math.min(24, prev + 1))}
                        className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold transition-all active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  {/* Total Duration Display */}
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
                    <div className="text-xs text-slate-400 mb-1">Total Duration</div>
                    <div className="text-lg font-bold text-green-400">
                      {Math.ceil((stakeDurationSeconds + (stakeDurationMinutes * 60) + (stakeDurationHours * 3600)) / 86400)} days
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Stake Amount
                  </label>
                  <input 
                    type="number" 
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                  />
                  <p className="text-xs text-slate-500 mt-1">Balance: {parseFloat(balance).toFixed(2)} G$</p>
                </div>
                
                {!isApproved ? (
                  <button 
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                  >
                    {isApproving ? 'Approving...' : 'Approve G$'}
                  </button>
                ) : (
                  <button 
                    onClick={handlePlantSeed}
                    disabled={isPlanting}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                  >
                    {isPlanting ? 'Planting...' : 'Plant Seed 🌱'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HealthPage;
