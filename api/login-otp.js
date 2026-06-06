import crypto from 'crypto';
import net from 'net';
import tls from 'tls';

const OTP_TTL_MS = 5 * 60 * 1000;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_EMAIL = process.env.SMTP_EMAIL || process.env.GMAIL_EMAIL || '';
const SMTP_APP_PASSWORD = process.env.SMTP_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || '';
const OTP_FROM_NAME = process.env.OTP_FROM_NAME || 'SucessKart';
const OTP_SECRET = process.env.LOGIN_OTP_SECRET || SMTP_APP_PASSWORD;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const escapeHeader = (value) => String(value || '').replace(/[\r\n"]/g, ' ').trim();

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        req.destroy();
        reject(new Error('Request body is too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });

const smtpCommand = (socket, command, expected) =>
  new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`SMTP timeout while sending ${command || 'initial command'}.`));
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(lastLine)) return;

      const code = Number(lastLine.slice(0, 3));
      const accepted = Array.isArray(expected) ? expected.includes(code) : code === expected;
      cleanup();
      if (!accepted) {
        reject(new Error(`SMTP rejected command: ${lastLine}`));
        return;
      }
      resolve(buffer);
    };

    socket.on('data', onData);
    socket.on('error', onError);
    if (command) socket.write(`${command}\r\n`);
  });

const createSmtpSocket = async () => {
  if (SMTP_PORT === 587) {
    let socket = net.connect({ host: SMTP_HOST, port: SMTP_PORT });
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });

    await smtpCommand(socket, null, 220);
    await smtpCommand(socket, `EHLO ${SMTP_HOST}`, 250);
    await smtpCommand(socket, 'STARTTLS', 220);

    socket = tls.connect({
      socket,
      host: SMTP_HOST,
      servername: SMTP_HOST,
      rejectUnauthorized: true,
    });
    await new Promise((resolve, reject) => {
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
    });
    await smtpCommand(socket, `EHLO ${SMTP_HOST}`, 250);
    return socket;
  }

  const socket = tls.connect({
    host: SMTP_HOST,
    port: SMTP_PORT,
    servername: SMTP_HOST,
    rejectUnauthorized: true,
  });

  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });
  await smtpCommand(socket, null, 220);
  await smtpCommand(socket, `EHLO ${SMTP_HOST}`, 250);
  return socket;
};

const sendSmtpMail = async ({ to, subject, text, html }) => {
  if (!SMTP_EMAIL || !SMTP_APP_PASSWORD) {
    throw new Error('SMTP_EMAIL and SMTP_APP_PASSWORD must be configured.');
  }

  const socket = await createSmtpSocket();

  const fromName = escapeHeader(OTP_FROM_NAME);
  const safeSubject = escapeHeader(subject);
  const boundary = `SucessKart-${crypto.randomBytes(12).toString('hex')}`;
  const encodedUser = Buffer.from(SMTP_EMAIL).toString('base64');
  const encodedPassword = Buffer.from(SMTP_APP_PASSWORD).toString('base64');
  const message = [
    `From: "${fromName}" <${SMTP_EMAIL}>`,
    `To: <${to}>`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  try {
    await smtpCommand(socket, 'AUTH LOGIN', 334);
    await smtpCommand(socket, encodedUser, 334);
    await smtpCommand(socket, encodedPassword, 235);
    await smtpCommand(socket, `MAIL FROM:<${SMTP_EMAIL}>`, 250);
    await smtpCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
    await smtpCommand(socket, 'DATA', 354);
    await smtpCommand(socket, `${message}\r\n.`, 250);
    await smtpCommand(socket, 'QUIT', 221);
  } finally {
    socket.end();
  }
};

const signPayload = (payload) =>
  crypto.createHmac('sha256', OTP_SECRET).update(JSON.stringify(payload)).digest('base64url');

const makeChallenge = ({ email, otp }) => {
  const payload = {
    email: email.toLowerCase(),
    expiresAt: Date.now() + OTP_TTL_MS,
    nonce: crypto.randomBytes(16).toString('hex'),
    otpHash: crypto.createHmac('sha256', OTP_SECRET).update(`${email.toLowerCase()}:${otp}`).digest('base64url'),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${signPayload(payload)}`;
};

const buildOtpEmail = (otp) => {
  const digits = otp.split('');
  const digitHtml = digits
    .map(
      (digit) => `
        <td style="padding:0 4px;">
          <div style="width:44px;height:54px;line-height:54px;text-align:center;border-radius:14px;background:#fff7ed;border:1px solid #fed7aa;color:#0f172a;font-size:26px;font-weight:800;letter-spacing:0;box-shadow:0 10px 24px rgba(245,158,11,0.14);">
            ${digit}
          </div>
        </td>
      `
    )
    .join('');

  const text = [
    `Your ${OTP_FROM_NAME} login OTP is ${otp}.`,
    'It expires in 5 minutes.',
    'If you did not try to login, reset your password.',
  ].join('\n');

  const html = `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <style>
      @media (prefers-reduced-motion: no-preference) {
        .otp-card { animation: SucessKartFadeUp 520ms ease-out both; }
        .otp-badge { animation: SucessKartPulse 1800ms ease-in-out infinite; }
      }
      @keyframes SucessKartFadeUp {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes SucessKartPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16,185,129,0.32); }
        50% { transform: scale(1.04); box-shadow: 0 0 0 10px rgba(16,185,129,0); }
      }
      @media screen and (max-width: 520px) {
        .otp-wrap { padding: 18px !important; }
        .otp-card { border-radius: 22px !important; }
        .otp-title { font-size: 25px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div class="otp-wrap" style="padding:34px 18px;background:linear-gradient(135deg,#f8fafc 0%,#fff7ed 48%,#ecfdf5 100%);">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          <td align="center">
            <table class="otp-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:28px;overflow:hidden;box-shadow:0 28px 70px rgba(15,23,42,0.14);">
              <tr>
                <td style="padding:0;background:linear-gradient(135deg,#0f172a 0%,#1e293b 56%,#b45309 100%);">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                    <tr>
                      <td style="padding:26px 28px;">
                        <div class="otp-badge" style="display:inline-block;border-radius:999px;background:rgba(16,185,129,0.16);border:1px solid rgba(167,243,208,0.35);padding:8px 12px;color:#bbf7d0;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">
                          Secure Login
                        </div>
                        <h1 class="otp-title" style="margin:18px 0 0;color:#ffffff;font-size:32px;line-height:1.15;font-weight:900;letter-spacing:0;">
                          Your ${OTP_FROM_NAME} OTP
                        </h1>
                        <p style="margin:10px 0 0;color:#fde68a;font-size:15px;line-height:1.6;">
                          Use this code to finish signing in.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:30px 28px 10px;">
                  <p style="margin:0;color:#475569;font-size:15px;line-height:1.7;">
                    Enter the 6-digit code below in the login page. This code expires in
                    <strong style="color:#0f172a;">5 minutes</strong>.
                  </p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:20px 18px 24px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                    <tr>${digitHtml}</tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 30px;">
                  <div style="border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;padding:15px 16px;color:#64748b;font-size:13px;line-height:1.6;">
                    If this was not you, ignore this email and reset your password. Never share this OTP with anyone.
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 28px;background:#f1f5f9;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
                  Sent by ${OTP_FROM_NAME}. This is an automated security email.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;

  return { text, html };
};

const parseChallenge = (challenge) => {
  try {
    const [encodedPayload, signature] = String(challenge || '').split('.');
    if (!encodedPayload || !signature) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const expected = signPayload(payload);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length) return null;
    const validSignature = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    return validSignature ? payload : null;
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!OTP_SECRET) {
    json(res, 500, { error: 'LOGIN_OTP_SECRET or SMTP_APP_PASSWORD must be configured.' });
    return;
  }

  try {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      json(res, 400, { error: 'Valid email is required.' });
      return;
    }

    if (body.action === 'send') {
      const otp = String(crypto.randomInt(100000, 1000000));
      const challenge = makeChallenge({ email, otp });
      const emailContent = buildOtpEmail(otp);
      await sendSmtpMail({
        to: email,
        subject: 'Your SucessKart login OTP',
        text: emailContent.text,
        html: emailContent.html,
      });
      json(res, 200, { ok: true, challenge, expiresInSeconds: OTP_TTL_MS / 1000 });
      return;
    }

    if (body.action === 'verify') {
      const otp = String(body.otp || '').replace(/\D/g, '');
      const payload = parseChallenge(body.challenge);
      if (!payload || payload.email !== email || Date.now() > payload.expiresAt || otp.length !== 6) {
        json(res, 400, { error: 'Invalid or expired OTP.' });
        return;
      }

      const otpHash = crypto.createHmac('sha256', OTP_SECRET).update(`${email}:${otp}`).digest('base64url');
      const payloadOtpBuffer = Buffer.from(payload.otpHash || '');
      const submittedOtpBuffer = Buffer.from(otpHash);
      const validOtp =
        payloadOtpBuffer.length === submittedOtpBuffer.length &&
        crypto.timingSafeEqual(payloadOtpBuffer, submittedOtpBuffer);
      if (!validOtp) {
        json(res, 400, { error: 'Invalid OTP.' });
        return;
      }

      json(res, 200, { ok: true });
      return;
    }

    json(res, 400, { error: 'Unknown OTP action.' });
  } catch (error) {
    json(res, 500, { error: error.message || 'OTP request failed.' });
  }
}
