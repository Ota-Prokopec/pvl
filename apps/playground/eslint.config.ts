import { config } from '@repo/eslint-config/base';

// `.pvl/` is generated output, not source.
export default [{ ignores: ['.pvl'] }, ...config];
