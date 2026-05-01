export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.warn('[Telegram] Missing BOT_TOKEN or CHAT_ID')
    return null
  }

  // Telegram max message length is 4096 chars — split if needed
  const chunks = []
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000))

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
    })
    const json = await res.json()
    if (!json.ok) console.error('[Telegram] Send error:', json.description)
  }
}
