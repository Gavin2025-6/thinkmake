// YouTube Data API v3 — free tier: 10,000 units/day
// Requires YOUTUBE_API_KEY env variable
// Search costs 100 units, comments cost 1 unit each

const YT_BASE = 'https://www.googleapis.com/youtube/v3'

const SEARCH_QUERIES = [
  'best free PDF tools alternative',
  'free photo editing app alternative',
  'free video editing software alternative',
  'free audio editing tool alternative',
  'best free productivity app 2024',
  'free alternative to expensive app',
]

const COMMENT_KEYWORDS = ['free alternative', 'is there a free', 'free version',
  'too expensive', 'wish there was free', 'no free option', 'free app for this']

async function ytFetch(path, params) {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  const url = `${YT_BASE}${path}?${new URLSearchParams({ ...params, key })}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    return res.ok ? res.json() : null
  } catch { return null }
}

export async function scrapeYouTube() {
  if (!process.env.YOUTUBE_API_KEY) {
    console.warn('[YouTube] YOUTUBE_API_KEY not set — skipping')
    return []
  }

  const results = []
  const seen = new Set()
  const twodays = Date.now() - 48 * 3600 * 1000

  for (const query of SEARCH_QUERIES) {
    const searchRes = await ytFetch('/search', {
      q: query, type: 'video', maxResults: 5,
      relevanceLanguage: 'en', order: 'relevance',
    })
    if (!searchRes?.items) continue

    const videoIds = searchRes.items.map(i => i.id.videoId).filter(Boolean)

    for (const videoId of videoIds) {
      const commentsRes = await ytFetch('/commentThreads', {
        videoId, maxResults: 50, order: 'relevance',
        textFormat: 'plainText',
      })
      if (!commentsRes?.items) continue

      for (const thread of commentsRes.items) {
        const c = thread.snippet?.topLevelComment?.snippet
        if (!c) continue
        const text = c.textDisplay?.toLowerCase() || ''
        if (!COMMENT_KEYWORDS.some(kw => text.includes(kw))) continue

        const commentId = thread.id
        if (seen.has(commentId)) continue
        seen.add(commentId)

        const publishedAt = new Date(c.publishedAt || Date.now())
        if (publishedAt.getTime() < twodays) continue

        const videoTitle = searchRes.items.find(i => i.id.videoId === videoId)?.snippet?.title || query

        results.push({
          postId: `yt_${commentId}`,
          platform: 'youtube',
          source: 'youtube',
          title: text.slice(0, 120),
          url: `https://youtube.com/watch?v=${videoId}&lc=${commentId}`,
          content: `[From video: "${videoTitle}"]\n${c.textDisplay?.slice(0, 500) || ''}`,
          upvotes: c.likeCount || 0,
          date: publishedAt,
        })
      }
      await new Promise(r => setTimeout(r, 200))
    }
  }
  return results
}
