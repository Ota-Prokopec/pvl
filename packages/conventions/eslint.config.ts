// `@repo/eslint-config` depends on this package, so importing it by name
// would be a workspace dependency cycle; the preset is reached by path.
import { config } from '../eslint-config/src/base.ts';

export default config;
