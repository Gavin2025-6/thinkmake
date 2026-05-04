// Reddit JSON API — fetch new posts directly, filter locally
// More reliable than search API (less likely to be blocked/rate-limited)

const SUBREDDITS = [
  'somebodymakeit',
  'AppIdeas',
  'SideProject',
  'Entrepreneur',
  'startups',
]

const KEYWORDS = [
  'wish there was', 'no free app', 'too expensive', 'should be free',
  'need an app', 'nobody made', 'no app for', 'need a tool',
  'free alternative', 'looking for', 'does anyone know', 'is there a',
  'wish someone', 'why is there no', 'why doesn\'t exist', 'would pay for',
]

export async function scrapeReddit() {
  const results = []
  const seen    = new Set()

  for (const subreddit of SUBREDDITS) {
    try {
      // Use /new.json — simpler, more reliable than search API
      const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=100`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SignalHunt/1.0 (contact: thinkmake.ai)' },
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        console.warn(`[Reddit] r/${subreddit} HTTP ${res.status} — skipping`)
        continue
      }

      const data  = await res.json()
      const posts = data?.data?.children || []
      console.log(`[Reddit] r/${subreddit}: fetched ${posts.length} posts`)

      for (const { data: post } of posts) {
        const postUrl = `https://reddit.com${post.permalink}`
        if (seen.has(postUrl)) continue
        seen.add(postUrl)

        // Posts from last 7 days
        const ageDays = (Date.now() / 1000 - post.created_utc) / 86400
        if (ageDays > 7) continue

        // Must match at least one keyword in title or body
        const text = `${post.title || ''} ${post.selftext || ''}`.toLowerCase()
        if (!KEYWORDS.some(kw => text.includes(kw))) continue

        results.push({
          postId:   `reddit_${post.id}`,
          platform: 'reddit',
          source:   'reddit',
          subreddit,
          title:    post.title || '',
          url:      postUrl,
          content:  (post.selftext || '').slice(0, 600),
          upvotes:  post.score || 0,
          date:     new Date(post.created_utc * 1000),
        })
      }

      // Polite delay between subreddits
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      console.error(`[Reddit] r/${subreddit}:`, e.message)
    }
  }

  const unique = [...new Map(results.map(r => [r.url, r])).values()]
  console.log(`[Reddit] Total unique results: ${unique.length}`)
  return unique.sort((a, b) => b.upvotes - a.upvotes)
}
