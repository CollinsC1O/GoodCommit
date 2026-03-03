import type { Metadata } from 'next'
import './globals.css'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import NavBar from './components/NavBar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GoodCommit | The Habit Garden',
  description: 'Stake on yourself, grow your Habit Plant, and earn G$ rewards',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className={`${inter.className} min-h-screen overflow-x-hidden transition-colors duration-300`}>
        {/* Background gradients that respond to system theme */}
        <div className="fixed inset-0 z-0 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
          {/* Light mode gradients - visible in light mode */}
          <div className="absolute inset-0 opacity-100 dark:opacity-0 transition-opacity duration-300">
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-400/30 rounded-full blur-[100px]" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-400/30 rounded-full blur-[120px]" />
            <div className="absolute top-[40%] right-[20%] w-[400px] h-[400px] bg-purple-300/20 rounded-full blur-[100px]" />
          </div>
          
          {/* Dark mode gradients - visible in dark mode */}
          <div className="absolute inset-0 opacity-0 dark:opacity-100 transition-opacity duration-300">
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[100px]" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px]" />
          </div>
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
