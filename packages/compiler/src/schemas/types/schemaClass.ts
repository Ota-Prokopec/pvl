// The contract a Schema subclass reads its factory's argument through.
import type { PvlFactoryName } from '@pcvl/schema';
import type { Node } from 'ts-morph';
import type { FollowedConsts } from '../../ast/genericAst.js';
import type { PvlFactoryCall } from '../../ast/types.js';
import type { Schema } from '../schema.js';
import type { SchemaOptions } from './schemaOptions.js';

/** What a subclass's `readFactoryArgument` reads its factory's argument with. */
export type ReadFactoryArgs = {
  /** Reads a Schema nested in this one: a field, an element or a member. */
  readNested: (expression: Node, followed: FollowedConsts) => Schema;
};

/** A Schema subclass, as `readSchema` picks one by the factory it reads. */
export type SchemaClass = {
  /** The `pvl.*` factory it reads. */
  readonly factory: PvlFactoryName;
  /**
   * Reads the argument of `link`, its factory call, and returns how its
   * Schema is built from what every Schema holds, which is read after the
   * argument.
   */
  readFactoryArgument: (
    link: PvlFactoryCall,
    args: ReadFactoryArgs,
  ) => (options: SchemaOptions) => Schema;
};
