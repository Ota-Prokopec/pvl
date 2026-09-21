import { describe, expectTypeOf, it } from "vitest";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { pvl } from "../src/index.js";

describe("type inference", () => {
  it("infers pvl.string()'s input/output as string", () => {
    const schema = pvl.string();
    expectTypeOf<
      StandardSchemaV1.InferInput<typeof schema>
    >().toEqualTypeOf<string>();
    expectTypeOf<
      StandardSchemaV1.InferOutput<typeof schema>
    >().toEqualTypeOf<string>();
  });

  it("infers a transformed pvl.string()'s differing input/output", () => {
    const schema = pvl.string().transform((value) => value.length);
    expectTypeOf<
      StandardSchemaV1.InferInput<typeof schema>
    >().toEqualTypeOf<string>();
    expectTypeOf<
      StandardSchemaV1.InferOutput<typeof schema>
    >().toEqualTypeOf<number>();
  });

  it("infers pvl.number()'s input/output as number", () => {
    const schema = pvl.number();
    expectTypeOf<
      StandardSchemaV1.InferInput<typeof schema>
    >().toEqualTypeOf<number>();
    expectTypeOf<
      StandardSchemaV1.InferOutput<typeof schema>
    >().toEqualTypeOf<number>();
  });

  it("infers a transformed pvl.number()'s differing input/output", () => {
    const schema = pvl.number().transform((value) => value.toFixed(2));
    expectTypeOf<
      StandardSchemaV1.InferInput<typeof schema>
    >().toEqualTypeOf<number>();
    expectTypeOf<
      StandardSchemaV1.InferOutput<typeof schema>
    >().toEqualTypeOf<string>();
  });

  it("infers pvl.boolean()'s input/output as boolean", () => {
    const schema = pvl.boolean();
    expectTypeOf<
      StandardSchemaV1.InferInput<typeof schema>
    >().toEqualTypeOf<boolean>();
    expectTypeOf<
      StandardSchemaV1.InferOutput<typeof schema>
    >().toEqualTypeOf<boolean>();
  });

  it("infers a transformed pvl.boolean()'s differing input/output", () => {
    const schema = pvl.boolean().transform((value): number => (value ? 1 : 0));
    expectTypeOf<
      StandardSchemaV1.InferInput<typeof schema>
    >().toEqualTypeOf<boolean>();
    expectTypeOf<
      StandardSchemaV1.InferOutput<typeof schema>
    >().toEqualTypeOf<number>();
  });
});
