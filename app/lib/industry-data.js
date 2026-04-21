// Industry-specific data injected on demand based on keyword detection.
// Only loaded into system prompt when matching keywords appear in recent turns.

export const INDUSTRY_DATA = {
  trades: `行业真相·技工类（2025）
电工309A：最通用（住宅/商业/工业/自雇均可）；442A只能进工厂风险集中；华人社区有市场；学徒期9000h工作+840h课堂约5年可边打工边领薪；英语工地日常够用即可。收入：学徒$20-28/h，持牌$28-48/h，自雇$65k-100k+/年。
水管工306A：政府预警10年短缺；Express Entry技工通道；华人蓝海；紧急维修$150-300/h。CPAC免费Pre-Apprenticeship18周含工具，要求PR+高中+CLB5，约4-5年学徒期。收入：$24.93-53.09/h，$51k-110k/年。
厨师：Red Seal在华人餐厅无用；直接走进去试菜；北约克/士嘉堡/万锦缺人；别网上投简历直接走访。收入：$17.60-40/h，$36k-83k/年。`,

  insurance: `行业真相·保险代理OTL/LLQP（2025）
华人社区天然市场；门槛低（OTL考$250+题库$50+教材$246，2个月考完）；但这是纯销售——没有销售能力和人脉做不下去。收入：起步$40k-60k，有人脉$80k-200k+，差距极大取决于销售力和人脉圈。`,

  it: `行业真相·IT科技（2025）
2024-2026加拿大IT岗位急剧收缩大量裁员；Coding Bootcamp路径已基本失效；有5年+真实经验的人有需求但竞争激烈；0基础转码不建议，时机已过。`,

  government: `行业真相·政府/教育（2025）
PR即可申请大多数联邦岗位；工资公开透明同职级同薪；Defined Benefit Pension30年后领60%工资终身；对新移民友好口音容忍度高。收入参考(2026)：行政文员CR-04约$56k，项目协调PM-01约$62k，IT分析IT-02约$86k，含福利高25-30%。入门路径：先投Casual/Temporary（门槛低），进系统后内部转permanent（成功率高）；有gap不致命。`,
}

// Scan last 3 turns (6 messages) for keyword matching
export function detectIndustries(messages) {
  const text = messages.slice(-6).map(m => (typeof m.content === 'string' ? m.content : '')).join(' ')
  const found = new Set()
  if (/电工|水管工|技工|管工|管道|学徒|厨师|厨房|309a|442a|306a|red seal/i.test(text)) found.add('trades')
  if (/保险|insurance|otl|llqp|险代|寿险|车险/i.test(text)) found.add('insurance')
  if (/\bIT\b|it行业|编程|程序员|开发|软件|developer|coding|bootcamp|技术岗/i.test(text)) found.add('it')
  if (/政府|公务员|federal|联邦|省政府|市政府|教育|教师|学校|学区/i.test(text)) found.add('government')
  return found
}
