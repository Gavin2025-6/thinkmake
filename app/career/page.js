'use client'
import { useState, useEffect, useRef } from 'react'
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

const LOADING_MESSAGES = [
  '正在分析你的职业背景...',
  '正在匹配加拿大认证路径...',
  '正在计算时间和费用...',
  '正在生成你的专属报告...',
]

// ── HELPERS ────────────────────────────────────────────────

function Req() {
  return <span style={{ color: '#ef4444', fontSize: '0.75em', marginLeft: '4px' }}>*</span>
}

function getCareerEmoji(name = '', emojiFromApi = '') {
  if (emojiFromApi) return emojiFromApi
  const n = name.toLowerCase()
  if (n.includes('护士') || n.includes('nurse') || n.includes('医')) return '🏥'
  if (n.includes('电工') || n.includes('electrician') || n.includes('水管') || n.includes('plumb')) return '🔧'
  if (n.includes('会计') || n.includes('cpa') || n.includes('accounting')) return '📊'
  if (n.includes('房地产') || n.includes('real estate') || n.includes('经纪')) return '🏠'
  if (n.includes('汽车') || n.includes('automotive') || n.includes('车')) return '🚗'
  if (n.includes('厨') || n.includes('chef') || n.includes('cook') || n.includes('餐')) return '👨‍🍳'
  if (n.includes('金融') || n.includes('finance') || n.includes('投资')) return '📈'
  if (n.includes('教') || n.includes('teacher') || n.includes('ece') || n.includes('幼')) return '👩‍🏫'
  if (n.includes('it') || n.includes('tech') || n.includes('程序') || n.includes('软件')) return '💻'
  if (n.includes('保险') || n.includes('insurance')) return '🛡️'
  return '🌟'
}


// ── FORM STATE ─────────────────────────────────────────────

const SALUTATION_OPTIONS = ['先生', '女士', '不透露']

const EMPTY_FORM = {
  occupation: '', experience_years: '', education: '', current_status: '',
  province: '', english: '', skills: [], study_mode: '', total_timeline: '',
  budget: '', concern: '', name: '', salutation: '', email: '', phone: '',
}

// ── MAIN COMPONENT ─────────────────────────────────────────

export default function CareerPage() {
  const [step, setStep] = useState('form')          // form | loading | result
  const [form, setForm] = useState(EMPTY_FORM)
  const [careers, setCareers] = useState([])
  const [emailStatus, setEmailStatus] = useState('pending')  // pending | sent | failed
  const [jobId, setJobId] = useState(null)
  const [error, setError] = useState('')
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const loadingTimerRef = useRef(null)
  const pollTimerRef = useRef(null)

  // Rotate loading messages every 3s
  useEffect(() => {
    if (step === 'loading') {
      loadingTimerRef.current = setInterval(() => {
        setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length)
      }, 3000)
    }
    return () => clearInterval(loadingTimerRef.current)
  }, [step])

  // Poll for email status when jobId is set
  useEffect(() => {
    if (!jobId || step !== 'result') return
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/career/status?id=${jobId}`)
        const data = await res.json()
        if (data.status === 'sent' || data.status === 'failed') {
          setEmailStatus(data.status)
          clearInterval(pollTimerRef.current)
        }
      } catch (_) {}
    }, 5000)
    return () => clearInterval(pollTimerRef.current)
  }, [jobId, step])

  function set(key, value) { setForm(prev => ({ ...prev, [key]: value })) }

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
      'budget', 'concern', 'name', 'salutation', 'email',
    ]
    const missing = required.filter(k => !form[k])
    if (missing.length > 0) {
      setError('请填写所有必填字段')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!form.email.includes('@')) { setError('请输入有效的邮箱地址'); return }

    setError('')
    setStep('loading')
    setLoadingMsgIdx(0)
    setCareers([])
    setEmailStatus('pending')

    try {
      const res = await fetch('/api/career', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      console.log('[CareerPath] response:', data)

      if (!res.ok || data.error) {
        setError(data.error || '分析失败，请稍后重试')
        setStep('form')
        return
      }

      clearInterval(loadingTimerRef.current)
      setCareers(data.careers || [])
      setJobId(data.jobId || null)
      setEmailStatus('pending')
      setStep('result')
    } catch (err) {
      console.error('[CareerPath] error:', err)
      setError(err.message || '分析失败，请稍后重试')
      setStep('form')
    }
  }

  function resetForm() {
    clearInterval(loadingTimerRef.current)
    clearInterval(pollTimerRef.current)
    setStep('form'); setCareers([]); setEmailStatus('pending')
    setJobId(null); setError(''); setLoadingMsgIdx(0)
    setForm(EMPTY_FORM)
  }

  // ── LOADING ──
  if (step === 'loading') {
    return (
      <div className="career-page">
        <div className="loading-wrap">
          <div className="spinner" />
          <p className="loading-msg">{LOADING_MESSAGES[loadingMsgIdx]}</p>
        </div>
      </div>
    )
  }

  // ── RESULT ──
  if (step === 'result') {
    const emailBadgeText = emailStatus === 'sent'
      ? `✓ 报告已发至 ${form.email}`
      : emailStatus === 'failed'
      ? '⚠ 邮件发送失败，请截图保存'
      : '⏳ 完整报告生成中，稍后发至邮箱'
    const emailBadgeClass = emailStatus === 'sent'
      ? 'res-email-tag'
      : emailStatus === 'failed'
      ? 'res-email-tag res-email-tag-warn'
      : 'res-email-tag res-email-tag-pending'

    return (
      <div className="career-page">

        <div className="res-header">
          <div className="res-header-meta">{form.name} · {form.province} · {form.occupation}</div>
          <div className="res-header-sub">根据你的背景，以下是最匹配的职业方向</div>
          <div className={emailBadgeClass}>{emailBadgeText}</div>
        </div>

        <div className="res-cards-wrap">
          {careers.length > 0 ? (
            <div className="res-cards-grid">
              {careers.map((c, i) => {
                const safeEmoji = c.emoji && /^\p{Emoji}/u.test(c.emoji) ? c.emoji : '💼'
                return (
                <div key={i} className="res-card">
                  <div className="res-card-emoji">{getCareerEmoji(c.name, safeEmoji)}</div>
                  <div className="res-card-name">{c.name}</div>
                  <div className="res-card-reason">{c.match_reason}</div>
                  <div className="res-card-data">
                    <span>⏱ {c.time}</span>
                    <span>💰 {c.cost}</span>
                    <span>📈 {c.salary}</span>
                  </div>
                </div>
                )
              })}
            </div>
          ) : (
            <div className="res-empty">数据解析失败，请查收邮件中的完整报告</div>
          )}
        </div>

        <div className="res-bottom">
          <p className="res-bottom-note">完整认证步骤和行动清单将发送至你的邮箱</p>
          <button className="btn-outline" onClick={resetForm}>重新规划</button>
          <div className="res-sources">
            <a href="https://www.skilledtradesontario.ca" target="_blank" rel="noopener">Skilled Trades Ontario</a>
            &nbsp;·&nbsp;<a href="https://www.cno.org" target="_blank" rel="noopener">CNO</a>
            &nbsp;·&nbsp;<a href="https://www.cpaontario.ca" target="_blank" rel="noopener">CPA Ontario</a>
            &nbsp;·&nbsp;<a href="https://www.fsrao.ca" target="_blank" rel="noopener">FSRA</a>
            &nbsp;·&nbsp;<a href="https://www.jobbank.gc.ca" target="_blank" rel="noopener">Job Bank Canada</a>
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

        <p className="form-required-note">* 为必填项</p>
        <form onSubmit={handleSubmit}>

          <div className="form-section">
            <label className="form-label">在中国从事的职业<Req /></label>
            <input className="form-input" type="text"
              placeholder="例如：护士、电工、会计师、厨师"
              value={form.occupation} onChange={e => set('occupation', e.target.value)} />
          </div>

          <div className="form-section">
            <label className="form-label">从事年限<Req /></label>
            <div className="radio-grid radio-grid-3">
              {EXPERIENCE_OPTIONS.map(opt => (
                <div key={opt} style={{ textAlign: 'center' }}
                  className={`radio-card${form.experience_years === opt ? ' selected' : ''}`}
                  onClick={() => set('experience_years', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">最高学历<Req /></label>
            <div className="radio-grid radio-grid-4">
              {EDUCATION_OPTIONS.map(opt => (
                <div key={opt} style={{ textAlign: 'center' }}
                  className={`radio-card${form.education === opt ? ' selected' : ''}`}
                  onClick={() => set('education', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">目前状态<Req /></label>
            <div className="radio-grid">
              {STATUS_OPTIONS.map(opt => (
                <div key={opt}
                  className={`radio-card${form.current_status === opt ? ' selected' : ''}`}
                  onClick={() => set('current_status', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">目前所在省份<Req /></label>
            <select className="form-select" value={form.province}
              onChange={e => set('province', e.target.value)}>
              {PROVINCES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="form-section">
            <label className="form-label">英语水平<Req /></label>
            <div className="radio-grid">
              {ENGLISH_OPTIONS.map(opt => (
                <div key={opt.value}
                  className={`radio-card${form.english === opt.value ? ' selected' : ''}`}
                  onClick={() => set('english', opt.value)}>{opt.desc}</div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">
              除主要职业外，你还有哪些相关经验？
              <span className="form-label-opt">（选填，可多选）</span>
            </label>
            <div className="skills-grid">
              {SKILLS_LIST.map(skill => (
                <div key={skill}
                  className={`skill-tag${form.skills.includes(skill) ? ' selected' : ''}`}
                  onClick={() => toggleSkill(skill)}>{skill}</div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">学习方式<Req /></label>
            <div className="radio-grid">
              {STUDY_OPTIONS.map(opt => (
                <div key={opt}
                  className={`radio-card${form.study_mode === opt ? ' selected' : ''}`}
                  onClick={() => set('study_mode', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">可接受总周期<Req /></label>
            <div className="radio-grid">
              {TIMELINE_OPTIONS.map(opt => (
                <div key={opt}
                  className={`radio-card${form.total_timeline === opt ? ' selected' : ''}`}
                  onClick={() => set('total_timeline', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">可用预算<Req /></label>
            <div className="radio-grid radio-grid-3">
              {BUDGET_OPTIONS.map(opt => (
                <div key={opt} style={{ textAlign: 'center', fontSize: '13px' }}
                  className={`radio-card${form.budget === opt ? ' selected' : ''}`}
                  onClick={() => set('budget', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">最大的顾虑是什么？<Req /></label>
            <div className="radio-grid radio-grid-2">
              {CONCERN_OPTIONS.map(opt => (
                <div key={opt}
                  className={`radio-card${form.concern === opt ? ' selected' : ''}`}
                  onClick={() => set('concern', opt)}>{opt}</div>
              ))}
            </div>
          </div>

          <div className="contact-section">
            <div className="contact-section-title">留下联系方式，完整报告发到你邮箱</div>
            <div className="contact-section-sub">完整认证步骤和行动清单将发送至邮箱</div>
            <div className="form-section" style={{ marginBottom: '16px' }}>
              <label className="form-label">姓名<Req /></label>
              <input className="form-input" type="text" placeholder="你的名字"
                value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-section" style={{ marginBottom: '16px' }}>
              <label className="form-label">称谓<Req /></label>
              <div className="radio-grid radio-grid-3">
                {SALUTATION_OPTIONS.map(opt => (
                  <div key={opt} style={{ textAlign: 'center' }}
                    className={`radio-card${form.salutation === opt ? ' selected' : ''}`}
                    onClick={() => set('salutation', opt)}>{opt}</div>
                ))}
              </div>
            </div>
            <div className="form-section" style={{ marginBottom: '16px' }}>
              <label className="form-label">邮箱<Req /></label>
              <input className="form-input" type="email" placeholder="your@email.com"
                value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="form-section" style={{ marginBottom: 0 }}>
              <label className="form-label">手机号</label>
              <input className="form-input" type="tel" placeholder="647-xxx-xxxx（选填）"
                value={form.phone} onChange={e => set('phone', e.target.value)} />
              <p className="form-hint">选填 · 用于培训机构与你直接联系</p>
            </div>
          </div>

          <button type="submit" className="submit-btn">开始分析 →</button>
          <p className="submit-hint">分析通常需要15–30秒，请稍候</p>
        </form>
      </div>
    </div>
  )
}
