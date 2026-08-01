"use client";

import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import FaceVerification from '@/components/FaceVerification';
import { useFaceVerification } from '@/hooks/useFaceVerification';
import Link from 'next/link';
import { useGToken } from '@/hooks/useGToken';
import { useStaking } from '@/hooks/useStaking';
import { useStreak } from '@/hooks/useStreak';
import { useRecentAchievements } from '@/hooks/useAchievements';
import { HabitType } from '@/config/abis';
import { formatUnits } from 'viem';

export default function Home() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { isVerified, markAsVerified, markAsPending }  = useFaceVerification();
  const { balance } = useGToken();
  const { userProfile, stakeInfo: healthStake, claimInitialSeed, isClaimingSeed } = useStaking(HabitType.Health);
  const { stakeInfo: academicsStake } = useStaking(HabitType.Academics);
  const { streak, loading: streakLoading, error: streakError } = useStreak();
  const { badges: recentBadges, loading: recentLoading } = useRecentAchievements(5);

  const activeHealthStake = healthStake ? Number(formatUnits(healthStake[0], 18)) : 0;
  const activeAcademicsStake = academicsStake ? Number(formatUnits(academicsStake[0], 18)) : 0;
  const totalActiveStake = activeHealthStake + activeAcademicsStake;

  const healthPoints = healthStake ? Number(healthStake[1]) : 0;
  const academicsPoints = academicsStake ? Number(academicsStake[1]) : 0;
  
  const totalWorkouts = userProfile ? Number(userProfile[3]) : 0;
  const totalQuizzes = userProfile ? Number(userProfile[4]) : 0;

  const handleHabitClick = (route: string) => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    router.push(route);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mb-10 sm:mb-16 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 text-white">
          Grow your{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
            Habit Garden
          </span>
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Stake G$ on yourself. Build real-world healthy habits, prove you did the work,
          and harvest daily yields. Fail, and your stake funds the global UBI pool.
        </p>

        {/* ── Identity badge (informational only — never blocks access) ──── */}
        {isConnected && (
          <div className={`mt-5 inline-flex max-w-full flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-2xl sm:rounded-full border text-sm transition-all
            ${isVerified
              ? 'bg-green-500/10 border-green-500/30 text-green-300'
              : 'bg-slate-800/50 border-white/10 text-slate-400'
            }`}>
            {isVerified ? (
              <><span className="text-green-400">✓</span> Identity verified — eligible for free G$ gifting</>
            ) : (
              <>
                <span className="text-yellow-400">ℹ</span>&nbsp;
                Stake your own G$ now, or verify identity on a habit page to claim a free 10 G$ seed
              </>
            )}
          </div>
        )}

        {/* ── Wallet Summary ─────────────────────────────────────────────── */}
        {isConnected && (
          <div className="mt-8 max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="min-w-0 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
              <div className="text-slate-400 text-sm mb-1">Wallet Balance</div>
              <div className="break-words text-xl sm:text-2xl font-bold text-white">{parseFloat(balance).toFixed(2)} G$</div>
            </div>
            <div className="min-w-0 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
              <div className="text-slate-400 text-sm mb-1">Active Stake</div>
              <div className="break-words text-xl sm:text-2xl font-bold text-emerald-400">{totalActiveStake.toFixed(2)} G$</div>
            </div>
            <div className="min-w-0 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
              <div className="text-slate-400 text-sm mb-1">Total Habit Points</div>
              <div className="break-words text-xl sm:text-2xl font-bold text-purple-400">{healthPoints + academicsPoints}</div>
              <div className="mt-2 text-xs text-slate-500 space-y-1">
                <div>Health & Fitness: {healthPoints} pts</div>
                <div>Academics: {academicsPoints} pts</div>
              </div>
            </div>
            <div className="min-w-0 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
              <div className="text-slate-400 text-sm mb-1">Activities</div>
              <div className="flex flex-wrap items-center justify-center text-xl sm:text-2xl font-bold text-blue-400">
                <span title="Workouts">🏃 {totalWorkouts}</span>
                <span className="mx-2 opacity-30">|</span>
                <span title="Quizzes">📚 {totalQuizzes}</span>
              </div>
            </div>
            <div className="min-w-0 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
              <div className="text-slate-400 text-sm mb-1">Habit Streak</div>
              <div className="text-xl sm:text-2xl font-bold text-orange-400">
                🔥 {streakLoading ? 'Loading…' : `${streak ? streak.currentStreak : 0} days`}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                🏆 Longest: {streakLoading ? '…' : `${streak ? streak.longestStreak : 0} days`}
              </div>
              {streakError && <div className="mt-2 text-xs text-rose-400">Unable to load streak</div>}
              {streakLoading && <div className="mt-2 text-xs text-slate-500">Loading streak…</div>}
            </div>
          </div>
        )}
      </header>

      {/* ── Habit cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4 max-w-5xl mx-auto">

        {/* Health & Fitness */}
        <button
          onClick={() => handleHabitClick('/health')}
          disabled={!isConnected}
          className="group relative block p-[1px] rounded-3xl overflow-hidden transition-all hover:scale-[1.02] text-left w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-blue-600 opacity-50 group-hover:opacity-100 transition-opacity" />
          <div className="relative h-full bg-slate-900/90 backdrop-blur-xl rounded-3xl p-5 sm:p-8 flex flex-col items-start border border-white/10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center text-4xl mb-6 shadow-xl shadow-green-500/10">
              🏃‍♂️
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Health &amp; Fitness</h2>
            <p className="text-slate-400 mb-8 flex-1">
              Commit to your daily step count or gym routine. Prove your sweat with
              real-time validated selfies or GPS tracking.
            </p>
            <div className="flex items-center text-green-400 font-medium group-hover:translate-x-1 transition-transform">
              Plant a Seed →
            </div>
          </div>
        </button>

        {/* Academics */}
        <button
          onClick={() => handleHabitClick('/academics')}
          disabled={!isConnected}
          className="group relative block p-[1px] rounded-3xl overflow-hidden transition-all hover:scale-[1.02] text-left w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 opacity-50 group-hover:opacity-100 transition-opacity" />
          <div className="relative h-full bg-slate-900/90 backdrop-blur-xl rounded-3xl p-5 sm:p-8 flex flex-col items-start border border-white/10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center text-4xl mb-6 shadow-xl shadow-purple-500/10">
              📚
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Academics (ExamEdge)</h2>
            <p className="text-slate-400 mb-8 flex-1">
              Struggle to study? Take daily timed AI-quizzes based on your syllabus. No
              tab-switching allowed. Grow smarter, grow richer.
            </p>
            <div className="flex items-center text-purple-400 font-medium group-hover:translate-x-1 transition-transform">
              Plant a Seed →
            </div>
          </div>
        </button>

      </div>

      {/* ── Recent Achievements ──────────────────────────────────────────────── */}
      {isConnected && (
        <div className="mt-12 max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🏆</span> Recent Achievements
            </h2>
            <Link
              href="/achievements"
              className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              View all →
            </Link>
          </div>
          {recentLoading ? (
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 text-center">
              <p className="text-slate-500 text-sm">Loading achievements...</p>
            </div>
          ) : recentBadges.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {recentBadges.map((badge) => {
                const rarityCfg: Record<string, { label: string; color: string }> = {
                  common: { label: 'Common', color: 'text-slate-300 border-slate-600 bg-slate-700/50' },
                  rare: { label: 'Rare', color: 'text-blue-300 border-blue-600 bg-blue-700/50' },
                  epic: { label: 'Epic', color: 'text-purple-300 border-purple-600 bg-purple-700/50' },
                  legendary: { label: 'Legendary', color: 'text-orange-300 border-orange-600 bg-orange-700/50' },
                  mythic: { label: 'Mythic', color: 'text-rose-300 border-rose-600 bg-rose-700/50' },
                };
                const rCfg = rarityCfg[badge.rarity] || rarityCfg.common;
                return (
                  <div
                    key={badge.badgeId}
                    className="bg-slate-900/80 border border-white/10 rounded-xl p-4 text-center hover:border-white/20 transition-all"
                  >
                    <div className="text-3xl mb-2">{badge.icon}</div>
                    <h4 className="text-white text-sm font-bold truncate">{badge.title}</h4>
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mt-1 ${rCfg.color}`}>
                      {rCfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 text-center">
              <p className="text-slate-500 text-sm mb-2">No achievements yet</p>
              <Link
                href="/achievements"
                className="text-emerald-400 text-sm hover:text-emerald-300 transition-colors"
              >
                View all available achievements →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Two paths explainer ─────────────────────────────────────────────── */}
      {isConnected && (
        <div className="mt-10 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6">
            <div className="text-2xl mb-3">💰</div>
            <h3 className="text-white font-semibold mb-2">Stake Your Own G$</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Start immediately with G$ you already own. Choose a habit, set a duration,
              and approve the transfer. No identity verification needed.
            </p>
          </div>

          {!isVerified ? (
            <FaceVerification 
              inline={true} 
              onVerified={markAsVerified} 
              onPending={markAsPending} 
            />
          ) : (
            <div className="bg-slate-900/60 border border-emerald-500/20 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="text-2xl mb-3">🎁</div>
                <h3 className="text-white font-semibold mb-2">Claim Free 10 G$ Seed</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  Identity verified! You can now claim your free 10 G$ seed. One-time per person, checked directly on-chain.
                </p>
              </div>
              
              <div className="mt-auto pt-4">
                {!userProfile?.[1] ? (
                  <button
                    onClick={async () => {
                      try {
                        await claimInitialSeed();
                      } catch (e) {
                        console.error("Claim seed failed", e);
                      }
                    }}
                    disabled={isClaimingSeed}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50"
                  >
                    {isClaimingSeed ? 'Claiming...' : 'Claim 10 G$ Now'}
                  </button>
                ) : (
                  <div className="text-center p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
                    ✓ Seed Claimed
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {!isConnected && (
        <div className="text-center mt-16">
          <p className="text-slate-400 text-sm">
            Connect your wallet above to get started
          </p>
        </div>
      )}
    </div>
  );
}
