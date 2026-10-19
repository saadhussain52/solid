/* Resend HTTPS self-test. Run `npm run check-email [recipient@example.com]`. */
'use strict';
const fs = require('fs');
const path = require('path');

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

const apiKey = process.env.RESEND_API_KEY || '';
const from = process.env.RESEND_FROM || 'SOLID Store <onboarding@resend.dev>';
const recipient = String(process.argv[2] || process.env.OFFICIAL_EMAIL || '').trim();

async function main() {
  if (!apiKey) {
    console.error('Set RESEND_API_KEY in .env or the server environment.');
    process.exitCode = 1;
    return;
  }
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    console.error('Provide a valid recipient email address.');
    process.exitCode = 1;
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: recipient,
      bcc: 'solids.pk.official@gmail.com',
      subject: 'SOLID Store — Resend email test',
      text: 'Resend HTTPS email delivery is configured for SOLID Store.'
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('Resend API ' + response.status + ': ' + (result.message || JSON.stringify(result)));
  }
  console.log('Resend accepted the test email (' + (result.id || 'no id returned') + '). Check ' + recipient + '.');
}

main().catch(error => {
  console.error('Resend email test failed:', error);
  process.exitCode = 1;
});
