import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <header className="mb-16 text-center">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6">
          Grow your <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">Habit Garden</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Stake G$ on yourself. Build real-world healthy habits, prove you did the work, and harvest daily yields. 
          Fail, and your stake funds the global UBI pool.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12 max-w-5xl mx-auto">
        
        {/* Health & Fitness Card */}
        <Link href="/health" className="group relative block p-[1px] rounded-3xl overflow-hidden transition-all hover:scale-[1.02]">
          <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-blue-600 opacity-50 group-hover:opacity-100 transition-opacity" />
          <div className="relative h-full bg-slate-900/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-start border border-white/10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center text-4xl mb-6 shadow-xl shadow-green-500/10">
              🏃‍♂️
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Health & Fitness</h2>
            <p className="text-slate-400 mb-8 flex-1">
              Commit to your daily step count or gym routine. Prove your sweat with real-time validated selfies or GPS tracking.
            </p>
            <div className="flex items-center text-green-400 font-medium group-hover:translate-x-1 transition-transform">
              Plant a Seed →
            </div>
          </div>
        </Link>

        {/* Academics Card */}
        <Link href="/academics" className="group relative block p-[1px] rounded-3xl overflow-hidden transition-all hover:scale-[1.02]">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 opacity-50 group-hover:opacity-100 transition-opacity" />
          <div className="relative h-full bg-slate-900/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-start border border-white/10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center text-4xl mb-6 shadow-xl shadow-purple-500/10">
              📚
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Academics (ExamEdge)</h2>
            <p className="text-slate-400 mb-8 flex-1">
              Struggle to study? Take daily timed AI-quizzes based on your syllabus. No tab-switching allowed. Grow smarter, grow richer.
            </p>
            <div className="flex items-center text-purple-400 font-medium group-hover:translate-x-1 transition-transform">
              Plant a Seed →
            </div>
          </div>
        </Link>
        
      </div>
    </div>
  );
}
