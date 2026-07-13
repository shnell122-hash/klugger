export function fmtMX(n: number, decimals = 0): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtMoney(n: number): string {
  return '$' + fmtMX(n, 2);
}

export function pct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}
