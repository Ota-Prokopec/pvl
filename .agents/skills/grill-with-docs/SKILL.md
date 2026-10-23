---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

Call the Skill tool twice, for "grilling" and "domain-modeling".

The session settles what to build and why, recorded as ADRs; nothing is implemented yet. Until it concludes, the only files written are `/prototype-code` variants, which that skill deletes before the question closes. Once the session concludes and the ADR and glossary changes are written, commit just those doc changes with type `docs` (`docs(adr): record ADR-0026`), so ADR-only commits stand out in history.

Next in the pipeline: `/to-spec`.
