import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../scripts/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const DRAW = String.raw`
window.drawIcon = function(size, maskable) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const margin = maskable ? 0 : size * 0.035;
  const tile = size - margin * 2;
  const radius = tile * 0.22;
  const bg = g.createLinearGradient(margin, margin, size - margin, size - margin);
  bg.addColorStop(0, '#0a2023');
  bg.addColorStop(0.56, '#123b39');
  bg.addColorStop(1, '#173f3b');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(margin, margin, tile, tile, maskable ? 0 : radius);
  g.fill();
  if (!maskable) {
    g.strokeStyle = 'rgba(247,237,218,.16)';
    g.lineWidth = size * 0.007;
    g.beginPath();
    g.roundRect(margin + size * 0.018, margin + size * 0.018, tile - size * 0.036, tile - size * 0.036, radius * 0.88);
    g.stroke();
  }
  const scale = maskable ? 0.82 : 0.91;
  g.save();
  g.translate(size / 2, size / 2);
  g.scale(scale, scale);
  g.translate(-size / 2, -size / 2);
  const glow = g.createRadialGradient(size * 0.52, size * 0.28, 0, size * 0.52, size * 0.28, size * 0.28);
  glow.addColorStop(0, 'rgba(255,214,155,.45)');
  glow.addColorStop(1, 'rgba(255,214,155,0)');
  g.fillStyle = glow;
  g.fillRect(size * 0.18, 0, size * 0.68, size * 0.62);
  g.save();
  g.translate(size * 0.52, size * 0.285);
  g.beginPath();
  const outer = size * 0.125, inner = size * 0.032;
  for (let i = 0; i < 8; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 4;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = '#ffe2ad';
  g.shadowColor = 'rgba(241,193,132,.9)';
  g.shadowBlur = size * 0.055;
  g.fill();
  g.restore();
  const left = [
    [size*.51,size*.46],[size*.41,size*.405],[size*.31,size*.39],[size*.205,size*.42],
    [size*.19,size*.69],[size*.30,size*.72],[size*.41,size*.745],[size*.505,size*.705]
  ];
  const right = [
    [size*.53,size*.46],[size*.63,size*.405],[size*.73,size*.39],[size*.835,size*.42],
    [size*.85,size*.69],[size*.74,size*.72],[size*.63,size*.745],[size*.535,size*.705]
  ];
  g.fillStyle = '#745033';
  g.beginPath(); left.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p)); g.closePath(); g.fill();
  g.beginPath(); right.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p)); g.closePath(); g.fill();
  g.fillStyle = '#f5dfba';
  g.beginPath(); left.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p)); g.closePath(); g.fill();
  g.fillStyle = '#fff0d2';
  g.beginPath(); right.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p)); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(116,80,51,.75)';
  g.lineWidth = size * 0.009;
  g.beginPath(); g.moveTo(size*.52,size*.47); g.lineTo(size*.52,size*.705); g.stroke();
  g.strokeStyle = 'rgba(152,116,76,.32)';
  g.lineWidth = size * 0.007;
  g.beginPath(); g.moveTo(size*.27,size*.52); g.lineTo(size*.44,size*.493); g.stroke();
  g.beginPath(); g.moveTo(size*.77,size*.52); g.lineTo(size*.60,size*.493); g.stroke();
  g.restore();
  return c.toDataURL('image/png');
};
`;
const PAGE = '<!doctype html><meta charset=utf-8><body style="margin:0"><script>' + DRAW + '</script></body>';
const browser = await launch({ viewport: { width: 600, height: 600 }, name: 'progress-icons' });
try {
  await browser.goto('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE), 15000);
  await browser.waitFor('typeof window.drawIcon === "function"', 10000);
  for (const [size, maskable] of [[192,false],[256,false],[512,false],[512,true]]) {
    const data = await browser.evaluate(`window.drawIcon(${size}, ${maskable})`);
    const name = maskable ? `icon-maskable-${size}.png` : `icon-${size}.png`;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(String(data).split(',')[1], 'base64'));
    console.log('generated', name);
  }
  const png = fs.readFileSync(path.join(OUT, 'icon-256.png'));
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0,0); head.writeUInt16LE(1,2); head.writeUInt16LE(1,4);
  head.writeUInt8(0,6); head.writeUInt8(0,7); head.writeUInt8(0,8); head.writeUInt8(0,9);
  head.writeUInt16LE(1,10); head.writeUInt16LE(32,12); head.writeUInt32LE(png.length,14); head.writeUInt32LE(22,18);
  fs.writeFileSync(path.join(OUT, 'icon.ico'), Buffer.concat([head, png]));
  console.log('generated icon.ico');
} finally {
  await browser.close();
}
