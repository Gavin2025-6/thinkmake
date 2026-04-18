import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const inter = Inter({ subsets: ['latin'], weight: ['400','500','600','700','800','900'] })

export const metadata = {
  title: 'ThinkMake — AI tools for real problems',
  description: 'ThinkMake builds focused AI tools that solve real, everyday problems.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content" />
      </head>
      <body className={inter.className}>
        <nav>
          <Link className="nav-logo" href="/">Think<span>Make</span></Link>
          <ul className="nav-links">
            <li><a href="/#products">Products</a></li>
            <li><Link href="/career">CareerPath</Link></li>
            <li><a href="https://t.me/TorontoCarAlert" target="_blank" rel="noopener">Telegram</a></li>
          </ul>
        </nav>
        {children}
      </body>
    </html>
  )
}
