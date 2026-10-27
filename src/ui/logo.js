const DRIPS = [
  [192, 6, 30], [214, 4, 14], [240, 7, 48], [268, 5, 22], [300, 8, 62], [328, 4, 18], [354, 6, 36], [386, 9, 70], [414, 5, 26], [440, 6, 40],
];

function drip(x, w, h) {
  const top = 70;
  const b = top + h;
  const r = w * 0.62;
  return `<path d="M${x - w} ${top} C${x - w * 0.55} ${top + h * 0.35} ${x - w * 0.42} ${b - r * 2.2} ${x - r} ${b - r} A${r} ${r} 0 1 0 ${x + r} ${b - r} C${x + w * 0.42} ${b - r * 2.2} ${x + w * 0.55} ${top + h * 0.35} ${x + w} ${top}Z"/>`
    + `<ellipse cx="${x - r * 0.35}" cy="${b - r * 1.2}" rx="${r * 0.22}" ry="${r * 0.4}" fill="#ff8a8a" opacity="0.45"/>`;
}

let count = 0;

export function logo() {
  const id = `lg${count++}`;
  const drips = DRIPS.map(([x, w, h]) => drip(x, w, h)).join('');
  const spray = [[178, 116, 2.2], [460, 96, 3.4], [474, 84, 2], [487, 104, 1.6], [172, 98, 1.4], [428, 126, 2.4], [282, 140, 1.8], [366, 150, 2.6]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  return `<svg class="logo-svg" viewBox="0 0 500 160" role="img" aria-label="NoBlank">
  <defs>
    <linearGradient id="${id}Blood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e3192b"/><stop offset="0.5" stop-color="#a10b18"/><stop offset="1" stop-color="#4e030a"/>
    </linearGradient>
    <linearGradient id="${id}Drip" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8f0914"/><stop offset="0.7" stop-color="#b30f1d"/><stop offset="1" stop-color="#6a050e"/>
    </linearGradient>
    <linearGradient id="${id}Steel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#e2e6ec"/><stop offset="0.52" stop-color="#b9c2ce"/><stop offset="1" stop-color="#8a95a4"/>
    </linearGradient>
    <filter id="${id}Shadow" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000" flood-opacity="0.6"/></filter>
    <filter id="${id}Wet"><feSpecularLighting in="SourceAlpha" surfaceScale="3" specularConstant="0.9" specularExponent="22" lighting-color="#ff9a9a" result="s"><fePointLight x="250" y="-60" z="140"/></feSpecularLighting><feComposite in="s" in2="SourceAlpha" operator="in" result="h"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="h"/></feMerge></filter>
  </defs>
  <g filter="url(#${id}Shadow)">
    <g fill="url(#${id}Drip)" filter="url(#${id}Wet)">${drips}${spray}</g>
    <text x="4" y="84" font-family="'Exo 2', system-ui, sans-serif" font-weight="900" font-style="italic" font-size="90" letter-spacing="-2" fill="url(#${id}Steel)" stroke="#2a2f36" stroke-width="1.5" paint-order="stroke">NO</text>
    <text x="160" y="84" font-family="'Exo 2', system-ui, sans-serif" font-weight="900" font-style="italic" font-size="90" letter-spacing="-2" fill="url(#${id}Blood)" filter="url(#${id}Wet)">BLANK</text>
    <g transform="translate(118 52)" fill="none" stroke="#e3192b" stroke-width="3.5" stroke-linecap="round">
      <circle r="15"/><path d="M0 -25v10M0 15v10M-25 0h10M15 0h10"/>
    </g>
    <circle cx="118" cy="52" r="2.6" fill="#e3192b"/>
  </g>
</svg>`;
}

export const FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#120608"/><path d="M8 7h4l8 12V7h4v18h-4l-8-12v12H8z" fill="#e3192b"/><path d="M14 25h3v3.5a1.5 1.5 0 0 1-3 0z" fill="#a10b18"/></svg>');
