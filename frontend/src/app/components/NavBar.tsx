"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WalletConnectButton from './WalletConnectButton';
import PointsDisplay from './PointsDisplay';
import AccumulatedPoints from './AccumulatedPoints';

export default function NavBar() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/health', label: 'Fitness', icon: '🏃' },
    { href: '/academics', label: 'Academics', icon: '📚' },
    { href: '/achievements', label: 'Achievements', icon: '🏆' },
  ];

  return (
    <nav className="relative z-50 w-full border-b border-white/10 bg-slate-950/50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 min-h-16 sm:min-h-20">
        {/* Mobile logo row - centered above on <480px */}
        <div className="flex justify-start md:hidden mb-1.5">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-tr from-green-400 to-emerald-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center">
              <span className="text-white font-bold text-xl leading-none pt-0.5">🌱</span>
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
              GoodCommit
            </span>
          </Link>
        </div>

        {/* Main row - left-aligned on mobile, pushed apart on larger screens */}
        <div className="flex items-center md:justify-between gap-2 sm:gap-4 overflow-x-auto scrollbar-none">
          {/* Left side: Logo + Desktop nav links */}
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="hidden md:flex items-center gap-2 shrink-0"
            >
              <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-tr from-green-400 to-emerald-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center">
                <span className="text-white font-bold text-xl leading-none pt-0.5">🌱</span>
              </div>
              <span className="truncate text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
                GoodCommit
              </span>
            </Link>
            <div className="hidden xl:flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {link.icon} {link.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right side: Mobile nav icons + Points + Wallet */}
          <div className="flex min-w-0 shrink-0 items-center justify-end gap-1 sm:gap-3">
            <div className="xl:hidden flex items-center gap-0.5 sm:gap-1 shrink-0">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`p-1.5 sm:p-2 rounded-lg text-sm transition-all ${
                      isActive ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-white'
                    }`}
                    title={link.label}
                  >
                    {link.icon}
                  </Link>
                );
              })}
            </div>
            <AccumulatedPoints />
            <PointsDisplay />
            <WalletConnectButton />
          </div>
        </div>
      </div>
    </nav>
  );
}
