// Reddit JSON API — fetch /new.json directly, filter locally
// Covers English + German + French subreddits

const EN_SUBREDDITS = [
  'somebodymakeit',
  'AppIdeas',
  'SideProject',
  'SaaS',
  'nocode',
  'productivity',
  'webdev',
]

const EN_KEYWORDS = [
  'wish there was', 'someone should make', 'why is there no',
  'need a free', 'looking for an app', 'does anyone know a free',
  'build this', 'i want an app', 'no good free',
  'too expensive', 'paywalled', 'free alternative',
  'free version', 'open source alternative',
]

// Multilingual subreddits — titles will be translated before storage
const ML_SUBREDDITS = [
  {
    subreddit: 'de',
    lang: 'de',
    flag: '🇩🇪',
    keywords: ['kostenlose app', 'keine kostenlose', 'zu teuer', 'wünsche mir', 'gibt es keine app', 'gratis alternative'],
  },
  {
    subreddit: 'france',
    lang: 'fr',
    flag: '🇫🇷',
    keywords: ['application gratuite', 'pas gratuit', 'trop cher', 'alternative gratuite', 'je cherche une app'],
  },
]

async function fetchSubreddit(subreddit, keywords, lang = 'en', flag = '🇺🇸') {
  const results = []
  try {
    const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=100`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SignalHunt/1.0 (contact: thinkmake.ai)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.warn(`[Reddit] r/${subreddit} HTTP ${res.status}`)
      return []
    }
    const data  = await res.json()
    const posts = data?.data?.children || []
    console.log(`[Reddit] r/${subreddit}: fetched ${posts.length} posts`)

    for (const { data: post } of posts) {
      const ageDays = (Date.now() / 1000 - post.created_utc) / 86400
      if (ageDays > 7) continue

      const text = `${post.title || ''} ${post.selftext || ''}`.toLowerCase()
      if (!keywords.some(kw => text.includes(kw))) continue

      results.push({
        postId:   `reddit_${post.id}`,
        platform: 'reddit',
        source:   'reddit',
        subreddit,
        lang,
        flag,
        title:    post.title || '',
        url:      `https://reddit.com${post.permalink}`,
        content:  (post.selftext || '').slice(0, 600),
        upvotes:  post.score || 0,
        date:     new Date(post.created_utc * 1000),
      })
    }
  } catch (e) {
    console.error(`[Reddit] r/${subreddit}:`, e.message)
  }
  return results
}

export async function scrapeReddit() {
  const seen    = new Set()
  const results = []

  // English subreddits
  for (const sub of EN_SUBREDDITS) {
    const posts = await fetchSubreddit(sub, EN_KEYWORDS, 'en', '🇺🇸')
    for (const p of posts) {
      if (!seen.has(p.url)) { seen.add(p.url); results.push(p) }
    }
    await new Promise(r => setTimeout(r, 500))
  }

  // Multilingual subreddits
  for (const { subreddit, lang, flag, keywords } of ML_SUBREDDITS) {
    const posts = await fetchSubreddit(subreddit, keywords, lang, flag)
    for (const p of posts) {
      if (!seen.has(p.url)) { seen.add(p.url); results.push(p) }
    }
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`[Reddit] Total unique: ${results.length}`)
  return results.sort((a, b) => b.upvotes - a.upvotes)
}
