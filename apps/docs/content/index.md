---
layout: home

hero:
  name: '@pvl/schema'
  text: 'Schemas you compose, values you validate'
  tagline: A small, synchronous, Standard Schema-conformant validation library for TypeScript.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Schema types
      link: /guide/schemas
    - theme: alt
      text: API reference
      link: /api/

features:
  - title: Chained and inferred
    details: Build a schema by chaining methods, then read its input and output types straight off it — no parallel type declaration to keep in sync.
  - title: Every failure at once
    details: Objects and arrays check every field and every element, so one Result tells you everything that is wrong, each issue pathed to where it happened.
  - title: Never throws for bad data
    details: validate() returns a Result synchronously. A rejected value is issues, not an exception, so both branches are handled the same way every time.
  - title: Standard Schema
    details: Every schema implements StandardSchemaV1, so tools that speak the spec can use a pvl schema without knowing about pvl.
---
