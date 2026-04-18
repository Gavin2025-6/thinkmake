'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

// Progress bar pulses to show activity, no fixed count shown

// ── Markdown renderer ─────────────────────────────────────────
function renderMd(text) {
  if (!text) return ''
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<h2 class="chat-h2">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="chat-h3">$1</h3>')
    .replace(/^- (.+)$/gm, '<span class="chat-li">· $1</span><br>')
    .replace(/^(\d+)\. (.+)$/gm, '<span class="chat-li"><strong>$1.</strong> $2</span><br>')
    .replace(/\n\n/g, '<br>')
    .replace(/\n/g, '<br>')
}

// ── Recommendation Card ───────────────────────────────────────
function RecCard({ rec }) {
  const [open, setOpen] = useState(false)
  const isHigh = rec.matchPct >= 80
  return (
    <div className="rec-card">
      <div className="rec-card-top">
        <div className="rec-title">{rec.title}</div>
        <span className={isHigh ? 'rec-badge rec-badge-high' : 'rec-badge rec-badge-mid'}>
          匹配度 {rec.matchPct}%
        </span>
      </div>
      <p className="rec-why">{rec.why}</p>
      <div className="rec-stats">
        <span>⏱ {rec.timeline}</span>
        <span>💰 {rec.cost}</span>
        <span>📈 {rec.income}</span>
      </div>
      {rec.sourceUrl && (
        <a href={rec.sourceUrl} target="_blank" rel="noopener" className="rec-source">
          数据来源：{rec.sourceName || rec.sourceUrl}
        </a>
      )}
      <button className="rec-expand" onClick={() => setOpen(o => !o)}>
        {open ? '收起 ▲' : '了解详细路径 ▼'}
      </button>
      {open && <p className="rec-details">{rec.details}</p>}
    </div>
  )
}

// ── Summary View ──────────────────────────────────────────────
function SummaryView({ data, userName, userEmail, sessionId }) {
  const [leadDone, setLeadDone] = useState(false)
  const [leadWechat, setLeadWechat] = useState('')
  const [leadSubmitting, setLeadSubmitting] = useState(false)
  const [leadError, setLeadError] = useState('')

  // Auto-submit lead if we already have email from onboarding
  useEffect(() => {
    if (userEmail && !leadDone) {
      submitLead(userEmail, '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [leadFallback, setLeadFallback] = useState('')

  async function submitLead(email, wechat) {
    try {
      const summaryText = data ? JSON.stringify(data) : ''
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, wechat, sessionId, summaryText, consent: true }),
      })
      const json = await res.json()
      if (res.ok) {
        setLeadDone(true)
        if (json.fallbackMessage) setLeadFallback(json.fallbackMessage)
      }
    } catch {}
  }

  async function handleWechatSubmit(e) {
    e.preventDefault()
    setLeadSubmitting(true)
    setLeadError('')
    await submitLead(userEmail, leadWechat)
    setLeadSubmitting(false)
  }

  if (!data) return null

  return (
    <div className="summary-wrap">
      {/* Portrait */}
      <div className="summary-portrait">
        <div className="summary-portrait-label">你的画像</div>
        <p>{data.portrait}</p>
      </div>

      {/* Recommendation cards */}
      <div className="summary-section-title">推荐方向</div>
      <div className="rec-grid">
        {(data.recommendations || []).map((rec, i) => (
          <RecCard key={i} rec={rec} />
        ))}
      </div>

      {/* Cases */}
      {data.cases?.length > 0 && (
        <div className="summary-block">
          <div className="summary-block-title">📚 真实案例参考</div>
          {data.cases.map((c, i) => (
            <div key={i} className="case-item">
              <div className="case-desc">{c.description}</div>
              {c.quote && <div className="case-quote">"{c.quote}"</div>}
              {c.lesson && <div className="case-lesson">→ {c.lesson}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Certainty */}
      {data.certainty && (
        <div className="summary-block">
          <div className="summary-block-title">确定性分级</div>
          {data.certainty.sure?.map((s, i) => (
            <div key={i} className="certainty-item">✅ {s}</div>
          ))}
          {data.certainty.unsure?.map((s, i) => (
            <div key={i} className="certainty-item">⚠️ {s}</div>
          ))}
          {data.certainty.professional?.map((s, i) => (
            <div key={i} className="certainty-item">❓ {s}</div>
          ))}
        </div>
      )}

      {/* Next steps */}
      {data.nextSteps?.length > 0 && (
        <div className="summary-block">
          <div className="summary-block-title">🎯 明天能做的事</div>
          {data.nextSteps.map((s, i) => (
            <div key={i} className="nextstep-item"><span className="nextstep-num">{i + 1}</span>{s}</div>
          ))}
        </div>
      )}

      {/* Resources */}
      {data.resources?.length > 0 && (
        <div className="summary-block">
          <div className="summary-block-title">🔗 相关资源</div>
          <div className="resources-list">
            {data.resources.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener" className="resource-link">
                {r.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Lead / email confirmation */}
      <div className="lead-final-card">
        {leadDone ? (
          <>
            <div className="lead-done-text">
            {leadFallback || `✅ 完整报告已发送至 ${userEmail}`}
          </div>
            <div className="lead-wechat-block">
              <div className="lead-wechat-label">想要一对一深度指导？</div>
              <div className="lead-wechat-id">微信：{process.env.NEXT_PUBLIC_WECHAT_CONTACT || 'thinkmake_ca'}</div>
            </div>
            <form onSubmit={handleWechatSubmit} className="lead-wechat-form">
              <input
                className="onboard-input"
                type="text"
                placeholder="留下你的微信号，我们主动联系你"
                value={leadWechat}
                onChange={e => setLeadWechat(e.target.value)}
              />
              {leadError && <div className="lead-error">{leadError}</div>}
              <button type="submit" className="onboard-btn" disabled={leadSubmitting || !leadWechat}>
                {leadSubmitting ? '提交中...' : '提交微信号'}
              </button>
            </form>
          </>
        ) : (
          <div className="lead-done-text">⏳ 发送报告中...</div>
        )}
      </div>
    </div>
  )
}

// ── Onboarding Form ───────────────────────────────────────────
function OnboardingForm({ onSubmit }) {
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(true)
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('请填写称呼'); return }
    if (!email.includes('@')) { setError('请输入有效的邮箱地址'); return }
    setError('')
    onSubmit({ name: name.trim(), gender, email: email.trim().toLowerCase(), phone, consent })
  }

  return (
    <div className="onboard-root">
      <div className="onboard-card">
        <div className="onboard-logo">Think<span>Make</span></div>
        <h1 className="onboard-title">加拿大职业规划</h1>
        <p className="onboard-sub">AI 顾问，基于真实案例 + 权威资源，帮你找到最适合的方向</p>

        <form onSubmit={handleSubmit} className="onboard-form">
          <div className="onboard-field">
            <label className="onboard-label">怎么称呼你 <span className="req">*</span></label>
            <input className="onboard-input" type="text" placeholder="例如：王芳、小明、Kelly"
              value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="onboard-field">
            <label className="onboard-label">性别</label>
            <div className="onboard-radio-group">
              {['男', '女', '不想透露'].map(g => (
                <label key={g} className={`onboard-radio${gender === g ? ' selected' : ''}`}>
                  <input type="radio" name="gender" value={g}
                    checked={gender === g} onChange={() => setGender(g)} />
                  {g}
                </label>
              ))}
            </div>
          </div>

          <div className="onboard-field">
            <label className="onboard-label">邮箱 <span className="req">*</span></label>
            <input className="onboard-input" type="email" placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)} />
            <span className="onboard-hint">规划报告将发送到这里</span>
          </div>

          <div className="onboard-field">
            <label className="onboard-label">电话</label>
            <input className="onboard-input" type="tel" placeholder="647-xxx-xxxx（选填）"
              value={phone} onChange={e => setPhone(e.target.value)} />
          </div>

          <label className="onboard-consent">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>同意 ThinkMake 使用我的联系方式推送相关培训和政策信息（<Link href="/privacy" target="_blank" className="onboard-privacy-link">隐私政策</Link>）</span>
          </label>

          {error && <div className="onboard-error">{error}</div>}

          <button type="submit" className="onboard-btn">
            开始我的职业规划 →
          </button>
        </form>

        <div className="onboard-footer">
          <Link href="/quick" className="onboard-quick-link">已填过表单？用 30 秒快速版 →</Link>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function ChatPage() {
  const [step, setStep] = useState('onboarding')
  const [userInfo, setUserInfo] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(false) // progress bar pulse
  const [sessionId] = useState(() => `s_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  const [summaryData, setSummaryData] = useState(null)
  const [isSummaryDone, setIsSummaryDone] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, summaryData])

  useEffect(() => {
    if (!loading && step === 'chat') textareaRef.current?.focus()
  }, [loading, step])

  function handleOnboardingSubmit(info) {
    setUserInfo(info)
    const greeting = `你好 ${info.name}！我是 ThinkMake 职业规划助手 👋\n\n我专门帮助加拿大华人新移民找到适合自己的职业方向。我手上有数十个真实华人新移民的案例、经过验证的求职策略，和 100+ 个加拿大权威资源。\n\n咱们聊几分钟，我帮你梳理一下方向。先告诉我：**你之前在国内做什么工作？做了多久？**`
    setMessages([{ role: 'assistant', content: greeting }])
    setStep('chat')
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setActive(true)

    try {
      // Filter out the initial greeting (it's static, not from Claude)
      const apiMessages = newMessages
        .slice(1) // skip initial assistant greeting
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          sessionId,
          userName: userInfo?.name,
          userGender: userInfo?.gender,
        }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `抱歉，出错了：${data.error || '请稍后重试'}` }])
        return
      }

      if (data.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      }

      if (data.isSummaryComplete) {
        setIsSummaryDone(true)
        if (data.summaryData) setSummaryData(data.summaryData)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '网络错误，请稍后重试' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  if (step === 'onboarding') return <OnboardingForm onSubmit={handleOnboardingSubmit} />

  return (
    <div className="chat-root">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-inner">
          <div className="chat-header-left">
            <span className="chat-logo">Think<span>Make</span></span>
            <span className="chat-logo-sub">AI 职业规划</span>
          </div>
          <Link href="/quick" className="chat-nav-link">30秒快速版 →</Link>
        </div>
        <div className={`chat-progress-bar${active ? ' chat-progress-active' : ''}`}>
          <div className="chat-progress-fill" />
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg-wrap ${msg.role === 'user' ? 'chat-msg-wrap-user' : 'chat-msg-wrap-ai'}`}>
            {msg.role === 'assistant' && <div className="chat-avatar">🤖</div>}
            <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
              <div className="chat-bubble-text" dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-msg-wrap chat-msg-wrap-ai">
            <div className="chat-avatar">🤖</div>
            <div className="chat-bubble chat-bubble-ai">
              <div className="chat-typing"><span /><span /><span /></div>
            </div>
          </div>
        )}

        {isSummaryDone && (
          <SummaryView
            data={summaryData}
            userName={userInfo?.name}
            userEmail={userInfo?.email}
            sessionId={sessionId}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!isSummaryDone && (
        <div className="chat-input-wrap">
          <div className="chat-input-inner">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的回答，按 Enter 发送..."
              rows={1}
              disabled={loading}
            />
            <button
              className={`chat-send-btn${(!input.trim() || loading) ? ' chat-send-btn-disabled' : ''}`}
              onClick={sendMessage}
              disabled={!input.trim() || loading}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div className="chat-input-hint">Enter 发送 · Shift+Enter 换行</div>
        </div>
      )}
    </div>
  )
}
