"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useSearchParams, useRouter } from 'next/navigation';
import { IdentitySDK } from '@goodsdks/citizen-sdk';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface FaceVerificationProps {
  /** Called once on-chain confirmation succeeds */
  onVerified : () => void;
  /** Called immediately before navigating to GoodDollar */
  onPending? : () => void;
  /**
   * inline=true → renders as a card embedded in the habit page (seed claim section)
   * inline=false → full-screen modal overlay (default, rarely needed now)
   */
  inline?    : boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// ── Local storage helpers ─────────────────────────────────────────────────────
function lsGet(k: string): string | null  { try { return localStorage.getItem(k);  } catch { return null; } }
function lsSet(k: string, v: string): void { try { localStorage.setItem(k, v);      } catch { /* SSR */ } }
function lsDel(k: string): void            { try { localStorage.removeItem(k);      } catch { /* ignore */ } }

const pendingKey  = (a: string) => `fv_pending_${a.toLowerCase()}`;
const returnedKey = (a: string) => `fv_returned_${a.toLowerCase()}`;

// ── Polling helper ────────────────────────────────────────────────────────────
async function pollVerificationStatus(
  address: string,
  onAttempt: (n: number) => void,
  maxAttempts = 40,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    onAttempt(i + 1);
    try {
      const res = await fetch(`${BACKEND_URL}/api/verify/status/${address}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.verified === true) return true;
        // Only break if definitively not verified (not an RPC hiccup)
        if (!data.rpcError && i >= 5) return false;
      }
      // 503 / rpcError → keep polling
    } catch { /* network hiccup — keep polling */ }
    if (i < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, i < 10 ? 3000 : 6000));
    }
  }
  return false;
}

// ── Return detection ──────────────────────────────────────────────────────────
function detectGoodDollarReturn(
  searchParams: ReturnType<typeof useSearchParams>,
  address: string,
): boolean {
  // Primary signal: pending flag we set BEFORE redirect
  if (lsGet(pendingKey(address)) === 'true') {
    lsSet(returnedKey(address), 'true');
    return true;
  }
  if (lsGet(returnedKey(address)) === 'true') return true;

  // Secondary: URL param heuristics (GoodDollar sometimes appends fv* params)
  const hasFvParam = Array.from(searchParams.keys()).some(
    k => k.toLowerCase().startsWith('fv') || k === 'sig'
  );
  const hasGDValue = Array.from(searchParams.values()).some(
    v => typeof v === 'string' && v.toLowerCase().includes('gooddollar')
  );
  if (hasFvParam || hasGDValue) {
    lsSet(returnedKey(address), 'true');
    return true;
  }
  return false;
}

// ── Inner component ───────────────────────────────────────────────────────────
function FaceVerificationInner({ onVerified, onPending, inline = true }: FaceVerificationProps) {
  const { address, isConnected } = useAccount();
  const publicClient             = usePublicClient();
  const { data: walletClient }   = useWalletClient();
  const searchParams             = useSearchParams();
  const router                   = useRouter();

  const [sdk,         setSdk]         = useState<IdentitySDK | null>(null);
  const [sdkError,    setSdkError]    = useState<string | null>(null);
  const [step,        setStep]        = useState<
    'idle' | 'waiting-signature' | 'redirecting' | 'confirming' | 'done'
  >('idle');
  const [error,        setError]       = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [pollAttempt,  setPollAttempt]  = useState(0);

  const confirmationStarted = useRef(false);
  const abortRef            = useRef(false);

  // ── Init SDK ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!publicClient || !walletClient) return;
    let cancelled = false;

    IdentitySDK.init({
      publicClient: publicClient as any,
      walletClient: walletClient as any,
      env: 'production', // Celo mainnet identity contract
    })
      .then(s  => { if (!cancelled) setSdk(s); })
      .catch((e: any) => { if (!cancelled) setSdkError(e?.message ?? 'SDK init failed'); });

    return () => { cancelled = true; };
  }, [publicClient, walletClient]);

  // ── Handle return from GoodDollar ─────────────────────────────────────────
  useEffect(() => {
    if (!address || !isConnected || confirmationStarted.current) return;

    const isReturn = detectGoodDollarReturn(searchParams, address);
    if (!isReturn) return;

    confirmationStarted.current = true;
    abortRef.current            = false;

    // Clean URL immediately so a refresh doesn't re-trigger
    router.replace(window.location.pathname, { scroll: false });
    lsDel(pendingKey(address));
    setStep('confirming');

    pollVerificationStatus(address, n => setPollAttempt(n))
      .then(verified => {
        if (abortRef.current) return;
        lsDel(returnedKey(address));
        if (verified) {
          setStep('done');
          setTimeout(() => onVerified(), 800);
        } else {
          setError(
            'Confirmation timed out. If you completed the scan, click "Check my status" below.'
          );
          setStep('idle');
          confirmationStarted.current = false;
        }
      });

    return () => { abortRef.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected]);

  // ── Manual status re-check ────────────────────────────────────────────────
  const handleManualCheck = useCallback(async () => {
    if (!address) return;
    setError(null);
    setStep('confirming');
    const ok = await pollVerificationStatus(address, n => setPollAttempt(n), 10);
    if (ok) {
      lsDel(returnedKey(address));
      setStep('done');
      setTimeout(() => onVerified(), 800);
    } else {
      setStep('idle');
      setError('Still not confirmed. Wait a moment and try again, or restart the scan.');
    }
  }, [address, onVerified]);

  // ── Start face verification ───────────────────────────────────────────────
  const handleVerification = useCallback(async () => {
    if (!address || !isConnected) { setError('Connect your wallet first.'); return; }
    if (!sdk)  { setError(sdkError || 'SDK still loading — please wait.'); return; }
    if (step !== 'idle') return;

    setError(null);
    setAttemptCount(c => c + 1);
    setStep('waiting-signature');

    try {
      const callbackUrl      = window.location.origin + window.location.pathname;
      const verificationLink = await sdk.generateFVLink(false, callbackUrl, 42220);

      // Write flag BEFORE navigating so we can detect the return even if GoodDollar
      // strips all URL params on their redirect back.
      lsSet(pendingKey(address), 'true');
      onPending?.();

      setStep('redirecting');
      await new Promise(r => setTimeout(r, 400));
      window.location.href = verificationLink;

    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (/rejected|denied/i.test(msg)) {
        setError('You declined the MetaMask signature. Approve it — no gas is charged.');
      } else if (/timeout|timed out/i.test(msg)) {
        setError('MetaMask timed out. Please try again.');
      } else {
        setError(msg || 'Failed to start verification. Please try again.');
      }
      setStep('idle');
    }
  }, [address, isConnected, sdk, sdkError, step, onPending]);

  // ── Render: confirming / done / redirecting ───────────────────────────────
  if (step === 'confirming' || step === 'done' || step === 'redirecting') {
    const icon  = step === 'done' ? '✅' : step === 'redirecting' ? '🚀' : '⛓️';
    const title = step === 'done'
      ? 'Verified!'
      : step === 'redirecting'
        ? 'Redirecting to GoodDollar…'
        : 'Confirming on-chain…';
    const body  = step === 'done'
      ? 'Identity confirmed! You can now claim your free 10 G$ seed.'
      : step === 'redirecting'
        ? 'Complete the face scan and you\'ll be returned here automatically.'
        : 'GoodDollar is recording your verification on the blockchain. Usually 30–90 seconds.';

    const content = (
      <div className="text-center py-2">
        <div className="text-4xl mb-3">{icon}</div>
        <p className="font-bold text-white mb-1">{title}</p>
        <p className="text-slate-400 text-xs leading-relaxed">{body}</p>
        {step === 'confirming' && (
          <div className="mt-3 flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              Polling blockchain…
            </div>
            {pollAttempt > 5 && (
              <p className="text-xs text-slate-500">
                Attempt {pollAttempt}/40 — GoodDollar can take up to 2 min
              </p>
            )}
          </div>
        )}
      </div>
    );

    return inline
      ? <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5">{content}</div>
      : (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4">{content}</div>
        </div>
      );
  }

  // ── Render: idle (main CTA) ───────────────────────────────────────────────
  const isWaiting = step === 'waiting-signature';
  const isActive  = step !== 'idle';

  const mainContent = (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30 flex items-center justify-center text-xl shrink-0">
          🎁
        </div>
        <div>
          <h3 className="text-white font-bold text-sm">
            {isWaiting ? '🦊 Approve in MetaMask' : 'Claim Your Free 10 G$ Seed'}
          </h3>
          <p className="text-slate-400 text-xs">
            {isWaiting
              ? 'Click Sign — no gas, no transaction.'
              : 'One-time identity check. Verified by GoodDollar on Celo mainnet.'}
          </p>
        </div>
      </div>

      {/* MetaMask waiting banner */}
      {isWaiting && (
        <div className="bg-orange-500/10 border border-orange-400/30 rounded-xl p-3 mb-4 text-center">
          <p className="text-orange-300 text-sm font-semibold">🦊 Check MetaMask</p>
          <p className="text-orange-200/70 text-xs mt-0.5">Click the extension icon, then click <strong>Sign</strong>.</p>
        </div>
      )}

      {/* Info checklist */}
      {step === 'idle' && (
        <ul className="space-y-1 mb-4">
          {[
            'One free seed per GoodDollar identity',
            'Biometric data never stored on-chain',
            'Powered by GoodDollar Identity (Celo mainnet)',
            'Contract verifies you directly — no backend trust',
          ].map(t => (
            <li key={t} className="flex items-center gap-2 text-xs text-slate-300">
              <span className="text-emerald-400 shrink-0">✓</span>{t}
            </li>
          ))}
        </ul>
      )}

      {/* SDK loading */}
      {!sdk && !sdkError && step === 'idle' && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-2.5 mb-3 text-center">
          <p className="text-yellow-300 text-xs">⏳ Connecting to GoodDollar on Celo mainnet…</p>
        </div>
      )}

      {/* SDK error */}
      {sdkError && (
        <div className="bg-orange-500/10 border border-orange-400/30 rounded-xl p-2.5 mb-3">
          <p className="text-orange-300 text-xs text-center">{sdkError}</p>
        </div>
      )}

      {/* Error + manual check */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3">
          <p className="text-red-400 text-xs text-center">{error}</p>
          {attemptCount > 0 && (
            <button
              onClick={handleManualCheck}
              className="mt-2 w-full text-xs bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:text-blue-100 py-1.5 px-3 rounded-lg transition-colors"
            >
              ✓ I completed the scan — Check my status
            </button>
          )}
        </div>
      )}

      {/* CTA button */}
      <button
        onClick={handleVerification}
        disabled={isActive || !address || !isConnected || !sdk}
        className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold py-2.5 rounded-xl text-sm hover:shadow-lg hover:shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isWaiting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            Waiting for MetaMask…
          </span>
        ) : attemptCount > 0
          ? '↺ Retry Face Scan'
          : 'Verify Identity & Claim Free G$ →'
        }
      </button>

      {/* Steps */}
      <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-slate-600">
        <span>1. Sign (free)</span>
        <span>→</span>
        <span>2. Face scan</span>
        <span>→</span>
        <span>3. 10 G$ in your wallet</span>
      </div>

      <p className="mt-2 text-[10px] text-slate-600 text-center">
        By verifying you agree to{' '}
        <a href="https://www.gooddollar.org/terms-of-use/" target="_blank" rel="noopener noreferrer"
          className="underline hover:text-slate-400 transition-colors">
          GoodDollar's terms
        </a>
      </p>
    </>
  );

  if (inline) {
    return (
      <div className="bg-slate-900/70 border border-emerald-500/20 rounded-2xl p-5">
        {mainContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-8 shadow-2xl">
        {mainContent}
      </div>
    </div>
  );
}

// ── Suspense wrapper (required for useSearchParams in Next.js App Router) ─────
export default function FaceVerification(props: FaceVerificationProps) {
  return (
    <Suspense fallback={null}>
      <FaceVerificationInner {...props} />
    </Suspense>
  );
}
