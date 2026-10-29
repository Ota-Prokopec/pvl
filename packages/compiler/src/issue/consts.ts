// The stand-in a default message is rendered around, so the emitted code can
// spell it in a template literal.

/**
 * Stands in for a value only known at runtime while a default message is
 * rendered, so the message's text around it can be split off and spelled in
 * a template literal. It works for a message that writes its value as it is,
 * as every `<SCHEMA>_SCHEMA_ISSUE_MESSAGE` does; the differential test
 * catches one that formats it.
 */
export const MESSAGE_VALUE_PLACEHOLDER = '\u0000' as const;
