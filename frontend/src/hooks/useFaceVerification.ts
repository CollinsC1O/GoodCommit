"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';

// ── Storage helpers ───────────────────────────────────────────────────────────
function lsGet(k: string): string | null  { try { return localStorage.getItem(k);  } catch { return null; } }
function lsSet(k: string, v: string): void { try { localStorage.setItem(k, v);      } catch { /* SSR/private */ } }
function lsDel(k: string): void            { try { localStorage.removeItem(k);      } catch { /* ignore */ } }

// ── Cache keys ────────────────────────────────────────────────────────────────
const cacheKey    = (a: string) => `fv_verified_${a.toLowerCase()}`;
const cacheTs     = (a: string) => `fv_ts_${a.toLowerCase()}`;
const pendingKey  = (a: string) => `fv_pending_${a.toLowerCase()}`;   // set BEFORE redirect

// Trust local cache for 12 h (GoodDollar auth period is ~14 days)
const LOCAL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface FaceVerificationState {
  /** True once on-chain GoodDollar identity is confirmed */
  isVerified        : boolean;
  /** True while polling after a GoodDollar redirect */
  isPending         : boolean;
  /** Call immediately BEFORE redirecting to GoodDollar */
  markAsPending     : () => void;
  /** Call after on-chain confirmation succeeds */
  markAsVerified    : () => void;
  /** Wipe all cached state */
  clearVerification : () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useFaceVerification(): FaceVerificationState {
  const { address, isConnected } = useAccount();

  const [isVerified, setIsVerified] = useState(false);
  const [isPending,  setIsPending]  = useState(false);

  // Prevent concurrent background checks
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setIsVerified(false);
      setIsPending(false);
      return;
    }

    let cancelled = false;

    const runCheck = async () => {
      // ── 1. Fast path: fresh local cache ──────────────────────────────────
      const cached = lsGet(cacheKey(address));
      const ts     = lsGet(cacheTs(address));
      if (cached === 'true' && ts && Date.now() - parseInt(ts, 10) < LOCAL_CACHE_TTL_MS) {
        if (!cancelled) setIsVerified(true);
        return;
      }

      // ── 2. Pending flag: user redirected to GoodDollar but not confirmed yet
      if (lsGet(pendingKey(address)) === 'true') {
        if (!cancelled) setIsPending(true);
        return;
      }

      // ── 3. Silent background network check (never blocks the UI) ─────────
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        const res = await fetch(`${BACKEND_URL}/api/verify/status/${address}`, {
          signal: AbortSignal.timeout(8000),
        });

        if (cancelled) return;

        if (res.status === 503) {
          // Transient RPC error — fall back to cache, don't clear
          if (lsGet(cacheKey(address)) === 'true') setIsVerified(true);
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data.verified) {
            lsSet(cacheKey(address), 'true');
            lsSet(cacheTs(address),  Date.now().toString());
            lsDel(pendingKey(address));
            setIsVerified(true);
          } else if (data.rpcError) {
            // Transient backend hiccup — keep cache
            if (lsGet(cacheKey(address)) === 'true') setIsVerified(true);
          } else {
            // Definitive "not verified"
            lsDel(cacheKey(address));
            lsDel(cacheTs(address));
            setIsVerified(false);
          }
        }
      } catch {
        // Network error — silently fall back, never block user
        if (!cancelled && lsGet(cacheKey(address)) === 'true') setIsVerified(true);
      } finally {
        checkingRef.current = false;
      }
    };

    runCheck();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected]);

  const markAsPending = useCallback(() => {
    if (!address) return;
    lsSet(pendingKey(address), 'true');
    setIsPending(true);
  }, [address]);

  const markAsVerified = useCallback(() => {
    if (!address) return;
    lsSet(cacheKey(address),  'true');
    lsSet(cacheTs(address),   Date.now().toString());
    lsDel(pendingKey(address));
    setIsVerified(true);
    setIsPending(false);
  }, [address]);

  const clearVerification = useCallback(() => {
    if (!address) return;
    lsDel(cacheKey(address));
    lsDel(cacheTs(address));
    lsDel(pendingKey(address));
    setIsVerified(false);
    setIsPending(false);
  }, [address]);

  return { isVerified, isPending, markAsPending, markAsVerified, clearVerification };
}