'use client';

import { useState, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useAchievements } from '@/hooks/useAchievements';
import { BadgeCard } from '../components/BadgeCard';
import type { BadgeCategory } from '@/config/badges';
import { CATEGORY_CONFIG } from '@/config/badges';

const ALL_CATEGORIES: BadgeCategory[] = [
  'streak',
  'workout',
  'academic',
  'plant',
  'staking',
  'harvest',
  'points',
];

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl sm:text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

export default function AchievementsPage() {
  const { isConnected } = useAccount();
  const { data, loading, error } = useAchievements();
  const [activeCategory, setActiveCategory] = useState<BadgeCategory | 'all'>('all');

  const badges = useMemo(() => {
    if (!data) return { unlocked: [], locked: [] };
    const unlocked = data.unlocked;
    const locked = data.locked;

    if (activeCategory === 'all') {
      return { unlocked, locked };
    }

    return {
      unlocked: unlocked.filter((b) => b.category === activeCategory),
      locked: locked.filter((b) => b.category === activeCategory),
    };
  }, [data, activeCategory]);

  const categoryCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, { unlocked: number; total: number }> = {};
    for (const b of [...data.unlocked, ...data.locked]) {
      if (!counts[b.category]) {
        counts[b.category] = { unlocked: 0, total: 0 };
      }
      counts[b.category].total++;
    }
    for (const b of data.unlocked) {
      counts[b.category].unlocked++;
    }
    return counts;
  }, [data]);

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="text-6xl mb-6">🏆</div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Achievements</h1>
        <p className="text-slate-400 mb-8">Connect your wallet to view your achievements.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="text-6xl mb-6 animate-pulse">🏆</div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Loading Achievements...</h1>
        <div className="w-16 h-1 bg-emerald-500 rounded mx-auto animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Achievements</h1>
        <p className="text-rose-400">Unable to load achievements. Please try again.</p>
        <p className="text-slate-500 text-sm mt-2">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-8 sm:mb-12">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">🏆</span>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">Achievements</h1>
        </div>
        <p className="text-slate-400 mt-2">
          Complete milestones to earn badges and track your progress.
        </p>
      </header>

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8 sm:mb-10">
            <StatCard
              icon="🏅"
              label="Badges Earned"
              value={`${data.summary.totalBadges} / ${data.summary.totalPossible}`}
            />
            <StatCard
              icon="📊"
              label="Completion"
              value={`${data.summary.completionPercentage}%`}
            />
            <StatCard
              icon="💫"
              label="Rare+ Badges"
              value={
                data.summary.rareCount +
                data.summary.epicCount +
                data.summary.legendaryCount +
                data.summary.mythicCount
              }
            />
            <StatCard
              icon="🌟"
              label="Legendary+"
              value={data.summary.legendaryCount + data.summary.mythicCount}
            />
          </div>

          <div className="flex flex-wrap gap-2 mb-6 sm:mb-8">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeCategory === 'all'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-white/10'
              }`}
            >
              All ({data.summary.totalPossible})
            </button>
            {ALL_CATEGORIES.map((cat) => {
              const counts = categoryCounts[cat] || { unlocked: 0, total: 0 };
              const catCfg = CATEGORY_CONFIG[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    activeCategory === cat
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-white/10'
                  }`}
                >
                  {catCfg.icon} {catCfg.label} ({counts.unlocked}/{counts.total})
                </button>
              );
            })}
          </div>

          <div className="space-y-6 mb-10">
            {badges.unlocked.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-emerald-400 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Unlocked ({badges.unlocked.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {badges.unlocked.map((badge) => (
                    <BadgeCard key={`unlocked-${badge.id}`} badge={badge} />
                  ))}
                </div>
              </section>
            )}

            {badges.locked.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-500 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                  Locked ({badges.locked.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {badges.locked.map((badge) => (
                    <BadgeCard key={`locked-${badge.id}`} badge={badge} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="text-center py-16">
          <p className="text-slate-500">No achievement data available.</p>
        </div>
      )}
    </div>
  );
}
