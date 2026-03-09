"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useSearchParams, useRouter } from 'next/navigation';
import { IdentitySDK } from '@goodsdks/citizen-sdk';

interface FaceVerificationProps {
  onVerified: () => void;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

async function pollVerificationStatus(
  address: string,
  maxAttempts = 40,
  intervalMs = 3000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/verify/status/${address}`);
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
 * Inner component — uses useSearchParams so it must be wrapped in Suspense.
 *
 * Flow (redirect-based, no popup needed):
 *  1. User clicks button
 *  2. We call generateFVLink(popupMode=false, callbackUrl, chainId)
 *     → MetaMask asks for a signature (no gas)
 *  3. We redirect the current tab to GoodDollar's hosted verification page
 *  4. User completes the 3D face scan
 *  5. GoodDollar redirects back to callbackUrl with ?fvSig=... params
 *  6. We detect those params, poll the backend until on-chain confirmed, done
 */
function FaceVerificationInner({ onVerified }: FaceVerificationProps) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [sdk, setSdk] = useState<IdentitySDK | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [step, setStep] = useState<
    'idle' | 'waiting-signature' | 'redirecting' | 'returned' | 'confirming' | 'done'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [attemptCount, setAttemptCount] = useState(0);

  const inProgress = useRef(false);

  // ── Detect return from GoodDollar (callback URL params) ──────────────────
  // GoodDollar appends params like ?fvSig=...&fvNonce=... when redirecting back
  const returnedFromGoodDollar =
    searchParams.has('fvSig') ||
    searchParams.has('fvNonce') ||
    searchParams.has('fv') ||
    // fallback: any param that looks like a GoodDollar callback
    Array.from(searchParams.keys()).some((k) => k.startsWith('fv'));

  // ── Init SDK ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!publicClient || !walletClient) return;
    let cancelled = false;

    IdentitySDK.init({
      publicClient: publicClient as any,
      walletClient: walletClient as any,
      env: 'production', // Celo mainnet: 0xC361A6E67822a0EDc17D899227dd9FC50BD62F42
    })
      .then((s) => { if (!cancelled) setSdk(s); })
      .catch((e: any) => {
        if (!cancelled) {
          console.error('IdentitySDK init error:', e);
          setSdkError(`SDK init failed: ${e?.message || 'unknown error'}`);
        }
      });

    return () => { cancelled = true; };
  }, [publicClient, walletClient]);

  // ── Check existing status on mount ────────────────────────────────────────
  useEffect(() => {
    if (!address || !isConnected) { setIsCheckingStatus(false); return; }
    let cancelled = false;

    fetch(`${BACKEND_URL}/api/verify/status/${address}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.verified) onVerified(); })
      .catch(() => { /* unreachable — show modal */ })
      .finally(() => { if (!cancelled) setIsCheckingStatus(false); });

    return () => { cancelled = true; };
  }, [address, isConnected, onVerified]);

  // ── Handle return from GoodDollar redirect ────────────────────────────────
  useEffect(() => {
    if (!returnedFromGoodDollar || !address || isCheckingStatus) return;
    if (inProgress.current) return;
    inProgress.current = true;

    setStep('returned');

    // Clean the URL so a refresh doesn't re-trigger this
    const cleanUrl = window.location.pathname;
    router.replace(cleanUrl);

    // Poll until on-chain confirmed
    setStep('confirming');
    pollVerificationStatus(address, 40, 3000).then((verified) => {
      if (verified) {
        setStep('done');
        inProgress.current = false;
        setTimeout(() => onVerified(), 500);
      } else {
        setError(
          'On-chain confirmation timed out. Your scan may still be processing — click "Check My Status" to try again.'
        );
        setStep('idle');
        inProgress.current = false;
      }
    });
  }, [returnedFromGoodDollar, address, isCheckingStatus, onVerified, router]);

  // ── Manual re-check ───────────────────────────────────────────────────────
  const handleManualCheck = useCallback(async () => {
    if (!address) return;
    setError(null);
    setStep('confirming');
    const verified = await pollVerificationStatus(address, 10, 2000);
    setStep('idle');
    if (verified) onVerified();
    else setError('Still not confirmed. Please wait a moment and try again, or restart the scan.');
  }, [address, onVerified]);

  // ── Main verification flow ────────────────────────────────────────────────
  const handleVerification = async () => {
    if (!address || !isConnected) { setError('Please connect your wallet first.'); return; }
    if (!sdk) { setError(sdkError || 'SDK still loading — please wait.'); return; }
    if (inProgress.current) return;

    inProgress.current = true;
    setError(null);
    setAttemptCount((c) => c + 1);

    try {
      // callbackUrl = current page — GoodDollar will redirect back here
      const callbackUrl = window.location.origin + window.location.pathname;

      // Step 1: Get signature from MetaMask (no gas)
      setStep('waiting-signature');

      // popupMode = false → generates a redirect URL instead of a popup URL
      const verificationLink = await sdk.generateFVLink(false, callbackUrl, 42220);

      // Step 2: Redirect current tab to GoodDollar's face scan page
      setStep('redirecting');

      // Small delay so the user sees the "redirecting" message
      await new Promise((r) => setTimeout(r, 600));
      window.location.href = verificationLink;

      // (Execution stops here — the tab navigates away)

    } catch (err: any) {
      const msg: string = err?.message || '';
      console.error('Face verification error:', err);

      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('user denied')) {
        setError('You declined the MetaMask signature. Please approve it — it does not cost gas.');
      } else if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('timed out')) {
        setError('MetaMask signature timed out. Please try again.');
      } else {
        setError(msg || 'Failed to start verification. Please try again.');
      }

      setStep('idle');
      inProgress.current = false;
    }
  };

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (isCheckingStatus) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center gap-3">
            <svg className="animate-spin h-8 w-8 text-green-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-white font-medium">Checking verification status…</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirming state (after redirect return) ──────────────────────────────
  if (step === 'confirming' || step === 'returned') {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-5xl mb-4">⛓️</div>
          <h2 className="text-xl font-bold text-white mb-2">Confirming on-chain...</h2>
          <p className="text-slate-400 text-sm mb-6">
            Your face scan is complete! Waiting for GoodDollar to update the blockchain.
            This usually takes 30–90 seconds.
          </p>
          <div className="flex items-center justify-center gap-2 text-green-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm font-medium">Waiting for on-chain confirmation…</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Redirecting state ─────────────────────────────────────────────────────
  if (step === 'redirecting') {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-5xl mb-4">🚀</div>
          <h2 className="text-xl font-bold text-white mb-2">Redirecting to GoodDollar...</h2>
          <p className="text-slate-400 text-sm">
            You're being taken to GoodDollar's face scan page. After completing the scan,
            you'll be automatically returned to GoodCommit.
          </p>
        </div>
      </div>
    );
  }

  const isActive = step !== 'idle';
  const isWaitingForMetaMask = step === 'waiting-signature';

  // ── Main modal ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-8 shadow-2xl">

        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-500/30 flex items-center justify-center">
            <span className="text-3xl">
              {isWaitingForMetaMask ? '🦊' : '🔐'}
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mb-1">
            {isWaitingForMetaMask ? 'Approve in MetaMask' : 'Verify Your Identity'}
          </h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            {isWaitingForMetaMask
              ? 'MetaMask is asking for a signature. This is free — no gas, no transaction.'
              : 'One-time GoodDollar face scan. You\'ll be redirected back automatically after.'}
          </p>
        </div>

        {/* MetaMask prompt */}
        {isWaitingForMetaMask && (
          <div className="bg-orange-500/15 border-2 border-orange-400/60 rounded-xl p-4 mb-4 text-center">
            <p className="text-orange-300 font-bold text-sm mb-1">🦊 Check MetaMask</p>
            <p className="text-orange-200/80 text-xs">
              Click the <strong>MetaMask icon</strong> in your browser toolbar if you don't see the popup. Then click <strong>"Sign"</strong>.
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

        {/* How it works callout */}
        {step === 'idle' && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4">
            <p className="text-blue-300 text-xs text-center">
              📋 You'll be redirected to GoodDollar's scan page, then brought back here automatically.
            </p>
          </div>
        )}

        {/* SDK warnings */}
        {!sdk && !sdkError && step === 'idle' && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-4">
            <p className="text-yellow-300 text-xs text-center">⏳ Connecting to GoodDollar on Celo mainnet...</p>
          </div>
        )}
        {sdkError && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 mb-4">
            <p className="text-orange-300 text-xs text-center">{sdkError}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
            <p className="text-red-400 text-sm text-center">{error}</p>
            {attemptCount > 0 && step === 'idle' && (
              <button
                onClick={handleManualCheck}
                className="mt-2 w-full text-xs text-blue-400 hover:text-blue-300 underline transition-colors"
              >
                I completed the scan — check my status again
              </button>
            )}
          </div>
        )}

        {/* CTA Button */}
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
              Waiting for MetaMask signature...
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

/**
 * Exported wrapper — FaceVerificationInner uses useSearchParams which
 * requires a Suspense boundary in Next.js App Router.
 */
export default function FaceVerification({ onVerified }: FaceVerificationProps) {
  return (
    <Suspense fallback={null}>
      <FaceVerificationInner onVerified={onVerified} />
    </Suspense>
  );
}