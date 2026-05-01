// App Store reviews — uses app-store-scraper npm package
// Targets: top paid apps in PDF/Image/Video/Audio categories
// Filters: 1-2 star reviews containing pricing complaints

const TARGETS = [
  // PDF tools
  { id: 469337564,  appName: 'Adobe Acrobat',  category: '🛠 工具类' },
  { id: 743974925,  appName: 'PDF Expert',      category: '🛠 工具类' },
  { id: 595563753,  appName: 'Scanner Pro',     category: '🛠 工具类' },
  // Image tools
  { id: 1149994032, appName: 'Facetune',        category: '🎨 创意类' },
  { id: 878783582,  appName: 'Lightroom',       category: '🎨 创意类' },
  { id: 588173303,  appName: 'VSCO',            category: '🎨 创意类' },
  // Video tools
  { id: 1062022008, appName: 'LumaFusion',      category: '🎨 创意类' },
  { id: 1500855883, appName: 'CapCut',          category: '🎨 创意类' },
  { id: 997340941,  appName: 'InShot',          category: '🎨 创意类' },
  // Audio tools
  { id: 408709785,  appName: 'GarageBand',      category: '🎨 创意类' },
  { id: 1018780185, appName: 'Ferrite',         category: '🎨 创意类' },
]

const KEYWORDS = ['too expensive', 'wish it was free', 'need free version',
  'paywalled', 'cost too much', 'overpriced', 'free version', 'free alternative',
  'cheaper', 'price', 'subscription', 'pay wall', 'free app']

export async function scrapeAppStore() {
  let store
  try {
    store = (await import('app-store-scraper')).default
  } catch {
    console.warn('[AppStore] app-store-scraper not available')
    return []
  }

  const results = []
  const twodays = Date.now() - 48 * 3600 * 1000

  for (const target of TARGETS) {
    try {
      const reviews = await store.reviews({
        id: target.id,
        sort: store.sort.HELPFUL,
        num: 100,
        country: 'us',
        page: 1,
      })

      for (const r of reviews) {
        if (r.score > 2) continue
        const text = `${r.title || ''} ${r.text || ''}`.toLowerCase()
        if (!KEYWORDS.some(kw => text.includes(kw))) continue
        const reviewDate = r.updated ? new Date(r.updated) : new Date()
        if (reviewDate.getTime() < twodays) continue

        results.push({
          postId: `appstore_${r.id}`,
          platform: 'appstore',
          source: 'appstore',
          appName: target.appName,
          rating: r.score,
          category: target.category,
          title: `[${target.appName}] ${r.title || text.slice(0, 80)}`,
          url: r.url || `https://apps.apple.com/us/app/id${target.id}`,
          content: r.text?.slice(0, 600) || '',
          upvotes: 0,
          date: reviewDate,
        })
      }
      await new Promise(res => setTimeout(res, 500))
    } catch (e) {
      console.error(`[AppStore] ${target.appName}:`, e.message)
    }
  }
  return results
}
