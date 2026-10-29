import * as fsPromises from 'node:fs/promises';
import { GENERATED_MARKER_FILE_NAME } from './consts.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';

/**
 * What `stat` says about `filePath`, or `undefined` when nothing is there (or it can't be read).
 *
 * ```ts
 * await statOrUndefined('/repo')        // Stats: a directory
 * await statOrUndefined('/repo/absent') // undefined
 * ```
 */
export const statOrUndefined = async (
  filePath: string,
): Promise<Awaited<ReturnType<typeof fsPromises.stat>> | undefined> => {
  try {
    return await fsPromises.stat(filePath);
  } catch {
    return undefined;
  }
};

export const createDestinationUnwritableDiagnostic = (
  destinationPath: string,
  reason: string,
): Diagnostic => {
  return new Diagnostic({
    code: DIAGNOSTIC_CODE.DESTINATION_UNWRITABLE,
    message: `Can't write the Destination Directory to ${destinationPath}: ${reason}.`,
    file: destinationPath,
  });
};

/* Whether the existing directory `directoryPath` may be replaced: it is empty,
   or it carries the marker a previous run left.
  
     .pvl/ holding .pvl-generated, index.ts, schemas/   // true
     generated/ holding nothing                         // true
     src/ holding index.ts, app.ts                      // false
     **/
export const isReplaceableDirectory = async (directoryPath: string): Promise<boolean> => {
  const entryNames = await fsPromises.readdir(directoryPath);
  return entryNames.length === 0 || entryNames.includes(GENERATED_MARKER_FILE_NAME);
};
