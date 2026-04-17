import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], weight: ['400','500','600','700','800','900'] })

export const metadata = {
  title: 'ThinkMake CareerPath — 加拿大华人职业规划',
  description: '专为加拿大华人新移民打造的 AI 职业规划助手，基于真实案例和权威资源。',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}
