import Link from 'next/link'

export const metadata = {
  title: '隐私政策 — ThinkMake CareerPath',
}

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px', color: '#1a1a1a', lineHeight: 1.8 }}>
      <Link href="/" style={{ color: '#7c3aed', textDecoration: 'none', fontSize: 14 }}>← 返回</Link>

      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '24px 0 8px' }}>隐私政策</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 32 }}>最后更新：2026年4月17日</p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>1. 我们收集哪些信息</h2>
        <p>当你使用 ThinkMake CareerPath 时，我们收集：</p>
        <ul style={{ marginLeft: 20, marginTop: 8 }}>
          <li>你在对话中主动提供的职业背景信息</li>
          <li>你提交的邮箱地址和微信号（可选）</li>
          <li>IP 地址和浏览器信息（用于安全防护）</li>
          <li>对话内容（用于改善服务质量）</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>2. 我们如何使用这些信息</h2>
        <ul style={{ marginLeft: 20 }}>
          <li>向你发送职业规划报告（邮件）</li>
          <li>通过微信提供一对一深度咨询服务</li>
          <li>向你推送与加拿大职业发展相关的培训机构信息和政策更新</li>
          <li>改善 AI 对话质量和职业建议准确性</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>3. 信息共享</h2>
        <p>我们可能与以下方共享你的联系方式：</p>
        <ul style={{ marginLeft: 20, marginTop: 8 }}>
          <li>与你的职业方向匹配的加拿大合作培训机构</li>
          <li>提供一对一职业咨询的专业顾问</li>
        </ul>
        <p style={{ marginTop: 8 }}>我们不会将你的信息出售给第三方。</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>4. 你的权利（PIPEDA）</h2>
        <p>根据加拿大《个人信息保护和电子文件法》（PIPEDA），你有权：</p>
        <ul style={{ marginLeft: 20, marginTop: 8 }}>
          <li>查看我们持有的关于你的信息</li>
          <li>要求更正不准确的信息</li>
          <li>要求删除你的个人信息</li>
          <li>随时取消订阅（回复任意邮件"STOP"）</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>5. 联系我们</h2>
        <p>如有任何隐私相关问题，请通过以下方式联系：</p>
        <ul style={{ marginLeft: 20, marginTop: 8 }}>
          <li>网站：thinkmake.ai</li>
          <li>微信：{process.env.NEXT_PUBLIC_WECHAT_CONTACT || 'thinkmake_ca'}</li>
        </ul>
      </section>
    </div>
  )
}
