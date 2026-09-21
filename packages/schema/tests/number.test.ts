import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Result } from "../src/index.js";
import { pvl } from "../src/index.js";

function assertSuccess<Output>(
  result: Result<Output>,
): asserts result is { value: Output; issues?: undefined } {
  if (result.issues) {
    throw new Error(
      `Expected a success Result, got issues: ${JSON.stringify(result.issues)}`,
    );
  }
}

describe("pvl.number()", () => {
  it("accepts a number", () => {
    const result = pvl.number().validate(42);
    assertSuccess(result);
    expect(result.value).toBe(42);
  });

  it("rejects a non-number", () => {
    const result = pvl.number().validate("42");
    expect(result.issues).toBeDefined();
  });

  it("rejects NaN", () => {
    const result = pvl.number().validate(NaN);
    expect(result.issues).toBeDefined();
  });

  it("uses a custom message for the base type check", () => {
    const result = pvl.number({ message: "must be a number" }).validate("x");
    expect(result.issues?.[0]?.message).toBe("must be a number");
  });

  it("reports a top-level Issue with no path for a bare number failure", () => {
    const result = pvl.number().validate("x");
    expect(result.issues?.[0]?.message).toBeTypeOf("string");
    expect(result.issues?.[0]?.path).toBeUndefined();
  });

  describe(".min()", () => {
    it("accepts the exact min boundary", () => {
      const result = pvl.number().min(3).validate(3);
      expect(result.issues).toBeUndefined();
    });

    it("rejects one below the min boundary", () => {
      const result = pvl.number().min(3).validate(2);
      expect(result.issues).toBeDefined();
    });

    it("uses a custom message", () => {
      const result = pvl.number().min(3, { message: "too small" }).validate(2);
      expect(result.issues?.[0]?.message).toBe("too small");
    });
  });

  describe(".max()", () => {
    it("accepts the exact max boundary", () => {
      const result = pvl.number().max(3).validate(3);
      expect(result.issues).toBeUndefined();
    });

    it("rejects one above the max boundary", () => {
      const result = pvl.number().max(3).validate(4);
      expect(result.issues).toBeDefined();
    });

    it("uses a custom message", () => {
      const result = pvl.number().max(3, { message: "too big" }).validate(4);
      expect(result.issues?.[0]?.message).toBe("too big");
    });
  });

  describe(".int()", () => {
    it("accepts an integer", () => {
      const result = pvl.number().int().validate(3);
      expect(result.issues).toBeUndefined();
    });

    it("rejects a non-integer", () => {
      const result = pvl.number().int().validate(3.5);
      expect(result.issues).toBeDefined();
    });

    it("uses a custom message", () => {
      const result = pvl
        .number()
        .int({ message: "must be whole" })
        .validate(3.5);
      expect(result.issues?.[0]?.message).toBe("must be whole");
    });
  });

  describe(".refine()", () => {
    it("accepts a value satisfying the predicate", () => {
      const schema = pvl.number().refine((value) => value % 2 === 0);
      expect(schema.validate(4).issues).toBeUndefined();
    });

    it("rejects a value failing the predicate", () => {
      const schema = pvl.number().refine((value) => value % 2 === 0);
      expect(schema.validate(3).issues).toBeDefined();
    });

    it("uses a custom message", () => {
      const schema = pvl.number().refine((value) => value % 2 === 0, {
        message: "must be even",
      });
      expect(schema.validate(3).issues?.[0]?.message).toBe("must be even");
    });

    it("never runs the predicate when the base check already failed", () => {
      const schema = pvl.number().refine(() => {
        throw new Error("should not be called");
      });
      expect(() => schema.validate("x")).not.toThrow();
    });
  });

  describe(".transform()", () => {
    it("converts the accepted value", () => {
      const schema = pvl.number().transform((value) => value * 2);
      const result = schema.validate(4);
      assertSuccess(result);
      expect(result.value).toBe(8);
    });

    it("still rejects an invalid input without running the transform", () => {
      const schema = pvl.number().transform((value) => value * 2);
      const result = schema.validate("x");
      expect(result.issues).toBeDefined();
    });
  });

  describe(".coerce()", () => {
    it("coerces a string to a number before validating", () => {
      const result = pvl.number().coerce().validate("42");
      assertSuccess(result);
      expect(result.value).toBe(42);
    });

    it("coerces a boolean to a number before validating", () => {
      const result = pvl.number().coerce().validate(true);
      assertSuccess(result);
      expect(result.value).toBe(1);
    });

    it("still rejects a value that can't become a valid number", () => {
      const result = pvl.number().coerce().validate("not a number");
      expect(result.issues).toBeDefined();
    });

    it("still coerces when chained after .refine()", () => {
      const result = pvl
        .number()
        .refine((value) => value > 0)
        .coerce()
        .validate("42");
      assertSuccess(result);
      expect(result.value).toBe(42);
    });

    it("still coerces when chained after .transform()", () => {
      const result = pvl
        .number()
        .transform((value) => value * 2)
        .coerce()
        .validate("21");
      assertSuccess(result);
      expect(result.value).toBe(42);
    });
  });

  describe(".optional()", () => {
    it("accepts undefined", () => {
      const result = pvl.number().optional().validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
    });

    it("still validates a defined value", () => {
      const result = pvl.number().optional().validate("x");
      expect(result.issues).toBeDefined();
    });
  });

  describe(".nullable()", () => {
    it("accepts null", () => {
      const result = pvl.number().nullable().validate(null);
      assertSuccess(result);
      expect(result.value).toBeNull();
    });

    it("still validates a non-null value", () => {
      const result = pvl.number().nullable().validate("x");
      expect(result.issues).toBeDefined();
    });
  });

  describe("never throws for an invalid value", () => {
    it("returns a Result instead of throwing", () => {
      expect(() =>
        pvl.number().min(3).validate({ not: "a number" }),
      ).not.toThrow();
    });
  });
});

describe("pvl.number().min()/.max() (property-based)", () => {
  it("accepts any number within [min, max]", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 10 }), (value) => {
        const result = pvl.number().min(3).max(10).validate(value);
        return result.issues === undefined;
      }),
    );
  });

  it("rejects any number below min", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10, max: 2 }), (value) => {
        const result = pvl.number().min(3).validate(value);
        return result.issues !== undefined;
      }),
    );
  });
});
