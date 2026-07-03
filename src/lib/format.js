const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** '2026-07-22' -> '22 июл' */
export function fmtDate(iso) {
  if (!iso) return '—';
  return `${+iso.slice(8, 10)} ${MONTHS_RU[+iso.slice(5, 7) - 1]}`;
}

/** '2026-07-22'..'2026-07-26' -> '22–26 июл' | '25 фев – 1 мар' */
export function fmtRange(startISO, endISO) {
  if (!startISO) return '—';
  if (!endISO || endISO === startISO) return fmtDate(startISO);
  if (startISO.slice(0, 7) === endISO.slice(0, 7)) {
    return `${+startISO.slice(8, 10)}–${fmtDate(endISO)}`;
  }
  return `${fmtDate(startISO)} – ${fmtDate(endISO)}`;
}

/** {amount: 15000, currency: 'EUR'} -> '€15 000' */
export function fmtPrize(prizePool, prizeRaw) {
  if (!prizePool) return prizeRaw ?? '—';
  const sym = { EUR: '€', USD: '$', GBP: '£' }[prizePool.currency] ?? '';
  const num = prizePool.amount.toLocaleString('ru-RU').replace(/,/g, ' ');
  return `${sym}${num}`;
}

/** '2026-07-02T09:14:00.000Z' -> '02.07 12:14' (локальное время не гарантируем — показываем UTC с пометкой в title) */
export function fmtTimestamp(iso) {
  if (!iso) return '—';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)} UTC`;
}

export function fmtDateFull(iso) {
  if (!iso) return '—';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}
