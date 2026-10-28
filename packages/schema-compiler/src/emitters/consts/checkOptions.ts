// How a Compiled Schema's constructor types a check's options passed as a
// Runtime Argument. `tests/check-options-type.test.ts` checks it against
// `@pvl/schema`'s `CheckOptions`, which it spells by hand.

/**
 * The type a Compiled Schema's constructor declares a Runtime Argument with
 * when it is passed as a check's options: `@pvl/schema`'s `CheckOptions`,
 * spelled out, `| undefined` as each check takes them as an optional
 * trailing parameter.
 */
export const CHECK_OPTIONS_TYPE_STRING = '{ message?: string } | undefined' as const;
