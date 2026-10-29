// What `TsMorphProject.create` returns.
import type { Project } from 'ts-morph';
import type { Diagnostic } from '../diagnostics/diagnostic.js';

/** The project the mirror reads into, or why the application's tsconfig stops it from being built. */
export type CreateTsMorphProjectPayload =
  | { tsMorphProject: Project; diagnostics: [] }
  | { tsMorphProject: undefined; diagnostics: [Diagnostic] };
