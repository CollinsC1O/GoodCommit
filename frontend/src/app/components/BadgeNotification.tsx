'use client';

import { useEffect, useRef } from 'react';
import type { BadgeRarity } from '@/config/badges';
import { RARITY_CONFIG } from '@/config/badges';

interface BadgeNotificationProps {
  badge: {
    title: string;
    description: string;
    icon: string;
    rarity: BadgeRarity;
  } | null;
  onClose: () => void;
  autoHideMs?: number;
}

export function BadgeNotification({ badge, onClose, autoHideMs = 6000 }: BadgeNotificationProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (badge) {
      timerRef.current = setTimeout(onClose, autoHideMs);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [badge, onClose, autoHideMs]);

  if (!badge) return null;

  const rarityCfg = RARITY_CONFIG[badge.rarity];

  return (
    <div className="fixed top-24 right-4 sm:right-8 z-[100] max-w-sm w-full animate-in slide-in-from-right-8 fade-in duration-300">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 flex items-center justify-center text-2xl shrink-0">
            🏆
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-yellow-400 text-xs font-semibold uppercase tracking-wider mb-1">
              Achievement Unlocked!
            </p>
            <h4 className="text-white font-bold text-lg truncate">
              {badge.icon} {badge.title}
            </h4>
            <p className="text-slate-400 text-sm mt-1 line-clamp-2">
              {badge.description}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${rarityCfg.color}`}>
                {rarityCfg.label}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
