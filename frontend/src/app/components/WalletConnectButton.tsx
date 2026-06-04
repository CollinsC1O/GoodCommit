'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function WalletConnectButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return (
            <div className="h-9 w-20 shrink-0 rounded-full bg-slate-800/80 border border-white/5" />
          );
        }

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="h-9 shrink-0 rounded-full bg-emerald-500 px-3 sm:px-4 text-xs sm:text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 active:scale-95"
            >
              Connect
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="h-9 shrink-0 rounded-full bg-red-500/20 px-3 sm:px-4 text-xs sm:text-sm font-bold text-red-200 border border-red-500/40 transition hover:bg-red-500/30 active:scale-95"
            >
              Network
            </button>
          );
        }

        return (
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={openChainModal}
              className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full bg-slate-800/80 px-3 text-xs font-semibold text-slate-200 border border-white/5 transition hover:bg-slate-800 sm:flex"
            >
              {chain.hasIcon && chain.iconUrl ? (
                <span
                  className="h-4 w-4 rounded-full bg-slate-700"
                  style={{ backgroundImage: `url(${chain.iconUrl})`, backgroundSize: 'cover' }}
                />
              ) : null}
              <span className="max-w-24 truncate">{chain.name}</span>
            </button>

            <button
              type="button"
              onClick={openAccountModal}
              className="h-9 max-w-24 shrink-0 truncate rounded-full bg-slate-800/80 px-3 sm:max-w-36 sm:px-4 text-xs sm:text-sm font-bold text-white border border-white/5 transition hover:bg-slate-800 active:scale-95"
            >
              {account.displayName}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
