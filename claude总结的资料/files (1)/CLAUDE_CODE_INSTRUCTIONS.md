# 发给 Claude Code 的完整集成指令

**用法**：把下面整段（包括代码块）复制粘贴给 Claude Code，让它一次性集成 V2。

---

## 集成指令（直接复制下面给 Claude Code）

```
我要把 ThinkMake CareerPath 升级到 V2。这是一个对加拿大华人新移民的职业规划工具。
V1 是一个 5 字段表单，V2 要改成对话式 AI。

我会附上 4 个文件：
1. cases.json - 11 条真实案例库
2. tactics.json - 9 条应对策略库
3. resources.json - 100+ 权威资源库
4. v2_design_doc.md - 完整产品设计文档

请按以下步骤集成：

【步骤 1：保留 V1 + 新建 V2 主入口】

1. 把现有的 V1 表单页面移到 /quick 路由
2. 主页 / 改为新的对话式 AI 界面
3. 顶部导航加切换：
   - "对话规划（推荐）" → /
   - "30 秒快速版" → /quick

【步骤 2：建立数据库（Railway Postgres）】

1. 在 Railway 项目里添加 Postgres（控制台 + New → Database → PostgreSQL）
2. 安装 prisma 和 @prisma/client
3. 创建 prisma/schema.prisma：

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Conversation {
  id              String   @id @default(cuid())
  sessionId       String   @unique
  email           String?
  
  conversationHistory  Json
  extractedProfile     Json?
  matchedCases         Json?
  matchedTactics       Json?
  finalRecommendations Json?
  
  pdfDownloadedAt DateTime?
  ipAddress       String?
  userAgent       String?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  lead Lead?
}

model Lead {
  id             String   @id @default(cuid())
  email          String   @unique
  wechat         String?
  
  conversationId String   @unique
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  
  recommendedCareers Json?
  province           String?
  englishLevel       String?
  
  source           String?
  unsubscribed     Boolean  @default(false)
  
  createdAt DateTime @default(now())
}

4. 跑 prisma migrate dev 创建表

【步骤 3：把 3 个数据文件放到项目里】

在项目根目录创建 data/ 文件夹，放：
- data/cases.json
- data/tactics.json
- data/resources.json

【步骤 4：实现对话式 AI 主流程】

技术栈：
- 前端：聊天气泡 UI（用户右、AI 左）
- 后端：Next.js API route 调用 Anthropic API（Claude Sonnet 4）
- 状态管理：useState 维护对话历史

每轮对话流程：
1. 用户发消息
2. 前端把对话历史 + 用户消息 → POST /api/chat
3. 后端：
   a. 把对话历史 + 系统提示词 + cases.json/tactics.json 摘要 → 发给 Claude
   b. Claude 决定下一个回复（继续问 or 进入总结阶段）
   c. 把回复返回前端
   d. 同时把这一轮存入 conversations 表
4. 前端显示 AI 回复

系统提示词（放在 lib/system-prompt.ts，请直接用下面这段）：

【系统提示词内容】
你是 ThinkMake CareerPath 的 AI 职业规划顾问，专门帮助加拿大华人新移民。

【你的数据资产】
- 11 条真实华人新移民案例
- 9 条可复用应对策略
- 100+ 权威资源链接

【你的两阶段任务】

阶段 1 - 信息收集（前 8-12 轮）：
通过自然对话获取以下信息（每次只问 1-2 个，根据用户回答智能调整）：
1. 国内职业（具体到行业、级别、年限）
2. 真实技能（不只 title）
3. 现在所在城市
4. 当前在加拿大的状态
5. 转行/找工作的真实原因
6. 家庭情况（独身/带娃、配偶状态）
7. 现金流压力（多快需要稳定收入）
8. 身份状态（PR/工签/学签/配偶工签）
9. 英语水平（不只自评，问具体场景）
10. 学习意愿（愿意读书、考证、还是直接工作）
11. 时间投入能力
12. 预算
13. 价值观维度（最看重工作的什么）

每答完一题：
- 先给简短反馈（如"38 岁是转型黄金期"），再问下一题
- 用户提到关键词（焦虑、送快递、语言不行等）必须追问
- 用户回答模糊时具体追问

【关键识别规则】
- 用户提到"我看了很多资料"→ 调用策略 T008（决策协助框架）
- 用户提到"投了 X 份没回复"→ 调用策略 T002（海投到精投）
- 用户提到"陪配偶"→ 调用策略 T006（配偶工签）
- 用户提到"想做电工/水管工"→ 调用策略 T009（先问目标）
- 用户提到 gap、政府工作、教育→ 调用策略 T004（政府路径）
- 用户提到"我应该读硕士吗"→ 调用策略 T007（ROI 对比）

阶段 2 - 总结建议（第 8-12 轮后）：
当信息足够，用结构化 markdown 输出：

## 你的画像
[3-5 句话总结]

## 推荐方向（2-3 个）
### 方向 1：XXX（匹配度 X%）
- 为什么匹配你：[基于对话内容个性化解释]
- 大致路径
- 时间和费用
- 预期收入
- 数据来源：[官方链接]

## 类似案例
我们案例库里有位类似情况的人...
- 案例摘要（带博主原话）

## 确定性分级
- ✅ 我很确定的部分
- ⚠️ 需要更多信息的部分 → 加微信深聊
- ❓ 需要找专业人士的部分 → 推荐资源

## 下一步行动（明天能做的）
1. [具体行动 1]
2. [具体行动 2]
3. [具体行动 3]

## 完整资源
[相关链接]

【输出风格】
- 中文为主
- 引用案例时用博主原话
- 每段 3-5 句，不要堆砌
- 适当用 emoji
- 永远诚实，不假装全知

【避免】
- 不给 5 年规划，给"明天能做的事"
- 不要鸡汤化
- 不要假装确定
- 不要堆砌所有信息
【系统提示词结束】

【步骤 5：UI 设计】

主对话页面（/）布局：

顶部：
- ThinkMake CareerPath logo
- 副标题："已经有 [动态数字] 位华人新移民通过对话获得了规划"（数字先硬编码 100）
- 进度条："对话进度 X/12"（每轮 +1）

中间：
- 聊天气泡（用户右、AI 左）
- AI 头像用 ThinkMake logo
- AI "打字"时显示 ... 动画

底部：
- 输入框 + 发送按钮
- "切换到快速版"链接

总结阶段后：
- AI 输出完整总结
- 跳出 PDF 下载卡片（要邮箱、可选微信）

【步骤 6：PDF 生成】

用 puppeteer 或 react-pdf 生成 PDF：
- 内容来自总结阶段已生成的内容（不调新 API）
- 每页页眉：ThinkMake CareerPath
- 每页页脚：thinkmake.ai | 微信 [PLACEHOLDER_WECHAT] | 第 X 页 / 共 X 页
- 末页加"接下来你可以做的"卡片：
  * 加微信领 7 天行动清单
  * 把报告发给家人讨论
  * 加微信订阅每月政策更新

【步骤 7：邮件】

集成 Resend：
- 用户提交邮箱后立即发邮件附 PDF
- 邮件正文简短，强调"如有问题加微信 [PLACEHOLDER_WECHAT]"
- 底部："如不希望接收，回复 STOP"

【步骤 8：隐私合规】

- 创建 /privacy 页面（写清楚收集和使用规则）
- PDF 下载表单加 checkbox：默认勾选"我同意 ThinkMake 使用我的联系方式向我推荐相关培训机构"
- 表单底部 footer 链接到 /privacy

【步骤 9：Admin 后台】

创建 /admin：
- HTTP Basic Auth 用 ADMIN_PASSWORD 保护
- 总览页：今日新增 / 本周 / 总数（3 个数字卡片）
- Lead 列表：表格显示 email、wechat、推荐方向、城市、注册时间
- 筛选：按推荐职业方向、按城市
- 导出 CSV 按钮

【步骤 10：环境变量】

在 Railway 添加：
- ANTHROPIC_API_KEY（从 console.anthropic.com 拿）
- DATABASE_URL（Railway Postgres 自动生成）
- RESEND_API_KEY（从 resend.com 拿）
- ADMIN_PASSWORD（自定义）
- WECHAT_CONTACT（你的客服微信号）

【步骤 11：部署 + 测试】

1. git push → Railway 自动部署
2. 测试 5 个不同身份用户跑一遍：
   - 留学应届
   - 配偶工签
   - 带娃妈妈
   - 中年技工
   - PR 想转行
3. 验证：
   - 对话能正常推进
   - 总结合理
   - PDF 能下载
   - 邮件能收到
   - admin 能看到 lead

完成后告诉我：
1. 哪些环境变量需要我配置
2. 测试发现的问题
3. 上线后建议关注的 3 个核心指标
```

---

## 给你（用户）的操作指引

### 你需要准备的

1. **新微信号**（专门给 ThinkMake CareerPath 的客服号）
   - 头像：ThinkMake logo
   - 名字：ThinkMake 职业规划
   - 个性签名：加拿大华人职业路径规划 | 政策更新 | 真实案例

2. **Resend 账号**（去 resend.com 注册）
   - 拿 API key
   - 验证你的发送域名（thinkmake.ai）

3. **想好 admin 密码**

4. **想好 ANTHROPIC_API_KEY**
   - 从 console.anthropic.com 拿
   - 或者用现有的（如果你已有）

### 集成顺序建议

1. 把上面的「集成指令」整段复制给 Claude Code
2. 同时上传 4 个数据文件
3. Claude Code 跑完后会问你环境变量
4. 你去 Railway 配置环境变量
5. Railway 自动重新部署
6. 你测试 5 个不同身份用户
7. 没问题就开始小范围分享（5 个微信群）

### 上线后第一周观察

| 指标 | 目标 | 你怎么看 |
|------|------|---------|
| 进站完成对话率 | > 30% | Admin 后台 |
| 总结后下载 PDF | > 60% | Admin 后台 |
| 加微信率 | > 15% | 你的微信新增数 |
| 平均对话轮数 | 8-12 | Admin 后台 |
| 加微信用户主动咨询率 | > 30% | 你回复时统计 |

如果某个指标低于目标，回来找我，我们一起调。

---

## 如果 Claude Code 集成中遇到问题

常见问题清单：

**问题 1：对话太长，AI 还不进入总结阶段**
- 解决：在系统提示词里强化"第 8 轮后必须开始考虑触发总结"

**问题 2：AI 引用案例时编造细节**
- 解决：把 cases.json 的具体内容直接放进系统提示词的 context（不是摘要）

**问题 3：PDF 生成超时**
- 解决：把 PDF 生成放到独立的 API route，异步处理

**问题 4：Resend 域名验证**
- 解决：让 Claude Code 帮你设置 DNS 记录（thinkmake.ai 的 DNS）

**问题 5：用户不愿留邮箱**
- 解决：调整文案，强调"PDF 是可保存可分享的"，弱化"留邮箱"

遇到任何问题，把日志和报错截图发给我。
