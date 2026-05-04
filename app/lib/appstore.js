// App Store reviews — uses app-store-scraper npm package
// 65 apps × 7 countries = up to 22,750 raw reviews per run
// Filters: 1-2 star reviews with pricing/subscription complaint keywords

// ─── App catalogue (65 apps, 6 categories) ──────────────────
const APP_GROUPS = [
  {
    groupName: '效率工具',
    category:  '🛠 工具类',
    apps: [
      { id: 1232780281, appName: 'Notion' },
      { id: 572688855,  appName: 'Todoist' },
      { id: 904280696,  appName: 'Things 3' },
      { id: 778658393,  appName: 'GoodNotes' },
      { id: 743974925,  appName: 'PDF Expert' },
      { id: 371339188,  appName: 'Scanner Pro' },
      { id: 281796108,  appName: 'Evernote' },
      { id: 1016366447, appName: 'Bear' },
      { id: 1487937127, appName: 'Craft' },
      { id: 1044584252, appName: 'OmniFocus' },
      { id: 718043190,  appName: 'Fantastical' },
      { id: 1370289240, appName: 'Agenda' },
      { id: 1044867788, appName: 'Day One' },
      { id: 390017969,  appName: 'Due' },
      { id: 1236254471, appName: 'Drafts' },
    ],
  },
  {
    groupName: '图片视频',
    category:  '🎨 创意类',
    apps: [
      { id: 588173303,  appName: 'VSCO' },
      { id: 878783582,  appName: 'Lightroom' },
      { id: 1102365,    appName: 'Facetune' },
      { id: 1500855883, appName: 'CapCut' },
      { id: 997340986,  appName: 'InShot' },
      { id: 1062022008, appName: 'LumaFusion' },
      { id: 409838725,  appName: 'Splice' },
      { id: 573116090,  appName: 'Afterlight' },
      { id: 439438619,  appName: 'Snapseed' },
      { id: 395462898,  appName: 'TouchRetouch' },
      { id: 924695435,  appName: 'Pixelmator' },
      { id: 953286746,  appName: 'Darkroom' },
      { id: 885697368,  appName: 'Halide' },
      { id: 293634086,  appName: 'ProCamera' },
      { id: 843469028,  appName: 'SKRWT' },
    ],
  },
  {
    groupName: '健康健身',
    category:  '🏥 健康类',
    apps: [
      { id: 341232718,  appName: 'MyFitnessPal' },
      { id: 493145008,  appName: 'Headspace' },
      { id: 571800810,  appName: 'Calm' },
      { id: 426826309,  appName: 'Strava' },
      { id: 464254577,  appName: 'Strong' },
      { id: 1041517543, appName: 'Fitbod' },
      { id: 320606217,  appName: 'Sleep Cycle' },
      { id: 1307529743, appName: 'Waking Up' },
      { id: 1087147432, appName: 'Ten Percent Happier' },
      { id: 387771637,  appName: 'Nike Run Club' },
    ],
  },
  {
    groupName: '商务金融',
    category:  '💰 金融类',
    apps: [
      { id: 471713959,  appName: 'Expensify' },
      { id: 1010172137, appName: 'YNAB' },
      { id: 300238550,  appName: 'Mint' },
      { id: 938003185,  appName: 'Robinhood' },
      { id: 883324671,  appName: 'Acorns' },
      { id: 393790736,  appName: 'QuickBooks' },
      { id: 504601885,  appName: 'FreshBooks' },
      { id: 1361225420, appName: 'Wave' },
      { id: 351727428,  appName: 'Venmo' },
      { id: 711923939,  appName: 'Cash App' },
    ],
  },
  {
    groupName: '学习教育',
    category:  '📚 教育类',
    apps: [
      { id: 570060128,  appName: 'Duolingo' },
      { id: 829587759,  appName: 'Babbel' },
      { id: 736535961,  appName: 'Coursera' },
      { id: 916716674,  appName: 'Skillshare' },
      { id: 1273797985, appName: 'MasterClass' },
      { id: 568839295,  appName: 'Blinkist' },
      { id: 379693831,  appName: 'Audible' },
      { id: 302584613,  appName: 'Kindle' },
      { id: 309601447,  appName: 'Pocket' },
      { id: 1476236905, appName: 'Readwise' },
    ],
  },
  {
    groupName: '社交通讯',
    category:  '💬 社交类',
    apps: [
      { id: 985746746,  appName: 'Discord' },
      { id: 686449807,  appName: 'Telegram' },
      { id: 874139669,  appName: 'Signal' },
      { id: 1531555842, appName: 'BeReal' },
      { id: 1503133294, appName: 'Clubhouse' },
    ],
  },
]

// ─── Countries + language keywords ──────────────────────────
const COUNTRIES = [
  {
    country: 'us', lang: 'en', flag: '🇺🇸',
    keywords: [
      'expensive', 'price', 'free', 'pay', 'subscription', 'charge', 'cost',
      'wish it was free', 'used to be free', 'too much', 'overpriced', 'paywalled',
      'need free version', 'free alternative', 'why charge', 'used to be good',
      'ruined by subscription', 'cash grab', 'money grab', 'should be free',
      'highway robbery', 'rip off', 'ripoff', 'not worth', 'cancelled',
      'unsubscribed',
    ],
  },
  {
    country: 'cn', lang: 'zh-cn', flag: '🇨🇳',
    keywords: ['贵', '收费', '免费', '订阅', '价格', '付费', '太贵', '没有免费', '割韭菜', '不值', '涨价', '买断'],
  },
  {
    country: 'tw', lang: 'zh-tw', flag: '🇹🇼',
    keywords: ['貴', '收費', '免費', '訂閱', '價格', '付費', '太貴', '買斷', '不值'],
  },
  {
    country: 'jp', lang: 'ja', flag: '🇯🇵',
    keywords: ['高い', '有料', '無料', 'サブスクリプション', '課金', '高すぎ', '払う', '料金', 'サブスク'],
  },
  {
    country: 'kr', lang: 'ko', flag: '🇰🇷',
    keywords: ['비싸', '유료', '무료', '구독', '결제', '가격', '너무 비싸', '돈'],
  },
  {
    country: 'de', lang: 'de', flag: '🇩🇪',
    keywords: ['teuer', 'kostenlos', 'Abonnement', 'bezahlen', 'Preis', 'zu teuer', 'gratis', 'kostenpflichtig'],
  },
  {
    country: 'fr', lang: 'fr', flag: '🇫🇷',
    keywords: ['cher', 'gratuit', 'abonnement', 'payer', 'prix', 'trop cher', 'payant', 'abonner'],
  },
  {
    country: 'es', lang: 'es', flag: '🇪🇸',
    keywords: ['caro', 'gratis', 'suscripción', 'pagar', 'precio', 'demasiado caro', 'cobran', 'gratuito'],
  },
]

// ─── Fetch one app × one country ────────────────────────────
async function fetchAppCountry(store, target, countryConf, sevenDays) {
  const { country, lang, flag, keywords } = countryConf
  const results = []
  try {
    const reviews = await store.reviews({
      id:      target.id,
      sort:    store.sort.RECENT,   // RECENT to catch fresh complaints
      num:     50,
      country,
      page:    1,
    })

    for (const r of reviews) {
      if (r.score > 2) continue
      const text = `${r.title || ''} ${r.text || ''}`.toLowerCase()
      if (!keywords.some(kw => text.includes(kw))) continue
      const reviewDate = r.updated ? new Date(r.updated) : new Date()
      if (reviewDate.getTime() < sevenDays) continue

      results.push({
        postId:   `appstore_${r.id}_${country}`,
        platform: 'appstore',
        source:   'appstore',
        appName:  target.appName,
        rating:   r.score,
        category: target.category,
        lang,
        flag,
        title:    `[${target.appName}] ${r.title || text.slice(0, 80)}`,
        url:      `https://apps.apple.com/${country}/app/id${target.id}#review_${r.id}`,
        content:  (r.text || '').slice(0, 600),
        upvotes:  0,
        date:     reviewDate,
      })
    }
  } catch (e) {
    // Silently skip 404/403 (app not in that region, etc.)
    if (!e.message?.includes('404') && !e.message?.includes('403')) {
      console.warn(`[AppStore] ${target.appName}/${country}:`, e.message)
    }
  }
  return results
}

// ─── Main export ────────────────────────────────────────────
export async function scrapeAppStore() {
  let store
  try {
    store = (await import('app-store-scraper')).default
  } catch {
    console.warn('[AppStore] app-store-scraper not available')
    return []
  }

  const sevenDays = Date.now() - 7 * 24 * 3600 * 1000
  const seen    = new Set()
  const results = []
  const groupCounts = {}

  for (const group of APP_GROUPS) {
    groupCounts[group.groupName] = 0

    for (const target of group.apps) {
      const enrichedTarget = { ...target, category: group.category }

      // Fetch all 7 countries in parallel for this app
      const settled = await Promise.allSettled(
        COUNTRIES.map(c => fetchAppCountry(store, enrichedTarget, c, sevenDays))
      )

      for (const r of settled) {
        if (r.status !== 'fulfilled') continue
        for (const post of r.value) {
          if (!seen.has(post.postId)) {
            seen.add(post.postId)
            results.push(post)
            groupCounts[group.groupName]++
          }
        }
      }

      // Small delay between apps to be polite to Apple
      await new Promise(r => setTimeout(r, 400))
    }

    console.log(`[AppStore] ${group.groupName}: ${groupCounts[group.groupName]} reviews`)
  }

  console.log(`[AppStore] Total: ${results.length} reviews across ${Object.keys(groupCounts).length} categories`)
  return results
}
