// V2EX public API scraper — Chinese tech community
// Nodes: create (产品) and programmer (程序员)
// Filters: posts mentioning pricing pain points or app gaps

const NODES = ['create', 'programmer']

const KEYWORDS = [
  '有没有', '求推荐', '没有免费', '太贵了', '收费了', '有没有类似',
  '求一个', '有没有好用', '找不到', '有没有替代', '开源替代',
  '哪个免费', '谁知道有', '想要一个', '不要钱', '有没有工具',
]

async function fetchNode(node) {
  const results = []
  try {
    const url = `https://www.v2ex.com/api/topics/show.json?node_name=${node}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SignalHunt/1.0 (contact: thinkmake.ai)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.warn(`[V2EX] node/${node} HTTP ${res.status}`)
      return []
    }
    const posts = await res.json()
    console.log(`[V2EX] node/${node}: fetched ${posts.length} posts`)

    const sevenDays = Date.now() - 7 * 24 * 3600 * 1000

    for (const post of posts) {
      const created = post.created * 1000
      if (created < sevenDays) continue

      const text = `${post.title || ''} ${post.content || ''}`.toLowerCase()
      if (!KEYWORDS.some(kw => text.includes(kw))) continue

      results.push({
        postId:   `v2ex_${post.id}`,
        platform: 'v2ex',
        source:   'v2ex',
        lang:     'zh',
        flag:     '🇨🇳',
        title:    post.title || '',
        url:      post.url || `https://www.v2ex.com/t/${post.id}`,
        content:  (post.content || '').slice(0, 600),
        upvotes:  post.replies || 0,
        date:     new Date(created),
      })
    }
  } catch (e) {
    console.error(`[V2EX] node/${node}:`, e.message)
  }
  return results
}

export async function scrapeV2EX() {
  const seen = new Set()
  const results = []

  for (const node of NODES) {
    const posts = await fetchNode(node)
    for (const p of posts) {
      if (!seen.has(p.url)) { seen.add(p.url); results.push(p) }
    }
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`[V2EX] Total unique: ${results.length}`)
  return results.sort((a, b) => b.upvotes - a.upvotes)
}
