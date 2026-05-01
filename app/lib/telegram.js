export async function sendTelegram(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  console.log('[Telegram] token prefix:', token?.slice(0, 12) ?? 'MISSING')
  console.log('[Telegram] chatId:', chatId ?? 'MISSING')

  if (!token || !chatId) {
    throw new Error('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID')
  }

  // Telegram max message length is 4096 chars — split if needed
  const chunks = []
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000))

  for (const chunk of chunks) {
    const res  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
    })
    const json = await res.json()
    console.log('[Telegram] API response:', JSON.stringify(json).slice(0, 200))
    if (!json.ok) {
      throw new Error(`[Telegram] API error ${json.error_code}: ${json.description}`)
    }
  }

  console.log(`[Telegram] Sent ${chunks.length} chunk(s) successfully`)
}
