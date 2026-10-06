export function formatMoney(minorUnits: number, locale: string, currency = 'ILS') {
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) throw new Error('Money must be nonnegative integer minor units.');
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minorUnits / 100);
}
