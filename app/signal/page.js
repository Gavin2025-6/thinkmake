'use client'
import { useState, useEffect, useCallback } from 'react'

// ─── Constants ───────────────────────────────────────────────
const CATEGORIES = ['🛠 工具类', '🎨 创意类', '💰 金融类', '🏥 健康类', '📚 教育类', '💬 社交类', '📱 生活类']
const PLATFORMS  = ['reddit', 'hackernews', 'appstore', 'googleplay', 'youtube', 'producthunt', 'v2ex']
const PLATFORM_META = {
  reddit:       { icon: '👾', label: 'Reddit' },
  hackernews:   { icon: '🟠', label: 'Hacker News' },
  appstore:     { icon: '🍎', label: 'App Store' },
  googleplay:   { icon: '🤖', label: 'Google Play' },
  youtube:      { icon: '▶️', label: 'YouTube' },
  producthunt:  { icon: '🐱', label: 'Product Hunt' },
  v2ex:         { icon: '🟦', label: 'V2EX' },
}
const STRENGTH_META = {
  high:   { icon: '🔴', label: '强需求', bg: '#fef2f2', color: '#991b1b' },
  medium: { icon: '🟡', label: '中需求', bg: '#fffbeb', color: '#92400e' },
  low:    { icon: '🟢', label: '弱信号', bg: '#f0fdf4', color: '#15803d' },
}
const VALIDATION_META = {
  blank:   { label: '✅ 验证空白', bg: '#f0fdf4', color: '#15803d' },
  weak:    { label: '⚠️ 有竞品',   bg: '#fffbeb', color: '#92400e' },
  covered: { label: '❌ 已有免费', bg: '#fef2f2', color: '#991b1b' },
}
const TYPE_META = {
  new:        { label: '🆕 新信号',   bg: '#eff6ff', color: '#1d4ed8' },
  rising:     { label: '🔥 上升中',   bg: '#fff7ed', color: '#c2410c' },
  persistent: { label: '📊 持续热门', bg: '#f0fdf4', color: '#15803d' },
}

// ─── Tiny components ─────────────────────────────────────────
const badge = (text, bg, color) => (
  <span style={{ background: bg, color, borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{text}</span>
)

function SignalCard({ signal, blurred }) {
  const [open, setOpen] = useState(false)
  const a = signal.aiAnalysis || {}
  const tm = TYPE_META[signal.signalType] || TYPE_META.new
  const pm = PLATFORM_META[signal.platform] || { icon: '📡', label: signal.platform }

  // Prefer stored validationStatus, fall back to AI competition score
  const vm = signal.validationStatus
    ? VALIDATION_META[signal.validationStatus]
    : a.competition != null
      ? a.competition < 4 ? VALIDATION_META.blank : a.competition < 7 ? VALIDATION_META.weak : VALIDATION_META.covered
      : null
  const sm = signal.signalStrength ? STRENGTH_META[signal.signalStrength] : null

  return (
    <div style={{ border: `1px solid ${sm?.color ? sm.color + '44' : '#e5e7eb'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10, background: '#fff', filter: blurred ? 'blur(4px)' : 'none', userSelect: blurred ? 'none' : 'auto', pointerEvents: blurred ? 'none' : 'auto' }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
        {sm && badge(`${sm.icon} ${sm.label}`, sm.bg, sm.color)}
        {badge(tm.label, tm.bg, tm.color)}
        {signal.category && badge(signal.category, '#f3f0ff', '#7c3aed')}
        {signal.aiScore && badge(`${signal.aiScore.toFixed(1)}/10`, signal.aiScore >= 8 ? '#d1fae5' : signal.aiScore >= 6 ? '#fef3c7' : '#f3f4f6', signal.aiScore >= 8 ? '#065f46' : signal.aiScore >= 6 ? '#92400e' : '#6b7280')}
        {vm && badge(vm.label, vm.bg, vm.color)}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>
          {signal.flag || ''} {pm.icon} {pm.label} · 👍{signal.upvotes}{signal.upvoteVelocity > 0 ? ` ↑${Math.round(signal.upvoteVelocity)}/天` : ''}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#111', marginBottom: 2, lineHeight: 1.4 }}>
        {signal.translatedTitle || signal.title}
      </div>
      {signal.translatedTitle && signal.translatedTitle !== signal.title
        ? <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: a.advice ? 4 : 8 }}>{signal.title}</div>
        : <div style={{ marginBottom: a.advice ? 4 : 8 }} />
      }
      {a.advice && <div style={{ fontSize: 13, color: '#7c3aed', marginBottom: 8 }}>💡 {a.advice}</div>}
      <div style={{ display: 'flex', gap: 10, fontSize: 12, flexWrap: 'wrap' }}>
        <a href={signal.url} target="_blank" rel="noopener" style={{ color: '#6b7280', textDecoration: 'underline' }}>原帖 →</a>
        {signal.githubExists && signal.githubUrl && (
          <a href={signal.githubUrl} target="_blank" rel="noopener" style={{ color: '#374151', textDecoration: 'underline' }}>
            ⭐{signal.githubStars?.toLocaleString()} GitHub →
          </a>
        )}
        {signal.validationStatus === 'blank' && !signal.githubExists && (
          <span style={{ color: '#15803d', fontWeight: 600 }}>无开源方案</span>
        )}
        {a.total && <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: 0, fontSize: 12 }}>{open ? '收起' : '评分详情'}</button>}
      </div>
      {open && a.total && (
        <div style={{ marginTop: 8, background: '#f9fafb', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {a.market      != null && <span>📈 市场：{a.market}/10</span>}
            {a.feasibility != null && <span>⚙️ 可行性：{a.feasibility}/10</span>}
            {a.competition != null && <span>🥊 竞争：{a.competition}/10 <span style={{ color: '#9ca3af' }}>(低=好)</span></span>}
            {a.monetization!= null && <span>💰 变现：{a.monetization}/10</span>}
          </div>
          {signal.freeSolutionScore != null && (
            <div style={{ marginTop: 3 }}>🔓 免费方案指数：{signal.freeSolutionScore}/10 <span style={{ color: '#9ca3af' }}>(低=机会大)</span></div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Auth modal ───────────────────────────────────────────────
function AuthModal({ mode, onClose, onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setErr('')
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (data.token) { onSuccess(data.token, data.plan) }
    else setErr(data.error || '出错了')
    setLoading(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 340, maxWidth: '90vw' }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>{mode === 'register' ? '免费注册' : '登录'}</div>
        <form onSubmit={submit}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="邮箱" type="email" required
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }} />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="密码（至少6位）" type="password" required
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }} />
          {err && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{err}</div>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '10px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            {loading ? '...' : mode === 'register' ? '开始免费使用' : '登录'}
          </button>
        </form>
        <button onClick={onClose} style={{ marginTop: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, width: '100%' }}>关闭</button>
      </div>
    </div>
  )
}

// ─── Ad unlock countdown ──────────────────────────────────────
function AdUnlock({ onUnlocked }) {
  const [secs, setSecs] = useState(15)
  useEffect(() => {
    const t = setInterval(() => setSecs(s => { if (s <= 1) { clearInterval(t); onUnlocked(); return 0 } return s - 1 }), 1000)
    return () => clearInterval(t)
  }, [onUnlocked])
  return (
    <div style={{ textAlign: 'center', padding: '24px 16px', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fffbeb', marginBottom: 16 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📺</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>广告支持免费访问</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>等待 {secs} 秒后解锁全部信号...</div>
      <div style={{ width: '100%', height: 6, background: '#e5e7eb', borderRadius: 3 }}>
        <div style={{ height: '100%', width: `${((15 - secs) / 15) * 100}%`, background: '#7c3aed', borderRadius: 3, transition: 'width 1s linear' }} />
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>[广告位 — 接入 Google AdSense 后展示]</div>
    </div>
  )
}

// ─── Landing page ─────────────────────────────────────────────
function LandingPage({ onRegister }) {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 16px', fontFamily: '-apple-system, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 13, color: '#7c3aed', fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>SignalHunt</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.2, marginBottom: 16, color: '#111' }}>
          Find Your Next App Idea<br /><span style={{ color: '#7c3aed' }}>Before Anyone Else</span>
        </h1>
        <p style={{ fontSize: 16, color: '#6b7280', lineHeight: 1.6, maxWidth: 520, margin: '0 auto 28px' }}>
          SignalHunt scans Reddit, App Store, Hacker News, and YouTube daily —
          surfacing real user pain points with <strong>no free solution</strong>,
          scored by AI for market potential.
        </p>
        <button onClick={onRegister}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginRight: 12 }}>
          Start Free Today →
        </button>
      </div>

      {/* Feature grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 40 }}>
        {[
          ['👾🟠🍎🤖▶️🐱', '6大平台', 'Reddit · HN · App Store · Google Play · YouTube · Product Hunt'],
          ['🤖', 'AI 自动评分 + GitHub验证', '市场规模、可行性、竞争程度、变现潜力，自动搜索开源竞品并调整评分'],
          ['🔔', '每日推送', '北京21:00 & 09:00，多伦多09:00 & 21:00，准时到 Telegram'],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Pricing */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 40 }}>
        {[
          { plan: '免费版', price: '$0', features: ['每日 TOP 3 信号', '广告解锁全部信号', '基础筛选功能'], cta: '免费开始', action: onRegister, highlight: false },
          { plan: '付费版', price: '$9/月', features: ['全部信号不限查看', 'Telegram 推送', '历史数据查询', '趋势预警报告', '无广告'], cta: '即将开放', action: null, highlight: true },
        ].map(p => (
          <div key={p.plan} style={{ border: `2px solid ${p.highlight ? '#7c3aed' : '#e5e7eb'}`, borderRadius: 12, padding: '24px 20px', position: 'relative' }}>
            {p.highlight && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: '#fff', borderRadius: 20, padding: '2px 12px', fontSize: 11, fontWeight: 700 }}>推荐</div>}
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{p.plan}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed', marginBottom: 16 }}>{p.price}</div>
            {p.features.map(f => <div key={f} style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>✓ {f}</div>)}
            <button onClick={p.action || undefined} disabled={!p.action}
              style={{ width: '100%', marginTop: 16, padding: '10px', background: p.highlight ? '#7c3aed' : '#f3f4f6', color: p.highlight ? '#fff' : '#374151', border: 'none', borderRadius: 8, fontWeight: 700, cursor: p.action ? 'pointer' : 'default', fontSize: 14, opacity: p.action ? 1 : 0.6 }}>
              {p.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────
export default function SignalPage() {
  const [user, setUser]             = useState(null)  // {email, plan}
  const [authModal, setAuthModal]   = useState(null)  // 'register' | 'login'
  const [unlocked, setUnlocked]     = useState(false)
  const [showAd, setShowAd]         = useState(false)

  const [signals, setSignals]       = useState([])
  const [reports, setReports]       = useState([])
  const [stats, setStats]           = useState({})
  const [clusters, setClusters]     = useState([])

  const [category, setCategory]             = useState('')
  const [platform, setPlatform]             = useState('')
  const [signalType, setSignalType]         = useState('')
  const [validationFilter, setValidation]   = useState('')
  const [sort, setSort]                     = useState('score')
  const [search, setSearch]                 = useState('')
  const [searchInput, setSearchInput]       = useState('')
  const [loading, setLoading]               = useState(true)

  // Restore auth from localStorage
  useEffect(() => {
    const token = localStorage.getItem('sh_token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[0]))
        setUser({ email: payload.email, plan: payload.plan })
        setUnlocked(true)
      } catch {}
    }
    const day = new Date().toDateString()
    if (localStorage.getItem('sh_unlocked_day') === day) setUnlocked(true)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sort, ...(category ? { category } : {}), ...(platform ? { platform } : {}), ...(signalType ? { type: signalType } : {}), ...(validationFilter ? { validation: validationFilter } : {}), ...(search ? { q: search } : {}) })
      const res  = await fetch(`/api/signal/list?${params}`)
      const data = await res.json()
      setSignals(data.signals || [])
      setReports(data.reports || [])
      setStats(data.stats || {})
      setClusters(data.clusters || [])
    } catch {}
    setLoading(false)
  }, [sort, category, platform, signalType, validationFilter, search])

  useEffect(() => { if (user || unlocked) load() }, [load, user, unlocked])

  function handleAuthSuccess(token, plan) {
    localStorage.setItem('sh_token', token)
    try {
      const payload = JSON.parse(atob(token.split('.')[0]))
      setUser({ email: payload.email, plan })
    } catch {}
    setUnlocked(true)
    setAuthModal(null)
    load()
  }

  function handleAdUnlocked() {
    localStorage.setItem('sh_unlocked_day', new Date().toDateString())
    setUnlocked(true)
    setShowAd(false)
  }

  function handleLogout() {
    localStorage.removeItem('sh_token')
    localStorage.removeItem('sh_unlocked_day')
    setUser(null)
    setUnlocked(false)
    setSignals([])
  }

  const isPaid  = user?.plan === 'paid'
  const canSeeAll = isPaid || unlocked

  // Not logged in → show landing
  if (!user && !unlocked) {
    return (
      <>
        {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} onSuccess={handleAuthSuccess} />}
        <LandingPage onRegister={() => setAuthModal('register')} />
        <div style={{ textAlign: 'center', paddingBottom: 24 }}>
          <button onClick={() => setAuthModal('login')} style={{ color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>已有账号？登录</button>
        </div>
      </>
    )
  }

  const FREE_LIMIT = 3
  const visibleSignals  = canSeeAll ? signals : signals.slice(0, FREE_LIMIT)
  const blurredSignals  = canSeeAll ? [] : signals.slice(FREE_LIMIT, FREE_LIMIT + 3)
  const verified = signals.filter(s =>
    (s.validationStatus === 'blank' || (!s.validationStatus && (s.aiAnalysis?.competition ?? 10) < 4)) &&
    (s.aiScore || 0) > 7
  )

  const pill = (label, active, onClick) => (
    <button onClick={onClick} style={{ padding: '5px 11px', borderRadius: 20, border: '1px solid #e5e7eb', background: active ? '#7c3aed' : '#fff', color: active ? '#fff' : '#374151', fontSize: 12, cursor: 'pointer' }}>
      {label}
    </button>
  )

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px', fontFamily: '-apple-system, sans-serif' }}>
      {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} onSuccess={handleAuthSuccess} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🔭 Signal<span style={{ color: '#7c3aed' }}>Hunt</span></div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>需求信号监控 · 6大平台 · AI评分 · GitHub验证</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {user ? (
            <>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{user.email} · {user.plan === 'paid' ? '💎 付费' : '免费版'}</span>
              <button onClick={handleLogout} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>退出</button>
            </>
          ) : (
            <>
              <button onClick={() => setAuthModal('login')} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer' }}>登录</button>
              <button onClick={() => setAuthModal('register')} style={{ padding: '5px 12px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>注册</button>
            </>
          )}
        </div>
      </div>

      {/* Stats — signal type */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 8 }}>
        {[
          { l: '历史总量',   v: stats.total },
          { l: '今日新增',   v: stats.today },
          { l: '🆕 新信号', v: stats.countNew,        t: 'new' },
          { l: '🔥 上升中', v: stats.countRising,     t: 'rising' },
          { l: '📊 持续热门', v: stats.countPersistent, t: 'persistent' },
        ].map(({ l, v, t }) => (
          <div key={l} onClick={() => t && setSignalType(signalType === t ? '' : t)}
            style={{ background: signalType === t ? '#f3f0ff' : '#f9fafb', border: `1px solid ${signalType === t ? '#7c3aed' : '#e5e7eb'}`, borderRadius: 10, padding: '10px 12px', cursor: t ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#7c3aed' }}>{v ?? 0}</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>{l}</div>
          </div>
        ))}
      </div>
      {/* Stats — validation status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { l: '✅ 验证空白', v: stats.countBlank,   val: 'blank',   bg: '#f0fdf4', border: '#86efac', active: '#15803d' },
          { l: '⚠️ 有竞品',   v: stats.countWeak,    val: 'weak',    bg: '#fffbeb', border: '#fcd34d', active: '#92400e' },
          { l: '❌ 已有免费', v: stats.countCovered, val: 'covered', bg: '#fef2f2', border: '#fca5a5', active: '#991b1b' },
        ].map(({ l, v, val, bg, border, active }) => {
          const isActive = validationFilter === val
          return (
            <div key={val} onClick={() => setValidation(validationFilter === val ? '' : val)}
              style={{ background: isActive ? bg : '#f9fafb', border: `1px solid ${isActive ? border : '#e5e7eb'}`, borderRadius: 10, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: isActive ? active : '#7c3aed' }}>{v ?? 0}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>{l}</div>
            </div>
          )
        })}
      </div>

      {/* Verified highlight */}
      {!category && !platform && !signalType && verified.length > 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>✅ 已验证空白（竞争&lt;4，综合&gt;7）— {verified.length} 条</div>
          {verified.slice(0, 3).map(s => <SignalCard key={s.id} signal={s} />)}
        </div>
      )}

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)}
          placeholder="搜索信号关键词..." style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
        <button onClick={() => setSearch(searchInput)} style={{ padding: '7px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>搜索</button>
        {search && <button onClick={() => { setSearch(''); setSearchInput('') }} style={{ padding: '7px 10px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>清除</button>}
      </div>

      {/* Platform filter */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        {pill('全部平台', !platform, () => setPlatform(''))}
        {PLATFORMS.map(p => {
          const m = PLATFORM_META[p]
          return pill(`${m.icon} ${m.label}`, platform === p, () => setPlatform(platform === p ? '' : p))
        })}
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        {pill('全部分类', !category, () => setCategory(''))}
        {CATEGORIES.map(cat => pill(cat, category === cat, () => setCategory(cat === category ? '' : cat)))}
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>排序：</span>
        {[['score','AI综合分'],['velocity','上升速度'],['date','最新'],['upvotes','点赞']].map(([val, label]) => (
          <button key={val} onClick={() => setSort(val)}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: sort === val ? '#f3f0ff' : '#fff', color: sort === val ? '#7c3aed' : '#374151', fontSize: 12, cursor: 'pointer', fontWeight: sort === val ? 700 : 400 }}>
            {label}
          </button>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>↻ 刷新</button>
      </div>

      {/* Ad unlock banner */}
      {!canSeeAll && !showAd && signals.length > FREE_LIMIT && (
        <div style={{ background: '#f3f0ff', border: '1px solid #c4b5fd', borderRadius: 10, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>免费版每日显示 TOP 3</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>观看 15 秒广告解锁今日全部 {signals.length} 条信号，或注册免费账号</div>
          <button onClick={() => setShowAd(true)} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13, marginRight: 8 }}>
            📺 观看广告解锁
          </button>
          <button onClick={() => setAuthModal('register')} style={{ background: '#fff', color: '#7c3aed', border: '1px solid #7c3aed', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            免费注册
          </button>
        </div>
      )}

      {showAd && <AdUnlock onUnlocked={handleAdUnlocked} />}

      {/* Signal list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>加载中...</div>
      ) : signals.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>暂无数据 — 等待首次抓取</div>
      ) : (
        <>
          {visibleSignals.map(s => <SignalCard key={s.id} signal={s} />)}
          {blurredSignals.map(s => <SignalCard key={s.id} signal={s} blurred />)}
        </>
      )}

      {/* Top clusters */}
      {clusters.length > 0 && (
        <div style={{ marginTop: 28, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🧩 需求聚合 TOP 10</div>
          {clusters.map(c => {
            const platforms = Array.isArray(c.platforms) ? c.platforms : []
            return (
              <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: '#7c3aed' }}>{c.clusterSize} 条信号</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>热度 {c.totalSignalStrength}</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{platforms.map(p => PLATFORM_META[p]?.icon || '📡').join('')}</span>
                {c.dayStreak >= 3 && <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>🔥 {c.dayStreak}天</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Report history */}
      {reports.length > 0 && (
        <div style={{ marginTop: 28, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>📋 推送历史</div>
          {reports.map(r => (
            <div key={r.id} style={{ fontSize: 12, color: '#6b7280', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
              {r.reportType === 'morning' ? '早报' : '晚报'} · {new Date(r.sentAt).toLocaleString('zh-CN')} · {r.signalCount} 条
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
