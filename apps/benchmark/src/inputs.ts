// The benchmark's inputs: a valid and an invalid value for each Schema of
// `src/schemas/benchmark.ts`. Each invalid one fails in a few places, near the root
// and deep down, so every variant reports several Issues at nested paths.

/** The names of the benchmarked Schemas, as each variant's module exports them. */
export const SCHEMA_NAMES = [
  'flat',
  'nested',
  'list',
  'reused',
  'wide',
  'complex',
  'huge',
] as const;

export type SchemaName = (typeof SCHEMA_NAMES)[number];

/** The two inputs each Schema is validated against. */
export const INPUT_KINDS = ['valid', 'invalid'] as const;

type Inputs = Record<SchemaName, Record<(typeof INPUT_KINDS)[number], unknown>>;

const LIST_LENGTH = 1000 as const;
const ORDER_LINES = 50 as const;

const nestedLevel = (depth: number, broken: boolean): Record<string, unknown> => ({
  name: broken && depth === 2 ? 3 : `level ${depth}`,
  level: broken && depth === 5 ? 1.5 : depth,
  ...(depth < 5 ? { child: nestedLevel(depth + 1, broken) } : {}),
});

const listItem = (index: number, broken: boolean): Record<string, unknown> => ({
  id: broken && index % 100 === 0 ? 0 : index + 1,
  name: `item ${index}`,
  price: index * 1.5,
  inStock: index % 2 === 0,
});

const address = (broken: boolean): Record<string, unknown> => ({
  street: 'Main 1',
  city: 'Brno',
  zip: broken ? '1234' : '60200',
  country: broken ? 'US' : 'CZ',
});

const wideBlock = (prefix: string, broken: boolean): Record<string, unknown> => ({
  [`${prefix}1`]: 'one',
  [`${prefix}2`]: broken ? '' : 'two',
  [`${prefix}3`]: 3.5,
  [`${prefix}4`]: broken ? 4.5 : 4,
  [`${prefix}5`]: true,
  [`${prefix}6`]: 'six',
  [`${prefix}7`]: null,
  [`${prefix}8`]: 'y',
  [`${prefix}9`]: 9,
  [`${prefix}10`]: 'ten',
});

const money = (amount: number): Record<string, unknown> => ({ amount, currency: 'CZK' });

const contact = (broken: boolean): Record<string, unknown> => ({
  name: 'Ada Lovelace',
  email: broken ? 'a' : 'ada@example.com',
  phone: '+420123456789',
  address: address(false),
});

const orderLine = (index: number, broken: boolean): Record<string, unknown> => ({
  sku: `SKU-${index}`,
  quantity: (index % 9) + 1,
  unitPrice: money(broken && index === ORDER_LINES - 1 ? -1 : 100 + index),
  discounts: [
    { code: 'SUMMER', amount: money(10), stackable: true },
    { code: 'LOYAL', amount: money(5), stackable: false },
    { code: 'BULK', amount: money(index), stackable: true },
  ],
  attributes: [
    { name: 'color', value: 'red' },
    { name: 'size', value: 'M' },
  ],
  note: index % 3 === 0 ? null : 'handle with care',
  ...(broken && index === 10 ? { extra: true } : {}),
});

const order = (broken: boolean): Record<string, unknown> => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  kind: 'order',
  status: 'paid',
  createdAt: 1_700_000_000_000,
  customer: contact(broken),
  shippingTo: contact(false),
  lines: Array.from({ length: ORDER_LINES }, (_, index) => orderLine(index, broken)),
  payments: [
    {
      method: 'card',
      paid: money(5000),
      reference: 'TX-1',
      refunds: [{ amount: money(100), reason: 'damaged' }],
    },
    { method: 'transfer', paid: money(2000), reference: null, refunds: [] },
    {
      method: broken ? 'cheque' : 'cash',
      paid: money(300),
      reference: null,
      refunds: [{ amount: money(50), reason: 'late' }],
    },
  ],
  total: money(7300),
  tags: ['new', 'vip', broken ? '' : 'gift', 'eu', 'web'],
  metadata: {
    source: 'web',
    campaign: 'autumn',
    flags: { gift: true, priority: false, fragile: true },
    ref: 'x',
  },
});

export const INPUTS: Inputs = {
  flat: {
    valid: {
      id: 1,
      name: 'Ada',
      email: 'ada@example.com',
      age: 36,
      active: true,
      role: 'admin',
      kind: 'user',
      nickname: 'ada',
      score: null,
      code: 'ABC123',
    },
    invalid: {
      id: 1.5,
      name: '',
      email: 'ada@example.com',
      age: 200,
      active: true,
      role: 'owner',
      kind: 'user',
      score: 'high',
      code: 'ABC123',
    },
  },
  nested: { valid: nestedLevel(1, false), invalid: nestedLevel(1, true) },
  list: {
    valid: Array.from({ length: LIST_LENGTH }, (_, index) => listItem(index, false)),
    invalid: Array.from({ length: LIST_LENGTH }, (_, index) => listItem(index, true)),
  },
  reused: {
    valid: {
      home: address(false),
      work: address(false),
      billing: address(false),
      shipping: address(false),
      previous: address(false),
    },
    invalid: {
      home: address(false),
      work: address(true),
      billing: address(false),
      shipping: address(false),
      previous: address(true),
    },
  },
  wide: {
    valid: {
      ...wideBlock('a', false),
      b: { ...wideBlock('b', false), c: wideBlock('c', false) },
      d: { ...wideBlock('d', false), e: wideBlock('e', false) },
    },
    invalid: {
      ...wideBlock('a', false),
      b: { ...wideBlock('b', true), c: wideBlock('c', false) },
      d: { ...wideBlock('d', false), e: wideBlock('e', true) },
    },
  },
  complex: { valid: order(false), invalid: order(true) },
  huge: {
    valid: {
      o1: order(false),
      o2: order(false),
      o3: order(false),
      o4: order(false),
      o5: order(false),
      o6: order(false),
    },
    invalid: {
      o1: order(false),
      o2: order(true),
      o3: order(false),
      o4: order(false),
      o5: order(true),
      o6: order(false),
    },
  },
};
