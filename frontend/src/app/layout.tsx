import type { Metadata } from 'next'
import './globals.css'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import NavBar from './components/NavBar'

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
        <div className="fixed inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px]" />
        </div>
        
        <Providers>
          <NavBar />
          <main className="relative z-10 w-full">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
