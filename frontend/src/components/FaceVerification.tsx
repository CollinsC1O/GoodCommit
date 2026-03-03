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
  const [showIframe, setShowIframe] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const handleVerification = async () => {
    if (!address) {
      setError('Please connect your wallet first');
      return;
    }

    setIsVerifying(true);
    setError(null);
    setIframeError(false);
    setShowIframe(true);
  };

  const handleVerificationSuccess = () => {
    if (address) {
      // Store verification status in localStorage
      localStorage.setItem(`fv_verified_${address}`, 'true');
      localStorage.setItem(`fv_timestamp_${address}`, Date.now().toString());
      
      setIsVerifying(false);
      setShowIframe(false);
      onVerified();
    }
  };

  const handleVerificationError = (errorMsg: string) => {
    setError(errorMsg || 'Verification failed. Please try again.');
    setIsVerifying(false);
    setShowIframe(false);
  };

  const handleOpenInNewTab = () => {
    if (address) {
      // Open verification in new tab
      const verificationUrl = `https://verify.gooddollar.org/?walletAddress=${address}`;
      window.open(verificationUrl, '_blank', 'noopener,noreferrer');
      
      // Show instructions
      setError('Please complete verification in the new tab, then click "I\'ve Verified" below.');
    }
  };

  const handleManualVerificationConfirm = () => {
    if (address) {
      // Store verification status
      localStorage.setItem(`fv_verified_${address}`, 'true');
      localStorage.setItem(`fv_timestamp_${address}`, Date.now().toString());
      
      setIsVerifying(false);
      setShowIframe(false);
      setError(null);
      onVerified();
    }
  };

  const handleSkipVerification = () => {
    if (address) {
      // Temporary skip - store with flag
      localStorage.setItem(`fv_verified_${address}`, 'skipped');
      localStorage.setItem(`fv_timestamp_${address}`, Date.now().toString());
      
      setIsVerifying(false);
      setShowIframe(false);
      setError(null);
      onVerified();
    }
  };

  useEffect(() => {
    if (!showIframe) return;

    // Set timeout to detect if iframe fails to load
    const timeout = setTimeout(() => {
      setIframeError(true);
      setError('Unable to load verification service. Please try opening in a new tab.');
    }, 10000); // 10 second timeout

    // Listen for messages from iframe
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === 'https://verify.gooddollar.org') {
        clearTimeout(timeout);
        if (event.data.type === 'fv-success') {
          handleVerificationSuccess();
        } else if (event.data.type === 'fv-error') {
          handleVerificationError(event.data.message);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('message', handleMessage);
    };
  }, [showIframe, address]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {showIframe ? (
        <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden">
          <div className="bg-slate-800 px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">GoodDollar Face Verification</h2>
            <button
              onClick={() => {
                setShowIframe(false);
                setIsVerifying(false);
                setIframeError(false);
              }}
              className="text-slate-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
          
          {iframeError ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 border-2 border-red-500/30 flex items-center justify-center">
                <span className="text-3xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Connection Issue</h3>
              <p className="text-slate-400 mb-6">
                We're having trouble connecting to the verification service. This might be due to network issues or browser restrictions.
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={handleOpenInNewTab}
                  className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-bold py-3 rounded-xl hover:shadow-lg transition-all"
                >
                  Open Verification in New Tab
                </button>
                
                {error && error.includes("I've Verified") && (
                  <button
                    onClick={handleManualVerificationConfirm}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 rounded-xl hover:shadow-lg transition-all"
                  >
                    I've Verified - Continue
                  </button>
                )}
                
                <button
                  onClick={handleSkipVerification}
                  className="w-full bg-slate-700 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-600 transition-all"
                >
                  Skip for Now (Verify Later)
                </button>
              </div>
              
              {error && (
                <p className="text-sm text-slate-500 mt-4">{error}</p>
              )}
            </div>
          ) : (
            <div className="relative" style={{ height: '600px' }}>
              <iframe
                src={`https://verify.gooddollar.org/?walletAddress=${address}`}
                className="w-full h-full"
                allow="camera"
                title="GoodDollar Face Verification"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                onError={() => {
                  setIframeError(true);
                  setError('Failed to load verification service.');
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-slate-800/90 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <svg className="animate-spin h-6 w-6 text-green-400" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-white font-medium">Loading verification...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-500/30 flex items-center justify-center">
              <span className="text-4xl">🔐</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Face Verification Required</h2>
            <p className="text-slate-400 text-sm">
              GoodCommit requires Face Verification to prevent bots and ensure fair play. This is a one-time verification.
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

          <div className="space-y-3">
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
                  Verifying...
                </span>
              ) : (
                'Start Face Verification'
              )}
            </button>

            <button
              onClick={handleOpenInNewTab}
              disabled={!address}
              className="w-full bg-slate-700 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Open in New Tab Instead
            </button>
          </div>

          <p className="text-xs text-slate-500 text-center mt-4">
            By verifying, you agree to GoodDollar's terms of service
          </p>
        </div>
      )}
    </div>
  );
}
