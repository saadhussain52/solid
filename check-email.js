/*
 * Email self-test.
 *
 * Run this when a customer says the tracking email never arrived:
 *   npm run check-email            -> sends a test mail to the studio address
 *   npm run check-email me@x.com   -> sends it to an address you give
 *
 * It reports the exact reason a mail would not arrive, rather than leaving
 * you to guess between a missing key, an unverified sender domain, and a
 * provider that accepted the request but dropped the message.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* Same .env reader the server uses, so both see identical settings. */
const envPath = path.join(__dirname, '.env');
let envFile = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) return;
    let value = match[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    envFile[match[1]] = value;
  });
}
const val = key => (key in process.env && process.env[key] !== '' ? process.env[key] : (envFile[key] || ''));

const KEY = val('RESEND_API_KEY');
const FROM = val('MAIL_FROM') || 'Solids <onboarding@resend.dev>';
const SITE = val('SITE_URL');
const arg = process.argv[2] || val('STUDIO_EMAIL');
const to = String(arg || '').trim();
const fromDomain = (FROM.match(/@([^>\s]+)/) || [])[1] || '';

const line = text => console.log('  ' + text);
const ok = text => console.log('  [ok]   ' + text);
const bad = text => console.log('  [!!]   ' + text);
const warn = text => console.log('  [note] ' + text);

/* Wrapped in a function rather than run at the top level: this file uses
   require(), so top-level await would leave Node unable to tell whether the
   file is CommonJS or an ES module, and it would refuse to run at all. */
async function main() {
  /* Plain ASCII punctuation: the Windows console this is run from does not
     render em dashes, and garbled output makes a real error hard to spot. */
  console.log('\nSolids - email check\n');

  /* 1. Is there anything to send with? */
  if (!KEY) {
    bad('No RESEND_API_KEY, so the server never attempts to send anything.');
    console.log('\n  Fix: get a free key at https://resend.com/api-keys, then create a file');
    console.log('  named ".env" next to package.json containing:');
    console.log('\n      RESEND_API_KEY=re_xxxxxxxxx\n');
    process.exit(1);
  }
  ok('RESEND_API_KEY is set (' + KEY.slice(0, 6) + '…)');

  /* 2. Does the key actually authenticate? Catches typos and revoked keys. */
  let domains = [];
  try {
    const auth = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: 'Bearer ' + KEY }
    });
    if (auth.ok) {
      domains = (await auth.json()).data || [];
      ok('Key accepted by Resend');
    } else {
      bad('Resend rejected the key (HTTP ' + auth.status + '). It is likely wrong or revoked.');
    }
  } catch (error) {
    bad('Could not reach Resend - check your internet connection. (' + error.message + ')');
  }

  /* 3. Will Resend actually send from this address? */
  if (fromDomain && domains.length) {
    const match = domains.find(d => d.name === fromDomain);
    if (!match) {
      bad('"' + fromDomain + '" is not a domain on this Resend account, so every mail would be rejected.');
      warn('Domains on this account: ' + domains.map(d => d.name).join(', '));
    } else if (match.status !== 'verified') {
      bad('Domain "' + fromDomain + '" is ' + match.status + ', not verified - Resend will not send from it yet.');
      warn('Check the DNS records Resend lists for this domain.');
    } else {
      ok('Sending domain "' + fromDomain + '" is verified');
    }
  } else if (fromDomain === 'resend.dev') {
    warn('MAIL_FROM uses the Resend test address - it only delivers to your own inbox.');
    warn('Verify your own domain and set MAIL_FROM to it before real customers can receive mail.');
  }

  if (!to) {
    warn('No recipient given, so nothing was sent.');
    warn('Re-run with an address to send a real test:  npm run check-email you@example.com');
    console.log('');
    return;
  }
  if (!SITE) {
    warn('SITE_URL is not set - the tracking link inside the email will point at localhost,');
    warn('which does not work for a customer. Set SITE_URL to your live address.');
  }

  /* 4. Send the actual test mail. */
  const link = (SITE || 'http://localhost:5173') + '/track.html';
  console.log('\n  Sending a test email to ' + to + '…\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: 'Solids — email setup test',
        text: 'This is a test from the Solids storefront.\n\nTracking links in real emails look like this:\n' + link + '\n\nIf you got this, the customer email will arrive too.',
        html: '<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;color:#292827">' +
          '<h1 style="font-size:20px">Email setup works</h1>' +
          '<p style="font-size:14px">This is a test from the Solids storefront. Real customers will receive their ' +
          'order number, tracking ID and a tracking link that opens their parcel status.</p>' +
          '<p><a href="' + link + '" style="display:inline-block;background:#292827;color:#fff;padding:12px 20px;' +
          'text-decoration:none;font-size:12px">OPEN A TRACKING LINK</a></p></div>'
      })
    });
    const body = await res.text();
    if (res.ok) {
      const id = (JSON.parse(body).id || '');
      ok('Resend accepted the email (id ' + id + ')');
      console.log('\n  Now check the inbox at ' + to + ' - including Spam/Promotions.');
      warn('Accepted by the provider is not the same as delivered. If it does not arrive in');
      warn('a few minutes, the usual causes are a domain with no SPF/DKIM record, or a');
      warn('DMARC policy that rejects the message. Resend shows the full reason per send.');
    } else {
      bad('Resend refused the email (HTTP ' + res.status + ')');
      console.log('\n  ' + body.slice(0, 400) + '\n');
    }
  } catch (error) {
    bad('Send failed: ' + error.message);
  }

  console.log('');
}

main().catch(error => {
  console.error('Email check failed to run: ' + error.message);
  process.exit(1);
});
