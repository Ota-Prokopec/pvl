import type { Result } from './result.js';

export type Modifier<Input, Output> = {
  fn: (value: Input, path: ReadonlyArray<PropertyKey>) => Result<Output> | null;
};
