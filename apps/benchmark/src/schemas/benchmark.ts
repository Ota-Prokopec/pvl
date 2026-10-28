// The benchmark's Schemas, from simplest to most complex. `pvl compile`
// mirrors them into `.pvl/schemas/benchmark.ts`: the inline-everything
// variant (V1) the runners measure against two hand-split ones in `src/variants/`,
// which are typed by each Schema's `Input` and `Output` declared here.
import { pvl, type InferInput, type InferOutput } from '@pvl/schema';

export const flat = pvl.compile(
  pvl.object({
    id: pvl.number().int().min(1),
    name: pvl.string().min(1).max(64),
    email: pvl.string().min(3),
    age: pvl.number().int().min(0).max(150),
    active: pvl.boolean(),
    role: pvl.enum(['admin', 'editor', 'viewer']),
    kind: pvl.literal('user'),
    nickname: pvl.string().optional(),
    score: pvl.number().nullable(),
    code: pvl.string().length(6),
  }),
);

export const nested = pvl.compile(
  pvl.object({
    name: pvl.string(),
    level: pvl.number().int(),
    child: pvl.object({
      name: pvl.string(),
      level: pvl.number().int(),
      child: pvl.object({
        name: pvl.string(),
        level: pvl.number().int(),
        child: pvl.object({
          name: pvl.string(),
          level: pvl.number().int(),
          child: pvl.object({ name: pvl.string(), level: pvl.number().int() }),
        }),
      }),
    }),
  }),
);

export const list = pvl.compile(
  pvl.array(
    pvl.object({
      id: pvl.number().int().min(1),
      name: pvl.string().min(1),
      price: pvl.number().min(0),
      inStock: pvl.boolean(),
    }),
  ),
);

const address = pvl.object({
  street: pvl.string().min(1),
  city: pvl.string().min(1),
  zip: pvl.string().length(5),
  country: pvl.enum(['CZ', 'SK', 'DE', 'AT', 'PL']),
});

export const reused = pvl.compile(
  pvl.object({
    home: address,
    work: address,
    billing: address,
    shipping: address,
    previous: address,
  }),
);

export const wide = pvl.compile(
  pvl.object({
    a1: pvl.string(),
    a2: pvl.string().min(1),
    a3: pvl.number(),
    a4: pvl.number().int(),
    a5: pvl.boolean(),
    a6: pvl.string().optional(),
    a7: pvl.number().nullable(),
    a8: pvl.enum(['x', 'y', 'z']),
    a9: pvl.literal(9),
    a10: pvl.string().max(100),
    b: pvl.object({
      b1: pvl.string(),
      b2: pvl.string().min(1),
      b3: pvl.number(),
      b4: pvl.number().int(),
      b5: pvl.boolean(),
      b6: pvl.string().optional(),
      b7: pvl.number().nullable(),
      b8: pvl.enum(['x', 'y', 'z']),
      b9: pvl.literal(9),
      b10: pvl.string().max(100),
      c: pvl.object({
        c1: pvl.string(),
        c2: pvl.string().min(1),
        c3: pvl.number(),
        c4: pvl.number().int(),
        c5: pvl.boolean(),
        c6: pvl.string().optional(),
        c7: pvl.number().nullable(),
        c8: pvl.enum(['x', 'y', 'z']),
        c9: pvl.literal(9),
        c10: pvl.string().max(100),
      }),
    }),
    d: pvl.object({
      d1: pvl.string(),
      d2: pvl.string().min(1),
      d3: pvl.number(),
      d4: pvl.number().int(),
      d5: pvl.boolean(),
      d6: pvl.string().optional(),
      d7: pvl.number().nullable(),
      d8: pvl.enum(['x', 'y', 'z']),
      d9: pvl.literal(9),
      d10: pvl.string().max(100),
      e: pvl.object({
        e1: pvl.string(),
        e2: pvl.string().min(1),
        e3: pvl.number(),
        e4: pvl.number().int(),
        e5: pvl.boolean(),
        e6: pvl.string().optional(),
        e7: pvl.number().nullable(),
        e8: pvl.enum(['x', 'y', 'z']),
        e9: pvl.literal(9),
        e10: pvl.string().max(100),
      }),
    }),
  }),
);

const money = pvl.object({
  amount: pvl.number().int().min(0),
  currency: pvl.enum(['CZK', 'EUR', 'USD']),
});

const contact = pvl.object({
  name: pvl.string().min(1).max(128),
  email: pvl.string().min(3),
  phone: pvl.string().min(9).optional(),
  address,
});

const order = pvl
  .object({
    id: pvl.string().length(36),
    kind: pvl.literal('order'),
    status: pvl.enum(['new', 'paid', 'shipped', 'delivered', 'cancelled']),
    createdAt: pvl.number().int(),
    customer: contact,
    shippingTo: contact.optional(),
    lines: pvl
      .array(
        pvl
          .object({
            sku: pvl.string().min(4).max(32),
            quantity: pvl.number().int().min(1).max(999),
            unitPrice: money,
            discounts: pvl.array(
              pvl.object({
                code: pvl.string().min(3),
                amount: money,
                stackable: pvl.boolean(),
              }),
            ),
            attributes: pvl.array(
              pvl.object({ name: pvl.string().min(1), value: pvl.string() }).strict(),
            ),
            note: pvl.string().max(500).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    payments: pvl.array(
      pvl.object({
        method: pvl.enum(['card', 'transfer', 'cash']),
        paid: money,
        reference: pvl.string().nullable(),
        refunds: pvl.array(pvl.object({ amount: money, reason: pvl.string().min(1) })),
      }),
    ),
    total: money,
    tags: pvl.array(pvl.string().min(1)).max(20),
    metadata: pvl
      .object({
        source: pvl.enum(['web', 'app', 'pos']),
        campaign: pvl.string().optional(),
        flags: pvl.object({
          gift: pvl.boolean(),
          priority: pvl.boolean(),
          fragile: pvl.boolean(),
        }),
      })
      .passthrough(),
  })
  .strict();

export const complex = pvl.compile(order);

// Six orders inlined into one `_validate` take it past V8's 61,440-byte limit for optimizing a function.
export const huge = pvl.compile(
  pvl.object({ o1: order, o2: order, o3: order, o4: order, o5: order, o6: order }),
);

export type FlatInput = InferInput<typeof flat>;
export type FlatOutput = InferOutput<typeof flat>;
export type NestedInput = InferInput<typeof nested>;
export type NestedOutput = InferOutput<typeof nested>;
export type ListInput = InferInput<typeof list>;
export type ListOutput = InferOutput<typeof list>;
export type ReusedInput = InferInput<typeof reused>;
export type ReusedOutput = InferOutput<typeof reused>;
export type WideInput = InferInput<typeof wide>;
export type WideOutput = InferOutput<typeof wide>;
export type ComplexInput = InferInput<typeof complex>;
export type ComplexOutput = InferOutput<typeof complex>;
export type HugeInput = InferInput<typeof huge>;
export type HugeOutput = InferOutput<typeof huge>;
