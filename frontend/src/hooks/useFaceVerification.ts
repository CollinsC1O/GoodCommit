"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

const CACHE_KEY = (address: string) => `fv_verified_${address}`;
const CACHE_TS_KEY = (address: string) => `fv_timestamp_${address}`;

// How long the local cache is trusted before we re-confirm on-chain (24 hours).
// The real source of truth is always the backend (which reads the chain).
const LOCAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Polls the backend /api/verify/status/:address endpoint (which reads the
 * GoodDollar Identity contract on-chain) until verified === true or maxAttempts
 * is reached.  Returns true if verified, false otherwise.
 */
async function pollBackendVerification(
  address: string,
  maxAttempts = 20,
  intervalMs = 3000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/verify/status/${address}`);
      if (res.ok) {
        const data = await res.json();
        if (data.verified === true) return true;
      }
    } catch {
      // Network hiccup — keep trying
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

export function useFaceVerification() {
  const { address, isConnected } = useAccount();
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ── On wallet connect / address change: check local cache then backend ──
  useEffect(() => {
    if (!isConnected || !address) {
      setIsVerified(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const check = async () => {
      setIsLoading(true);

      // 1️⃣ Fast path: trust the local cache if it is fresh enough
      const cachedFlag = localStorage.getItem(CACHE_KEY(address));
      const cachedTs = localStorage.getItem(CACHE_TS_KEY(address));

      if (cachedFlag === 'true' && cachedTs) {
        const age = Date.now() - parseInt(cachedTs, 10);
        if (age < LOCAL_CACHE_TTL_MS) {
          if (!cancelled) {
            setIsVerified(true);
            setIsLoading(false);
          }
          return;
        }
      }

      // 2️⃣ Slow path: ask the backend (authoritative on-chain check)
      try {
        const res = await fetch(`${BACKEND_URL}/api/verify/status/${address}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.verified) {
            // Refresh the local cache
            localStorage.setItem(CACHE_KEY(address), 'true');
            localStorage.setItem(CACHE_TS_KEY(address), Date.now().toString());
            setIsVerified(true);
          } else {
            // Clear stale cache
            localStorage.removeItem(CACHE_KEY(address));
            localStorage.removeItem(CACHE_TS_KEY(address));
            setIsVerified(false);
          }
        }
      } catch {
        // If backend is unreachable, fall back to whatever the cache said
        if (!cancelled && cachedFlag === 'true') {
          setIsVerified(true);
        } else if (!cancelled) {
          setIsVerified(false);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  /**
   * Called by FaceVerification component after the GoodDollar popup closes.
   * Polls the backend until the on-chain whitelist update propagates.
   */
  const markAsVerified = useCallback(async () => {
    if (!address) return;

    // Optimistically update local state so the modal closes immediately
    localStorage.setItem(CACHE_KEY(address), 'true');
    localStorage.setItem(CACHE_TS_KEY(address), Date.now().toString());
    setIsVerified(true);

    // Then confirm on-chain in the background (silently corrects if it failed)
    const confirmed = await pollBackendVerification(address);
    if (!confirmed) {
      // Verification did not actually land on-chain — roll back
      localStorage.removeItem(CACHE_KEY(address));
      localStorage.removeItem(CACHE_TS_KEY(address));
      setIsVerified(false);
    }
  }, [address]);

  const clearVerification = useCallback(() => {
    if (address) {
      localStorage.removeItem(CACHE_KEY(address));
      localStorage.removeItem(CACHE_TS_KEY(address));
      setIsVerified(false);
    }
  }, [address]);

  return {
    isVerified,
    isLoading,
    markAsVerified,
    clearVerification,
  };
}
