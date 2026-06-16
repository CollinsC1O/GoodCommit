import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export function useStreak() {
  const { address } = useAccount();
  const [streak, setStreak] = useState<{
    currentStreak: number;
    longestStreak: number;
    totalDaysActive: number;
    lastActivityDate: string | null;
    streakStartDate: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStreak = useCallback(async () => {
    if (!address) {
      setStreak(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/streak/${address}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch streak data');
      }
      const payload = await response.json();
      setStreak({
        currentStreak: Number(payload.currentStreak || 0),
        longestStreak: Number(payload.longestStreak || 0),
        totalDaysActive: Number(payload.totalDaysActive || 0),
        lastActivityDate: payload.lastActivityDate || null,
        streakStartDate: payload.streakStartDate || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load streak');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchStreak();
  }, [fetchStreak]);

  return {
    streak,
    loading,
    error,
    refetchStreak: fetchStreak,
  };
}
