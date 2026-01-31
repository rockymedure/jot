import { Resend } from 'resend'
import { format } from 'date-fns'

let resendInstance: Resend | null = null

function getResend() {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY)
  }
  return resendInstance
}

interface ReflectionEmailParams {
  to: string
  userName: string | null
  repoName: string
  date: string
  content: string
  comicUrl?: string | null
}

/**
 * Send a reflection email to the user
 */
export async function sendReflectionEmail({
  to,
  userName,
  repoName,
  date,
  content,
  comicUrl
}: ReflectionEmailParams) {
  const formattedDate = format(new Date(date), 'EEEE, MMMM d')
  const greeting = userName ? `Hey ${userName.split(' ')[0]},` : "Here's your daily reflection."
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your jot for ${formattedDate}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #fafafa;
    }
    .container {
      background: #ffffff;
      border-radius: 12px;
      padding: 32px;
      border: 1px solid #e5e5e5;
    }
    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e5e5e5;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
    }
    .logo {
      font-family: monospace;
      font-size: 24px;
      font-weight: bold;
      color: #0a0a0a;
    }
    .repo-name {
      font-size: 14px;
      color: #666;
      text-align: right;
    }
    .greeting {
      color: #666;
      margin-bottom: 24px;
    }
    .content h2 {
      font-size: 18px;
      font-weight: 600;
      margin-top: 24px;
      margin-bottom: 12px;
      color: #0a0a0a;
    }
    .content p {
      margin-bottom: 16px;
      color: #333;
    }
    .content ul {
      padding-left: 20px;
      margin-bottom: 16px;
    }
    .content li {
      margin-bottom: 8px;
    }
    .content strong {
      font-weight: 600;
    }
    .comic-image {
      width: 100%;
      margin-bottom: 24px;
    }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e5e5e5;
      color: #999;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <table class="header-table">
        <tr>
          <td class="logo">jot</td>
          <td class="repo-name">${repoName}</td>
        </tr>
      </table>
    </div>
    
    <p class="greeting">${greeting}</p>
    
    ${comicUrl ? `<img src="${comicUrl}" alt="Daily comic strip" class="comic-image" />` : ''}
    
    <div class="content">
      ${markdownToHtml(content)}
    </div>
    
    <div class="footer">
      <p>— jot</p>
      <p style="font-size: 12px; color: #bbb;">
        <a href="${appUrl}/dashboard" style="color: #666;">View in dashboard</a> · 
        <a href="${appUrl}/settings" style="color: #666;">Email settings</a>
      </p>
    </div>
  </div>
</body>
</html>
`

  try {
    const resend = getResend()
    await resend.emails.send({
      from: 'jot <jot@mail.jotgrowsideas.com>',
      to,
      subject: `Your day in code — ${formattedDate}`,
      html: htmlContent,
    })
  } catch (error) {
    console.error('Failed to send email:', error)
    throw error
  }
}

interface ReviewEmailParams {
  to: string
  userName: string | null
  repoName: string
  date: string
  issueCount: number
  reflectionId: string
  summary?: string
  issueTitles?: string[]
}

/**
 * Send an email when a deep review is complete
 */
export async function sendReviewEmail({
  to,
  userName,
  repoName,
  date,
  issueCount,
  reflectionId,
  summary,
  issueTitles = []
}: ReviewEmailParams) {
  const formattedDate = format(new Date(date), 'MMMM d')
  const greeting = userName ? `Hey ${userName.split(' ')[0]},` : 'Hey,'
  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reflections/${reflectionId}`
  
  // Show up to 5 issues, indicate if there are more
  const displayIssues = issueTitles.slice(0, 5)
  const remainingCount = issueTitles.length - 5

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deep review complete — ${repoName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #fafafa;
    }
    .container {
      background: #ffffff;
      border-radius: 12px;
      padding: 32px;
      border: 1px solid #e5e5e5;
    }
    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e5e5e5;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
    }
    .logo {
      font-family: monospace;
      font-size: 24px;
      font-weight: bold;
      color: #0a0a0a;
    }
    .repo-name {
      font-size: 14px;
      color: #666;
      text-align: right;
    }
    .greeting {
      color: #666;
      margin-bottom: 16px;
    }
    .summary-section {
      background: #f9f9f9;
      border-radius: 8px;
      padding: 16px;
      margin: 20px 0;
    }
    .summary-section h3 {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .summary-section p {
      margin: 0;
      color: #333;
      font-size: 15px;
    }
    .issue-count-box {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 20px 0;
      display: flex;
      align-items: center;
    }
    .issue-count {
      font-size: 32px;
      font-weight: bold;
      color: #0a0a0a;
      margin-right: 12px;
    }
    .issue-label {
      color: #666;
      font-size: 14px;
    }
    .issues-list {
      margin: 20px 0;
      padding: 0;
      list-style: none;
    }
    .issues-list li {
      padding: 10px 0;
      border-bottom: 1px solid #eee;
      font-size: 14px;
      color: #333;
    }
    .issues-list li:last-child {
      border-bottom: none;
    }
    .issue-number {
      color: #999;
      font-family: monospace;
      margin-right: 8px;
    }
    .more-issues {
      color: #666;
      font-size: 13px;
      font-style: italic;
    }
    .cta-button {
      display: inline-block;
      background: #0a0a0a;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 500;
      margin-top: 16px;
    }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e5e5e5;
      color: #999;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <table class="header-table">
        <tr>
          <td class="logo">jot</td>
          <td class="repo-name">${repoName}</td>
        </tr>
      </table>
    </div>
    
    <p class="greeting">${greeting}</p>
    
    <p>Your deep review for <strong>${formattedDate}</strong> is ready.</p>
    
    ${summary ? `
    <div class="summary-section">
      <h3>Summary</h3>
      <p>${summary}</p>
    </div>
    ` : ''}
    
    <table class="issue-count-box" role="presentation">
      <tr>
        <td class="issue-count">${issueCount}</td>
        <td class="issue-label">${issueCount === 1 ? 'issue' : 'issues'} found</td>
      </tr>
    </table>
    
    ${displayIssues.length > 0 ? `
    <ul class="issues-list">
      ${displayIssues.map((title, i) => `
        <li><span class="issue-number">${i + 1}.</span>${title}</li>
      `).join('')}
      ${remainingCount > 0 ? `
        <li class="more-issues">...and ${remainingCount} more</li>
      ` : ''}
    </ul>
    ` : ''}
    
    <div style="text-align: center;">
      <a href="${reviewUrl}" class="cta-button">View Full Review</a>
    </div>
    
    <div class="footer">
      <p>— jot</p>
      <p style="font-size: 12px; color: #bbb;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color: #666;">View dashboard</a> · 
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings" style="color: #666;">Email settings</a>
      </p>
    </div>
  </div>
</body>
</html>
`

  try {
    const resend = getResend()
    await resend.emails.send({
      from: 'jot <jot@mail.jotgrowsideas.com>',
      to,
      subject: `Deep review complete — ${issueCount} ${issueCount === 1 ? 'issue' : 'issues'} found`,
      html: htmlContent,
    })
  } catch (error) {
    console.error('Failed to send review email:', error)
    throw error
  }
}

/**
 * Build a contextual deep review pitch based on the work done
 */
interface TipsEmailParams {
  to: string
  userName: string | null
}

/**
 * Send a tips email - jot expressing curiosity about their other work
 * Sent after a user's 3rd reflection
 */
export async function sendTipsEmail({
  to,
  userName
}: TipsEmailParams) {
  const name = userName ? userName.split(' ')[0] : 'there'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>What else are you working on?</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #fafafa;
    }
    .container {
      background: #ffffff;
      border-radius: 12px;
      padding: 32px;
      border: 1px solid #e5e5e5;
    }
    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e5e5e5;
    }
    .logo {
      font-family: monospace;
      font-size: 24px;
      font-weight: bold;
      color: #0a0a0a;
    }
    p {
      margin-bottom: 20px;
      color: #333;
    }
    .cta-link {
      color: #0a0a0a;
      font-weight: 500;
    }
    .section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px dashed #e5e5e5;
    }
    .section-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #999;
      margin-bottom: 12px;
    }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e5e5e5;
      color: #999;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">jot</div>
    </div>
    
    <p>Hey ${name},</p>
    
    <p>
      I've been watching your commits roll in, and I'm curious — is this the only thing you're building right now?
    </p>
    
    <p>
      Most founders I work with have a few things going on. Side projects, experiments, that thing you keep meaning to get back to. 
      If you want, <a href="${appUrl}/dashboard" class="cta-link">add your other repos</a> and I'll start reflecting on those too. 
      I'd love to see the full picture of what you're working on.
    </p>
    
    <div class="section">
      <div class="section-label">One more thing</div>
      <p>
        After any reflection, you can ask me for a deep review. I'll actually clone your repo, read through the code you shipped that day, 
        and tell you what I think — patterns I noticed, things that might bite you later, places where you crushed it.
      </p>
      <p>
        Just click "Review this work" on any reflection. I'll email you when it's ready.
      </p>
    </div>
    
    <div class="footer">
      <p>— jot</p>
      <p style="font-size: 12px; color: #bbb;">
        <a href="${appUrl}/settings" style="color: #666;">Email settings</a>
      </p>
    </div>
  </div>
</body>
</html>
`

  try {
    const resend = getResend()
    await resend.emails.send({
      from: 'jot <jot@mail.jotgrowsideas.com>',
      to,
      subject: 'What else are you working on?',
      html: htmlContent,
    })
  } catch (error) {
    console.error('Failed to send tips email:', error)
    throw error
  }
}

/**
 * Simple markdown to HTML conversion for email
 */
function markdownToHtml(markdown: string): string {
  return markdown
    // Headers
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Paragraphs (lines not already wrapped)
    .replace(/^(?!<[hul]|<li)(.+)$/gm, '<p>$1</p>')
    // Clean up
    .replace(/<\/ul>\n<ul>/g, '')
    .replace(/\n\n+/g, '\n')
}
