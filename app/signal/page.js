'use client'
import { useState, useEffect } from 'react'

const CATEGORIES = ['🛠 工具类', '🎨 创意类', '💰 金融类', '🏥 健康类', '📱 生活类', '🔧 其他']

function ScoreBadge({ score }) {
  if (!score) return null
  const color = score >= 8 ? '#065f46' : score >= 6 ? '#92400e' : '#6b7280'
  const bg = score >= 8 ? '#d1fae5' : score >= 6 ? '#fef3c7' : '#f3f4f6'
  return (
    <span style={{ background: bg, color, borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
      {score.toFixed(1)} / 10
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
  const a = signal.aiAnalysis || {}
  const date = signal.date ? new Date(signal.date).toLocaleDateString('zh-CN') : ''

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', marginBottom: 10, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <CatBadge category={signal.category} />
        <ScoreBadge score={signal.aiScore} />
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
            {expanded ? '收起' : '查看评分详情'}
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
  const [signals, setSignals] = useState([])
  const [reports, setReports] = useState([])
  const [stats, setStats] = useState({ total: 0, today: 0 })
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('score')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sort, ...(category ? { category } : {}) })
      const res = await fetch(`/api/signal/list?${params}`)
      const data = await res.json()
      setSignals(data.signals || [])
      setReports(data.reports || [])
      setStats(data.stats || { total: 0, today: 0 })
      setLastUpdated(new Date())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [category, sort]) // eslint-disable-line

  const lowCompHigh = signals.filter(s => s.aiAnalysis?.competition < 4 && s.aiScore > 7)

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

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: '历史信号', value: stats.total },
          { label: '今日新增', value: stats.today },
          { label: '⚡ 低竞争高潜力', value: lowCompHigh.length },
        ].map(({ label, value }) => (
          <div key={label} style={{ flex: 1, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed' }}>{value}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => setCategory('')}
          style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: !category ? '#7c3aed' : '#fff', color: !category ? '#fff' : '#374151', fontSize: 13, cursor: 'pointer' }}>
          全部
        </button>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategory(cat === category ? '' : cat)}
            style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: category === cat ? '#7c3aed' : '#fff', color: category === cat ? '#fff' : '#374151', fontSize: 13, cursor: 'pointer' }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>排序：</span>
        {[['score', 'AI综合分'], ['date', '最新'], ['upvotes', '最多点赞']].map(([val, label]) => (
          <button key={val} onClick={() => setSort(val)}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: sort === val ? '#f3f0ff' : '#fff', color: sort === val ? '#7c3aed' : '#374151', fontSize: 12, cursor: 'pointer', fontWeight: sort === val ? 700 : 400 }}>
            {label}
          </button>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>
          刷新
        </button>
      </div>

      {/* Low competition highlight */}
      {lowCompHigh.length > 0 && !category && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>⚡ 低竞争高潜力（竞争&lt;4，总分&gt;7）</div>
          {lowCompHigh.slice(0, 3).map(s => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>
      )}

      {/* Signal list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>加载中...</div>
      ) : signals.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>
          暂无数据 — 等待首次抓取运行
        </div>
      ) : (
        signals.map(s => <SignalCard key={s.id} signal={s} />)
      )}

      {/* Report history */}
      {reports.length > 0 && (
        <div style={{ marginTop: 32, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>📋 历史报告</div>
          {reports.map(r => (
            <div key={r.id} style={{ fontSize: 13, color: '#6b7280', padding: '4px 0' }}>
              {r.reportType === 'morning' ? '早报' : '晚报'} · {new Date(r.sentAt).toLocaleString('zh-CN')} · {r.signalCount} 条信号
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
