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

// ── Recommendation Card (web: simple view, no expand) ────────
function RecCard({ rec }) {
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
        body: JSON.stringify({ email, wechat, sessionId, summaryText, consent: true, userName: userName }),
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

      {/* Email nudge */}
      <div className="summary-email-nudge">
        📩 包含详细路径和行动清单的完整报告已发送到你的邮箱
      </div>

      {/* Lead / email confirmation */}
      <div className="lead-final-card">
        {leadDone ? (
          <>
            <div className="lead-done-text">
              {leadFallback || `✅ 完整报告已发送至 ${userEmail}`}
            </div>
            <div className="lead-wechat-cta">
              <div className="lead-wechat-line1">想要一对一深度指导？</div>
              <div className="lead-wechat-line2">微信：{process.env.NEXT_PUBLIC_WECHAT_CONTACT || 'thinkmake_ca'}</div>
              <div className="lead-wechat-line3">注册后可开启进度跟踪，系统陪你一步步走完这条路</div>
            </div>
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
    if (!/^[a-zA-Z\u4e00-\u9fa5\s]+$/.test(name.trim())) { setError('请输入你的名字（中文或英文字母）'); return }
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
  const [summaryGenerating, setSummaryGenerating] = useState(false)
  const [sessionId] = useState(() => `s_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  const [summaryData, setSummaryData] = useState(null)
  const [quickRepliesDone, setQuickRepliesDone] = useState(false)
  const [isSummaryDone, setIsSummaryDone] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const textareaRef = useRef(null)

  // Scroll to bottom whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, summaryData])

  useEffect(() => {
    if (!loading && step === 'chat') textareaRef.current?.focus()
  }, [loading, step])

  // Show "generating summary" message if loading takes more than 6s
  useEffect(() => {
    if (!loading) { setSummaryGenerating(false); return }
    const t = setTimeout(() => setSummaryGenerating(true), 6000)
    return () => clearTimeout(t)
  }, [loading])

  // Scroll to bottom when keyboard appears (focus on textarea)
  function handleInputFocus() {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 300)
  }

  // Auto-resize textarea (max 6 lines)
  function autoResize() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden'
  }

  function handleOnboardingSubmit(info) {
    setUserInfo(info)
    const greeting = `你好 ${info.name}！我是 ThinkMake 职业规划助手 👋\n\n我专门帮助加拿大华人找到适合自己的职业方向。手上有真实案例、经过验证的求职策略，和 100+ 个权威资源。\n\n你现在的情况是哪种？（点选或直接输入都可以）`
    setMessages([{ role: 'assistant', content: greeting }])
    setStep('chat')
  }

  async function sendQuickReply(text) {
    setQuickRepliesDone(true)
    setInput('')
    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)
    setActive(true)
    try {
      const apiMessages = newMessages.slice(1).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, sessionId, userName: userInfo?.name, userGender: userInfo?.gender }),
      })
      const data = await res.json()
      if (data.message) setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      if (data.isSummaryComplete) {
        setIsSummaryDone(true)
        if (data.summaryData) setSummaryData(data.summaryData)
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
      setActive(false)
    }
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
      console.log('[Chat] AI response received, length:', data.message?.length || 0)
      console.log('[Chat] Has SUMMARY_DATA_START:', !!(data.message?.includes('SUMMARY_DATA_START')))
      console.log('[Chat] isSummaryComplete:', data.isSummaryComplete, '| hasSummaryData:', !!data.summaryData)

      if (!res.ok || data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `抱歉，出错了：${data.error || '请稍后重试'}` }])
        return
      }

      // ── Client-side fallback: parse SUMMARY_DATA if backend missed it ──
      let resolvedSummary = data.summaryData
      let displayMessage = data.message || ''

      if (!resolvedSummary && displayMessage.includes('SUMMARY_DATA_START')) {
        const startIdx = displayMessage.indexOf('SUMMARY_DATA_START')
        const endIdx = displayMessage.indexOf('SUMMARY_DATA_END')
        if (startIdx !== -1 && endIdx !== -1) {
          const jsonStr = displayMessage
            .substring(startIdx + 'SUMMARY_DATA_START'.length, endIdx)
            .trim()
          try {
            resolvedSummary = JSON.parse(jsonStr)
            console.log('[Chat] Client-side parse succeeded')
          } catch (e) {
            console.error('[Chat] Client-side parse failed:', e.message)
            console.error('[Chat] Failed JSON (first 300):', jsonStr.slice(0, 300))
          }
        }
        // Always strip raw block from displayed text — never show JSON to user
        displayMessage = displayMessage
          .replace(/SUMMARY_DATA_START[\s\S]*?SUMMARY_DATA_END/, '')
          .replace(/SUMMARY_COMPLETE:\{[^}]*\}/, '')
          .trim()
      }

      if (displayMessage) {
        setMessages(prev => [...prev, { role: 'assistant', content: displayMessage }])
      }

      const isSummaryDoneNow = data.isSummaryComplete || !!resolvedSummary
      if (isSummaryDoneNow) {
        setIsSummaryDone(true)
        if (resolvedSummary) {
          setSummaryData(resolvedSummary)
        } else {
          console.warn('[Chat] summaryData missing despite isSummaryComplete')
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `规划报告已生成，完整版已发送到你的邮箱 📩\n\n如果没有收到，请加微信 ${process.env.NEXT_PUBLIC_WECHAT_CONTACT || 'thinkmake_ca'}`
          }])
          setIsSummaryDone(false)
        }
      }
    } catch (err) {
      console.error('[Chat] fetch error:', err)
      setMessages(prev => [...prev, { role: 'assistant', content: '网络错误，请稍后重试' }])
    } finally {
      setLoading(false)
      setActive(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) { e.preventDefault(); sendMessage() }
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
      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg-wrap ${msg.role === 'user' ? 'chat-msg-wrap-user' : 'chat-msg-wrap-ai'}`}>
            {msg.role === 'assistant' && <div className="chat-avatar">🤖</div>}
            <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
              <div className="chat-bubble-text" dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
            </div>
          </div>
        ))}

        {/* Quick reply buttons — shown after first AI message only */}
        {messages.length === 1 && !quickRepliesDone && !loading && (
          <div className="quick-replies">
            {[
              { emoji: '🎓', label: '我是留学生/本地成长' },
              { emoji: '🌏', label: '我是新移民（从国内来）' },
              { emoji: '🔍', label: '我想了解某个行业' },
            ].map(({ emoji, label }) => (
              <button key={label} className="quick-reply-btn" onClick={() => sendQuickReply(`${emoji} ${label}`)}>
                {emoji} {label}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="chat-msg-wrap chat-msg-wrap-ai">
            <div className="chat-avatar">🤖</div>
            <div className="chat-bubble chat-bubble-ai">
              {summaryGenerating ? (
                <div className="summary-generating">
                  <div className="summary-generating-text">正在为你生成专属规划，通常需要 20-30 秒...</div>
                  <div className="summary-generating-bar"><div className="summary-generating-fill" /></div>
                </div>
              ) : (
                <div className="chat-typing"><span /><span /><span /></div>
              )}
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
              onChange={e => { setInput(e.target.value); setQuickRepliesDone(true); autoResize() }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              placeholder="输入你的回答，按 Enter 发送..."
              rows={1}
              style={{ overflowY: 'hidden' }}
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
