'use client'
import { useState } from 'react'
import Link from 'next/link'

const PROVINCES = [
  { value: '', label: '请选择省份' },
  { value: '安大略省 Ontario', label: '安大略省 Ontario' },
  { value: '不列颠哥伦比亚省 BC', label: '不列颠哥伦比亚省 BC' },
  { value: '阿尔伯塔省 Alberta', label: '阿尔伯塔省 Alberta' },
  { value: '其他省份', label: '其他省份' },
]

const ENGLISH_OPTIONS = [
  { value: '基础', desc: '基础：日常对话勉强，书面英语较弱' },
  { value: '中等', desc: '中等：能沟通工作内容，有口音' },
  { value: '流利', desc: '流利：工作语言无障碍' },
]

const TIME_OPTIONS = [
  { value: '1年以内', label: '1年以内' },
  { value: '1-3年', label: '1–3年' },
  { value: '3年以上', label: '3年以上' },
]

const BUDGET_OPTIONS = [
  { value: '$5,000以下', label: '$5,000 以下' },
  { value: '$5,000–$20,000', label: '$5,000–$20,000' },
  { value: '$20,000以上', label: '$20,000 以上' },
]

function parseMarkdown(md) {
  if (!md) return ''
  const lines = md.split('\n')
  const out = []
  let listBuf = []
  let listType = null

  function flushList() {
    if (!listBuf.length) return
    const tag = listType === 'ol' ? 'ol' : 'ul'
    out.push(`<${tag} class="md-${tag}">${listBuf.join('')}</${tag}>`)
    listBuf = []
    listType = null
  }

  function inline(text) {
    return text
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  }

  for (const line of lines) {
    if (/^### /.test(line)) {
      flushList()
      out.push(`<h3 class="md-h3">${inline(line.slice(4))}</h3>`)
    } else if (/^## /.test(line)) {
      flushList()
      out.push(`<h2 class="md-h2">${inline(line.slice(3))}</h2>`)
    } else if (/^# /.test(line)) {
      flushList()
      out.push(`<h1 class="md-h1">${inline(line.slice(2))}</h1>`)
    } else if (/^\d+\. /.test(line)) {
      if (listType === 'ul') flushList()
      listType = 'ol'
      listBuf.push(`<li>${inline(line.replace(/^\d+\. /, ''))}</li>`)
    } else if (/^[-•*] /.test(line)) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      listBuf.push(`<li>${inline(line.slice(2))}</li>`)
    } else if (line.trim() === '') {
      flushList()
      out.push('<div class="md-spacer"></div>')
    } else {
      flushList()
      out.push(`<p class="md-p">${inline(line)}</p>`)
    }
  }
  flushList()
  return out.join('')
}

export default function CareerPage() {
  const [step, setStep] = useState('form')
  const [form, setForm] = useState({ occupation: '', province: '', english: '', time: '', budget: '' })
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const { occupation, province, english, time, budget } = form
    if (!occupation.trim() || !province || !english || !time || !budget) {
      setError('请填写所有字段')
      return
    }
    setError('')
    setStep('loading')
    try {
      const res = await fetch('/api/career', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || '分析失败，请稍后重试')
        setStep('form')
        return
      }
      setResult(data.result)
      setStep('result')
    } catch {
      setError('分析失败，请稍后重试')
      setStep('form')
    }
  }

  function resetForm() {
    setStep('form')
    setResult('')
    setError('')
    setForm({ occupation: '', province: '', english: '', time: '', budget: '' })
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  if (step === 'loading') {
    return (
      <div className="career-page">
        <div className="loading-wrap">
          <div className="spinner"></div>
          <p>AI正在分析你的职业背景，请稍候...</p>
        </div>
      </div>
    )
  }

  if (step === 'result') {
    return (
      <div className="career-page">
        <div className="career-container">
          <Link href="/" className="career-back">← 返回首页</Link>

          <div className="result-summary">
            <strong>你的背景：</strong>{form.occupation} · {form.province} · 英语{form.english} · 可投入{form.time} · 预算{form.budget}
          </div>

          <div
            className="result-content"
            dangerouslySetInnerHTML={{ __html: parseMarkdown(result) }}
          />

          <div className="result-actions">
            <button className="btn-secondary" onClick={resetForm}>重新规划</button>
            <button className="btn-primary-sm" onClick={copyLink}>
              {copied ? '✓ 已复制' : '复制链接分享'}
            </button>
          </div>

          <div className="result-sources">
            数据来源：&nbsp;
            <a href="https://www.skilledtradesontario.ca" target="_blank" rel="noopener">Skilled Trades Ontario</a>
            &nbsp;·&nbsp;
            <a href="https://www.cno.org" target="_blank" rel="noopener">CNO</a>
            &nbsp;·&nbsp;
            <a href="https://www.cpaontario.ca" target="_blank" rel="noopener">CPA Ontario</a>
            &nbsp;·&nbsp;
            <a href="https://www.jobbank.gc.ca" target="_blank" rel="noopener">Job Bank Canada</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="career-page">
      <div className="career-header">
        <h1>加拿大职业路径规划</h1>
        <p>输入你的背景，AI帮你找到在加拿大的职业方向</p>
      </div>

      <div className="career-container">
        <Link href="/" className="career-back">← 返回首页</Link>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>

          {/* 1. Occupation */}
          <div className="form-section">
            <label className="form-label">在中国从事的职业</label>
            <input
              className="form-input"
              type="text"
              placeholder="例如：护士、电工、会计师、厨师"
              value={form.occupation}
              onChange={e => setForm({ ...form, occupation: e.target.value })}
            />
          </div>

          {/* 2. Province */}
          <div className="form-section">
            <label className="form-label">目前所在省份</label>
            <select
              className="form-select"
              value={form.province}
              onChange={e => setForm({ ...form, province: e.target.value })}
            >
              {PROVINCES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* 3. English */}
          <div className="form-section">
            <label className="form-label">英语水平</label>
            <div className="radio-grid">
              {ENGLISH_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  className={`radio-card${form.english === opt.value ? ' selected' : ''}`}
                  onClick={() => setForm({ ...form, english: opt.value })}
                >
                  {opt.desc}
                </div>
              ))}
            </div>
          </div>

          {/* 4. Time */}
          <div className="form-section">
            <label className="form-label">可投入时间</label>
            <div className="radio-grid radio-grid-3">
              {TIME_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  className={`radio-card${form.time === opt.value ? ' selected' : ''}`}
                  onClick={() => setForm({ ...form, time: opt.value })}
                  style={{ textAlign: 'center' }}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          </div>

          {/* 5. Budget */}
          <div className="form-section">
            <label className="form-label">可用预算</label>
            <div className="radio-grid radio-grid-3">
              {BUDGET_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  className={`radio-card${form.budget === opt.value ? ' selected' : ''}`}
                  onClick={() => setForm({ ...form, budget: opt.value })}
                  style={{ textAlign: 'center', fontSize: '13px' }}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          </div>

          <button type="submit" className="submit-btn">开始分析 →</button>
          <p className="submit-hint">分析通常需要15–30秒，请稍候</p>
        </form>
      </div>
    </div>
  )
}
