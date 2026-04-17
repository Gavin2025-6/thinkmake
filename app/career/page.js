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

// ── REQUIRED ASTERISK ─────────────────────────────────────
const Req = <span style={{ color: '#ef4444', fontSize: '0.75em', marginLeft: '4px' }}>*</span>

// ── ENGLISH RESOURCES ─────────────────────────────────────

function getEnglishResources(englishLevel, careerName) {
  const n = (careerName || '').toLowerCase()

  let vocabHint = '学习该行业专业词汇，建立职场英语基础'
  if (n.includes('保险') || n.includes('insurance')) vocabHint = '重点学习LLQP考试词汇（支持中文应考，英语压力小）'
  else if (n.includes('房地产') || n.includes('real estate') || n.includes('经纪')) vocabHint = '学习OREA课程术语，掌握合同和法律词汇'
  else if (n.includes('护士') || n.includes('nurse') || n.includes('医')) vocabHint = '学习医疗英语：病历记录、用药沟通、患者交流术语'
  else if (n.includes('会计') || n.includes('cpa') || n.includes('accounting')) vocabHint = '学习财务英语：审计、税务、财务报表专业词汇'
  else if (n.includes('电工') || n.includes('electrician') || n.includes('水管') || n.includes('plumb')) vocabHint = '学习技工英语：图纸阅读、安全规范、操作手册'
  else if (n.includes('厨') || n.includes('chef') || n.includes('cook') || n.includes('餐')) vocabHint = '学习餐饮英语：菜单写作、食品安全法规术语'

  if (englishLevel === '基础') {
    return {
      title: '📚 英语提升建议',
      items: [
        { text: '多伦多公共图书馆 · 免费ESL课程', url: 'https://www.tpl.ca/programs-and-events/learning/english-language-learning' },
        { text: 'Settlement.org · 免费语言培训资源', url: 'https://settlement.org/ontario/education/english-as-a-second-language-esl/' },
        { text: vocabHint, url: null },
      ],
    }
  }

  if (englishLevel === '中等') {
    let yt = '搜索该行业英文YouTube频道，跟进行业最新资讯'
    let free = '查看行业协会官网的免费学习资源和备考材料'
    if (n.includes('保险') || n.includes('insurance')) {
      yt = 'YouTube: "Insurance School of Canada" 频道'
      free = 'FSRA 官网 · 免费备考指引与样题'
    } else if (n.includes('房地产') || n.includes('real estate') || n.includes('经纪')) {
      yt = 'YouTube: 搜索 "OREA real estate exam" 相关频道'
      free = 'RECO 官网 · 免费入门课程与考试大纲'
    } else if (n.includes('会计') || n.includes('cpa') || n.includes('accounting')) {
      yt = 'YouTube: "CPA Canada" 官方频道'
      free = 'CPA Ontario 官网 · 免费备考资源包'
    } else if (n.includes('护士') || n.includes('nurse') || n.includes('医')) {
      yt = 'YouTube: "Nurse Sarah" / "Simple Nursing" 频道'
      free = 'CNO 官网 · 注册流程与英语要求详解'
    }
    return {
      title: '📺 行业英语资源',
      items: [
        { text: yt, url: null },
        { text: free, url: null },
      ],
    }
  }

  // 流利 — no dropdown, show inline note
  return { fluent: true }
}

// ── CAREER EMOJI MAP ──────────────────────────────────────

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

// ── MAIN COMPONENT ─────────────────────────────────────────

const EMPTY_FORM = {
  occupation: '', experience_years: '', education: '', current_status: '',
  province: '', english: '', skills: [], study_mode: '', total_timeline: '',
  budget: '', concern: '', name: '', email: '', phone: '',
}

export default function CareerPage() {
  const [step, setStep] = useState('form')
  const [form, setForm] = useState(EMPTY_FORM)
  const [careers, setCareers] = useState([])
  const [requestId, setRequestId] = useState(null)
  const [emailStatus, setEmailStatus] = useState('pending') // pending | sent | failed
  const [error, setError] = useState('')
  const [expandedEnglish, setExpandedEnglish] = useState({})
  const pollRef = useRef(null)

  // ── POLLING ──
  useEffect(() => {
    if (step !== 'result' || !requestId) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/career/status?id=${requestId}`)
        const data = await res.json()
        if (data.status === 'sent' || data.status === 'failed') {
          setEmailStatus(data.status)
          clearInterval(pollRef.current)
        }
      } catch { /* ignore poll errors */ }
    }, 3000)
    return () => clearInterval(pollRef.current)
  }, [step, requestId])

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
    const missing = required.filter(k => !form[k])
    console.log('[CareerPath] submit triggered, missing fields:', missing, 'form:', form)
    if (missing.length > 0) {
      setError('请填写所有必填字段：' + missing.join(', '))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
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
      console.log('[CareerPath] response:', data)
      console.log('[CareerPath] careers:', data?.careers)
      if (!res.ok || data.error) {
        setError(data.error || '分析失败，请稍后重试')
        setStep('form')
        return
      }
      setCareers(data.careers || [])
      setRequestId(data.requestId)
      setEmailStatus('pending')
      setStep('result')
    } catch (err) {
      console.error('[CareerPath] fetch error:', err)
      setError('分析失败，请稍后重试')
      setStep('form')
    }
  }

  function resetForm() {
    clearInterval(pollRef.current)
    setStep('form'); setCareers([]); setRequestId(null)
    setEmailStatus('pending'); setError('')
    setForm(EMPTY_FORM)
  }

  // ── LOADING ──
  if (step === 'loading') {
    return (
      <div className="career-page">
        <div className="loading-wrap">
          <div className="spinner" />
          <p>正在分析你的背景...</p>
        </div>
      </div>
    )
  }

  // ── RESULT ──
  if (step === 'result') {
    const emailBadgeText = emailStatus === 'sent'
      ? '✓ 报告已发至邮箱'
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

        {/* ── HEADER BAR ── */}
        <div className="res-header">
          <div className="res-header-meta">
            {form.name} · {form.province} · {form.occupation}
          </div>
          <div className="res-header-sub">根据你的背景，以下是最匹配的职业方向</div>
          <div className={emailBadgeClass}>{emailBadgeText}</div>
        </div>

        {/* ── CAREER CARDS ── */}
        <div className="res-cards-wrap">
          {careers.length > 0 ? (
            <div className="res-cards-grid">
              {careers.map((c, i) => {
                const engRes = getEnglishResources(form.english, c.name)
                const isOpen = !!expandedEnglish[i]
                return (
                  <div key={i} className="res-card">
                    <div className="res-card-emoji">{getCareerEmoji(c.name, c.emoji)}</div>
                    <div className="res-card-name">{c.name}</div>
                    <div className="res-card-reason">{c.match_reason}</div>
                    <div className="res-card-data">
                      <span>⏱ {c.time}</span>
                      <span>💰 {c.cost}</span>
                      <span>📈 {c.salary}</span>
                    </div>
                    {engRes && !engRes.fluent && (
                      <div className="res-eng-section">
                        <button
                          className="res-eng-toggle"
                          onClick={() => setExpandedEnglish(prev => ({ ...prev, [i]: !prev[i] }))}
                        >
                          {engRes.title} {isOpen ? '↑' : '↓'}
                        </button>
                        {isOpen && (
                          <ul className="res-eng-list">
                            {engRes.items.map((item, j) => (
                              <li key={j}>
                                {item.url
                                  ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.text}</a>
                                  : item.text}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {engRes?.fluent && (
                      <div className="res-eng-fluent">
                        ✓ 英语优势：可直接参加全英文培训课程
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="res-empty">
              数据解析失败，请查收邮件中的完整报告
            </div>
          )}
        </div>

        {/* ── BOTTOM ── */}
        <div className="res-bottom">
          <p className="res-bottom-note">完整认证步骤和行动清单将发送至你的邮箱</p>
          <button className="btn-outline" onClick={resetForm}>重新规划</button>
          <div className="res-sources">
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

        <p className="form-required-note">* 为必填项</p>
        <form onSubmit={handleSubmit}>

          {/* 1. 职业 */}
          <div className="form-section">
            <label className="form-label">在中国从事的职业{Req}</label>
            <input className="form-input" type="text"
              placeholder="例如：护士、电工、会计师、厨师"
              value={form.occupation}
              onChange={e => set('occupation', e.target.value)} />
          </div>

          {/* 2. 年限 */}
          <div className="form-section">
            <label className="form-label">从事年限{Req}</label>
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
            <label className="form-label">最高学历{Req}</label>
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
            <label className="form-label">目前状态{Req}</label>
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
            <label className="form-label">目前所在省份{Req}</label>
            <select className="form-select" value={form.province}
              onChange={e => set('province', e.target.value)}>
              {PROVINCES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* 6. 英语 */}
          <div className="form-section">
            <label className="form-label">英语水平{Req}</label>
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
            <label className="form-label">学习方式{Req}</label>
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
            <label className="form-label">可接受总周期{Req}</label>
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
            <label className="form-label">可用预算{Req}</label>
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
            <label className="form-label">最大的顾虑是什么？{Req}</label>
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
              <label className="form-label">姓名{Req}</label>
              <input className="form-input" type="text" placeholder="你的名字"
                value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-section" style={{ marginBottom: '16px' }}>
              <label className="form-label">邮箱{Req}</label>
              <input className="form-input" type="email" placeholder="your@email.com"
                value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="form-section" style={{ marginBottom: 0 }}>
              <label className="form-label">手机号</label>
              <input className="form-input" type="tel"
                placeholder="647-xxx-xxxx（选填）"
                value={form.phone} onChange={e => set('phone', e.target.value)} />
              <p className="form-hint">选填 · 用于培训机构与你直接联系</p>
            </div>
          </div>

          <button type="submit" className="submit-btn">开始分析 →</button>
          <p className="submit-hint">分析通常需要5–10秒，请稍候</p>
        </form>
      </div>
    </div>
  )
}
