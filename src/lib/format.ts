/** Format integer cents as dollars: 12345 -> "$123.45", 20000 -> "$200". */
export function formatMoney(cents: number, opts: { signed?: boolean } = {}): string {
  const sign = cents < 0 ? '-' : opts.signed && cents > 0 ? '+' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const wholeText = whole.toLocaleString('en-US');
  return `${sign}$${frac === 0 ? wholeText : `${wholeText}.${String(frac).padStart(2, '0')}`}`;
}

/** Parse a dollar string ("12.5", "$1,200") into integer cents, or null. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function formatStakes(smallBlind: number, bigBlind: number): string {
  const f = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
  return `${f(smallBlind)}/${f(bigBlind)}`;
}

export function formatBb(cents: number, bigBlind: number): string {
  const bb = cents / bigBlind;
  return `${Number.isInteger(bb) ? bb : bb.toFixed(1)} bb`;
}
