// App Store reviews — uses app-store-scraper npm package
// Targets: top paid apps across productivity, creative, and health categories
// Filters: 1-2 star reviews containing pricing complaints

const TARGETS = [
  // 效率工具类
  { id: 1232780281, appName: 'Notion',       category: '🛠 工具类' },
  { id: 572688855,  appName: 'Todoist',      category: '🛠 工具类' },
  { id: 904280696,  appName: 'Things 3',     category: '🛠 工具类' },
  { id: 778658393,  appName: 'GoodNotes',    category: '🛠 工具类' },
  { id: 743974925,  appName: 'PDF Expert',   category: '🛠 工具类' },
  // 图片视频类
  { id: 588173303,  appName: 'VSCO',         category: '🎨 创意类' },
  { id: 878783582,  appName: 'Lightroom',    category: '🎨 创意类' },
  { id: 1500855883, appName: 'CapCut',       category: '🎨 创意类' },
  { id: 1102365,    appName: 'Facetune',     category: '🎨 创意类' },
  { id: 1062022008, appName: 'LumaFusion',   category: '🎨 创意类' },
  // 健康类
  { id: 341232718,  appName: 'MyFitnessPal', category: '🏥 健康类' },
  { id: 493145008,  appName: 'Headspace',    category: '🏥 健康类' },
  { id: 571800810,  appName: 'Calm',         category: '🏥 健康类' },
]

const KEYWORDS = [
  'expensive', 'price', 'free', 'pay', 'subscription', 'charge', 'cost',
  'wish it was free', 'used to be free', 'too much', 'overpriced',
  'paywalled', 'pay wall', 'free version', 'free alternative', 'cheaper',
]

export async function scrapeAppStore() {
  let store
  try {
    store = (await import('app-store-scraper')).default
  } catch {
    console.warn('[AppStore] app-store-scraper not available')
    return []
  }

  const results = []
  const sevenDays = Date.now() - 7 * 24 * 3600 * 1000

  for (const target of TARGETS) {
    try {
      const reviews = await store.reviews({
        id: target.id,
        sort: store.sort.HELPFUL,
        num: 100,
        country: 'us',
        page: 1,
      })

      let matched = 0
      for (const r of reviews) {
        if (r.score > 2) continue
        const text = `${r.title || ''} ${r.text || ''}`.toLowerCase()
        if (!KEYWORDS.some(kw => text.includes(kw))) continue
        const reviewDate = r.updated ? new Date(r.updated) : new Date()
        if (reviewDate.getTime() < sevenDays) continue

        matched++
        results.push({
          postId:   `appstore_${r.id}`,
          platform: 'appstore',
          source:   'appstore',
          appName:  target.appName,
          rating:   r.score,
          category: target.category,
          title:    `[${target.appName}] ${r.title || text.slice(0, 80)}`,
          url:      r.url || `https://apps.apple.com/us/app/id${target.id}`,
          content:  r.text?.slice(0, 600) || '',
          upvotes:  0,
          date:     reviewDate,
        })
      }
      console.log(`[AppStore] ${target.appName}: ${reviews.length} reviews, ${matched} matched`)
      await new Promise(res => setTimeout(res, 500))
    } catch (e) {
      console.error(`[AppStore] ${target.appName}:`, e.message)
    }
  }
  return results
}
