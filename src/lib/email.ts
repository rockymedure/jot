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
}

/**
 * Send a reflection email to the user
 */
export async function sendReflectionEmail({
  to,
  userName,
  repoName,
  date,
  content
}: ReflectionEmailParams) {
  const formattedDate = format(new Date(date), 'EEEE, MMMM d')
  const greeting = userName ? `Hey ${userName.split(' ')[0]},` : "Here's your daily reflection."

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
    
    <div class="content">
      ${markdownToHtml(content)}
    </div>
    
    <div class="footer">
      <p>— jot</p>
      <p style="font-size: 12px; color: #bbb;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color: #666;">View in dashboard</a> · 
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
  reflectionId
}: ReviewEmailParams) {
  const formattedDate = format(new Date(date), 'MMMM d')
  const greeting = userName ? `Hey ${userName.split(' ')[0]},` : 'Hey,'
  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reflections/${reflectionId}`

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
    .summary-box {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
      text-align: center;
    }
    .issue-count {
      font-size: 36px;
      font-weight: bold;
      color: #0a0a0a;
    }
    .issue-label {
      color: #666;
      font-size: 14px;
    }
    .cta-button {
      display: inline-block;
      background: #0a0a0a;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 500;
      margin-top: 24px;
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
    
    <div class="summary-box">
      <div class="issue-count">${issueCount}</div>
      <div class="issue-label">${issueCount === 1 ? 'issue' : 'issues'} found</div>
    </div>
    
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
