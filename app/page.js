'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: '你好！我是 ThinkMake 职业规划助手 👋\n\n我专门帮助加拿大华人新移民找到适合自己的职业方向。我手上有 11 个真实华人新移民的案例、9 个经过验证的策略，和 100+ 个加拿大权威资源。\n\n咱们聊几分钟，我帮你梳理一下方向。先告诉我：**你之前在国内做什么工作？做了多久？**',
}

const TOTAL_ROUNDS = 12

function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<h2 class="chat-h2">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="chat-h3">$1</h3>')
    .replace(/^- (.+)$/gm, '<li class="chat-li">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="chat-li chat-li-num">$1. $2</li>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .replace(/`(.+?)`/g, '<code class="chat-code">$1</code>')
}

export default function ChatPage() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [round, setRound] = useState(0)
  const [sessionId] = useState(() => `s_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  const [isSummaryDone, setIsSummaryDone] = useState(false)
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [leadEmail, setLeadEmail] = useState('')
  const [leadWechat, setLeadWechat] = useState('')
  const [leadConsent, setLeadConsent] = useState(true)
  const [leadSubmitting, setLeadSubmitting] = useState(false)
  const [leadDone, setLeadDone] = useState(false)
  const [leadError, setLeadError] = useState('')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, showLeadForm])

  useEffect(() => {
    if (!loading && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [loading])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setRound(r => r + 1)

    try {
      // Build API message array: include all messages, skip INITIAL_MESSAGE from the array
      // since it's handled by the system prompt
      const apiMessages = newMessages
        .filter(m => m !== INITIAL_MESSAGE)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, sessionId }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `抱歉，出错了：${data.error || '请稍后重试'}` }])
        return
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])

      if (data.isSummaryComplete) {
        setIsSummaryDone(true)
        setTimeout(() => setShowLeadForm(true), 800)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '网络错误，请稍后重试' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  async function handleLeadSubmit(e) {
    e.preventDefault()
    if (!leadEmail.includes('@')) { setLeadError('请输入有效邮箱'); return }
    if (!leadConsent) { setLeadError('请勾选同意条款'); return }

    setLeadSubmitting(true)
    setLeadError('')

    const summaryMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.content.includes('你的画像'))
    const summaryText = summaryMsg?.content || ''

    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: leadEmail, wechat: leadWechat, sessionId, summaryText, consent: leadConsent }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setLeadError(data.error || '提交失败，请重试')
      } else {
        setLeadDone(true)
      }
    } catch {
      setLeadError('网络错误，请重试')
    } finally {
      setLeadSubmitting(false)
    }
  }

  const progressPct = Math.min(100, (round / TOTAL_ROUNDS) * 100)

  return (
    <div className="chat-root">
      <div className="chat-header">
        <div className="chat-header-inner">
          <div className="chat-header-left">
            <span className="chat-logo">Think<span>Make</span></span>
            <span className="chat-logo-sub">AI 职业规划</span>
          </div>
          <Link href="/quick" className="chat-nav-link">30秒快速版 →</Link>
        </div>
        <div className="chat-progress-bar">
          <div className="chat-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="chat-progress-label">
          {round === 0 ? '开始对话，获取专属职业规划' : `对话进度 ${round} / ${TOTAL_ROUNDS}`}
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg-wrap ${msg.role === 'user' ? 'chat-msg-wrap-user' : 'chat-msg-wrap-ai'}`}>
            {msg.role === 'assistant' && <div className="chat-avatar">🤖</div>}
            <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
              <div className="chat-bubble-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
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

        {showLeadForm && (
          <div className="chat-lead-wrap">
            {leadDone ? (
              <div className="chat-lead-done">
                <div className="chat-lead-done-icon">✅</div>
                <div className="chat-lead-done-title">报告已发送！</div>
                <div className="chat-lead-done-sub">
                  完整规划报告已发至 <strong>{leadEmail}</strong>
                  {leadWechat && <><br /><span>我们会通过微信联系你 👋</span></>}
                </div>
                <div className="chat-wechat-cta">
                  <div className="chat-wechat-label">想要一对一深度指导？</div>
                  <div className="chat-wechat-id">微信：{process.env.NEXT_PUBLIC_WECHAT_CONTACT || 'thinkmake_ca'}</div>
                </div>
              </div>
            ) : (
              <div className="chat-lead-card">
                <div className="chat-lead-title">📄 保存你的完整规划报告</div>
                <div className="chat-lead-sub">留下邮箱，免费发送你的专属职业规划</div>
                <form onSubmit={handleLeadSubmit} className="chat-lead-form">
                  <input type="email" className="chat-lead-input" placeholder="your@email.com"
                    value={leadEmail} onChange={e => setLeadEmail(e.target.value)} required />
                  <input type="text" className="chat-lead-input" placeholder="微信号（选填）"
                    value={leadWechat} onChange={e => setLeadWechat(e.target.value)} />
                  <label className="chat-lead-consent">
                    <input type="checkbox" checked={leadConsent} onChange={e => setLeadConsent(e.target.checked)} />
                    <span>
                      我同意 ThinkMake 使用我的联系方式推送相关培训和政策信息
                      （<Link href="/privacy" className="chat-privacy-link" target="_blank">隐私政策</Link>）
                    </span>
                  </label>
                  {leadError && <div className="chat-lead-error">{leadError}</div>}
                  <button type="submit" className="chat-lead-btn" disabled={leadSubmitting}>
                    {leadSubmitting ? '发送中...' : '发送报告到邮箱 →'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

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
