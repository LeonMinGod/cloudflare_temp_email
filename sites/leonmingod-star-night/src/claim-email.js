// Emails cannot reliably run clipboard JavaScript. Use a normal HTTPS link to
// fill the existing verification flow, with a copy fallback on our own page.
export function verificationEmail(email, code, origin = 'https://leonmingod.com') {
  if (!['https://leonmingod.com', 'https://www.leonmingod.com'].includes(origin)) origin = 'https://leonmingod.com';
  const link = `${origin}/free-token/verify/#${new URLSearchParams({ code, email })}`;
  const href = link.replaceAll('&', '&amp;');
  return {
    subject: `${code} 是你的 LeonMinGod 验证码`,
    text: `LeonMinGod 邮箱验证码：${code}\n\n验证码 10 分钟内有效。长按数字即可复制，或打开下面的链接填入验证码：\n${link}\n\n请在刚才领取 Token 的浏览器中继续。请勿转发或告诉他人。\n如果不是你本人操作，请忽略这封邮件。`,
    html: `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>LeonMinGod 邮箱验证码</title></head>
<body style="margin:0;background-color:#07161b;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#07161b"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0c2428" style="max-width:520px;border:1px solid #41685b;border-radius:16px"><tr><td style="padding:28px">
<p style="margin:0 0 10px;color:#91bbaa;font-size:13px;line-height:1.5">LEONMINGOD · FREE TOKEN</p>
<h1 style="margin:0 0 16px;color:#f2ead1;font-size:24px;line-height:1.4">邮箱验证码</h1>
<p style="margin:0 0 18px;color:#c6d8cf;font-size:16px;line-height:1.7">你的验证码是：</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#071a1e" style="padding:18px;border:1px solid #6aa584;border-radius:12px;color:#f4dda6;font-family:Menlo,Consolas,monospace;font-size:32px;font-weight:700;line-height:1.3;letter-spacing:.16em;user-select:all;-webkit-user-select:all">${code}</td></tr></table>
<p style="margin:12px 0 20px;color:#a8beb4;font-size:14px;line-height:1.7">10 分钟内有效。长按数字即可复制，或点击下方按钮填入。</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#315d47" style="border:1px solid #87ab87;border-radius:10px"><a href="${href}" style="display:block;padding:14px 20px;color:#f7e6b2;font-size:16px;font-weight:700;line-height:1.5;text-decoration:none">填入验证码</a></td></tr></table>
<p style="margin:16px 0 0;color:#a8beb4;font-size:14px;line-height:1.7">请在刚才领取 Token 的浏览器中继续。若打开了其他浏览器，页面会提供复制按钮。</p>
<p style="margin:16px 0 0;color:#78958a;font-size:12px;line-height:1.7">请勿转发或告诉他人。如果不是你本人操作，请忽略这封邮件。</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}
