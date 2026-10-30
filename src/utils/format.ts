const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export const numberFormat = new Intl.NumberFormat();

export function formatBytes(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${UNITS[unit]}`;
}
