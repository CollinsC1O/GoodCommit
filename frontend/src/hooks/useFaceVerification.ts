"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';

// ── Storage helpers (safe in SSR / private-browsing) ──────────────────────────

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* SSR / private mode */ }
}
function lsDel(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ── Cache keys ────────────────────────────────────────────────────────────────

const cacheKey   = (addr: string) => `fv_verified_${addr.toLowerCase()}`;
const cacheTs    = (addr: string) => `fv_ts_${addr.toLowerCase()}`;
// NEW: "pending" flag written BEFORE we redirect — survives page navigation
const pendingKey = (addr: string) => `fv_pending_${addr.toLowerCase()}`;

// Trust local cache for 12 h (GoodDollar auth period is ~14 days)
const LOCAL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// ── Public API ────────────────────────────────────────────────────────────────

export interface FaceVerificationState {
  isVerified : boolean;
  isLoading  : boolean;
  isPending  : boolean; // true while we are waiting for on-chain confirmation after redirect
  markAsVerified    : () => void;
  markAsPending     : () => void; // call this BEFORE redirecting to GoodDollar
  clearVerification : () => void;
}

export function useFaceVerification(): FaceVerificationState {
  const { address, isConnected } = useAccount();

  const [isVerified, setIsVerified] = useState(false);
  const [isLoading,  setIsLoading]  = useState(true);
  const [isPending,  setIsPending]  = useState(false);

  // Prevent concurrent backend polls
  const pollingRef = useRef(false);

  // ── Primary status check ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected || !address) {
      setIsVerified(false);
      setIsLoading(false);
      setIsPending(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const check = async () => {
      // 1. Fast path: fresh local cache → trust it immediately, no network call
      const cached = lsGet(cacheKey(address));
      const ts     = lsGet(cacheTs(address));
      if (cached === 'true' && ts && Date.now() - parseInt(ts, 10) < LOCAL_CACHE_TTL_MS) {
        if (!cancelled) {
          setIsVerified(true);
          setIsLoading(false);
        }
        return;
      }

      // 2. Check if we set a "pending" flag (user just came back from GoodDollar)
      //    Don't clear cache here — let FaceVerification.tsx handle confirmation
      const pending = lsGet(pendingKey(address));
      if (pending === 'true') {
        if (!cancelled) {
          // Show as "loading" — FaceVerification.tsx will resolve this
          setIsPending(true);
          setIsLoading(false);
        }
        return;
      }

      // 3. Authoritative on-chain check via backend.
      //    Read the cache flag now so the catch block has a stable reference.
      const cachedFlag = lsGet(cacheKey(address));

      try {
        if (pollingRef.current) return;
        pollingRef.current = true;

        const res = await fetch(`${BACKEND_URL}/api/verify/status/${address}`, {
          signal: AbortSignal.timeout(8000),
        });

        if (!cancelled) {
          // 503 = transient RPC error on the backend — don't clear cache
          if (res.status === 503) {
            if (cachedFlag === 'true') setIsVerified(true);
            return; // finally handles setIsLoading(false)
          }

          if (res.ok) {
            const data = await res.json();
            if (data.verified) {
              lsSet(cacheKey(address), 'true');
              lsSet(cacheTs(address), Date.now().toString());
              lsDel(pendingKey(address));
              setIsVerified(true);
            } else if (data.rpcError) {
              // Backend got a transient RPC error — don't wipe cache
              if (cachedFlag === 'true') setIsVerified(true);
            } else {
              // Clean definitive "not verified" — safe to clear cache
              lsDel(cacheKey(address));
              lsDel(cacheTs(address));
              setIsVerified(false);
            }
          }
        }
      } catch {
        // Network error — fall back to whatever cache we have, never clear it
        if (!cancelled && cachedFlag === 'true') setIsVerified(true);
      } finally {
        pollingRef.current = false;
        if (!cancelled) setIsLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  // Intentionally only re-run on address/connection changes, NOT on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected]);

  // ── markAsPending — call BEFORE redirecting to GoodDollar ──────────────────
  const markAsPending = useCallback(() => {
    if (!address) return;
    lsSet(pendingKey(address), 'true');
    setIsPending(true);
  }, [address]);

  // ── markAsVerified — call after on-chain confirmation succeeds ──────────────
  const markAsVerified = useCallback(() => {
    if (!address) return;
    lsSet(cacheKey(address),  'true');
    lsSet(cacheTs(address),   Date.now().toString());
    lsDel(pendingKey(address));
    setIsVerified(true);
    setIsPending(false);
    setIsLoading(false);
  }, [address]);

  // ── clearVerification — for testing / re-verification ──────────────────────
  const clearVerification = useCallback(() => {
    if (!address) return;
    lsDel(cacheKey(address));
    lsDel(cacheTs(address));
    lsDel(pendingKey(address));
    setIsVerified(false);
    setIsPending(false);
  }, [address]);

  return { isVerified, isLoading, isPending, markAsVerified, markAsPending, clearVerification };
}
