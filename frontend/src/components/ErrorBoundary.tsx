"use client";

import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Top-level error boundary.
 * Wraps the entire app in layout.tsx so that any unhandled client exception
 * (e.g. WalletConnect throwing on bad projectId) shows a helpful message
 * instead of a white screen.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const isWCError =
      this.state.message.includes('Allowlist') ||
      this.state.message.includes('reown') ||
      this.state.message.includes('WalletConnect');

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-lg w-full p-8 shadow-2xl text-center">
          <div className="text-5xl mb-4">{isWCError ? '🔌' : '⚠️'}</div>
          <h2 className="text-2xl font-bold text-white mb-3">
            {isWCError ? 'WalletConnect Configuration Issue' : 'Something went wrong'}
          </h2>

          {isWCError ? (
            <div className="text-left space-y-3 text-sm text-slate-400 mb-6">
              <p>Your WalletConnect Project ID needs to be configured:</p>
              <ol className="list-decimal list-inside space-y-2 text-slate-300">
                <li>
                  Go to{' '}
                  <a
                    href="https://cloud.reown.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 underline"
                  >
                    cloud.reown.com
                  </a>
                </li>
                <li>Open your project → Allowed Origins</li>
                <li>
                  Add <code className="bg-slate-800 px-1 rounded">http://localhost:3000</code> and{' '}
                  <code className="bg-slate-800 px-1 rounded">https://good-commit.netlify.app</code>
                </li>
                <li>
                  Add to <code className="bg-slate-800 px-1 rounded">frontend/.env.local</code>:
                  <pre className="bg-slate-800 p-2 rounded mt-1 text-xs overflow-x-auto">
                    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_id_here
                  </pre>
                </li>
                <li>Restart the dev server</li>
              </ol>
            </div>
          ) : (
            <p className="text-slate-400 text-sm mb-6">{this.state.message}</p>
          )}

          <button
            onClick={() => {
              this.setState({ hasError: false, message: '' });
              window.location.reload();
            }}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 rounded-xl hover:shadow-lg transition-all"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}
