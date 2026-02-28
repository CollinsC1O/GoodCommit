"use client";

import Link from 'next/link';

export default function AcademicsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <Link href="/" className="text-sm font-medium text-slate-400 hover:text-white mb-8 inline-flex items-center gap-2 transition-colors">
        ← Back to Garden
      </Link>
      
      <div className="flex flex-col md:flex-row gap-12 items-start mt-4">
        <div className="flex-1">
          <div className="inline-block px-3 py-1 mb-4 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-semibold tracking-wide uppercase">
            Academics
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 text-white">
            Learn and <span className="bg-clip-text text-gradient bg-gradient-to-r from-purple-400 to-pink-600">Flourish</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed mb-8">
            Lock in your G$ and take daily, AI-generated quizzes to prepare for exams. Stay focused—tab switching will instantly slash your stake.
          </p>
          
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Plant a new Seed</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Subject / Exam Type</label>
                <select className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none">
                  <option>JAMB - Mathematics</option>
                  <option>WAEC - Physics</option>
                  <option>University Syllabus (Custom Upload)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Select Duration</label>
                <div className="flex gap-3">
                  {['7 Days', '14 Days', '30 Days'].map((days, i) => (
                    <button key={days} className={`flex-1 py-3 rounded-xl border font-medium transition-all ${i === 2 ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-slate-800/50 border-white/5 text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                      {days}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">G$ Stake Amount</label>
                <input 
                  type="number" 
                  defaultValue="1000"
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 placeholder-slate-600 transition-all font-mono text-lg"
                />
              </div>
              
              <button className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold text-lg py-4 rounded-xl mt-4 hover:shadow-lg hover:shadow-purple-500/25 transition-all active:scale-[0.98]">
                Approve & Plant Seed 🌱
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full bg-slate-900/50 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5" />
          
          <div className="relative z-10 text-center">
            <div className="w-32 h-32 mx-auto bg-slate-800 rounded-full border-4 border-slate-700 flex items-center justify-center shadow-inner mb-6 relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-t from-purple-900/40 to-transparent" />
               <span className="text-6xl z-10">📖</span>
            </div>
            <h4 className="text-xl font-semibold text-slate-300">Ready to Study</h4>
            <p className="text-sm text-slate-500 mt-2">10 Questions / Day</p>
          </div>
        </div>
      </div>
    </div>
  );
}
