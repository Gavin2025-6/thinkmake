import casesData from '../../data/cases.json'
import tacticsData from '../../data/tactics.json'
import resourcesData from '../../data/resources.json'

export const cases = casesData.cases
export const tactics = tacticsData.tactics

// Build compact summaries for injection into system prompt
export function getCasesSummary() {
  return cases.map(c => {
    const quotes = c.user_quotes?.slice(0, 1).map(q => `"${q}"`).join('') || ''
    return `[案例${c.id}] ${c.headline} | 背景:${c.user_profile.background},${c.user_profile.city} | 路径:${c.career_path.previous}→${c.career_path.current} | 薪资:${c.career_path.salary} | 关键决策:${c.key_decision_point}${quotes ? ` | 原话:${quotes}` : ''}`
  }).join('\n')
}

export function getTacticsSummary() {
  return tactics.map(t =>
    `[策略${t.id}] ${t.title} | 何时用:${t.applicable_when[0]} | 核心:${t.core_message}`
  ).join('\n')
}

export function getResourcesSummary() {
  // Extract key resources from the nested structure
  const skip = new Set(['version', 'last_updated', 'description', 'verification_principle'])
  const lines = []
  for (const [category, content] of Object.entries(resourcesData)) {
    if (skip.has(category)) continue
    lines.push(`【${category}】`)
    if (Array.isArray(content)) {
      content.slice(0, 5).forEach(r => {
        if (r.name && r.url) lines.push(`  ${r.name}: ${r.url}`)
      })
    } else if (typeof content === 'object') {
      for (const [sub, items] of Object.entries(content)) {
        if (sub.startsWith('_')) continue
        if (Array.isArray(items)) {
          items.slice(0, 3).forEach(r => {
            if (r && r.name && r.url) lines.push(`  ${r.name}: ${r.url}`)
          })
        }
      }
    }
  }
  return lines.join('\n')
}
