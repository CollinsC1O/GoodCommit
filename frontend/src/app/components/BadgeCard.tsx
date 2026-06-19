'use client';

import type { UserBadge, BadgeCategory } from '@/config/badges';
import { RARITY_CONFIG, CATEGORY_CONFIG } from '@/config/badges';

interface BadgeCardProps {
  badge: UserBadge;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function BadgeCard({ badge }: BadgeCardProps) {
  const rarityCfg = RARITY_CONFIG[badge.rarity];
  const catCfg = CATEGORY_CONFIG[badge.category as BadgeCategory];

  return (
    <div
      className={`relative group rounded-2xl border p-4 sm:p-5 transition-all duration-300 ${
        badge.isUnlocked
          ? `bg-slate-900/80 border-white/10 hover:border-white/20 ${rarityCfg.glow}`
          : 'bg-slate-900/40 border-white/5 opacity-60 hover:opacity-80'
      }`}
    >
      {badge.isUnlocked && (
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 z-10">
          <span className="text-white text-sm font-bold">✓</span>
        </div>
      )}

      <div className="flex items-start gap-4">
        <div
          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center text-3xl sm:text-4xl shrink-0 ${
            badge.isUnlocked
              ? 'bg-slate-800 border border-white/10'
              : 'bg-slate-800/50 border border-white/5 grayscale'
          }`}
        >
          {badge.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-base sm:text-lg font-bold truncate ${badge.isUnlocked ? 'text-white' : 'text-slate-400'}`}>
              {badge.title}
            </h3>
            <span className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full border ${rarityCfg.color}`}>
              {rarityCfg.label}
            </span>
          </div>

          <p className="text-xs sm:text-sm text-slate-500 mt-1 line-clamp-2">
            {badge.description}
          </p>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-slate-600 bg-slate-800/50 px-2 py-0.5 rounded-full">
              {catCfg.icon} {catCfg.label}
            </span>
            {badge.isUnlocked && badge.unlockedAt && (
              <span className="text-xs text-emerald-500">
                Unlocked {formatDate(badge.unlockedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {!badge.isUnlocked && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>Progress</span>
            <span>
              {badge.requirementType === 'plant_stage'
                ? `Stage ${badge.progress} / ${badge.total}`
                : `${Math.floor(badge.progress)} / ${Math.floor(badge.total)}`}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${badge.percentage}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
