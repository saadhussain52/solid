/* Gmail SMTP self-test. Run `npm run check-email [recipient@example.com]`. */
'use strict';
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || match[1] in process.env) return;
    let value = match[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    process.env[match[1]] = value;
  });
}

const user = process.env.GMAIL_USER || '';
const pass = process.env.GMAIL_APP_PASS || '';
const recipient = String(process.argv[2] || process.env.OFFICIAL_EMAIL || user).trim();

async function main() {
  if (!user || !pass) {
    console.error('Set GMAIL_USER and GMAIL_APP_PASS in .env or the server environment.');
    process.exitCode = 1;
    return;
  }
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    console.error('Provide a valid recipient email address.');
    process.exitCode = 1;
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
  const result = await transporter.sendMail({
    from: 'SOLID Store <solids.pk.official@gmail.com>',
    to: recipient,
    subject: 'SOLID Store — Gmail SMTP test',
    text: 'Gmail SMTP is configured for SOLID Store order confirmations.'
  });
  console.log('Gmail SMTP accepted the test email (' + result.messageId + '). Check ' + recipient + '.');
}

main().catch(error => {
  console.error('Gmail SMTP test failed: ' + error.message);
  process.exitCode = 1;
});
