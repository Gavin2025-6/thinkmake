// Hacker News — official Firebase API, completely free
const HN = 'https://hacker-news.firebaseio.com/v0'

const KEYWORDS = ['wish there was', 'no free', 'too expensive', 'should be free',
  "why doesn't exist", 'need an app', 'looking for free', 'free alternative',
  'is there a free', 'free version', 'open source alternative']

async function fetchItem(id) {
  try {
    const res = await fetch(`${HN}/item/${id}.json`, { signal: AbortSignal.timeout(5000) })
    return res.ok ? res.json() : null
  } catch { return null }
}

export async function scrapeHackerNews() {
  const results = []
  try {
    // Ask HN stories + new stories
    const [askIds, newIds] = await Promise.all([
      fetch(`${HN}/askstories.json`).then(r => r.json()),
      fetch(`${HN}/newstories.json`).then(r => r.json()),
    ])

    const ids = [...new Set([...askIds.slice(0, 100), ...newIds.slice(0, 100)])]
    const items = (await Promise.all(ids.slice(0, 80).map(fetchItem))).filter(Boolean)

    const sevendays = Date.now() - 7 * 24 * 3600 * 1000

    for (const item of items) {
      if (!item || item.deleted || item.dead) continue
      if ((item.time * 1000) < sevendays) continue

      const text = `${item.title || ''} ${item.text || ''}`.toLowerCase()
      const matched = KEYWORDS.some(kw => text.includes(kw))
      if (!matched) continue

      results.push({
        postId: `hn_${item.id}`,
        platform: 'hackernews',
        source: 'hackernews',
        title: item.title || item.text?.slice(0, 120) || 'HN post',
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        content: (item.text || '').replace(/<[^>]*>/g, '').slice(0, 600),
        upvotes: item.score || 0,
        date: new Date(item.time * 1000),
      })

      // Also grab top comments for sub-signals
      if (item.kids?.length) {
        const comments = (await Promise.all(item.kids.slice(0, 10).map(fetchItem))).filter(Boolean)
        for (const c of comments) {
          if (!c.text) continue
          const ct = c.text.toLowerCase().replace(/<[^>]*>/g, '')
          if (!KEYWORDS.some(kw => ct.includes(kw))) continue
          results.push({
            postId: `hn_${c.id}`,
            platform: 'hackernews',
            source: 'hackernews',
            title: ct.slice(0, 120),
            url: `https://news.ycombinator.com/item?id=${c.id}`,
            content: ct.slice(0, 600),
            upvotes: c.score || 0,
            date: new Date(c.time * 1000),
          })
        }
      }
    }
  } catch (e) {
    console.error('[HN] Error:', e.message)
  }
  return results
}
