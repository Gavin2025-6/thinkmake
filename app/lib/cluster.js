// Keyword-based clustering — no AI needed, zero API cost

const STOP = new Set([
  'a','an','the','and','or','in','on','to','for','of','with','is','are','was',
  'were','be','have','has','it','this','that','can','not','no','any','some',
  'need','want','free','app','tool','make','just','get','use','does','someone',
])

function extractWords(text) {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w))
}

// Returns same shape as before: [{idx, action, clusterId?} | {idx, action, clusterName}]
export async function clusterSignals(newSignals, existingClusters) {
  const results = []

  for (let i = 0; i < newSignals.length; i++) {
    const sig     = newSignals[i]
    const sigSet  = new Set(extractWords(sig.title))

    let bestCluster = null
    let bestOverlap = 1  // require at least 2 matching words

    for (const cluster of existingClusters) {
      const clusterSet = new Set(extractWords(cluster.name))
      const overlap    = [...sigSet].filter(w => clusterSet.has(w)).length
      if (overlap > bestOverlap) {
        bestOverlap  = overlap
        bestCluster  = cluster
      }
    }

    if (bestCluster) {
      results.push({ idx: i + 1, action: 'match', clusterId: bestCluster.id })
    } else {
      // Cluster name = first 5 meaningful words of title
      const words       = extractWords(sig.title).slice(0, 5)
      const clusterName = words.length ? words.join(' ') : sig.title.slice(0, 50)
      results.push({ idx: i + 1, action: 'new', clusterName })
    }
  }

  return results
}
