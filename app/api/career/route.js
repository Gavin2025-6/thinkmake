import { Resend } from 'resend'
import { randomUUID } from 'crypto'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// ── SYSTEM PROMPT ──────────────────────────────────────────

const SYSTEM_PROMPT = `你是加拿大华人新移民职业规划顾问。

称呼规则：
- 中文姓名+称谓：取姓氏+称谓（如"高文明"+"先生"→"高先生"）
- 英文姓名：直接用姓名称呼
- 称谓为"不透露"：只用姓名称呼
- 绝不猜测或添加职称（经理/总/老师/师傅等）
- 职业推荐完全不受称谓影响，只根据职业背景和核心技能

推荐规则（严格执行）：
1. 先分析职业背后的核心可迁移技能（是能力，不是职业名称）
2. 推荐3个职业：第一个技能完全对口，第二个技能高度迁移，第三个结合其他优势
3. G驾照只作辅助说明；除非用户是驾驶/运输行业，否则不推荐驾驶类职业
4. match_reason必须说明具体技能匹配点，不能泛泛而谈

分析维度：
- 学历：本科+→高门槛职业(RN/CPA/工程师)；大专→中等认证(RPN/ECE)；高中→技工学徒
- 年限8年+：提示Trade Equivalency Assessment可免部分学徒时间
- 省份安大略：给具体认证机构+官网链接+费用；其他省：给方向+当地机构链接
- 英语基础：推中文考试选项；中等：说明英语要求；流利：说明英语优势
- 预算不足：给分阶段方案，说明第一步只需多少钱
- 顾虑：每一条都在报告里直接回应

英语学习资源规则（每个职业必须返回2-3个，必须是真实URL，绝对不能写"搜索YouTube"等泛泛建议）：
- 证券/投资顾问：CSI::https://www.csi.ca | CIRO::https://www.ciro.ca | Investopedia::https://www.investopedia.com
- 理财规划师 CFP：FP Canada::https://www.fpcanada.ca | Advocis::https://www.advocis.ca
- 房地产经纪：RECO::https://www.reco.on.ca | Humber Real Estate::https://humber.ca/ce/real-estate
- 贷款经纪 Mortgage Broker：FSRA::https://www.fsrao.ca | REMIC::https://www.remic.ca
- 注册护士 RN / RPN：CNO::https://www.cno.org | NNAS::https://www.nnas.ca
- IT/软件/程序员：freeCodeCamp::https://www.freecodecamp.org | AWS Training::https://www.aws.training | Google Certificates::https://grow.google/certificates
- 技工（电工/水管/焊接等）：Skilled Trades Ontario::https://www.skilledtradesontario.ca | George Brown::https://www.georgebrown.ca
- 保险经纪：FSRA::https://www.fsrao.ca | IFSE::https://www.ifse.ca | Advocis::https://www.advocis.ca
- 会计 CPA：CPA Ontario::https://www.cpaontario.ca | Investopedia::https://www.investopedia.com
- 其他职业：Job Bank Canada::https://www.jobbank.gc.ca | Settlement.org::https://settlement.org

输出格式（严格按此结构，不要JSON，不要markdown代码块）：

===CAREERS_START===
职业1：名称中英文|emoji|匹配原因（必须提及用户具体背景）|预计时间|费用范围|安省年薪|资源1名称::资源1完整URL|资源2名称::资源2完整URL
职业2：名称中英文|emoji|匹配原因（必须提及用户具体背景）|预计时间|费用范围|安省年薪|资源1名称::资源1完整URL|资源2名称::资源2完整URL
职业3：名称中英文|emoji|匹配原因（必须提及用户具体背景）|预计时间|费用范围|安省年薪|资源1名称::资源1完整URL|资源2名称::资源2完整URL
===CAREERS_END===

===REPORT_START===
（完整markdown报告：一、每个职业认证机构+步骤+费用明细+年薪；二、英语建议；三、预算规划；四、顾虑回应；五、本周行动清单3条含具体链接；六、免责声明）
===REPORT_END===

全程简体中文。`

// ── HELPERS ────────────────────────────────────────────────

function buildUserPrompt(body) {
  const {
    name, salutation, occupation, experience_years, education, current_status,
    province, english, skills, study_mode, total_timeline, budget, concern,
  } = body
  const skillsStr = Array.isArray(skills) && skills.length > 0 ? skills.join('、') : '未选择'
  return `用户背景：
- 姓名：${name}，称谓：${salutation || '不透露'}
- 当前年份：${new Date().getFullYear()}
- 职业：${occupation}，从事${experience_years}
- 学历：${education}
- 状态：${current_status}
- 省份：${province}
- 英语：${english}
- 技能：${skillsStr}
- 学习：${study_mode}
- 周期：${total_timeline}
- 预算：${budget}
- 顾虑：${concern}`
}

function getAddressName(name, salutation) {
  if (!name) return name
  if (!salutation || salutation === '不透露') return name
  if (/[\u4e00-\u9fff]/.test(name)) return name.charAt(0) + salutation
  return name
}

function getCertificationBody(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('保险') || n.includes('insurance')) return { name: 'FSRA (安省金融监管局)', url: 'https://www.fsrao.ca' }
  if (n.includes('房地产') || n.includes('real estate') || n.includes('经纪')) return { name: 'RECO (安省房地产经纪委员会)', url: 'https://www.reco.on.ca' }
  if (n.includes('cpa') || n.includes('会计')) return { name: 'CPA Ontario', url: 'https://www.cpaontario.ca' }
  if (n.includes('护士') || n.includes('nurse') || n.includes('rn') || n.includes('rpn')) return { name: 'CNO (安省护士学院)', url: 'https://www.cno.org' }
  if (n.includes('电工') || n.includes('electrician') || n.includes('水管') || n.includes('plumb') || n.includes('技工')) return { name: 'Skilled Trades Ontario', url: 'https://www.skilledtradesontario.ca' }
  if (n.includes('厨') || n.includes('chef') || n.includes('cook')) return { name: 'George Brown College', url: 'https://www.georgebrown.ca' }
  if (n.includes('ece') || n.includes('幼教') || n.includes('托育')) return { name: 'College of Early Childhood Educators', url: 'https://www.college-ece.ca' }
  if (n.includes('金融') || n.includes('finance') || n.includes('投资') || n.includes('理财')) return { name: 'IFSE Institute', url: 'https://www.ifse.ca' }
  if (n.includes('it') || n.includes('软件') || n.includes('程序')) return { name: 'AWS / Google Career Certificates', url: 'https://grow.google/certificates' }
  return { name: 'Job Bank Canada', url: 'https://www.jobbank.gc.ca' }
}

function getCertificationSteps(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('保险') || n.includes('insurance')) return ['向FSRA确认保险经纪牌照要求', '完成LLQP认证课程（支持中文应考）', '通过LLQP考试并向FSRA完成注册']
  if (n.includes('房地产') || n.includes('real estate') || n.includes('经纪')) return ['完成Humber Real Estate注册前课程（约6-9个月）', '通过RECO要求的资格考试', '向RECO注册，加入持牌经纪公司']
  if (n.includes('cpa') || n.includes('会计')) return ['评估海外学历并申请学分豁免', '完成CPA PEP专业教育课程', '通过CFE统一考试，申请CPA执照']
  if (n.includes('rpn')) return ['向CNO提交RPn注册评估申请', '完成语言和临床技能评估（如需）', '通过NCLEX-PN考试，向CNO注册']
  if (n.includes('护士') || n.includes('nurse') || n.includes('rn')) return ['向NNAS提交海外护理学历认证', '完成CNO要求的补充培训（如需）', '通过NCLEX-RN考试，向CNO注册']
  if (n.includes('电工') || n.includes('electrician')) return ['向Skilled Trades Ontario申请海外经验评估', '注册学徒合同（有经验者可申请TEA减免工时）', '完成工时并通过Certificate of Qualification考试']
  if (n.includes('水管') || n.includes('plumb')) return ['向Skilled Trades Ontario评估海外水管经验', '注册学徒并完成工时要求', '通过Plumber Certificate of Qualification考试']
  if (n.includes('厨') || n.includes('chef') || n.includes('cook')) return ['完成George Brown/Centennial厨艺文凭课程', '积累安省餐饮工作经验', '申请Red Seal跨省认证（可选）']
  if (n.includes('ece') || n.includes('幼教') || n.includes('托育')) return ['完成ECE文凭课程（George Brown等，约2年）', '向CECE申请ECE II级注册', '积累工作经验后升级ECE III级认证']
  return ['研究具体认证要求并联系认证机构', '完成所需学历评估和培训课程', '申请相关专业资格证书']
}

function getEnglishResources(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('保险') || n.includes('insurance')) return [
    { name: 'IFSE Institute · LLQP备考资源', url: 'https://www.ifse.ca' },
    { name: 'Advocis · 保险从业者协会', url: 'https://www.advocis.ca' },
    { name: 'FSRA · 考试与注册指引', url: 'https://www.fsrao.ca' },
  ]
  if (n.includes('房地产') || n.includes('real estate') || n.includes('经纪')) return [
    { name: 'RECO · 房产教育资源中心', url: 'https://www.reco.on.ca/education' },
    { name: 'Humber Real Estate · 注册前课程', url: 'https://humber.ca/ce/real-estate' },
    { name: 'REP Magazine · 行业资讯', url: 'https://www.repmagazine.ca' },
  ]
  if (n.includes('cpa') || n.includes('会计')) return [
    { name: 'CPA Canada · 官方YouTube频道', url: 'https://www.youtube.com/@CPACanada' },
    { name: 'CPA Ontario · 免费备考资源', url: 'https://www.cpaontario.ca' },
    { name: 'Investopedia · 财务英语词汇', url: 'https://www.investopedia.com' },
  ]
  if (n.includes('护士') || n.includes('nurse') || n.includes('rn') || n.includes('rpn')) return [
    { name: 'CNO · 注册流程与要求', url: 'https://www.cno.org' },
    { name: 'RegisteredNurseRN · YouTube备考', url: 'https://www.youtube.com/@RegisteredNurseRN' },
    { name: 'NNAS · 海外护士认证指南', url: 'https://www.nnas.ca' },
  ]
  if (n.includes('电工') || n.includes('electrician') || n.includes('水管') || n.includes('plumb') || n.includes('技工')) return [
    { name: 'Skilled Trades Ontario · 技工资源', url: 'https://www.skilledtradesontario.ca' },
    { name: 'George Brown · 技工培训课程', url: 'https://www.georgebrown.ca/programs/skilled-trades' },
  ]
  if (n.includes('金融') || n.includes('finance') || n.includes('投资') || n.includes('理财')) return [
    { name: 'Bloomberg YouTube · 金融资讯', url: 'https://www.youtube.com/@BloombergTV' },
    { name: 'CFA Institute · 免费学习资源', url: 'https://www.cfainstitute.org' },
    { name: 'Investopedia · 投资英语', url: 'https://www.investopedia.com' },
  ]
  if (n.includes('it') || n.includes('软件') || n.includes('程序') || n.includes('tech')) return [
    { name: 'freeCodeCamp · 免费编程课程', url: 'https://www.freecodecamp.org' },
    { name: 'AWS免费培训', url: 'https://www.aws.training' },
    { name: 'Google Career Certificates', url: 'https://grow.google/certificates' },
  ]
  if (n.includes('厨') || n.includes('chef') || n.includes('cook') || n.includes('餐')) return [
    { name: 'George Brown · 厨艺管理课程', url: 'https://www.georgebrown.ca' },
    { name: 'Red Seal Program · 跨省认证', url: 'https://www.canada.ca/en/employment-social-development/programs/red-seal.html' },
  ]
  if (n.includes('ece') || n.includes('幼教') || n.includes('托育')) return [
    { name: 'College of ECE · 注册指南', url: 'https://www.college-ece.ca' },
    { name: 'George Brown · ECE课程', url: 'https://www.georgebrown.ca' },
  ]
  return [
    { name: 'Settlement.org · 新移民学习资源', url: 'https://settlement.org' },
    { name: 'Job Bank Canada · 职业信息', url: 'https://www.jobbank.gc.ca' },
  ]
}

// ── EMAIL HTML (table-based) ───────────────────────────────

function extractActionItems(report) {
  if (!report) return []
  const lines = report.split('\n')
  let inSection = false
  const items = []
  for (const line of lines) {
    if (/行动清单|这周|本周/.test(line) && /^#{1,3}\s/.test(line)) { inSection = true; continue }
    if (inSection && /^#{1,3}\s/.test(line)) break
    if (inSection) {
      const bullet = line.trim().match(/^(?:[-•]|\d+\.)\s+(.+)/)
      if (bullet) { items.push(bullet[1].trim()); if (items.length >= 3) break }
    }
  }
  return items
}

function mdToEmailHtml(md) {
  if (!md) return ''
  return md.split('\n').map(line => {
    const h = line
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" style="color:#7C3AED;text-decoration:none">$1</a>')
    if (/^### /.test(line)) return `<div style="color:#374151;font-size:14px;font-weight:700;margin:14px 0 4px;font-family:Arial,sans-serif">${h.slice(4)}</div>`
    if (/^## /.test(line))  return `<div style="color:#111827;font-size:16px;font-weight:700;margin:20px 0 6px;font-family:Arial,sans-serif">${h.slice(3)}</div>`
    if (/^# /.test(line))   return `<div style="color:#7C3AED;font-size:18px;font-weight:700;margin:24px 0 8px;font-family:Arial,sans-serif">${h.slice(2)}</div>`
    if (/^[-•] /.test(line)) return `<div style="padding-left:14px;margin:3px 0;color:#374151;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">• ${h.slice(2)}</div>`
    if (/^\d+\. /.test(line)) return `<div style="padding-left:14px;margin:3px 0;color:#374151;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">${h}</div>`
    if (line.trim() === '') return '<div style="height:8px"></div>'
    return `<div style="margin:5px 0;color:#374151;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">${h}</div>`
  }).join('')
}

function buildEmailHtml({ name, salutation, province, careers, full_report }) {
  const addressName = getAddressName(name, salutation)
  const year = new Date().getFullYear()

  const careerCards = careers.map(c => {
    const certBody = getCertificationBody(c.name)
    const steps = getCertificationSteps(c.name)
    // Use AI-provided resources from career object; fall back to server-side lookup
    const resources = (c.english_resources && c.english_resources.length > 0)
      ? c.english_resources
      : getEnglishResources(c.name)

    const stepsHtml = steps.map((s, i) => `
      <tr><td style="padding:3px 0;font-size:14px;color:#374151;line-height:1.5;font-family:Arial,sans-serif">
        <span style="color:#7C3AED;font-weight:700">${i + 1}.</span> ${s}
      </td></tr>`).join('')

    const resourcesHtml = resources.map(r => `
      <tr><td style="padding:2px 0;font-size:13px;font-family:Arial,sans-serif">
        · ${r.url
          ? `<a href="${r.url}" style="color:#7C3AED;text-decoration:none">${r.name}</a>`
          : `<span style="color:#374151">${r.name}</span>`}
      </td></tr>`).join('')

    return `
      <tr><td style="padding:0 24px 20px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3FF;border-radius:10px;border:1px solid #ede9fe">
          <tr><td style="padding:16px 20px 12px;border-bottom:1px solid #ede9fe">
            <span style="font-size:24px;vertical-align:middle">${c.emoji || '🌟'}</span>
            <strong style="color:#7C3AED;font-size:16px;vertical-align:middle;margin-left:8px;font-family:Arial,sans-serif">${c.name}</strong>
          </td></tr>
          <tr><td style="padding:12px 20px 8px">
            <div style="font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;font-family:Arial,sans-serif">为什么适合你</div>
            <div style="font-size:14px;color:#374151;line-height:1.6;font-family:Arial,sans-serif">${c.match_reason}</div>
          </td></tr>
          <tr><td style="padding:0 20px 8px">
            <div style="font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif">认证路径</div>
            <table cellpadding="0" cellspacing="0" width="100%">${stepsHtml}</table>
          </td></tr>
          <tr><td style="padding:10px 20px;background:#ede9fe">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-size:13px;color:#374151;font-weight:600;font-family:Arial,sans-serif">⏱ ${c.time}</td>
              <td style="font-size:13px;color:#374151;font-weight:600;font-family:Arial,sans-serif">💰 ${c.cost}</td>
              <td style="font-size:13px;color:#374151;font-weight:600;font-family:Arial,sans-serif">📈 ${c.salary}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:12px 20px 16px">
            <div style="font-size:13px;color:#374151;margin-bottom:10px;font-family:Arial,sans-serif">
              官方认证机构：<a href="${certBody.url}" style="color:#7C3AED;text-decoration:none;font-weight:600">${certBody.name} →</a>
            </div>
            <div style="font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;font-family:Arial,sans-serif">学习资源</div>
            <table cellpadding="0" cellspacing="0" width="100%">${resourcesHtml}</table>
          </td></tr>
        </table>
      </td></tr>`
  }).join('')

  // Extract action items from full_report for the green block
  const actionItems = extractActionItems(full_report)
  const actionBlock = actionItems.length > 0 ? `
  <tr><td style="padding:0 24px 24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border-radius:10px;border:1px solid #bbf7d0">
      <tr><td style="padding:16px 20px 12px">
        <div style="font-size:15px;font-weight:700;color:#166534;font-family:Arial,sans-serif">✅ 这周就可以做的3件事</div>
      </td></tr>
      <tr><td style="padding:0 20px 16px">
        <table cellpadding="0" cellspacing="0" width="100%">
          ${actionItems.map((item, i) => `
          <tr><td style="padding:4px 0;font-size:14px;color:#166534;line-height:1.6;font-family:Arial,sans-serif">
            <strong>${i + 1}.</strong> ${item.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#15803d;text-decoration:underline">$1</a>')}
          </td></tr>`).join('')}
        </table>
      </td></tr>
    </table>
  </td></tr>` : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6">
<tr><td align="center" style="padding:20px 10px">

<table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;border-radius:12px;overflow:hidden">

  <tr><td bgcolor="#4C1D95" style="padding:32px;text-align:center">
    <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;font-family:Arial,sans-serif">你的加拿大职业规划报告</div>
    <div style="color:#e9d5ff;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">CareerPath by ThinkMake</div>
    <div style="color:#ddd6fe;font-size:14px;margin-top:8px;font-family:Arial,sans-serif">为 ${addressName} 定制 · ${province} · ${year}年</div>
  </td></tr>

  <tr><td style="padding:28px 24px 12px">
    <p style="font-size:16px;color:#111827;margin:0 0 8px;font-family:Arial,sans-serif">你好 <strong>${addressName}</strong>，</p>
    <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0;font-family:Arial,sans-serif">以下是根据你的背景生成的专属规划报告，请保存以备参考。</p>
  </td></tr>

  <tr><td style="padding:8px 24px 12px">
    <div style="font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif">推荐职业方向</div>
  </td></tr>

  ${careerCards}

  ${actionBlock}

  <tr><td style="padding:0 24px"><hr style="border:none;border-top:1px solid #e5e7eb;margin:4px 0"/></td></tr>

  <tr><td style="padding:24px">
    <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;font-family:Arial,sans-serif">完整规划报告</div>
    ${mdToEmailHtml(full_report)}
  </td></tr>

  <tr><td style="padding:0 24px"><hr style="border:none;border-top:1px solid #e5e7eb;margin:4px 0"/></td></tr>

  <tr><td style="padding:20px 24px 8px">
    <p style="font-size:12px;color:#9ca3af;line-height:1.7;margin:0 0 10px;font-family:Arial,sans-serif">本报告仅供参考，具体认证要求请以各官方机构最新公告为准。数据来源：Skilled Trades Ontario · CNO · CPA Ontario · FSRA · Job Bank Canada</p>
  </td></tr>

  <tr><td bgcolor="#f9fafb" style="padding:16px 24px;text-align:center;border-top:1px solid #e5e7eb">
    <p style="font-size:13px;color:#6b7280;margin:0;font-family:Arial,sans-serif">
      © ${year} ThinkMake · <a href="https://thinkmake.ai" style="color:#7C3AED;text-decoration:none">thinkmake.ai</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// ── EMAIL SENDER ───────────────────────────────────────────

async function sendEmail(body, careers, full_report) {
  console.log('准备发邮件给:', body.email)
  console.log('Resend key:', !!process.env.RESEND_API_KEY)
  if (!resend) { console.log('[CareerPath] Resend未初始化，跳过发送'); return false }
  try {
    const { name, salutation, email, province } = body
    const addressName = getAddressName(name, salutation)
    const result = await resend.emails.send({
      from: 'CareerPath <onboarding@resend.dev>',
      to: email,
      subject: `你好 ${addressName}，这是你的加拿大职业规划`,
      text: `你好 ${addressName}，感谢使用CareerPath职业规划工具。你的规划报告已生成，请查看HTML版本获取完整内容。`,
      html: buildEmailHtml({ name, salutation, province, careers, full_report }),
      headers: { 'X-Entity-Ref-ID': randomUUID() },
    })
    console.log('发送结果:', JSON.stringify(result))
    if (result.error) {
      console.error('[CareerPath] Resend错误:', JSON.stringify(result.error))
      return false
    }
    return true
  } catch (err) {
    console.error('[CareerPath] 邮件异常:', err.message)
    return false
  }
}

// ── ROUTE HANDLER ──────────────────────────────────────────

export async function POST(request) {
  const body = await request.json()
  const { name, salutation, email, phone, occupation, province } = body

  console.log('[CareerPath]', JSON.stringify({
    timestamp: new Date().toISOString(),
    name, salutation: salutation || '', email, phone: phone || '', occupation, province,
  }))
  console.log('[CareerPath] System prompt length:', SYSTEM_PROMPT.length)
  console.log('[CareerPath] User prompt length:', buildUserPrompt(body).length)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(body) }],
      }),
    })

    console.log('[CareerPath] API status:', response.status)

    if (!response.ok) {
      const errText = await response.text()
      console.error('[CareerPath] API error:', errText.slice(0, 300))
      throw new Error(errText.slice(0, 200))
    }

    const data = await response.json()
    const text = data.content[0].text
    console.log('[CareerPath] Response length:', text.length)

    const careersMatch = text.match(/===CAREERS_START===([\s\S]*?)===CAREERS_END===/)
    const reportMatch = text.match(/===REPORT_START===([\s\S]*?)===REPORT_END===/)

    const careersRaw = careersMatch?.[1]?.trim() || ''
    // Strip all delimiter markers and raw pipe-format lines from report
    const rawReport = reportMatch?.[1]?.trim() || text
    const full_report = rawReport
      .replace(/===CAREERS_START===[\s\S]*?===CAREERS_END===/g, '')
      .replace(/===REPORT_START===|===REPORT_END===/g, '')
      .replace(/^职业\d+[：:].*\|.*$/gm, '')
      .trim()

    const careers = careersRaw.split('\n')
      .filter(line => line.trim() && line.includes('|'))
      .map(line => {
        const parts = line.replace(/^职业\d+[：:]\s*/, '').split('|')
        const name = parts[0]?.trim() || ''
        // Parse resources from fields [6+]: "资源名称::URL"
        const rawResources = parts.slice(6).map(r => r?.trim()).filter(Boolean)
        const english_resources = rawResources.length > 0
          ? rawResources.map(r => {
              const sepIdx = r.indexOf('::')
              if (sepIdx > -1) return { name: r.slice(0, sepIdx).trim(), url: r.slice(sepIdx + 2).trim() }
              return { name: r, url: null }
            })
          : getEnglishResources(name)  // fallback to server-side lookup
        return {
          name,
          emoji: parts[1]?.trim() || '🌟',
          match_reason: parts[2]?.trim() || '',
          time: parts[3]?.trim() || '',
          cost: parts[4]?.trim() || '',
          salary: parts[5]?.trim() || '',
          english_resources,
        }
      })
      .filter(c => c.name)

    console.log('[CareerPath] 解析职业数:', careers.length)

    const email_sent = await sendEmail(body, careers, full_report)

    return Response.json({ careers, email_sent })

  } catch (error) {
    console.error('[CareerPath] Error:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
