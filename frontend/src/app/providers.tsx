"use client";

import * as React from 'react';
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import { celo, celoAlfajores } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import '@rainbow-me/rainbowkit/styles.css';

/**
 * WalletConnect / Reown Project ID.
 *
 * ACTION REQUIRED — you MUST do ONE of these two things:
 *
 * Option A (recommended — free, 2 minutes):
 *   1. Go to https://cloud.reown.com
 *   2. Sign in and open your project (or create a new one)
 *   3. Under "Allowed Origins / Allowlist" add:
 *        http://localhost:3000
 *        https://good-commit.netlify.app
 *   4. Copy the Project ID into your frontend/.env.local:
 *        NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
 *   Changes take up to 15 minutes to propagate.
 *
 * Option B (quick test only — WalletConnect QR disabled):
 *   Leave the env var empty — the app will use injected wallets only
 *   (MetaMask browser extension still works perfectly).
 *
 * The current hardcoded ID `afc3dced...` has a broken allowlist and crashes
 * the app on every page load — that's the root cause of your white screen.
 */
const PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

/**
 * Suppress the WalletConnect "Origin not found on Allowlist" console error.
 * Without this, even a console error from WC can bubble into a Next.js
 * unhandled exception and white-screen the entire app in development mode.
 */
if (typeof window !== 'undefined') {
  const _origError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('not found on Allowlist') ||
      msg.includes('cloud.reown.com') ||
      msg.includes('WalletConnect') && msg.includes('allowlist')
    ) {
      // Log a friendlier message instead of crashing
      console.warn(
        '[WalletConnect] Origin not in allowlist — add http://localhost:3000 ' +
        'and https://good-commit.netlify.app at cloud.reown.com. ' +
        'WalletConnect QR disabled until then; browser extension wallets still work.'
      );
      return;
    }
    _origError(...args);
  };
}

const config = getDefaultConfig({
  appName: 'GoodCommit',
  projectId: PROJECT_ID || 'placeholder-no-wc-qr', // placeholder disables QR gracefully
  chains: [celo, celoAlfajores],
  ssr: true,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on error — avoids cascading WC errors
      retry: false,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#10b981',
            accentColorForeground: 'white',
            borderRadius: 'large',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}