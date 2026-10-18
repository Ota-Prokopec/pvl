// The kinds of emitted source text, each branded so one can't be passed
// where another is expected: a string becomes one only where it is written.

/** A local's declaration, which a composite's frame places before its children: `const path1 = [...path, "tags"];`. `''` sets the code after it apart with a blank line. */
export type EmittedVariableDeclaration = string & { readonly __brand: 'variableDeclaration' };

/** An Issue as an object literal, which a failed check pushes onto `issues`. */
export type EmittedIssue = string & { readonly __brand: 'issue' };

/** A check as a statement, which pushes its Issue onto `issues` when it fails: `if (field0.length < 3) { … }`. */
export type EmittedCheck = string & { readonly __brand: 'check' };

/** A pre-modifier's condition, as an expression: a value it holds for skips every other check, as `.optional()`'s `field0 === undefined`. */
export type EmittedShortCircuitCondition = string & { readonly __brand: 'shortCircuitCondition' };

/** A statement building a composite's output or handing it on: `output1["name"] = field1;`, `field0 = output1;`. */
export type EmittedOutputStatement = string & { readonly __brand: 'outputStatement' };
