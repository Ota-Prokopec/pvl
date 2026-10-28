import { config } from '@repo/eslint-config/base';

// `.pvl/` is generated output, not source.
export default [
  { ignores: ['.pvl'] },
  ...config,
  {
    // `VARIANTS` imports every variant, so it stays out of the `consts.ts`
    // the isolated worker shares, which loads only its own variant; the
    // inputs stay beside the functions that build them.
    files: ['src/index.ts', 'src/inputs.ts'],
    rules: { '@repo/conventions/compound-constant-file': 'off' },
  },
];
