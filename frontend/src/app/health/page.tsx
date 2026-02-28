"use client";

import Link from 'next/link';

export default function HealthPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <Link href="/" className="text-sm font-medium text-slate-400 hover:text-white mb-8 inline-flex items-center gap-2 transition-colors">
        ← Back to Garden
      </Link>
      
      <div className="flex flex-col md:flex-row gap-12 items-start mt-4">
        <div className="flex-1">
          <div className="inline-block px-3 py-1 mb-4 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-semibold tracking-wide uppercase">
            Health & Fitness
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 text-white">
            Sweat for your <span className="bg-clip-text text-gradient bg-gradient-to-r from-green-400 to-emerald-600">Rewards</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed mb-8">
            Stake your G$, set a daily physical goal, and start growing your fitness plant. Using secure mobile sensors, we verify your activity so you stay accountable.
          </p>
          
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Plant a new Seed</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Select Duration</label>
                <div className="flex gap-3">
                  {['7 Days', '14 Days', '30 Days'].map((days, i) => (
                    <button key={days} className={`flex-1 py-3 rounded-xl border font-medium transition-all ${i === 0 ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-slate-800/50 border-white/5 text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                      {days}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">G$ Stake Amount</label>
                <input 
                  type="number" 
                  defaultValue="500"
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 placeholder-slate-600 transition-all font-mono text-lg"
                />
              </div>
              
              <button className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg py-4 rounded-xl mt-4 hover:shadow-lg hover:shadow-green-500/25 transition-all active:scale-[0.98]">
                Approve & Plant Seed 🌱
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full bg-slate-900/50 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5" />
          
          {/* Mock Garden Plot */}
          <div className="relative z-10 text-center">
            <div className="w-32 h-32 mx-auto bg-slate-800 rounded-full border-4 border-slate-700 flex items-center justify-center shadow-inner mb-6 relative">
               <div className="absolute inset-0 rounded-full bg-gradient-to-br from-green-500/10 to-transparent" />
               <span className="text-6xl opacity-50 blur-[2px] filter grayscale">🌱</span>
            </div>
            <h4 className="text-xl font-semibold text-slate-300">Empty Plot</h4>
            <p className="text-sm text-slate-500 mt-2">Ready for a new habit</p>
          </div>
        </div>
      </div>
    </div>
  );
}
