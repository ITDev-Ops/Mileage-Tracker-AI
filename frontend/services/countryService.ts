export function getCurrencySymbol(country: string = 'US'): string {
  const c = (country || 'US').toUpperCase();
  if (c === 'GB') return '£';
  return '$';
}

export function getDistanceUnitAbbr(country: string = 'US'): string {
  const c = (country || 'US').toUpperCase();
  if (c === 'CAN' || c === 'AUS') return 'km';
  return 'mi';
}

export function getDistanceUnitFull(country: string = 'US'): string {
  const c = (country || 'US').toUpperCase();
  if (c === 'CAN' || c === 'AUS') return 'kilometres';
  return 'miles';
}
