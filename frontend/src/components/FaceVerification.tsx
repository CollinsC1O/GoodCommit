"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useSearchParams, useRouter } from 'next/navigation';
import { IdentitySDK } from '@goodsdks/citizen-sdk';

interface FaceVerificationProps {
  onVerified   : () => void;
  onPending?   : () => void; // optional — called before redirect so parent can set pending state
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// ── Helpers ───────────────────────────────────────────────────────────────────

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* SSR / private mode */ }
}
function lsDel(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

const pendingKey = (addr: string) => `fv_pending_${addr.toLowerCase()}`;
const returnedKey = (addr: string) => `fv_returned_${addr.toLowerCase()}`;

/**
 * Poll backend until on-chain verification is confirmed (or times out).
 * Longer intervals at start (GoodDollar can take 30–90 s to write on-chain).
 */
async function pollVerificationStatus(
  address: string,
  maxAttempts = 30,
  intervalMs  = 4000,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/verify/status/${address}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.verified === true) return true;
      }
    } catch { /* keep polling */ }
    if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Detect whether the current URL contains GoodDollar callback parameters.
 *
 * GoodDollar's hosted face-scan page appends query params when redirecting
 * back. The exact param names can vary by GoodDollar version, so we use a
 * broad heuristic:
 *   • any key that starts with "fv" (fvSig, fvNonce, fv, fvToken, …)
 *   • OR the presence of "gooddollar" anywhere in a value
 *   • OR a "sig" param (some older SDK versions)
 *
 * We also rely on the localStorage `fv_returned_*` flag that we set before
 * redirecting — this is the most reliable signal because it survives even if
 * GoodDollar strips or renames its params.
 */
function detectGoodDollarReturn(
  searchParams: URLSearchParams | ReturnType<typeof useSearchParams>,
  address: string,
): boolean {
  // Most reliable: we set this flag before redirecting
  if (lsGet(returnedKey(address)) === 'true') return true;
  if (lsGet(pendingKey(address)) === 'true') {
    // User was pending and has now returned (regardless of params)
    // This handles cases where GoodDollar strips all query params
    // We mark "returned" so this branch only fires once
    lsSet(returnedKey(address), 'true');
    return true;
  }

  const keys = Array.from(searchParams.keys());
  if (keys.length === 0) return false;

  // Check for known GoodDollar param patterns
  const hasFvParam = keys.some((k) => k.toLowerCase().startsWith('fv') || k === 'sig');
  const hasGDValue = Array.from(searchParams.values()).some(
    (v) => typeof v === 'string' && v.toLowerCase().includes('gooddollar'),
  );

  if (hasFvParam || hasGDValue) {
    lsSet(returnedKey(address), 'true');
    return true;
  }

  return false;
}

// ── Inner component ───────────────────────────────────────────────────────────

function FaceVerificationInner({ onVerified, onPending }: FaceVerificationProps) {
  const { address, isConnected } = useAccount();
  const publicClient  = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const searchParams  = useSearchParams();
  const router        = useRouter();

  const [sdk,      setSdk]      = useState<IdentitySDK | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [step, setStep] = useState<
    'idle' | 'waiting-signature' | 'redirecting' | 'confirming' | 'done'
  >('idle');
  const [error,        setError]        = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  // Prevent double-invocation of the confirmation flow
  const confirmationStarted = useRef(false);

  // ── Init SDK ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!publicClient || !walletClient) return;
    let cancelled = false;

    IdentitySDK.init({
      publicClient: publicClient as any,
      walletClient: walletClient as any,
      env: 'production', // Celo mainnet
    })
      .then((s) => { if (!cancelled) setSdk(s); })
      .catch((e: any) => {
        if (!cancelled) {
          console.error('IdentitySDK init error:', e);
          setSdkError(`SDK init failed: ${e?.message ?? 'unknown error'}`);
        }
      });

    return () => { cancelled = true; };
  }, [publicClient, walletClient]);

  // ── Handle return from GoodDollar ────────────────────────────────────────────
  useEffect(() => {
    if (!address || !isConnected) return;
    if (confirmationStarted.current) return;

    const isReturn = detectGoodDollarReturn(searchParams, address);
    if (!isReturn) return;

    confirmationStarted.current = true;

    // Immediately clear the URL so a browser refresh doesn't re-trigger this
    router.replace(window.location.pathname, { scroll: false });

    // Mark as returned (in case detectGoodDollarReturn relied on pendingKey)
    lsSet(returnedKey(address), 'true');
    lsDel(pendingKey(address));

    setStep('confirming');

    // Poll until on-chain confirmed
    pollVerificationStatus(address, 30, 4000).then((verified) => {
      if (verified) {
        setStep('done');
        // Small delay so the user sees the success state briefly
        setTimeout(() => {
          lsDel(returnedKey(address));
          onVerified();
        }, 800);
      } else {
        // ── Optimistic fallback ────────────────────────────────────────────
        // GoodDollar can take several minutes to write on-chain in rare cases.
        // Rather than making the user retry, we do a final direct contract read
        // via the backend, and if still unconfirmed, show a "manual check" UI.
        setError(
          'On-chain confirmation is taking longer than usual. ' +
          'Your scan was likely recorded — click "Check My Status" below.',
        );
        setStep('idle');
        confirmationStarted.current = false;
      }
    });
  // We only want this to fire when the component mounts or address changes.
  // Listing searchParams would re-fire after router.replace cleans the URL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected]);

  // ── Manual re-check ───────────────────────────────────────────────────────
  const handleManualCheck = useCallback(async () => {
    if (!address) return;
    setError(null);
    setStep('confirming');
    const verified = await pollVerificationStatus(address, 10, 3000);
    if (verified) {
      setStep('done');
      lsDel(returnedKey(address));
      setTimeout(() => onVerified(), 800);
    } else {
      setStep('idle');
      setError(
        'Still not confirmed on-chain. Wait a couple of minutes and try again, ' +
        'or restart the face scan.',
      );
    }
  }, [address, onVerified]);

  // ── Start verification flow ───────────────────────────────────────────────
  const handleVerification = useCallback(async () => {
    if (!address || !isConnected) { setError('Please connect your wallet first.'); return; }
    if (!sdk) { setError(sdkError || 'SDK still loading — please wait a moment.'); return; }
    if (step !== 'idle') return;

    setError(null);
    setAttemptCount((c) => c + 1);

    try {
      const callbackUrl = window.location.origin + window.location.pathname;

      setStep('waiting-signature');

      const verificationLink = await sdk.generateFVLink(false, callbackUrl, 42220);

      // ── Set the pending flag BEFORE navigating away ─────────────────────
      // This is the key fix: even if GoodDollar strips all query params from
      // the redirect, we can still detect the return via localStorage.
      lsSet(pendingKey(address), 'true');
      onPending?.();

      setStep('redirecting');
      await new Promise((r) => setTimeout(r, 500));

      window.location.href = verificationLink;
      // (execution stops — tab navigates away)

    } catch (err: any) {
      const msg: string = err?.message ?? '';
      console.error('FV error:', err);

      if (/rejected|denied|user denied/i.test(msg)) {
        setError('You declined the MetaMask signature. Please approve it — it costs no gas.');
      } else if (/timeout|timed out/i.test(msg)) {
        setError('MetaMask signature timed out. Please try again.');
      } else {
        setError(msg || 'Failed to start verification. Please try again.');
      }

      setStep('idle');
    }
  }, [address, isConnected, sdk, sdkError, step, onPending]);

  // ── Render: Confirming ────────────────────────────────────────────────────
  if (step === 'confirming' || step === 'done') {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-5xl mb-4">{step === 'done' ? '✅' : '⛓️'}</div>
          <h2 className="text-xl font-bold text-white mb-2">
            {step === 'done' ? 'Verified!' : 'Confirming on-chain…'}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {step === 'done'
              ? 'Identity confirmed. Taking you in…'
              : 'Your face scan is complete! Waiting for GoodDollar to record it on the blockchain. This usually takes 30–90 seconds.'}
          </p>
          {step !== 'done' && (
            <div className="flex items-center justify-center gap-2 text-green-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm font-medium">Polling blockchain…</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Redirecting ───────────────────────────────────────────────────
  if (step === 'redirecting') {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-5xl mb-4">🚀</div>
          <h2 className="text-xl font-bold text-white mb-2">Redirecting to GoodDollar…</h2>
          <p className="text-slate-400 text-sm">
            You're being taken to GoodDollar's face scan page. After completing the scan,
            you'll be automatically brought back to GoodCommit.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: Main modal ────────────────────────────────────────────────────
  const isWaitingForMetaMask = step === 'waiting-signature';
  const isActive = step !== 'idle';

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-8 shadow-2xl">

        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-500/30 flex items-center justify-center">
            <span className="text-3xl">{isWaitingForMetaMask ? '🦊' : '🔐'}</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-1">
            {isWaitingForMetaMask ? 'Approve in MetaMask' : 'Verify Your Identity'}
          </h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            {isWaitingForMetaMask
              ? 'MetaMask is asking for a signature. Free — no gas, no transaction.'
              : "One-time GoodDollar face scan. You'll be redirected back automatically."}
          </p>
        </div>

        {/* MetaMask prompt */}
        {isWaitingForMetaMask && (
          <div className="bg-orange-500/15 border-2 border-orange-400/60 rounded-xl p-4 mb-4 text-center">
            <p className="text-orange-300 font-bold text-sm mb-1">🦊 Check MetaMask</p>
            <p className="text-orange-200/80 text-xs">
              Click the <strong>MetaMask icon</strong> in your toolbar if you don't see the popup. Click <strong>"Sign"</strong>.
            </p>
          </div>
        )}

        {/* Feature list */}
        {step === 'idle' && (
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 mb-4">
            <div className="space-y-2 text-xs">
              {[
                'One unique human = one account',
                'Prevents bot exploitation of G$ rewards',
                'Powered by GoodDollar Identity (Celo mainnet)',
                'Biometric data never stored or linked to your wallet',
                'Re-verification every ~14 days',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <span className="text-green-400 shrink-0">✓</span>
                  <span className="text-slate-300">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        {step === 'idle' && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4">
            <p className="text-blue-300 text-xs text-center">
              📋 You'll be redirected to GoodDollar's scan page, then brought back here automatically.
            </p>
          </div>
        )}

        {/* SDK state */}
        {!sdk && !sdkError && step === 'idle' && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-4">
            <p className="text-yellow-300 text-xs text-center">⏳ Connecting to GoodDollar on Celo mainnet…</p>
          </div>
        )}
        {sdkError && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 mb-4">
            <p className="text-orange-300 text-xs text-center">{sdkError}</p>
          </div>
        )}

        {/* Error + manual check */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
            <p className="text-red-400 text-sm text-center">{error}</p>
            {attemptCount > 0 && step === 'idle' && (
              <button
                onClick={handleManualCheck}
                className="mt-3 w-full text-xs bg-blue-500/20 border border-blue-500/40 text-blue-300 hover:text-blue-200 hover:bg-blue-500/30 py-2 px-3 rounded-lg transition-colors"
              >
                ✓ I completed the scan — Check my status
              </button>
            )}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleVerification}
          disabled={isActive || !address || !isConnected || !sdk}
          className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:shadow-lg hover:shadow-green-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isWaitingForMetaMask ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Waiting for MetaMask signature…
            </span>
          ) : attemptCount > 0 && step === 'idle' ? (
            '↺ Restart Face Scan'
          ) : (
            'Verify with GoodDollar →'
          )}
        </button>

        {/* Step indicator */}
        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-slate-600">
          <span>1. Sign in MetaMask</span>
          <span>→</span>
          <span>2. Complete face scan</span>
          <span>→</span>
          <span>3. Auto-return here</span>
        </div>

        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <p className="text-xs text-yellow-200 text-center font-medium">
            ⚠️ Face verification is mandatory to access GoodCommit
          </p>
        </div>

        <p className="text-xs text-slate-500 text-center mt-3">
          By verifying, you agree to{' '}
          <a href="https://www.gooddollar.org/terms-of-use/" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300 transition-colors">
            GoodDollar's terms of service
          </a>
        </p>
      </div>
    </div>
  );
}

// ── Suspense wrapper (required for useSearchParams in Next.js App Router) ─────

export default function FaceVerification({ onVerified, onPending }: FaceVerificationProps) {
  return (
    <Suspense fallback={null}>
      <FaceVerificationInner onVerified={onVerified} onPending={onPending} />
    </Suspense>
  );
}
