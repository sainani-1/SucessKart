import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { QRCodeCanvas } from 'qrcode.react';
import { getCertificateDisplayName } from './identityVerification';

export const CERTIFICATE_CANVAS_SIZE = { width: 1600, height: 2200 };
const CERTIFICATE_VERIFY_BASE_URL = import.meta.env.VITE_CERTIFICATE_VERIFY_BASE_URL || 'https://skillingpro.vercel.app';

const LOGO_URL = import.meta.env.VITE_CERTIFICATE_LOGO || '/skillpro-logo.png';
const FOUNDER_SIGNATURE_URL = '/nani-signature-cropped.png';

const loadImage = async (src) => {
  if (!src) return null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
};

const buildQrDataUrl = async (value) => {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  document.body.appendChild(host);

  const root = createRoot(host);
  flushSync(() => {
    root.render(
      React.createElement(QRCodeCanvas, {
        value,
        size: 360,
        level: 'H',
        includeMargin: true,
        bgColor: '#ffffff',
        fgColor: '#050505',
      })
    );
  });

  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  const qrCanvas = host.querySelector('canvas');
  const dataUrl = qrCanvas?.toDataURL('image/png') || '';
  root.unmount();
  host.remove();
  return dataUrl;
};

const resolveCourseTitle = (cert) =>
  cert?.generated?.course_name ||
  cert?.generated?.award_name ||
  cert?.generated_course_name ||
  cert?.generated_name ||
  cert?.course?.title ||
  'General Achievement';

const drawCenteredText = (ctx, text, x, y, maxWidth) => {
  ctx.fillText(String(text || ''), x, y, maxWidth);
};

const drawContainedImage = (ctx, img, x, y, boxWidth, boxHeight) => {
  const ratio = Math.min(boxWidth / img.width, boxHeight / img.height);
  const width = img.width * ratio;
  const height = img.height * ratio;
  ctx.drawImage(img, x + (boxWidth - width) / 2, y + (boxHeight - height) / 2, width, height);
};

const drawCorner = (ctx, x, y, flipX = 1, flipY = 1) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX, flipY);
  ctx.strokeStyle = '#22313a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 54);
  ctx.lineTo(0, 0);
  ctx.lineTo(54, 0);
  ctx.moveTo(16, 70);
  ctx.lineTo(16, 16);
  ctx.lineTo(70, 16);
  ctx.stroke();
  ctx.strokeStyle = '#5f766e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(32, 86);
  ctx.lineTo(32, 32);
  ctx.lineTo(86, 32);
  ctx.stroke();
  ctx.restore();
};

const drawVerifiedSeal = (ctx, x, y) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#8d8f86';
  ctx.fillStyle = 'rgba(128, 128, 120, 0.09)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#747a72';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 60, 0, Math.PI * 2);
  ctx.stroke();

  ctx.rotate(-0.18);
  ctx.fillStyle = '#7b817b';
  ctx.strokeStyle = '#5d635d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-98, -24);
  ctx.lineTo(82, -42);
  ctx.lineTo(100, 18);
  ctx.lineTo(-82, 36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f7f1df';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VERIFIED', 0, -5);
  ctx.restore();
};

export const buildCertificateDataUrl = async (cert, formattedId, options = {}) => {
  const canvas = document.createElement('canvas');
  canvas.width = CERTIFICATE_CANVAS_SIZE.width * 2;
  canvas.height = CERTIFICATE_CANVAS_SIZE.height * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const width = CERTIFICATE_CANVAS_SIZE.width;
  const height = CERTIFICATE_CANVAS_SIZE.height;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#fbf2d7');
  gradient.addColorStop(0.45, '#f6e9c4');
  gradient.addColorStop(1, '#f2dfb2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#b89454';
  for (let i = 0; i < 260; i += 1) {
    const x = (i * 137) % width;
    const y = (i * 89) % height;
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#22313a';
  ctx.lineWidth = 8;
  ctx.strokeRect(50, 50, 1500, 2100);
  ctx.strokeStyle = '#5f766e';
  ctx.lineWidth = 4;
  ctx.strokeRect(72, 72, 1456, 2056);
  ctx.strokeStyle = '#22313a';
  ctx.lineWidth = 3;
  ctx.strokeRect(88, 88, 1424, 2024);
  drawCorner(ctx, 56, 56);
  drawCorner(ctx, 1544, 56, -1, 1);
  drawCorner(ctx, 56, 2144, 1, -1);
  drawCorner(ctx, 1544, 2144, -1, -1);

  const watermark = await loadImage(LOGO_URL);
  if (watermark) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    drawContainedImage(ctx, watermark, 430, 840, 740, 760);
    ctx.restore();
  }

  const logoImg = await loadImage(LOGO_URL);
  if (logoImg) {
    drawContainedImage(ctx, logoImg, 565, 130, 470, 280);
  } else {
    ctx.fillStyle = '#1f4c63';
    ctx.font = 'bold 82px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SkillPro', 800, 270);
    ctx.fillStyle = '#334155';
    ctx.font = '24px Arial';
    ctx.fillText('GLOBAL EDUCATION PLATFORM', 800, 315);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#101820';
  ctx.font = 'italic 118px "Times New Roman", Georgia, serif';
  ctx.fillText('Certificate', 800, 620);
  ctx.font = 'bold 56px Georgia, serif';
  ctx.fillText('OF ACHIEVEMENT', 800, 700);

  ctx.font = '42px Arial';
  ctx.fillText('This is to certify that', 800, 820);

  const displayName = options.displayName || getCertificateDisplayName(cert?.user || options.profile, { placeholder: 'Nani' });
  ctx.fillStyle = '#050505';
  ctx.font = 'bold italic 72px "Comic Sans MS", "Segoe Print", Arial';
  drawCenteredText(ctx, displayName, 800, 930, 980);

  ctx.font = '38px Arial';
  ctx.fillText('has successfully completed the course in', 800, 1050);

  ctx.font = 'bold 58px Arial';
  drawCenteredText(ctx, resolveCourseTitle(cert).toUpperCase(), 800, 1170, 1120);

  const completionDate = cert?.issued_at
    ? new Date(cert.issued_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.font = '40px Arial';
  ctx.fillText(`Date of Completion: ${completionDate}`, 800, 1310);

  const signatureImg = await loadImage(FOUNDER_SIGNATURE_URL);
  if (signatureImg) {
    drawContainedImage(ctx, signatureImg, 190, 1530, 410, 175);
  } else {
    ctx.font = 'italic 58px Georgia, serif';
    ctx.fillText('Sai Nani', 400, 1650);
  }
  ctx.strokeStyle = '#101820';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(170, 1710);
  ctx.lineTo(620, 1710);
  ctx.stroke();
  ctx.fillStyle = '#101820';
  ctx.font = '38px Arial';
  ctx.fillText('Founder and CEO', 395, 1780);
  ctx.font = 'bold italic 38px Arial';
  ctx.fillText('Nani', 395, 1870);
  ctx.font = '34px Arial';
  ctx.fillText('Issued by SkillPro', 310, 2045);

  drawVerifiedSeal(ctx, 1125, 1740);

  const verifyUrl = `${CERTIFICATE_VERIFY_BASE_URL.replace(/\/$/, '')}/verify/${encodeURIComponent(formattedId)}`;
  const qrDataUrl = await buildQrDataUrl(verifyUrl);
  const qrImg = await loadImage(qrDataUrl);
  if (qrImg) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(1330, 1850, 120, 120);
    ctx.drawImage(qrImg, 1334, 1854, 112, 112);
  }

  ctx.fillStyle = '#101820';
  ctx.textAlign = 'left';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(`CERT ID: ${formattedId}`, 1030, 2015, 280);

  return canvas.toDataURL('image/png');
};
