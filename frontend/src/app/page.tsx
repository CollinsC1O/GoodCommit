"use client";

import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useFaceVerification } from '@/hooks/useFaceVerification';
import FaceVerification from '@/components/FaceVerification';

export default function Home() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const {
    isVerified,
    isLoading,
    isPending,
    markAsVerified,
    markAsPending,
  } = useFaceVerification();

  const handleHabitClick = (route: string) => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    // Block navigation while loading or pending — verification state unknown
    if (isLoading || isPending) return;
    if (!isVerified) {
      alert('Please complete face verification first');
      return;
    }
    router.push(route);
  };

  // ── Modal visibility logic ─────────────────────────────────────────────────
  // Only show the verification modal when we are CERTAIN the user is not verified.
  // isLoading  → still checking, don't flash the modal
  // isPending  → user already went to GoodDollar and returned, FaceVerification
  //              is handling the confirmation polling itself — don't show modal
  // isVerified → user is good, no modal needed
  const showVerificationModal = isConnected && !isLoading && !isPending && !isVerified;

  // isPending overlay is shown here in page.tsx ONLY as a fallback — in practice
  // FaceVerification.tsx handles the confirming UI itself once it mounts. This
  // overlay covers the brief gap between page load and the component mounting.
  const showPendingOverlay = isConnected && isPending && !showVerificationModal;

  // Cards are clickable only when fully verified. While loading/pending,
  // disable them but don't show "verify first" text (state is still resolving).
  const cardsDisabled = isConnected && (!isVerified || isLoading || isPending);
  const cardCta = (color: string) => {
    if (!isConnected) return `Plant a Seed →`;
    if (isLoading)    return '⏳ Checking…';
    if (isPending)    return '⛓️ Confirming…';
    if (!isVerified)  return '🔐 Verify First';
    return `Plant a Seed →`;
  };

  return (
    <>
      {/* ── Face Verification Modal ───────────────────────────────────────── */}
      {showVerificationModal && (
        <FaceVerification
          onVerified={markAsVerified}
          onPending={markAsPending}
        />
      )}

      {/* ── Pending overlay (gap cover while FaceVerification mounts) ─────── */}
      {showPendingOverlay && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4 text-center">
            <div className="text-5xl mb-4">⛓️</div>
            <h2 className="text-xl font-bold text-white mb-2">Confirming verification…</h2>
            <p className="text-slate-400 text-sm mb-6">
              Your face scan is being recorded on the blockchain. This usually takes 30–90 seconds.
            </p>
            <div className="flex items-center justify-center gap-2 text-green-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm font-medium">Waiting on-chain…</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <header className="mb-16 text-center">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 text-slate-900 dark:text-white">
            Grow your{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
              Habit Garden
            </span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Stake G$ on yourself. Build real-world healthy habits, prove you did the work, and
            harvest daily yields. Fail, and your stake funds the global UBI pool.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12 max-w-5xl mx-auto">

          {/* Health & Fitness Card */}
          <button
            onClick={() => handleHabitClick('/health')}
            disabled={cardsDisabled}
            className="group relative block p-[1px] rounded-3xl overflow-hidden transition-all hover:scale-[1.02] text-left w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-blue-600 opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="relative h-full bg-slate-900/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-start border border-white/10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center text-4xl mb-6 shadow-xl shadow-green-500/10">
                🏃‍♂️
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Health &amp; Fitness</h2>
              <p className="text-slate-400 mb-8 flex-1">
                Commit to your daily step count or gym routine. Prove your sweat with real-time
                validated selfies or GPS tracking.
              </p>
              <div className="flex items-center text-green-400 font-medium group-hover:translate-x-1 transition-transform">
                {cardCta('green')}
              </div>
            </div>
          </button>

          {/* Academics Card */}
          <button
            onClick={() => handleHabitClick('/academics')}
            disabled={cardsDisabled}
            className="group relative block p-[1px] rounded-3xl overflow-hidden transition-all hover:scale-[1.02] text-left w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="relative h-full bg-slate-900/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-start border border-white/10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center text-4xl mb-6 shadow-xl shadow-purple-500/10">
                📚
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Academics (ExamEdge)</h2>
              <p className="text-slate-400 mb-8 flex-1">
                Struggle to study? Take daily timed AI-quizzes based on your syllabus. No
                tab-switching allowed. Grow smarter, grow richer.
              </p>
              <div className="flex items-center text-purple-400 font-medium group-hover:translate-x-1 transition-transform">
                {cardCta('purple')}
              </div>
            </div>
          </button>

        </div>

        {!isConnected && (
          <div className="text-center mt-16">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Connect your wallet above to get started
            </p>
          </div>
        )}
      </div>
    </>
  );
}
