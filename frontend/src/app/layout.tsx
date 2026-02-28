import type { Metadata } from 'next'
import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GoodCommit | The Habit Garden',
  description: 'Stake on yourself, grow your Habit Plant, and earn G$',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden`}>
        {/* Abstract Background Elements */}
        <div className="fixed inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px]" />
        </div>
        
        {/* Transparent Nav */}
        <nav className="relative z-50 w-full border-b border-white/10 bg-slate-950/50 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-green-400 to-emerald-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center">
                <span className="text-white font-bold text-xl leading-none pt-0.5">🌱</span>
              </div>
              <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
                GoodCommit
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="px-4 py-1.5 rounded-full bg-slate-800/80 border border-white/5 flex items-center gap-2">
                <span className="text-sm font-medium text-emerald-400">0.00 G$</span>
              </div>
              <button className="px-5 py-2 rounded-xl bg-white text-slate-900 font-semibold hover:bg-slate-200 transition-colors shadow-lg shadow-white/10">
                Connect Wallet
              </button>
            </div>
          </div>
        </nav>

        <main className="relative z-10 w-full">
          {children}
        </main>
      </body>
    </html>
  )
}
