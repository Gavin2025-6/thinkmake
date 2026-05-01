const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','have','has','had','do','does',
  'will','would','could','should','may','might','can','need','want','free',
  'version','alternative','like','just','its','this','that','app','tool',
  'best','any','some','not','there','make','use','using','looking','does',
  'exist','someone','something','wish','anyone','why','how','what','when','good',
  'find','trying','tried','need','your','mine','their','using','using','know',
])

function extractKeywords(title) {
  return title.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w))
    .slice(0, 4)
}

// Returns { githubExists, githubStars, githubUrl, freeSolutionScore, validationStatus }
// Returns null if rate-limited or error (don't penalize signal)
export async function validateWithGitHub(title) {
  const keywords = extractKeywords(title)
  if (!keywords.length) return null

  const q = keywords.join(' ')
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=5`
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'SignalHunt/1.0',
  }
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`

  try {
    const res = await fetch(url, { headers })
    if (res.status === 403 || res.status === 429) {
      console.warn('[GitHub] Rate limited, skipping')
      return null
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const repos = (data.items || []).filter(r => !r.archived && !r.fork)

    if (!repos.length) {
      return { githubExists: false, githubStars: 0, githubUrl: null, freeSolutionScore: 0, validationStatus: 'blank' }
    }

    const top = repos[0]
    const stars = top.stargazers_count || 0

    let freeSolutionScore, validationStatus
    if (stars > 1000)      { freeSolutionScore = 8; validationStatus = 'covered' }
    else if (stars > 100)  { freeSolutionScore = 5; validationStatus = 'weak' }
    else if (stars > 10)   { freeSolutionScore = 3; validationStatus = 'weak' }
    else                   { freeSolutionScore = 1; validationStatus = 'blank' }

    return { githubExists: true, githubStars: stars, githubUrl: top.html_url, freeSolutionScore, validationStatus }
  } catch (err) {
    console.error('[GitHub]', title, err.message)
    return null
  }
}

// Adjust aiScore based on GitHub validation result
// covered (strong OSS) → -3 | blank (no solution) → +2 | weak → no change
export function applyScoreAdjustment(signal) {
  if (!signal.aiScore || !signal.validationStatus) return signal
  const adj = signal.validationStatus === 'covered' ? -3
    : signal.validationStatus === 'blank' ? 2 : 0
  if (adj === 0) return signal
  return { ...signal, aiScore: Math.max(1, Math.min(10, signal.aiScore + adj)) }
}
