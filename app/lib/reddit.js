// Reddit JSON API — no auth needed for public subreddits
// Rate limit: ~60 req/min unauthenticated

const SOURCES = [
  {
    subreddit: 'somebodymakeit',
    keywords: ['wish there was', 'no free app', 'too expensive', 'should be free', "why doesn't exist", 'need an app'],
  },
  {
    subreddit: 'AppIdeas',
    keywords: ['wish there was', 'no free app', 'should exist', 'need an app', 'nobody made'],
  },
  {
    subreddit: 'SideProject',
    keywords: ['wish there was', 'no app for', 'too expensive', 'need a tool'],
  },
]

export async function scrapeReddit() {
  const results = []
  const seen = new Set()

  for (const { subreddit, keywords } of SOURCES) {
    for (const keyword of keywords) {
      try {
        const params = new URLSearchParams({
          q: keyword,
          restrict_sr: '1',
          sort: 'new',
          t: 'week',
          limit: '25',
        })
        const url = `https://www.reddit.com/r/${subreddit}/search.json?${params}`
        const res = await fetch(url, {
          headers: { 'User-Agent': 'SignalHunt/1.0 by thinkmake.ai' },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) continue

        const data = await res.json()
        const posts = data?.data?.children || []

        for (const { data: post } of posts) {
          const postUrl = `https://reddit.com${post.permalink}`
          if (seen.has(postUrl)) continue
          seen.add(postUrl)

          // Only posts from last 7 days
          const ageDays = (Date.now() / 1000 - post.created_utc) / 86400
          if (ageDays > 7) continue

          results.push({
            postId: `reddit_${post.id}`,
            platform: 'reddit',
            source: 'reddit',
            subreddit,
            title: post.title || '',
            url: postUrl,
            content: (post.selftext || '').slice(0, 600),
            upvotes: post.score || 0,
            date: new Date(post.created_utc * 1000),
          })
        }

        // Small delay to be polite
        await new Promise(r => setTimeout(r, 300))
      } catch (e) {
        console.error(`[Reddit] ${subreddit} "${keyword}":`, e.message)
      }
    }
  }

  // Deduplicate by url, sort by upvotes desc
  const unique = [...new Map(results.map(r => [r.url, r])).values()]
  return unique.sort((a, b) => b.upvotes - a.upvotes)
}
