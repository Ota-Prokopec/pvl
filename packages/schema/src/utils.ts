// Small helpers shared across the schema implementations. Internal-only, so it
// stays out of the barrel.

// Plain `target[key] = value` would hit `Object.prototype`'s `__proto__`
// setter for that one key name — which `JSON.parse('{"__proto__":{}}')`
// produces as a real own property — silently reparenting the output instead of
// copying the key. `defineProperty` writes it as the own data property it was.
export const assignObjectProperty = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void => {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return;
  }
  target[key] = value;
};

// The own enumerable keys of `value` that `knownKeys` does not list.
export const unknownKeysOfObject = (value: unknown, knownKeys: ReadonlySet<string>): string[] =>
  Object.keys(value as object).filter((key) => !knownKeys.has(key));
