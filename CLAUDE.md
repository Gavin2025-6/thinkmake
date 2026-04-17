# ThinkMake 项目

## 技术栈
Next.js 14，部署在Railway，代码在GitHub，域名thinkmake.ai

## 产品
- CarMonitor：GTA二手车监控，已上线，不要修改任何相关代码
- CareerPath：华人新移民职业规划工具，路径/career，开发中

## 设计规范
- 主题色：紫色 #7C3AED
- 背景：白色
- 顶部结果区：浅紫色 #F5F3FF
- 字体：系统默认sans-serif
- 界面语言：简体中文

## API配置
- AI模型：claude-sonnet-4-6
- 邮件服务：Resend，发件人暂用onboarding@resend.dev
  域名验证完成后改为noreply@thinkmake.ai
- ANTHROPIC_API_KEY 和 RESEND_API_KEY 在.env.local和Railway Variables里

## CareerPath架构
- 表单页：app/career/page.js
- API第一次调用：生成3个职业卡片简版数据
- API第二次调用：基于第一次职业名称生成完整报告，发邮件
- 邮件模板：table布局，600px，三个职业独立段落
- 结果页：显示3张卡片，顶部显示邮件发送状态

## 重要规则
- 不要修改CarMonitor任何代码
- 不要安装大型新依赖
- 每次改动后运行npm run build确认无报错再push
- push前先rm -rf .next清理缓存

## 部署流程
git add . && git commit -m "描述" && git push
Railway自动部署，等2-3分钟生效
