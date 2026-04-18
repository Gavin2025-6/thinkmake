import Link from 'next/link'

export default function Home() {
  return (
    <>
      {/* HERO */}
      <div className="hero">
        <div className="glow-wrap" aria-hidden="true">
          <div className="glow-blob glow-blob-1"></div>
          <div className="glow-blob glow-blob-2"></div>
          <div className="glow-ring"></div>
        </div>

        <div className="hero-badge">Now live</div>

        <h1 className="hero-title">
          Think<span className="gradient-text">Make</span>
        </h1>
        <p className="hero-subtitle">AI tools for real problems</p>

        <a className="hero-cta" href="#products">
          Explore products
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4"/>
          </svg>
        </a>

        <div className="scroll-hint" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 4v12M5 11l5 5 5-5"/>
          </svg>
        </div>
      </div>

      {/* STATS */}
      <div className="stats">
        <div className="stat">
          <div className="stat-number">2</div>
          <div className="stat-label">Products shipped</div>
        </div>
        <div className="stat">
          <div className="stat-number">24/7</div>
          <div className="stat-label">Automated monitoring</div>
        </div>
        <div className="stat">
          <div className="stat-number">∞</div>
          <div className="stat-label">Problems to solve</div>
        </div>
      </div>

      {/* PRODUCTS */}
      <section id="products">
        <div className="section-label">Products</div>
        <div className="cards">

          {/* CarMonitor */}
          <a className="card card-carmonitor" href="https://t.me/TorontoCarAlert" target="_blank" rel="noopener">
            <div className="card-visual card-visual-carmonitor">
              <div className="visual-glow vg-green"></div>
              <div className="cm-radar">
                <div className="cm-ring"></div>
                <div className="cm-ring"></div>
                <div className="cm-ring"></div>
                <div className="cm-ring"></div>
                <div className="cm-car">
                  <svg width="64" height="32" viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="4" y="14" width="56" height="12" rx="4" fill="#3fb950"/>
                    <path d="M16 14 L22 4 L44 4 L50 14 Z" fill="#3fb950"/>
                    <path d="M18 14 L22 6 L30 6 L30 14 Z" fill="#0d1117" opacity="0.55"/>
                    <path d="M32 14 L32 6 L42 6 L47 14 Z" fill="#0d1117" opacity="0.55"/>
                    <circle cx="17" cy="26" r="6" fill="#0d1117" stroke="#3fb950" strokeWidth="2"/>
                    <circle cx="17" cy="26" r="2.5" fill="#3fb950"/>
                    <circle cx="47" cy="26" r="6" fill="#0d1117" stroke="#3fb950" strokeWidth="2"/>
                    <circle cx="47" cy="26" r="2.5" fill="#3fb950"/>
                    <circle cx="60" cy="18" r="2.5" fill="white" opacity="0.9"/>
                  </svg>
                </div>
              </div>
            </div>
            <div className="card-body">
              <span className="card-tag tag-green">Live</span>
              <h2 className="card-title">CarMonitor</h2>
              <p className="card-desc">
                Real-time Kijiji GTA car deal alerts on Telegram. Scrapes listings every 5 minutes, filters by price vs market value, and pushes only the best deals.
              </p>
              <span className="card-link link-green">
                @TorontoCarAlert
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 7h10M7 2l5 5-5 5"/>
                </svg>
              </span>
            </div>
          </a>

          {/* CareerPath */}
          <Link className="card card-careerpath" href="/career">
            <div className="card-visual card-visual-careerpath">
              <div className="visual-glow vg-purple"></div>
              <div className="cp-visual-wrap">
                <div className="cp-bar-group">
                  <div className="cp-bar"></div>
                  <div className="cp-bar"></div>
                  <div className="cp-bar"></div>
                  <div className="cp-bar"></div>
                  <div className="cp-bar"></div>
                  <div className="cp-bar"></div>
                </div>
                <div className="cp-label">CAREER SIGNALS</div>
              </div>
            </div>
            <div className="card-body">
              <span className="card-tag tag-purple">Live</span>
              <h2 className="card-title">CareerPath</h2>
              <p className="card-desc">
                AI-powered career planning for Chinese newcomers in Canada. Chat with an AI advisor backed by real cases, proven strategies, and 100+ authoritative resources.
              </p>
              <span className="card-link link-purple">
                开始规划
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 7h10M7 2l5 5-5 5"/>
                </svg>
              </span>
            </div>
          </Link>

        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-logo">Think<span>Make</span></div>
        <div className="footer-copy">© 2026 ThinkMake. All rights reserved.</div>
        <div className="footer-links">
          <a href="https://t.me/TorontoCarAlert" target="_blank" rel="noopener">Telegram</a>
          <a href="mailto:hello@thinkmake.ai">Contact</a>
        </div>
      </footer>
    </>
  )
}
