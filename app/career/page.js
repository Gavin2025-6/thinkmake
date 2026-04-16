'use client'
import { useState } from 'react'
import Link from 'next/link'

// ── CONSTANTS ──────────────────────────────────────────────

const PROVINCES = [
  { value: '', label: '请选择省份' },
  { value: '安大略省 Ontario', label: '安大略省 Ontario' },
  { value: '不列颠哥伦比亚省 BC', label: '不列颠哥伦比亚省 BC' },
  { value: '阿尔伯塔省 Alberta', label: '阿尔伯塔省 Alberta' },
  { value: '其他省份', label: '其他省份' },
]
const EXPERIENCE_OPTIONS = ['1–3年', '3–8年', '8年以上']
const EDUCATION_OPTIONS = ['高中/中专', '大专', '本科', '硕士及以上']
const STATUS_OPTIONS = [
  '还没来加拿大，正在规划',
  '刚到加拿大，6个月以内',
  '已在加拿大1年以上',
]
const ENGLISH_OPTIONS = [
  { value: '基础', desc: '基础：日常对话勉强，书面英语较弱' },
  { value: '中等', desc: '中等：能沟通工作内容，有口音' },
  { value: '流利', desc: '流利：工作语言无障碍' },
]
const SKILLS_LIST = [
  '管理过团队', '有G驾照', '销售/客户服务',
  '财务/会计相关', '体力/户外工作', '教学/培训',
  '医疗/护理相关', '行政/文员', 'IT/电脑技术',
  '烹饪/餐饮', '驾驶/运输', '建筑/装修',
]
const STUDY_OPTIONS = [
  '全职学习：每天可投入6小时以上',
  '兼职学习：边工作边学，每天2-3小时',
  '极度有限：家庭或工作占用，每天约1小时',
]
const TIMELINE_OPTIONS = [
  '1年以内想开始工作',
  '1-3年都可以接受',
  '3年以上没问题，要做就做最好的',
]
const BUDGET_OPTIONS = ['$5,000以下', '$5,000–$20,000', '$20,000以上']
const CONCERN_OPTIONS = [
  '不知道从哪里开始',
  '担心英语不够用',
  '不确定预算够不够',
  '担心年龄影响就业',
  '家人不支持转行',
  '其他',
]

// ── MARKDOWN PARSER ────────────────────────────────────────

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
      flushList(); out.push(`<h3 class="md-h3">${inline(line.slice(4))}</h3>`)
    } else if (/^## /.test(line)) {
      flushList(); out.push(`<h2 class="md-h2">${inline(line.slice(3))}</h2>`)
    } else if (/^# /.test(line)) {
      flushList(); out.push(`<h1 class="md-h1">${inline(line.slice(2))}</h1>`)
    } else if (/^\d+\. /.test(line)) {
      if (listType === 'ul') flushList()
      listType = 'ol'
      listBuf.push(`<li>${inline(line.replace(/^\d+\. /, ''))}</li>`)
    } else if (/^[-•*] /.test(line)) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      listBuf.push(`<li>${inline(line.slice(2))}</li>`)
    } else if (line.trim() === '') {
      flushList(); out.push('<div class="md-spacer"></div>')
    } else {
      flushList(); out.push(`<p class="md-p">${inline(line)}</p>`)
    }
  }
  flushList()
  return out.join('')
}

// ── MAIN COMPONENT ─────────────────────────────────────────

const EMPTY_FORM = {
  occupation: '', experience_years: '', education: '', current_status: '',
  province: '', english: '', skills: [], study_mode: '', total_timeline: '',
  budget: '', concern: '', name: '', email: '',
}

export default function CareerPage() {
  const [step, setStep] = useState('form')
  const [form, setForm] = useState(EMPTY_FORM)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleSkill(skill) {
    setForm(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const required = [
      'occupation', 'experience_years', 'education', 'current_status',
      'province', 'english', 'study_mode', 'total_timeline',
      'budget', 'concern', 'name', 'email',
    ]
    if (required.some(k => !form[k])) { setError('请填写所有必填字段'); return }
    if (!form.email.includes('@')) { setError('请输入有效的邮箱地址'); return }
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
      setResult(data)
      setStep('result')
    } catch {
      setError('分析失败，请稍后重试')
      setStep('form')
    }
  }

  function resetForm() {
    setStep('form'); setResult(null); setError(''); setExpanded(false)
    setForm(EMPTY_FORM)
  }

  // ── LOADING ──
  if (step === 'loading') {
    return (
      <div className="career-page">
        <div className="loading-wrap">
          <div className="spinner" />
          <p>AI正在分析你的职业背景，请稍候...</p>
        </div>
      </div>
    )
  }

  // ── RESULT ──
  if (step === 'result' && result) {
    const careers = result.summary?.careers || []
    const fullReport = result.full_report || ''
    const emailFailed = result.email_failed

    return (
      <div className="career-page">
        <div className="result-banner">
          <div className="result-banner-title">✓ {form.name}，你的职业规划已生成</div>
          <div className="result-banner-sub">
            {emailFailed
              ? '报告已生成（邮件发送失败，请截图保存）'
              : `完整报告已发送至 ${form.email}，请查收`}
          </div>
        </div>

        <div className="career-container">
          {careers.length > 0 && (
            <>
              <div className="section-label-sm">推荐职业方向</div>
              <div className="career-cards-grid">
                {careers.map((c, i) => (
                  <div key={i} className="career-summary-card">
                    <div className="career-summary-name">{c.name}</div>
                    <div className="career-summary-reason">{c.match_reason}</div>
                    <div className="career-data-row">
                      <span className="career-data-item">⏱&nbsp;{c.time}</span>
                      <span className="career-data-item">💰&nbsp;{c.cost}</span>
                      <span className="career-data-item">💵&nbsp;{c.salary}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <hr className="section-divider" />
          <button className="expand-btn" onClick={() => setExpanded(v => !v)}>
            {expanded ? '收起报告 ↑' : '展开完整报告 ↓'}
          </button>

          {expanded && fullReport && (
            <div className="result-content"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(fullReport) }} />
          )}

          <div className="result-actions">
            <button className="btn-secondary" onClick={resetForm}>重新规划</button>
          </div>

          <div className="result-sources">
            数据来源：&nbsp;
            <a href="https://www.skilledtradesontario.ca" target="_blank" rel="noopener">Skilled Trades Ontario</a>
            &nbsp;·&nbsp;
            <a href="https://www.cno.org" target="_blank" rel="noopener">CNO</a>
            &nbsp;·&nbsp;
            <a href="https://www.cpaontario.ca" target="_blank" rel="noopener">CPA Ontario</a>
            &nbsp;·&nbsp;
            <a href="https://www.fsrao.ca" target="_blank" rel="noopener">FSRA</a>
            &nbsp;·&nbsp;
            <a href="https://www.jobbank.gc.ca" target="_blank" rel="noopener">Job Bank Canada</a>
          </div>
        </div>
      </div>
    )
  }

  // ── FORM ──
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

          {/* 1. 职业 */}
          <div className="form-section">
            <label className="form-label">在中国从事的职业</label>
            <input className="form-input" type="text"
              placeholder="例如：护士、电工、会计师、厨师"
              value={form.occupation}
              onChange={e => set('occupation', e.target.value)} />
          </div>

          {/* 2. 年限 */}
          <div className="form-section">
            <label className="form-label">从事年限</label>
            <div className="radio-grid radio-grid-3">
              {EXPERIENCE_OPTIONS.map(opt => (
                <div key={opt} style={{ textAlign: 'center' }}
                  className={`radio-card${form.experience_years === opt ? ' selected' : ''}`}
                  onClick={() => set('experience_years', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          {/* 3. 学历 */}
          <div className="form-section">
            <label className="form-label">最高学历</label>
            <div className="radio-grid radio-grid-4">
              {EDUCATION_OPTIONS.map(opt => (
                <div key={opt} style={{ textAlign: 'center' }}
                  className={`radio-card${form.education === opt ? ' selected' : ''}`}
                  onClick={() => set('education', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          {/* 4. 目前状态 */}
          <div className="form-section">
            <label className="form-label">目前状态</label>
            <div className="radio-grid">
              {STATUS_OPTIONS.map(opt => (
                <div key={opt}
                  className={`radio-card${form.current_status === opt ? ' selected' : ''}`}
                  onClick={() => set('current_status', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          {/* 5. 省份 */}
          <div className="form-section">
            <label className="form-label">目前所在省份</label>
            <select className="form-select" value={form.province}
              onChange={e => set('province', e.target.value)}>
              {PROVINCES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* 6. 英语 */}
          <div className="form-section">
            <label className="form-label">英语水平</label>
            <div className="radio-grid">
              {ENGLISH_OPTIONS.map(opt => (
                <div key={opt.value}
                  className={`radio-card${form.english === opt.value ? ' selected' : ''}`}
                  onClick={() => set('english', opt.value)}>{opt.desc}</div>
              ))}
            </div>
          </div>

          {/* 7. 技能多选 */}
          <div className="form-section">
            <label className="form-label">
              除主要职业外，你还有哪些相关经验？
              <span className="form-label-opt">（可多选）</span>
            </label>
            <div className="skills-grid">
              {SKILLS_LIST.map(skill => (
                <div key={skill}
                  className={`skill-tag${form.skills.includes(skill) ? ' selected' : ''}`}
                  onClick={() => toggleSkill(skill)}>{skill}</div>
              ))}
            </div>
          </div>

          {/* 8. 学习方式 */}
          <div className="form-section">
            <label className="form-label">学习方式</label>
            <div className="radio-grid">
              {STUDY_OPTIONS.map(opt => (
                <div key={opt}
                  className={`radio-card${form.study_mode === opt ? ' selected' : ''}`}
                  onClick={() => set('study_mode', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          {/* 9. 总周期 */}
          <div className="form-section">
            <label className="form-label">可接受总周期</label>
            <div className="radio-grid">
              {TIMELINE_OPTIONS.map(opt => (
                <div key={opt}
                  className={`radio-card${form.total_timeline === opt ? ' selected' : ''}`}
                  onClick={() => set('total_timeline', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          {/* 10. 预算 */}
          <div className="form-section">
            <label className="form-label">可用预算</label>
            <div className="radio-grid radio-grid-3">
              {BUDGET_OPTIONS.map(opt => (
                <div key={opt} style={{ textAlign: 'center', fontSize: '13px' }}
                  className={`radio-card${form.budget === opt ? ' selected' : ''}`}
                  onClick={() => set('budget', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          {/* 11. 顾虑 */}
          <div className="form-section">
            <label className="form-label">最大的顾虑是什么？</label>
            <div className="radio-grid radio-grid-2">
              {CONCERN_OPTIONS.map(opt => (
                <div key={opt}
                  className={`radio-card${form.concern === opt ? ' selected' : ''}`}
                  onClick={() => set('concern', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          {/* 12. 联系方式 */}
          <div className="contact-section">
            <div className="contact-section-title">留下联系方式，完整报告发到你邮箱</div>
            <div className="contact-section-sub">完整认证步骤和行动清单将发送至邮箱</div>
            <div className="form-section" style={{ marginBottom: '16px' }}>
              <label className="form-label">姓名</label>
              <input className="form-input" type="text" placeholder="你的名字"
                value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-section" style={{ marginBottom: 0 }}>
              <label className="form-label">邮箱</label>
              <input className="form-input" type="email" placeholder="your@email.com"
                value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>

          <button type="submit" className="submit-btn">开始分析 →</button>
          <p className="submit-hint">分析通常需要15–30秒，请稍候</p>
        </form>
      </div>
    </div>
  )
}
