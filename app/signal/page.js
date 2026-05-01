'use client'
import { useState, useEffect } from 'react'

const CATEGORIES = ['🛠 工具类', '🎨 创意类', '💰 金融类', '🏥 健康类', '📱 生活类', '🔧 其他']

const TYPE_META = {
  new:        { label: '🆕 新信号',   bg: '#eff6ff', color: '#1d4ed8' },
  rising:     { label: '🔥 上升中',   bg: '#fff7ed', color: '#c2410c' },
  persistent: { label: '📊 持续热门', bg: '#f0fdf4', color: '#15803d' },
}

function ScoreBadge({ score }) {
  if (!score) return null
  const color = score >= 8 ? '#065f46' : score >= 6 ? '#92400e' : '#6b7280'
  const bg    = score >= 8 ? '#d1fae5' : score >= 6 ? '#fef3c7' : '#f3f4f6'
  return (
    <span style={{ background: bg, color, borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
      {score.toFixed(1)} / 10
    </span>
  )
}

function TypeBadge({ type }) {
  const m = TYPE_META[type] || TYPE_META.new
  return (
    <span style={{ background: m.bg, color: m.color, borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
      {m.label}
    </span>
  )
}

function CatBadge({ category }) {
  if (!category) return null
  return (
    <span style={{ background: '#f3f0ff', color: '#7c3aed', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
      {category}
    </span>
  )
}

function SignalCard({ signal }) {
  const [expanded, setExpanded] = useState(false)
  const a   = signal.aiAnalysis || {}
  const date = signal.firstSeen ? new Date(signal.firstSeen).toLocaleDateString('zh-CN') : ''
  const vel  = signal.upvoteVelocity ? `↑${Math.round(signal.upvoteVelocity)}/天` : null

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', marginBottom: 10, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <TypeBadge type={signal.signalType} />
        <CatBadge category={signal.category} />
        <ScoreBadge score={signal.aiScore} />
        {vel && (
          <span style={{ background: '#fff7ed', color: '#c2410c', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
            {vel}
          </span>
        )}
        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>
          r/{signal.subreddit || signal.source} · 👍{signal.upvotes} · {date}
        </span>
      </div>

      <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a', marginBottom: 4, lineHeight: 1.4 }}>
        {signal.title}
      </div>

      {a.advice && (
        <div style={{ fontSize: 13, color: '#7c3aed', marginBottom: 6 }}>💡 {a.advice}</div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href={signal.url} target="_blank" rel="noopener"
          style={{ fontSize: 12, color: '#6b7280', textDecoration: 'underline' }}>
          原帖 →
        </a>
        {a.total && (
          <button onClick={() => setExpanded(e => !e)}
            style={{ fontSize: 12, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {expanded ? '收起' : '查看评分'}
          </button>
        )}
      </div>

      {expanded && a.total && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <span>📈 市场规模：{a.market}/10</span>
          <span>⚙️ 技术可行性：{a.feasibility}/10</span>
          <span>🥊 竞争程度：{a.competition}/10 <span style={{ color: '#9ca3af' }}>(越低越好)</span></span>
          <span>💰 变现潜力：{a.monetization}/10</span>
          {signal.content && (
            <div style={{ gridColumn: '1/-1', marginTop: 6, color: '#6b7280', lineHeight: 1.5 }}>
              {signal.content.slice(0, 300)}{signal.content.length > 300 ? '...' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SignalPage() {
  const [signals, setSignals]     = useState([])
  const [reports, setReports]     = useState([])
  const [stats, setStats]         = useState({ total: 0, today: 0, countNew: 0, countRising: 0, countPersistent: 0 })
  const [category, setCategory]   = useState('')
  const [signalType, setSignalType] = useState('')
  const [sort, setSort]           = useState('score')
  const [loading, setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sort, ...(category ? { category } : {}), ...(signalType ? { type: signalType } : {}) })
      const res  = await fetch(`/api/signal/list?${params}`)
      const data = await res.json()
      setSignals(data.signals || [])
      setReports(data.reports || [])
      setStats(data.stats || { total: 0, today: 0, countNew: 0, countRising: 0, countPersistent: 0 })
      setLastUpdated(new Date())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [category, signalType, sort]) // eslint-disable-line

  const verified = signals.filter(s => s.aiAnalysis?.competition < 4 && s.aiScore > 7)

  const pill = (label, active, onClick) => (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 20,
      border: '1px solid #e5e7eb',
      background: active ? '#7c3aed' : '#fff',
      color: active ? '#fff' : '#374151',
      fontSize: 13, cursor: 'pointer',
    }}>
      {label}
    </button>
  )

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px', fontFamily: '-apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a' }}>
          🔭 Signal<span style={{ color: '#7c3aed' }}>Hunt</span>
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
          Reddit 需求信号监控 · AI 自动评分
          {lastUpdated && ` · 更新于 ${lastUpdated.toLocaleTimeString('zh-CN')}`}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: '历史总量', value: stats.total },
          { label: '今日新增', value: stats.today },
          { label: '🆕 新信号', value: stats.countNew, type: 'new' },
          { label: '🔥 上升中', value: stats.countRising, type: 'rising' },
          { label: '📊 持续热门', value: stats.countPersistent, type: 'persistent' },
        ].map(({ label, value, type }) => (
          <div key={label}
            onClick={() => type && setSignalType(signalType === type ? '' : type)}
            style={{ background: signalType === type ? '#f3f0ff' : '#f9fafb', border: `1px solid ${signalType === type ? '#7c3aed' : '#e5e7eb'}`, borderRadius: 10, padding: '10px 12px', cursor: type ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed' }}>{value ?? 0}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Verified gap highlight */}
      {verified.length > 0 && !category && !signalType && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>✅ 已验证空白（竞争&lt;4，综合&gt;7）— {verified.length} 条</div>
          {verified.slice(0, 3).map(s => <SignalCard key={s.id} signal={s} />)}
        </div>
      )}

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {pill('全部分类', !category, () => setCategory(''))}
        {CATEGORIES.map(cat => pill(cat, category === cat, () => setCategory(cat === category ? '' : cat)))}
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>排序：</span>
        {[['score','AI综合分'], ['velocity','上升速度'], ['date','最新'], ['upvotes','点赞数']].map(([val, label]) => (
          <button key={val} onClick={() => setSort(val)}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: sort === val ? '#f3f0ff' : '#fff', color: sort === val ? '#7c3aed' : '#374151', fontSize: 12, cursor: 'pointer', fontWeight: sort === val ? 700 : 400 }}>
            {label}
          </button>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>
          刷新
        </button>
      </div>

      {/* Signal list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>加载中...</div>
      ) : signals.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>暂无数据</div>
      ) : (
        signals.map(s => <SignalCard key={s.id} signal={s} />)
      )}

      {/* Report history */}
      {reports.length > 0 && (
        <div style={{ marginTop: 32, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>📋 推送历史</div>
          {reports.map(r => (
            <div key={r.id} style={{ fontSize: 13, color: '#6b7280', padding: '4px 0' }}>
              {r.reportType === 'morning' ? '早报' : '晚报'} · {new Date(r.sentAt).toLocaleString('zh-CN')} · {r.signalCount} 条
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
