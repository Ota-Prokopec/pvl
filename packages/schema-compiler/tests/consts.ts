/** A scanned file with one export, so it raises no diagnostic of its own. */
export const SCHEMA_FILE =
  "import { pvl } from '@pvl/schema';\n\nexport const user = pvl.object({ name: pvl.string() });\n" as const;
