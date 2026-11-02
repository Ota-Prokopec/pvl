/**
 * `count` followed by `noun`, plural unless it is one.
 *
 * ```ts
 * pluralize(1, 'file'); // '1 file'
 * pluralize(0, 'error'); // '0 errors'
 * pluralize(2, 'warning'); // '2 warnings'
 * ```
 */
export const pluralize = (count: number, noun: string): string => {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
};
