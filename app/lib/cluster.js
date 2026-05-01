import Anthropic from '@anthropic-ai/sdk'
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Assign signals to clusters using Claude for semantic matching.
// Returns array of {signalIdx, clusterId (existing or 'new'), clusterName}
export async function clusterSignals(newSignals, existingClusters) {
  if (!newSignals.length) return []

  const existing = existingClusters.map((c, i) => `${i + 1}. "${c.name}" (id:${c.id})`).join('\n')
  const incoming = newSignals.map((s, i) => `${i + 1}. ${s.title}`).join('\n')

  const prompt = `You are a product signal analyst. Group these new user pain-point signals.

Existing demand clusters:
${existing || '(none yet)'}

New signals to classify:
${incoming}

For each new signal, either:
- Match to an existing cluster if semantically similar (>80% same user need)
- Create a new cluster with a concise English name (3-6 words, e.g. "Free PDF merger tool")

Output JSON array only:
[{"idx":1,"action":"match","clusterId":"existing_id"},
 {"idx":2,"action":"new","clusterName":"Free video editor app"},
 ...]`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0]?.text || '[]'
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch (e) {
    console.error('[Cluster] Claude error:', e.message)
    return []
  }
}
