// Product Hunt scraper — requires PRODUCTHUNT_TOKEN env var
// Get a free token at: https://www.producthunt.com/v2/oauth/applications

const KEYWORDS = [
  'free alternative', 'open source alternative', 'cheaper than',
  'self-hosted', 'open source', 'no subscription', 'one-time payment',
  'free forever', 'lifetime deal', 'affordable', 'free tier',
]

export async function scrapeProductHunt() {
  const token = process.env.PRODUCTHUNT_TOKEN
  if (!token) {
    console.log('[ProductHunt] No PRODUCTHUNT_TOKEN, skipping')
    return []
  }

  const query = `{
    posts(order: NEWEST, first: 50) {
      edges {
        node {
          id name tagline description url votesCount createdAt
          topics { edges { node { name } } }
        }
      }
    }
  }`

  try {
    const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const posts = (data.data?.posts?.edges || []).map(e => e.node)

    const cutoff = Date.now() - 48 * 3600 * 1000
    return posts
      .filter(p => {
        if (new Date(p.createdAt).getTime() < cutoff) return false
        const text = `${p.name} ${p.tagline} ${p.description || ''}`.toLowerCase()
        return KEYWORDS.some(k => text.includes(k))
      })
      .map(p => ({
        postId: `ph_${p.id}`,
        platform: 'producthunt',
        source: 'Product Hunt',
        title: `${p.name}: ${p.tagline}`,
        url: p.url || `https://www.producthunt.com/posts/${p.id}`,
        content: p.description || p.tagline || '',
        upvotes: p.votesCount || 0,
        date: new Date(p.createdAt),
      }))
  } catch (err) {
    console.error('[ProductHunt]', err.message)
    return []
  }
}
