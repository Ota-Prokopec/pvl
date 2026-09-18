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
});
