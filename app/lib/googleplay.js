// Google Play reviews — uses google-play-scraper npm package

const TARGETS = [
  { appId: 'com.adobe.reader',               appName: 'Adobe Acrobat',  category: '🛠 工具类' },
  { appId: 'com.foxit.mobile.pdf.lite',      appName: 'Foxit PDF',      category: '🛠 工具类' },
  { appId: 'com.vsco.cam',                   appName: 'VSCO',           category: '🎨 创意类' },
  { appId: 'com.adobe.lrmobile',             appName: 'Lightroom',      category: '🎨 创意类' },
  { appId: 'com.lemon.lvoideo',              appName: 'CapCut',         category: '🎨 创意类' },
  { appId: 'com.wondershare.filmorago',      appName: 'Filmora',        category: '🎨 创意类' },
  { appId: 'com.bandlab.bandlab',            appName: 'BandLab',        category: '🎨 创意类' },
  { appId: 'com.audacityteam.audacity',      appName: 'Audacity',       category: '🎨 创意类' },
  { appId: 'com.canva.editor',               appName: 'Canva',          category: '🎨 创意类' },
  { appId: 'com.microsoft.office.word',      appName: 'Word',           category: '🛠 工具类' },
]

const KEYWORDS = ['too expensive', 'wish it was free', 'need free version',
  'paywalled', 'cost too much', 'overpriced', 'free version', 'free alternative',
  'cheaper', 'subscription', 'pay wall', 'free app']

export async function scrapeGooglePlay() {
  let gplay
  try {
    gplay = (await import('google-play-scraper')).default
  } catch {
    console.warn('[GooglePlay] google-play-scraper not available')
    return []
  }

  const results = []
  const twodays = Date.now() - 48 * 3600 * 1000

  for (const target of TARGETS) {
    try {
      const { data: reviews } = await gplay.reviews({
        appId: target.appId,
        lang: 'en',
        country: 'us',
        sort: gplay.sort.HELPFULNESS,
        num: 100,
      })

      for (const r of reviews) {
        if (r.score > 2) continue
        const text = `${r.title || ''} ${r.text || ''}`.toLowerCase()
        if (!KEYWORDS.some(kw => text.includes(kw))) continue
        const reviewDate = r.date ? new Date(r.date) : new Date()
        if (reviewDate.getTime() < twodays) continue

        results.push({
          postId: `gplay_${r.id}`,
          platform: 'googleplay',
          source: 'googleplay',
          appName: target.appName,
          rating: r.score,
          category: target.category,
          title: `[${target.appName}] ${r.title || text.slice(0, 80)}`,
          url: `https://play.google.com/store/apps/details?id=${target.appId}`,
          content: r.text?.slice(0, 600) || '',
          upvotes: r.thumbsUp || 0,
          date: reviewDate,
        })
      }
      await new Promise(res => setTimeout(res, 500))
    } catch (e) {
      console.error(`[GooglePlay] ${target.appName}:`, e.message)
    }
  }
  return results
}
