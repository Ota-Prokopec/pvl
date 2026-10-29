import { pvl } from '@pcvl/schema';

export const pvlConfigSchema = pvl.object({
  include: pvl.array(pvl.string()).optional(),
  rootDir: pvl.string().optional(),
  destination: pvl.string().optional(),
});

export const pvlConfigFilePayloadSchema = pvl
  .object({
    $schema: pvl.string().optional(),
    include: pvl.array(pvl.string()).optional(),
    rootDir: pvl.string().optional(),
    destination: pvl.string().optional(),
  })
  .strict();
