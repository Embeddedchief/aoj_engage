// Renders the occasion header artwork used in emails (public/email/art/*.jpg).
// Text-free on purpose: titles stay editable in the template.  Run: node scripts/email-art.mjs
// Requires playwright-core and a local Chrome (dev-only tool; not used at runtime).
import fs from "node:fs";
import path from "node:path";

const W = 1200, H = 440;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const confetti = (n, colors, area = [0, 0, W, H]) =>
  Array.from({ length: n }, () => {
    const x = area[0] + rnd() * area[2], y = area[1] + rnd() * area[3], c = pick(colors), r = rnd() * 360, s = 6 + rnd() * 10;
    return rnd() > 0.5
      ? `<rect x="${x}" y="${y}" width="${s}" height="${s * 0.45}" rx="2" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`
      : `<circle cx="${x}" cy="${y}" r="${s * 0.32}" fill="${c}"/>`;
  }).join("");
const stars = (n, color, area = [0, 0, W, H], max = 3) => Array.from({ length: n }, () => `<circle cx="${area[0] + rnd() * area[2]}" cy="${area[1] + rnd() * area[3]}" r="${0.6 + rnd() * max}" fill="${color}" opacity="${0.4 + rnd() * 0.6}"/>`).join("");
const sparkle = (x, y, s, c) => `<path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z" fill="${c}"/>`;
const bg = (a, b, angle = 135) => `<defs><linearGradient id="bg" gradientTransform="rotate(${angle - 90} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>`;
const balloon = (x, y, r, c) => `<path d="M${x} ${y + r * 1.15} q -12 40 6 80 t -4 90" stroke="#15171E" stroke-opacity=".35" stroke-width="2" fill="none"/><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.18}" fill="${c}"/><ellipse cx="${x - r * 0.35}" cy="${y - r * 0.45}" rx="${r * 0.18}" ry="${r * 0.3}" fill="#fff" opacity=".45" transform="rotate(-20 ${x} ${y})"/><path d="M${x - 7} ${y + r * 1.2} l7 -10 l7 10z" fill="${c}"/>`;
const burst = (x, y, r, c, n = 16) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return `<line x1="${x + Math.cos(a) * r * 0.25}" y1="${y + Math.sin(a) * r * 0.25}" x2="${x + Math.cos(a) * r}" y2="${y + Math.sin(a) * r}" stroke="${c}" stroke-width="4" stroke-linecap="round"/><circle cx="${x + Math.cos(a) * r * 1.12}" cy="${y + Math.sin(a) * r * 1.12}" r="3.5" fill="${c}"/>`; }).join("");
const tree = (x, y, s, c) => `<polygon points="${x},${y - s * 1.6} ${x - s * 0.7},${y - s * 0.6} ${x + s * 0.7},${y - s * 0.6}" fill="${c}"/><polygon points="${x},${y - s * 1.15} ${x - s * 0.9},${y} ${x + s * 0.9},${y}" fill="${c}"/><rect x="${x - s * 0.12}" y="${y}" width="${s * 0.24}" height="${s * 0.3}" fill="#5B3A1E"/>`;
const gear = (x, y, r, c, teeth = 10) => { let d = ""; for (let i = 0; i < teeth * 2; i++) { const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r : r * 1.22; d += `${i ? "L" : "M"}${x + Math.cos(a) * rr} ${y + Math.sin(a) * rr}`; } return `<path d="${d}Z" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="none" stroke="#fff" stroke-opacity=".0"/><circle cx="${x}" cy="${y}" r="${r * 0.35}" fill="#0E3A66"/>`; };
const heart = (x, y, s, c, o = 1) => `<path d="M${x} ${y + s * 0.9} C ${x - s * 1.6} ${y - s * 0.2}, ${x - s * 0.6} ${y - s * 1.3}, ${x} ${y - s * 0.4} C ${x + s * 0.6} ${y - s * 1.3}, ${x + s * 1.6} ${y - s * 0.2}, ${x} ${y + s * 0.9}Z" fill="${c}" opacity="${o}"/>`;
const lantern = (x, y, s, c) => `<line x1="${x}" y1="0" x2="${x}" y2="${y - s}" stroke="#F5C451" stroke-width="2"/><rect x="${x - s * 0.5}" y="${y - s}" width="${s}" height="${s * 1.6}" rx="${s * 0.3}" fill="${c}"/><rect x="${x - s * 0.3}" y="${y - s * 0.7}" width="${s * 0.6}" height="${s}" rx="${s * 0.2}" fill="#FFE8A3" opacity=".9"/><rect x="${x - s * 0.6}" y="${y - s * 1.1}" width="${s * 1.2}" height="${s * 0.2}" rx="4" fill="#F5C451"/><rect x="${x - s * 0.6}" y="${y + s * 0.55}" width="${s * 1.2}" height="${s * 0.2}" rx="4" fill="#F5C451"/>`;
const calendarPage = (x, y, w, h, r, head) => `<g transform="rotate(${r} ${x + w / 2} ${y + h / 2})"><rect x="${x + 6}" y="${y + 10}" width="${w}" height="${h}" rx="22" fill="#15171E" opacity=".12"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#fff"/><path d="M${x} ${y + 22} a22 22 0 0 1 22 -22 h${w - 44} a22 22 0 0 1 22 22 v${h * 0.12} h-${w}z" fill="${head}"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${x + 22 + (i % 4) * ((w - 44) / 4)}" y="${y + h * 0.36 + Math.floor(i / 4) * (h * 0.18)}" width="${(w - 44) / 4 - 12}" height="${h * 0.11}" rx="6" fill="${i === 5 ? head : "#EFEFEC"}"/>`).join("")}<circle cx="${x + w * 0.3}" cy="${y + 8}" r="8" fill="#15171E"/><circle cx="${x + w * 0.7}" cy="${y + 8}" r="8" fill="#15171E"/></g>`;

const S = {
  birthday: () => bg("#FFE9E5", "#FFC9BF") + confetti(90, ["#E5120E", "#15171E", "#F5B700", "#FF8A80", "#fff"]) +
    balloon(830, 150, 62, "#E5120E") + balloon(950, 120, 54, "#F5B700") + balloon(1060, 175, 58, "#15171E") + balloon(720, 200, 44, "#FF8A80") + balloon(160, 160, 50, "#E5120E") + balloon(260, 120, 40, "#F5B700") +
    `<path d="M0 30 Q 150 110 300 40 T 600 60 T 900 30 T 1200 70" stroke="#E5120E" stroke-width="4" fill="none" stroke-dasharray="2 12" stroke-linecap="round"/>`,
  christmas: () => bg("#0E4D2F", "#0A3321", 160) + stars(140, "#fff", [0, 0, W, H], 2.6) +
    `<path d="M0 360 Q 300 320 600 360 T 1200 350 V440 H0Z" fill="#fff" opacity=".92"/>` + tree(170, 370, 110, "#1F7A4C") + tree(300, 380, 80, "#2E9461") + tree(1000, 372, 120, "#1F7A4C") + tree(1110, 385, 75, "#2E9461") +
    [[240, 40, "#E5120E"], [380, 70, "#F5C451"], [820, 55, "#E5120E"], [930, 85, "#F5C451"], [660, 35, "#fff"]].map(([x, l, c]) => `<line x1="${x}" y1="0" x2="${x}" y2="${l}" stroke="#F5C451" stroke-width="2"/><circle cx="${x}" cy="${l + 18}" r="18" fill="${c}"/><circle cx="${x - 6}" cy="${l + 12}" r="5" fill="#fff" opacity=".5"/>`).join("") +
    sparkle(1000, 150, 22, "#F5C451") + sparkle(170, 150, 18, "#F5C451"),
  "new-year": () => bg("#0B1026", "#202A5C", 170) + stars(160, "#fff", [0, 0, W, H], 2) + burst(260, 150, 90, "#F5C451", 18) + burst(600, 110, 70, "#E5120E", 16) + burst(940, 170, 100, "#fff", 20) + burst(1100, 70, 45, "#F5C451", 12) + burst(120, 330, 40, "#E5120E", 12) +
    confetti(40, ["#F5C451", "#fff", "#E5120E"], [0, 260, W, 180]),
  eid: () => bg("#064E3B", "#0A6B50", 160) + stars(110, "#FFE8A3", [0, 0, W, H], 2.4) +
    `<circle cx="930" cy="150" r="88" fill="#F5C451"/><circle cx="968" cy="128" r="80" fill="#0A6046"/>` + sparkle(1040, 210, 20, "#F5C451") +
    lantern(180, 150, 46, "#E5120E") + lantern(300, 110, 36, "#F5C451") + lantern(420, 170, 40, "#0E3A66") +
    `<path d="M0 440 V370 H120 V330 a60 60 0 0 1 120 0 V370 H330 V300 a90 90 0 0 1 180 0 V370 H600 V340 a45 45 0 0 1 90 0 V370 H1200 V440Z" fill="#04392B"/><rect x="540" y="230" width="18" height="140" fill="#04392B"/><circle cx="549" cy="222" r="12" fill="#04392B"/>`,
  easter: () => bg("#FFF7E6", "#FDE2C2") + Array.from({ length: 16 }, (_, i) => { const a = Math.PI + (i / 15) * Math.PI; return `<line x1="600" y1="430" x2="${600 + Math.cos(a) * 700}" y2="${430 + Math.sin(a) * 700}" stroke="#F5B700" stroke-opacity=".18" stroke-width="26"/>`; }).join("") +
    `<circle cx="600" cy="440" r="150" fill="#F5B700" opacity=".85"/><rect x="590" y="190" width="20" height="170" rx="6" fill="#fff"/><rect x="545" y="235" width="110" height="20" rx="6" fill="#fff"/>` +
    [[180, 380, "#E5120E"], [270, 395, "#7CC4A4"], [930, 385, "#B39DDB"], [1030, 395, "#F5B700"], [370, 400, "#FF8A80"]].map(([x, y, c]) => `<ellipse cx="${x}" cy="${y}" rx="34" ry="44" fill="${c}"/><path d="M${x - 32} ${y} q16 -12 32 0 t32 0" stroke="#fff" stroke-width="5" fill="none"/>`).join("") + confetti(30, ["#F5B700", "#7CC4A4", "#FF8A80"], [0, 0, W, 200]),
  nigeria: () => `<rect width="${W}" height="${H}" fill="#fff"/><rect width="400" height="${H}" fill="#008751"/><rect x="800" width="400" height="${H}" fill="#008751"/>` +
    `<path d="M0 300 Q 300 240 600 300 T 1200 290 V440 H0Z" fill="#00703F" opacity=".9"/><path d="M0 340 Q 300 290 600 345 T 1200 330 V440 H0Z" fill="#fff" opacity=".85"/>` + confetti(60, ["#008751", "#00A65A", "#fff", "#F5C451"]) + sparkle(600, 150, 46, "#008751"),
  engineering: () => `<rect width="${W}" height="${H}" fill="#0E3A66"/>` + Array.from({ length: 31 }, (_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40}" y2="${H}" stroke="#fff" stroke-opacity="${i % 5 ? 0.06 : 0.14}"/>`).join("") + Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${i * 40}" x2="${W}" y2="${i * 40}" stroke="#fff" stroke-opacity="${i % 5 ? 0.06 : 0.14}"/>`).join("") +
    gear(900, 170, 90, "#E5120E", 12) + gear(1040, 300, 60, "#F5C451", 10) + gear(780, 320, 46, "#fff", 8) +
    `<path d="M80 330 H300 V180 H460" stroke="#7FB2E5" stroke-width="22" fill="none" stroke-linejoin="round"/><circle cx="300" cy="330" r="18" fill="#F5C451"/><circle cx="300" cy="180" r="18" fill="#F5C451"/><path d="M560 60 l-50 110 h40 l-30 100 l90 -130 h-45 l35 -80z" fill="#F5C451"/>`,
  women: () => bg("#F5E8FF", "#FCE4EF") + Array.from({ length: 9 }, () => { const x = rnd() * W, y = 60 + rnd() * 320, r = 18 + rnd() * 26, c = pick(["#8E44AD", "#C2185B", "#E5120E", "#B39DDB"]); return Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return `<ellipse cx="${x + Math.cos(a) * r}" cy="${y + Math.sin(a) * r}" rx="${r * 0.7}" ry="${r * 0.42}" fill="${c}" opacity=".8" transform="rotate(${(a * 180) / Math.PI} ${x + Math.cos(a) * r} ${y + Math.sin(a) * r})"/>`; }).join("") + `<circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="#F5C451"/>`; }).join("") + confetti(30, ["#8E44AD", "#F5C451"]),
  "new-week": () => bg("#FFF1E3", "#FFD3B5", 180) + `<circle cx="820" cy="300" r="140" fill="#E5120E"/><circle cx="820" cy="300" r="190" fill="#E5120E" opacity=".14"/><circle cx="820" cy="300" r="250" fill="#E5120E" opacity=".07"/>` +
    `<path d="M0 330 Q 250 250 520 320 T 1200 290 V440 H0Z" fill="#262833"/><path d="M0 380 Q 300 320 640 380 T 1200 360 V440 H0Z" fill="#15171E"/>` +
    [[260, 120], [310, 150], [360, 110]].map(([x, y]) => `<path d="M${x} ${y} q12 -12 24 0 q12 -12 24 0" stroke="#15171E" stroke-width="4" fill="none" stroke-linecap="round"/>`).join(""),
  "new-month": () => bg("#FFF2F1", "#FFE0DD") + calendarPage(700, 80, 260, 300, 8, "#15171E") + calendarPage(560, 70, 260, 300, -6, "#E5120E") + confetti(70, ["#E5120E", "#15171E", "#F5B700"], [0, 0, 520, H]) + confetti(30, ["#E5120E", "#F5B700"], [980, 0, 220, H]),
  anniversary: () => bg("#15171E", "#2A2C38") + stars(80, "#F5C451", [0, 0, W, H], 2) +
    `<circle cx="600" cy="220" r="120" fill="none" stroke="#F5C451" stroke-width="14"/><circle cx="600" cy="220" r="92" fill="#E5120E"/>` +
    Array.from({ length: 9 }, (_, i) => { const a = Math.PI * 0.95 - (i / 8) * Math.PI * 0.6; return `<ellipse cx="${600 + Math.cos(a) * 170}" cy="${220 + Math.sin(a) * 170}" rx="26" ry="12" fill="#F5C451" transform="rotate(${(a * 180) / Math.PI + 90} ${600 + Math.cos(a) * 170} ${220 + Math.sin(a) * 170})"/><ellipse cx="${600 - Math.cos(a) * 170}" cy="${220 + Math.sin(a) * 170}" rx="26" ry="12" fill="#F5C451" transform="rotate(${-(a * 180) / Math.PI - 90} ${600 - Math.cos(a) * 170} ${220 + Math.sin(a) * 170})"/>`; }).join("") +
    sparkle(600, 220, 46, "#fff") + sparkle(300, 110, 20, "#F5C451") + sparkle(900, 320, 24, "#F5C451"),
  thanks: () => bg("#FFF2F1", "#FFD9D3") + heart(600, 230, 110, "#E5120E") + heart(380, 180, 46, "#FF8A80", 0.9) + heart(830, 170, 56, "#15171E", 0.9) + heart(220, 320, 30, "#E5120E", 0.6) + heart(1000, 320, 36, "#E5120E", 0.6) + sparkle(470, 90, 18, "#F5B700") + sparkle(760, 340, 22, "#F5B700") + confetti(40, ["#E5120E", "#F5B700", "#fff"]),
  recognition: () => bg("#15171E", "#262833") + stars(70, "#fff", [0, 0, W, H], 1.8) +
    `<path d="M520 90 H680 V170 a80 80 0 0 1 -160 0Z" fill="#F5C451"/><path d="M520 110 h-50 a40 40 0 0 0 50 70" stroke="#F5C451" stroke-width="14" fill="none"/><path d="M680 110 h50 a40 40 0 0 1 -50 70" stroke="#F5C451" stroke-width="14" fill="none"/><rect x="585" y="245" width="30" height="50" fill="#F5C451"/><rect x="540" y="295" width="120" height="26" rx="6" fill="#E5120E"/><rect x="520" y="321" width="160" height="30" rx="8" fill="#F5C451"/>` +
    sparkle(600, 150, 26, "#fff") + confetti(50, ["#F5C451", "#E5120E", "#fff"]),
  welcome: () => bg("#E5120E", "#9C0C09", 160) + Array.from({ length: 14 }, (_, i) => { const w = 50 + rnd() * 50, h = 90 + rnd() * 220, x = i * 90 - 20; return `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" fill="#fff" opacity="${0.08 + rnd() * 0.1}"/>${Array.from({ length: Math.floor(h / 30) }, (_, j) => `<rect x="${x + 10}" y="${H - h + 12 + j * 30}" width="${w - 20}" height="8" fill="#fff" opacity=".12"/>`).join("")}`; }).join("") +
    `<line x1="980" y1="440" x2="980" y2="70" stroke="#fff" stroke-width="10" opacity=".75"/><line x1="860" y1="80" x2="1150" y2="80" stroke="#fff" stroke-width="10" opacity=".75"/><line x1="1110" y1="80" x2="1110" y2="170" stroke="#fff" stroke-width="3" opacity=".75"/><rect x="1090" y="170" width="40" height="28" fill="#fff" opacity=".75"/>`,
  announcement: () => bg("#15171E", "#2B2D3A") + `<path d="M420 170 L720 70 V370 L420 270Z" fill="#E5120E"/><rect x="330" y="165" width="100" height="110" rx="14" fill="#fff"/><path d="M370 275 l26 90 h44 l-20 -90z" fill="#fff" opacity=".85"/>` +
    [90, 150, 210].map((r, i) => `<path d="M${770} ${220 - r} a${r} ${r} 0 0 1 0 ${r * 2}" stroke="#E5120E" stroke-opacity="${0.8 - i * 0.22}" stroke-width="14" fill="none" stroke-linecap="round"/>`).join("") + stars(60, "#fff", [0, 0, W, H], 1.6),
  urgent: () => `<rect width="${W}" height="${H}" fill="#E5120E"/>` + Array.from({ length: 24 }, (_, i) => `<polygon points="${i * 60 - 200},${H} ${i * 60 - 170},${H} ${i * 60 - 60},${H - 70} ${i * 60 - 90},${H - 70}" fill="#15171E"/>`).join("") + `<rect y="${H - 70}" width="${W}" height="4" fill="#15171E"/>` +
    `<path d="M600 60 L760 330 H440Z" fill="#fff" stroke="#fff" stroke-width="24" stroke-linejoin="round"/><rect x="588" y="140" width="24" height="110" rx="10" fill="#E5120E"/><circle cx="600" cy="290" r="15" fill="#E5120E"/>` +
    [140, 200].map((r, i) => `<circle cx="600" cy="220" r="${r + 60}" fill="none" stroke="#fff" stroke-opacity="${0.25 - i * 0.1}" stroke-width="10"/>`).join(""),
  meeting: () => bg("#EFEFEC", "#E2E2DC") + calendarPage(330, 80, 280, 290, -5, "#E5120E") +
    `<circle cx="830" cy="225" r="140" fill="#15171E"/><circle cx="830" cy="225" r="118" fill="#fff"/>${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<circle cx="${830 + Math.cos(a) * 98}" cy="${225 + Math.sin(a) * 98}" r="6" fill="#15171E"/>`; }).join("")}<line x1="830" y1="225" x2="830" y2="150" stroke="#15171E" stroke-width="12" stroke-linecap="round"/><line x1="830" y1="225" x2="885" y2="255" stroke="#E5120E" stroke-width="10" stroke-linecap="round"/><circle cx="830" cy="225" r="12" fill="#E5120E"/>`,
  services: () => bg("#15171E", "#262833") + Array.from({ length: 31 }, (_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40}" y2="${H}" stroke="#fff" stroke-opacity=".04"/>`).join("") +
    // lightbulb (electrical)
    `<circle cx="260" cy="190" r="80" fill="#F5C451"/><rect x="225" y="262" width="70" height="40" rx="10" fill="#fff"/><rect x="235" y="306" width="50" height="14" rx="6" fill="#fff" opacity=".8"/><path d="M240 200 l20 -30 l20 30" stroke="#15171E" stroke-width="7" fill="none"/>` +
    // pipes (plumbing)
    `<path d="M470 360 V220 a40 40 0 0 1 40 -40 H640 a40 40 0 0 0 40 -40 V80" stroke="#7FB2E5" stroke-width="34" fill="none"/><rect x="440" y="350" width="60" height="28" rx="6" fill="#fff"/><rect x="650" y="64" width="60" height="28" rx="6" fill="#fff"/><circle cx="560" cy="180" r="26" fill="#E5120E"/><rect x="550" y="140" width="20" height="40" fill="#E5120E"/>` +
    // fan / HVAC (mechanical)
    `<circle cx="940" cy="210" r="120" fill="none" stroke="#fff" stroke-width="14"/>${[0, 120, 240].map((r) => `<path d="M940 210 C 930 150, 990 120, 1000 170 Z" fill="#E5120E" transform="rotate(${r} 940 210)"/>`).join("")}<circle cx="940" cy="210" r="16" fill="#fff"/>`,
  project: () => bg("#FFF7ED", "#FFE4C7") + `<path d="M0 360 H1200 V440 H0Z" fill="#15171E"/>` +
    Array.from({ length: 6 }, (_, i) => { const x = 140 + i * 120, h = 120 + ((i * 53) % 140); return `<rect x="${x}" y="${360 - h}" width="96" height="${h}" fill="${i % 2 ? "#262833" : "#3A3D4B"}"/>${Array.from({ length: Math.floor(h / 34) }, (_, j) => `<rect x="${x + 14}" y="${360 - h + 14 + j * 34}" width="68" height="14" fill="#F5C451" opacity=".55"/>`).join("")}`; }).join("") +
    `<line x1="980" y1="360" x2="980" y2="60" stroke="#E5120E" stroke-width="14"/><line x1="800" y1="70" x2="1160" y2="70" stroke="#E5120E" stroke-width="14"/><line x1="860" y1="70" x2="860" y2="180" stroke="#15171E" stroke-width="3"/><rect x="842" y="180" width="36" height="26" fill="#F5C451"/><path d="M980 60 L1010 70 L980 80Z" fill="#E5120E"/>` +
    `<line x1="1110" y1="360" x2="1110" y2="200" stroke="#15171E" stroke-width="6"/><path d="M1110 200 h60 l-14 22 l14 22 h-60z" fill="#E5120E"/>`,
};

const out = process.argv[2] ?? "public/email/art";
fs.mkdirSync(out, { recursive: true });
const { chromium } = await import(process.env.PW_PATH ?? "playwright-core");
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await b.newPage({ viewport: { width: W, height: H } });
for (const [name, fn] of Object.entries(S)) {
  seed = 7 + name.length * 13;
  await p.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${fn()}</svg></body></html>`);
  await p.screenshot({ path: path.join(out, `${name}.jpg`), type: "jpeg", quality: 82, clip: { x: 0, y: 0, width: W, height: H } });
}
console.log("rendered", Object.keys(S).length, "artworks →", out);
await b.close();
