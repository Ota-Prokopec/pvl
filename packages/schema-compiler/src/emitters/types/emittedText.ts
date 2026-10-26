// The kinds of emitted source text, each branded so one can't be passed
// where another is expected: a string becomes one only where it is written,
// by one function each (`emitCheck` and its siblings in
// `../utils/emittedText.ts`).

/** A local a composite declares, which its frame places after its own and before its children: `const output2: unknown[] = [];`. */
export type EmittedVariableDeclaration = string & { readonly __brand: 'variableDeclaration' };

/** An Issue as an object literal, which a failed check pushes onto `issues`. */
export type EmittedIssue = string & { readonly __brand: 'issue' };

/** A check as a statement, which pushes its Issue onto `issues` when it fails: `if (field0.length < 3) { … }`. */
export type EmittedCheck = string & { readonly __brand: 'check' };

/** A pre-modifier's condition, as an expression: a value it holds for skips every other check, as `.optional()`'s `field0 === undefined`. */
export type EmittedShortCircuitCondition = string & { readonly __brand: 'shortCircuitCondition' };

/** `.coerce()`'s conversion, as statements replacing the value before its type check: `field0 = String(field0);`. */
export type EmittedCoercion = string & { readonly __brand: 'coercion' };

/** `.transform()`'s call, as a statement replacing the value with what the user's function returns: `field0 = this.arg0.call(undefined, field0 as never);`. */
export type EmittedTransform = string & { readonly __brand: 'transform' };

/** A statement building a composite's output: `output1["name"] = field1;`, `.passthrough()`'s loop. */
export type EmittedOutputStatement = string & { readonly __brand: 'outputStatement' };

/** The kinds of source text an emitter method writes: a check, or a pre-modifier's short-circuit condition. */
export type EmittedMethodText = EmittedCheck | EmittedShortCircuitCondition;
