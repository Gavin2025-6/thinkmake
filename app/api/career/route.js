import { NextResponse } from 'next/server'

const SYSTEM_PROMPT = `你是专门帮助中国新移民规划加拿大职业路径的顾问。
你的知识来源于以下权威机构的公开信息：
- Skilled Trades Ontario (skilledtradesontario.ca) — 安省技工认证
- College of Nurses of Ontario (cno.org) — 安省护士注册
- CPA Ontario (cpaontario.ca) — 安省注册会计师
- CTCMPAO (ctcmpao.on.ca) — 安省中医注册
- BC College of Nurses and Midwives (bccnm.ca) — BC省护士
- Alberta College of Nursing (nurses.ab.ca) — 阿省护士
- Job Bank Canada (jobbank.gc.ca) — 职业数据和工资

省份处理规则：
- 用户选安大略省：给出详细认证路径、机构名称+官网链接、具体费用范围、时间线
- 用户选BC省/Alberta/其他省份：给出方向性建议，注明"具体认证要求以当地官方机构为准"，并附上该省对应认证机构官网链接

回答结构（每次必须按此格式）：
1. 推荐2-3个最匹配的职业方向，每个职业单独成段，包含：
   - 为什么推荐（结合用户背景说明匹配原因）
   - 认证机构名称 + 官网链接
   - 认证步骤（分点列出，清晰具体）
   - 预计时间
   - 费用范围
   - 安省平均年薪范围
2. 针对用户英语水平的具体建议（英语差的给语言提升建议，流利的说明优势）
3. 针对用户预算的说明（预算不够的给出分阶段方案）
4. 第一步行动清单：3条今天/这周可以立刻执行的具体行动
5. 最后一行免责声明："以上信息仅供参考，具体要求请以各认证机构官方网站最新公告为准。"

语气：专业但亲切，像一个在加拿大生活多年的过来人在帮你分析，不用太正式。
全程使用简体中文。`

export async function POST(request) {
  try {
    const { occupation, province, english, time, budget } = await request.json()

    if (!occupation || !province || !english || !time || !budget) {
      return NextResponse.json({ error: '请填写所有字段' }, { status: 400 })
    }

    const userPrompt = `用户背景：
- 在中国的职业：${occupation}
- 目前所在省份：${province}
- 英语水平：${english}
- 可投入时间：${time}
- 可用预算：${budget}

请根据以上背景，为这位华人新移民规划在加拿大的职业路径。`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic API error:', data)
      return NextResponse.json({ error: '分析失败，请稍后重试' }, { status: 500 })
    }

    return NextResponse.json({ result: data.content[0].text })
  } catch (err) {
    console.error('Career API error:', err)
    return NextResponse.json({ error: '分析失败，请稍后重试' }, { status: 500 })
  }
}
