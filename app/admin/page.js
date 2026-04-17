'use client'
import { useState, useEffect } from 'react'

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({ career: '', province: '' })

  async function login(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'x-admin-password': password },
      })
      if (res.status === 401) { setAuthError('密码错误'); return }
      const json = await res.json()
      setData(json)
      setAuthed(true)
    } catch {
      setAuthError('连接失败')
    } finally {
      setLoading(false)
    }
  }

  async function fetchData() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.career) params.set('career', filter.career)
      if (filter.province) params.set('province', filter.province)
      const res = await fetch(`/api/admin/stats?${params}`, {
        headers: { 'x-admin-password': password },
      })
      const json = await res.json()
      setData(json)
    } catch {}
    setLoading(false)
  }

  function exportCsv() {
    if (!data?.leads) return
    const rows = [
      ['邮箱', '微信', '省份', '推荐职业', '来源', '注册时间'],
      ...data.leads.map(l => [
        l.email, l.wechat || '', l.province || '',
        Array.isArray(l.recommendedCareers) ? l.recommendedCareers.join(';') : '',
        l.source || '', new Date(l.createdAt).toLocaleString('zh-CN'),
      ])
    ]
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (!authed) {
    return (
      <div style={styles.loginWrap}>
        <div style={styles.loginCard}>
          <div style={styles.loginTitle}>ThinkMake Admin</div>
          <form onSubmit={login}>
            <input
              type="password"
              placeholder="管理员密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={styles.input}
            />
            {authError && <div style={styles.error}>{authError}</div>}
            <button type="submit" style={styles.btn} disabled={loading}>
              {loading ? '验证中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const stats = data?.stats || {}
  const leads = data?.leads || []

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>ThinkMake Admin</div>
        <button onClick={exportCsv} style={styles.exportBtn}>导出 CSV</button>
      </div>

      {/* Stats */}
      <div style={styles.statsGrid}>
        {[
          { label: '今日新增', value: stats.todayLeads ?? '-' },
          { label: '本周新增', value: stats.weekLeads ?? '-' },
          { label: '累计 Leads', value: stats.totalLeads ?? '-' },
          { label: '累计对话', value: stats.totalConversations ?? '-' },
        ].map(s => (
          <div key={s.label} style={styles.statCard}>
            <div style={styles.statValue}>{s.value}</div>
            <div style={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={styles.filterWrap}>
        <input placeholder="筛选职业方向" value={filter.career}
          onChange={e => setFilter(f => ({ ...f, career: e.target.value }))}
          style={{ ...styles.input, width: 180, margin: 0 }} />
        <input placeholder="筛选省份" value={filter.province}
          onChange={e => setFilter(f => ({ ...f, province: e.target.value }))}
          style={{ ...styles.input, width: 160, margin: 0 }} />
        <button onClick={fetchData} style={{ ...styles.btn, width: 80, padding: '8px 0', margin: 0 }}>
          筛选
        </button>
      </div>

      {/* Leads table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['邮箱', '微信', '省份', '推荐职业', '来源', '注册时间'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#9ca3af' }}>暂无数据</td></tr>
            ) : leads.map(l => (
              <tr key={l.id} style={styles.tr}>
                <td style={styles.td}>{l.email}</td>
                <td style={styles.td}>{l.wechat || '-'}</td>
                <td style={styles.td}>{l.province || '-'}</td>
                <td style={styles.td}>
                  {Array.isArray(l.recommendedCareers) ? l.recommendedCareers.join(', ') : '-'}
                </td>
                <td style={styles.td}>{l.source || '-'}</td>
                <td style={styles.td}>{new Date(l.createdAt).toLocaleString('zh-CN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const styles = {
  loginWrap: { minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  loginCard: { background: '#1a2235', border: '1px solid #2a3346', borderRadius: 16, padding: 32, width: 320 },
  loginTitle: { fontSize: 20, fontWeight: 700, color: '#f9fafb', marginBottom: 20, textAlign: 'center' },
  input: { width: '100%', background: '#0f1117', border: '1px solid #2a3346', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', fontSize: 14, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box', outline: 'none' },
  error: { color: '#f87171', fontSize: 12, marginBottom: 8 },
  btn: { width: '100%', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  root: { minHeight: '100vh', background: '#0f1117', color: '#e5e7eb', padding: '24px 20px', fontFamily: 'inherit' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerTitle: { fontSize: 18, fontWeight: 700, color: '#f9fafb' },
  exportBtn: { background: '#1a2235', border: '1px solid #2a3346', color: '#a78bfa', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  statCard: { background: '#1a2235', border: '1px solid #2a3346', borderRadius: 12, padding: '16px 20px' },
  statValue: { fontSize: 28, fontWeight: 800, color: '#a78bfa' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  filterWrap: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' },
  tableWrap: { background: '#1a2235', border: '1px solid #2a3346', borderRadius: 12, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '12px 16px', textAlign: 'left', color: '#9ca3af', borderBottom: '1px solid #2a3346', whiteSpace: 'nowrap' },
  td: { padding: '10px 16px', color: '#e5e7eb', borderBottom: '1px solid #1e2736' },
  tr: {},
}
