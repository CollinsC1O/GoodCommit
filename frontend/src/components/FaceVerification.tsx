"use client";

import { useState, useEffect, useRef } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { IdentitySDK } from '@goodsdks/citizen-sdk';

interface FaceVerificationProps {
  onVerified: () => void;
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Polls the backend /api/verify/status/:address endpoint (on-chain read)
 * until verified is true, or we exhaust maxAttempts.
 */
async function waitForOnChainVerification(
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
      // Network hiccup — keep polling
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

export default function FaceVerification({ onVerified }: FaceVerificationProps) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [identitySDK, setIdentitySDK] = useState<IdentitySDK | null>(null);
  const [statusMessage, setStatusMessage] = useState('Checking verification status...');

  // Prevent double-invocations from StrictMode / re-renders
  const verificationInProgress = useRef(false);

  // ── Initialise the GoodDollar SDK ──────────────────────────────────────────
  useEffect(() => {
    if (!publicClient || !walletClient) return;

    IdentitySDK.init({
      publicClient: publicClient as any,
      walletClient: walletClient as any,
      env: 'production',
    })
      .then(setIdentitySDK)
      .catch((err) => {
        console.error('IdentitySDK init error:', err);
        setError('Failed to initialise verification SDK');
      });
  }, [publicClient, walletClient]);

  // ── On mount: ask the backend whether this address is already verified ─────
  useEffect(() => {
    if (!address || !isConnected) {
      setIsCheckingStatus(false);
      return;
    }

    let cancelled = false;

    fetch(`${BACKEND_URL}/api/verify/status/${address}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.verified) {
          onVerified();
        }
      })
      .catch(() => {
        // Backend unreachable — let user try manually
      })
      .finally(() => {
        if (!cancelled) setIsCheckingStatus(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, isConnected, onVerified]);

  // ── Start GoodDollar face-verification popup ───────────────────────────────
  const handleVerification = async () => {
    if (!address || !isConnected || !identitySDK) {
      setError('Please connect your wallet first');
      return;
    }
    if (verificationInProgress.current) return;

    verificationInProgress.current = true;
    setIsVerifying(true);
    setError(null);

    try {
      const callbackUrl = window.location.origin + window.location.pathname;
      const verificationLink = await identitySDK.generateFVLink(
        true,        // popup mode
        callbackUrl,
        42220        // Celo mainnet chainId
      );

      const width = 500;
      const height = 700;
      const left = Math.round(window.screen.width / 2 - width / 2);
      const top = Math.round(window.screen.height / 2 - height / 2);

      const popup = window.open(
        verificationLink,
        'GoodDollar Face Verification',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );

      if (!popup) {
        setError('Please allow pop-ups for this site in your browser settings.');
        setIsVerifying(false);
        verificationInProgress.current = false;
        return;
      }

      // ── Watch for popup closure ────────────────────────────────────────────
      const watchPopup = setInterval(async () => {
        if (!popup.closed) return;

        clearInterval(watchPopup);

        // GoodDollar's whitelist update is async — poll the backend until it
        // propagates on-chain (or we time out after ~60 seconds).
        setStatusMessage(
          'Verifying on-chain… this may take up to 60 seconds.'
        );

        const verified = await waitForOnChainVerification(address);

        if (verified) {
          setIsVerifying(false);
          verificationInProgress.current = false;
          onVerified();
        } else {
          setError(
            'Verification could not be confirmed on-chain. ' +
              'Please complete the full verification in the popup and try again.'
          );
          setIsVerifying(false);
          verificationInProgress.current = false;
        }
      }, 500);

      // Safety timeout — close popup and stop polling after 10 minutes
      setTimeout(() => {
        clearInterval(watchPopup);
        if (!popup.closed) popup.close();
        if (verificationInProgress.current) {
          setError('Verification timed out. Please try again.');
          setIsVerifying(false);
          verificationInProgress.current = false;
        }
      }, 10 * 60 * 1000);
    } catch (err: any) {
      console.error('Verification error:', err);
      setError(err.message || 'Failed to start verification. Please try again.');
      setIsVerifying(false);
      verificationInProgress.current = false;
    }
  };

  // ── Loading spinner while we check existing status ─────────────────────────
  if (isCheckingStatus) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md">
          <div className="flex items-center justify-center gap-3">
            <svg className="animate-spin h-8 w-8 text-green-400" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-white font-medium">Checking verification status…</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Main modal ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-500/30 flex items-center justify-center">
            <span className="text-4xl">🔐</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Verification Required</h2>
          <p className="text-slate-400 text-sm">
            Complete GoodDollar Face Verification to access GoodCommit. This prevents bots and
            ensures fair play.
          </p>
        </div>

        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-6 mb-6">
          <div className="space-y-3 text-sm">
            {[
              'One unique human = one account',
              'Prevents bot exploitation',
              'Powered by GoodDollar protocol',
              'Your privacy is protected',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-slate-300">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        <button
          onClick={handleVerification}
          disabled={isVerifying || !address || !isConnected || !identitySDK}
          className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:shadow-lg hover:shadow-green-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isVerifying ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Waiting for Verification…
            </span>
          ) : (
            'Start Face Verification'
          )}
        </button>

        {isVerifying && (
          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <p className="text-xs text-blue-300 text-center">{statusMessage}</p>
          </div>
        )}

        <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <p className="text-xs text-yellow-200 text-center font-medium">
            ⚠️ Verification is mandatory to access GoodCommit
          </p>
        </div>

        <p className="text-xs text-slate-500 text-center mt-4">
          By verifying, you agree to GoodDollar's terms of service
        </p>
      </div>
    </div>
  );
}
