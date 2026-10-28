// The helpers that respell a file path: with `/` separators, and split from
// its extension.
import * as path from 'node:path';
import { DECLARATION_FILE_SUFFIXES } from './consts.js';
import type { SplitFileExtensionPayload } from './types.js';

/**
 * `filePath` with the platform's separators replaced by `/`, so the mirror
 * and the diagnostics read the same on Windows as elsewhere.
 *
 * ```ts
 * toPosixPath('src\\schemas\\user.ts') // 'src/schemas/user.ts' on Windows
 * toPosixPath('src/schemas/user.ts')   // unchanged on macOS and Linux
 * ```
 */
export const toPosixPath = (filePath: string): string => {
  return filePath.split(path.sep).join(path.posix.sep);
};

/**
 * `filePath` without its extension, a declaration file's whole `.d.ts`
 * included, and the extension of the file a `.d.<ext>.ts` declares, which
 * TypeScript resolves only from a module specifier spelling it.
 *
 * ```ts
 * splitFileExtension('/repo/src/lib/helpers.ts') // { extensionlessPath: '/repo/src/lib/helpers', declaredExtension: undefined }
 * splitFileExtension('/repo/src/lib/types.d.ts') // { extensionlessPath: '/repo/src/lib/types', declaredExtension: undefined }
 * splitFileExtension('/repo/src/data.json')      // { extensionlessPath: '/repo/src/data', declaredExtension: undefined }
 * splitFileExtension('/repo/src/styles.d.css.ts') // { extensionlessPath: '/repo/src/styles', declaredExtension: '.css' }
 * ```
 */
export const splitFileExtension = (filePath: string): SplitFileExtensionPayload => {
  const declarationFileSuffix = DECLARATION_FILE_SUFFIXES.find((suffix) =>
    filePath.endsWith(suffix),
  );
  const extension = declarationFileSuffix ?? path.extname(filePath);
  const extensionlessPath = filePath.slice(0, filePath.length - extension.length);

  // `styles.d.css.ts` is TypeScript's declaration of `styles.css`: `.css`
  // inside a `.d` before the `.ts`.
  const declaredExtension = path.extname(extensionlessPath);
  const declarationPath = extensionlessPath.slice(
    0,
    extensionlessPath.length - declaredExtension.length,
  );
  const declarationMarker = path.extname(declarationPath);

  return extension === '.ts' && declaredExtension !== '' && declarationMarker === '.d'
    ? {
        extensionlessPath: declarationPath.slice(
          0,
          declarationPath.length - declarationMarker.length,
        ),
        declaredExtension,
      }
    : { extensionlessPath, declaredExtension: undefined };
};
