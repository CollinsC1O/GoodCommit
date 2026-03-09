"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

const CACHE_KEY = (address: string) => `fv_verified_${address.toLowerCase()}`;
const CACHE_TS_KEY = (address: string) => `fv_ts_${address.toLowerCase()}`;

// Trust local cache for 12 hours — GoodDollar auth period is ~14 days
const LOCAL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* SSR / private mode */ }
}
function lsDel(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function useFaceVerification() {
  const { address, isConnected } = useAccount();
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !address) {
      setIsVerified(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const check = async () => {
      // 1️⃣ Fast path — fresh local cache
      const flag = lsGet(CACHE_KEY(address));
      const ts = lsGet(CACHE_TS_KEY(address));
      if (flag === 'true' && ts && Date.now() - parseInt(ts, 10) < LOCAL_CACHE_TTL_MS) {
        if (!cancelled) { setIsVerified(true); setIsLoading(false); }
        return;
      }

      // 2️⃣ Authoritative on-chain check via backend
      // Backend calls GoodDollar Identity contract (0xC361A6E67822a0EDc17D899227dd9FC50BD62F42)
      try {
        const res = await fetch(`${BACKEND_URL}/api/verify/status/${address}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.verified) {
            lsSet(CACHE_KEY(address), 'true');
            lsSet(CACHE_TS_KEY(address), Date.now().toString());
            if (!cancelled) setIsVerified(true);
          } else {
            lsDel(CACHE_KEY(address));
            lsDel(CACHE_TS_KEY(address));
            if (!cancelled) setIsVerified(false);
          }
        }
      } catch {
        // Backend unreachable — fall back to cache
        if (!cancelled) setIsVerified(flag === 'true');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [address, isConnected]);

  /**
   * Called by FaceVerification after on-chain confirmation succeeds.
   * FaceVerification.tsx already confirmed verified === true before calling
   * onVerified(), so we simply update state — no second poll needed.
   */
  const markAsVerified = useCallback(() => {
    if (!address) return;
    lsSet(CACHE_KEY(address), 'true');
    lsSet(CACHE_TS_KEY(address), Date.now().toString());
    setIsVerified(true);
  }, [address]);

  const clearVerification = useCallback(() => {
    if (!address) return;
    lsDel(CACHE_KEY(address));
    lsDel(CACHE_TS_KEY(address));
    setIsVerified(false);
  }, [address]);

  return { isVerified, isLoading, markAsVerified, clearVerification };
}
