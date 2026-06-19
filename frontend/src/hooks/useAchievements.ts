'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import type { AchievementsResponse, RecentBadge } from '@/config/badges';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export function useAchievements() {
  const { address } = useAccount();
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAchievements = useCallback(async () => {
    if (!address) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/achievements/${address}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch achievements');
      }
      const payload = await response.json();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load achievements');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  return {
    data,
    loading,
    error,
    refetch: fetchAchievements,
  };
}

export function useRecentAchievements(limit = 5) {
  const { address } = useAccount();
  const [badges, setBadges] = useState<RecentBadge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecent = useCallback(async () => {
    if (!address) {
      setBadges([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/achievements/recent/${address}?limit=${limit}`
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch recent achievements');
      }
      const payload = await response.json();
      setBadges(payload.recent || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recent achievements');
    } finally {
      setLoading(false);
    }
  }, [address, limit]);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  return {
    badges,
    loading,
    error,
    refetch: fetchRecent,
  };
}
