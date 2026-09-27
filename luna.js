// Fasi lunari calcolate: età della luna dal novilunio di riferimento del 6 gennaio 2000
const SYN = 29.530588853;
const REF = Date.UTC(2000, 0, 6, 18, 14) / 864e5;

export function moonAge(d) {
  const x = (d.getTime() / 864e5 - REF) % SYN;
  return (x + SYN) % SYN;
}

export function phaseName(a) {
  if (a < 1.85 || a >= 27.68) return 'Luna nuova';
  if (a < 7.38) return 'Falce crescente';
  if (a < 9.23) return 'Primo quarto';
  if (a < 14.77) return 'Gibbosa crescente';
  if (a < 16.61) return 'Luna piena';
  if (a < 22.15) return 'Gibbosa calante';
  if (a < 23.99) return 'Ultimo quarto';
  return 'Falce calante';
}

export const waxing = a => a < SYN / 2;

export function moonSvg(a, size) {
  const r = size / 2 - 1.5, cx = size / 2, cy = size / 2, p = a / SYN, w = p < 0.5;
  const c = Math.cos(2 * Math.PI * p), rx = Math.abs(c) * r;
  const s1 = w ? 1 : 0, s2 = c > 0 ? (w ? 0 : 1) : (w ? 1 : 0);
  const lit = `M${cx} ${cy - r} A${r} ${r} 0 0 ${s1} ${cx} ${cy + r} A${rx} ${r} 0 0 ${s2} ${cx} ${cy - r}Z`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--moon-dark)"/><path d="${lit}" fill="var(--moon-lit)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)"/></svg>`;
}

// Giorni del mese in cui cadono le quattro fasi principali
export function monthPhases(y, m) {
  const out = [];
  const days = new Date(y, m, 0).getDate();
  const targets = [[0, 'Luna nuova'], [SYN / 4, 'Primo quarto'], [SYN / 2, 'Luna piena'], [3 * SYN / 4, 'Ultimo quarto']];
  for (let d = 1; d <= days; d++) {
    const a0 = moonAge(new Date(Date.UTC(y, m - 1, d, 12)));
    const a1 = moonAge(new Date(Date.UTC(y, m - 1, d + 1, 12)));
    for (const [t, n] of targets) {
      const crossed = t === 0 ? a1 < a0 : (a0 < t && a1 >= t);
      if (!crossed) continue;
      const dist0 = t === 0 ? SYN - a0 : t - a0;
      const dist1 = t === 0 ? a1 : a1 - t;
      const day = dist0 < dist1 ? d : d + 1;
      if (day <= days) out.push({ day, n, a: t === 0 ? 0.01 : t });
    }
  }
  return out.sort((x, y) => x.day - y.day);
}

export const TRAD = {
  cresc: 'Con la luna crescente la tradizione contadina semina gli ortaggi da frutto e da fiore (pomodori, zucchine, fagioli) e fa gli innesti.',
  cal: 'Con la luna calante la tradizione semina ortaggi da foglia e da radice (insalate, carote), pota, travasa e raccoglie ciò che va conservato.',
};
