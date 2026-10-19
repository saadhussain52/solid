/* Brevo transactional email self-test. Run `npm run check-email [recipient@example.com]`. */
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

const apiKey = process.env.BREVO_API_KEY || '';
const recipient = String(process.argv[2] || process.env.OFFICIAL_EMAIL || '').trim();

async function main() {
  if (!apiKey) {
    console.error('Set BREVO_API_KEY in .env or the server environment.');
    process.exitCode = 1;
    return;
  }
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    console.error('Provide a valid recipient email address.');
    process.exitCode = 1;
    return;
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { email: 'solids.pk.official@gmail.com', name: 'SOLID Store' },
      to: [{ email: recipient }],
      bcc: [{ email: 'solids.pk.official@gmail.com' }],
      subject: 'SOLID Store — Brevo email test',
      textContent: 'Brevo transactional HTTPS email delivery is configured for SOLID Store.',
      htmlContent: '<p>Brevo transactional HTTPS email delivery is configured for SOLID Store.</p>'
    })
  });
  const responseText = await response.text();
  let result = {};
  try { result = responseText ? JSON.parse(responseText) : {}; }
  catch (error) { result = { message: responseText.slice(0, 500) }; }
  if (!response.ok) {
    throw new Error('Brevo API ' + response.status + ': ' + (result.message || JSON.stringify(result)));
  }
  console.log('Brevo accepted the test email (' + (result.messageId || 'accepted') + '). Check ' + recipient + '.');
}

main().catch(error => {
  console.error('Brevo email test failed:', error);
  process.exitCode = 1;
});
