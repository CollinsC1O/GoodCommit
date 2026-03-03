"use client";

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface FaceVerificationProps {
  onVerified: () => void;
}

export default function FaceVerification({ onVerified }: FaceVerificationProps) {
  const { address } = useAccount();
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  // Check verification status on mount
  useEffect(() => {
    const checkVerificationStatus = async () => {
      if (!address) {
        setIsCheckingStatus(false);
        return;
      }

      try {
        // Check localStorage first
        const verified = localStorage.getItem(`fv_verified_${address}`);
        const timestamp = localStorage.getItem(`fv_timestamp_${address}`);
        
        if (verified === 'true' && timestamp) {
          const verifiedDate = parseInt(timestamp);
          const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
          const isStillValid = Date.now() - verifiedDate < thirtyDaysInMs;
          
          if (isStillValid) {
            onVerified();
            return;
          }
        }
      } catch (err) {
        console.error('Error checking verification status:', err);
      } finally {
        setIsCheckingStatus(false);
      }
    };

    checkVerificationStatus();
  }, [address, onVerified]);

  // Listen for verification callback
  useEffect(() => {
    const handleVerificationCallback = (event: MessageEvent) => {
      // Accept messages from GoodDollar domains
      if (event.origin.includes('gooddollar.org') || event.origin.includes('gooddollar')) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          
          if (data.isVerified === true || data.type === 'fv-success') {
            // Verification successful
            if (address) {
              localStorage.setItem(`fv_verified_${address}`, 'true');
              localStorage.setItem(`fv_timestamp_${address}`, Date.now().toString());
              setIsVerifying(false);
              setError(null);
              onVerified();
            }
          } else if (data.isVerified === false || data.type === 'fv-error') {
            // Verification failed
            setError(data.reason || data.message || 'Verification failed. Please try again.');
            setIsVerifying(false);
          }
        } catch (err) {
          console.error('Error parsing verification callback:', err);
        }
      }
    };

    window.addEventListener('message', handleVerificationCallback);
    
    return () => {
      window.removeEventListener('message', handleVerificationCallback);
    };
  }, [address, onVerified]);

  const handleVerification = async () => {
    if (!address) {
      setError('Please connect your wallet first');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      // Construct the GoodDollar face verification URL
      // Based on GoodDollar's verification flow
      const baseUrl = 'https://wallet.gooddollar.org';
      const callbackUrl = encodeURIComponent(window.location.origin + window.location.pathname);
      
      // Build verification URL with parameters
      const verificationUrl = `${baseUrl}/?web3Provider=true&walletAddress=${address}&callback=${callbackUrl}`;
      
      // Open in popup window
      const width = 500;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        verificationUrl,
        'GoodDollar Face Verification',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );
      
      if (!popup) {
        setError('Please allow popups for this site to complete verification. Check your browser settings.');
        setIsVerifying(false);
        return;
      }

      // Monitor popup closure
      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed);
          
          // Check if verification was completed
          setTimeout(() => {
            const verified = localStorage.getItem(`fv_verified_${address}`);
            if (verified !== 'true' && isVerifying) {
              setError('Verification window was closed. Please try again to complete verification.');
              setIsVerifying(false);
            }
          }, 1000);
        }
      }, 500);

      // Cleanup after 10 minutes
      setTimeout(() => {
        clearInterval(checkPopupClosed);
        if (popup && !popup.closed) {
          popup.close();
        }
        if (isVerifying) {
          const verified = localStorage.getItem(`fv_verified_${address}`);
          if (verified !== 'true') {
            setError('Verification timed out. Please try again.');
            setIsVerifying(false);
          }
        }
      }, 10 * 60 * 1000);

    } catch (err: any) {
      console.error('Verification error:', err);
      setError('Failed to start verification. Please try again.');
      setIsVerifying(false);
    }
  };

  if (isCheckingStatus) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md">
          <div className="flex items-center justify-center gap-3">
            <svg className="animate-spin h-8 w-8 text-green-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-white font-medium">Checking verification status...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-500/30 flex items-center justify-center">
            <span className="text-4xl">🔐</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Verification Required</h2>
          <p className="text-slate-400 text-sm">
            Complete Face Verification with GoodDollar to access GoodCommit. This prevents bots and ensures fair play.
          </p>
        </div>

        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-6 mb-6">
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-green-400 mt-0.5">✓</span>
              <span className="text-slate-300">One unique human = one account</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-400 mt-0.5">✓</span>
              <span className="text-slate-300">Prevents bot exploitation</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-400 mt-0.5">✓</span>
              <span className="text-slate-300">Powered by GoodDollar protocol</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-400 mt-0.5">✓</span>
              <span className="text-slate-300">Your privacy is protected</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        <button
          onClick={handleVerification}
          disabled={isVerifying || !address}
          className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:shadow-lg hover:shadow-green-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isVerifying ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Waiting for Verification...
            </span>
          ) : (
            'Start Face Verification'
          )}
        </button>

        {isVerifying && (
          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <p className="text-xs text-blue-300 text-center">
              A popup window has opened. Complete the verification there and this page will update automatically.
            </p>
          </div>
        )}

        <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <p className="text-xs text-yellow-200 text-center font-medium">
            ⚠️ Verification is mandatory - you cannot proceed without completing it
          </p>
        </div>

        <p className="text-xs text-slate-500 text-center mt-4">
          By verifying, you agree to GoodDollar's terms of service
        </p>
      </div>
    </div>
  );
}
