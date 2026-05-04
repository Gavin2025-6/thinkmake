// Optional Claude Haiku translation for non-English signal titles
// Only runs when ANTHROPIC_API_KEY is set
// ~$0.001 per title (claude-haiku-4-5-20251001)

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

let anthropic = null

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!anthropic) {
    const { default: Anthropic } = require('@anthropic-ai/sdk')
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropic
}

// Translate a single title to English (or Chinese if zh)
// Returns translated string, or original on failure
export async function translateTitle(title, lang) {
  if (lang === 'en') return title
  const client = getClient()
  if (!client) return title  // no key → skip

  const target = 'English'
  try {
    const msg = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Translate this title to ${target}. Return ONLY the translation, no explanation:\n${title}`,
      }],
    })
    return msg.content[0]?.text?.trim() || title
  } catch (e) {
    console.warn('[Translate]', e.message)
    return title
  }
}

// Translate an array of signals (only non-English, only if key set)
// Returns signals with translatedTitle added (original title preserved)
export async function translateSignals(signals) {
  if (!process.env.ANTHROPIC_API_KEY) return signals
  const nonEn = signals.filter(s => s.lang && s.lang !== 'en')
  if (!nonEn.length) return signals

  console.log(`[Translate] Translating ${nonEn.length} non-English titles...`)
  const result = [...signals]

  for (const sig of nonEn) {
    const idx = result.findIndex(s => s.url === sig.url)
    if (idx === -1) continue
    const translated = await translateTitle(sig.title, sig.lang)
    result[idx] = { ...result[idx], translatedTitle: translated }
    await new Promise(r => setTimeout(r, 200))
  }
  return result
}
