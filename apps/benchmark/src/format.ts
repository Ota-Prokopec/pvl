// What both runners share: a median, and times, bytes and differences
// formatted as their tables print them.

export const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? Number.NaN)
    : ((sorted[middle - 1] ?? Number.NaN) + (sorted[middle] ?? Number.NaN)) / 2;
};

export const formatPercent = (value: number, baseline: number): string => {
  const percent = ((value - baseline) / baseline) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)} %`;
};

export const formatMilliseconds = (milliseconds: number): string =>
  `${milliseconds.toPrecision(4)} ms`;

export const formatBytes = (bytes: number): string =>
  `${Math.round(bytes).toLocaleString('en-US')} B`;
