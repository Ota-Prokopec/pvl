import { describe, expect, it } from 'vitest';
import { pluralize } from '../src/index.js';

describe('pluralize', () => {
  it('keeps the noun singular for one', () => {
    expect(pluralize(1, 'file')).toBe('1 file');
  });

  it('makes the noun plural for zero', () => {
    expect(pluralize(0, 'error')).toBe('0 errors');
  });

  it('makes the noun plural for more than one', () => {
    expect(pluralize(2, 'warning')).toBe('2 warnings');
  });
});
