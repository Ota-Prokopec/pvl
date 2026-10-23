---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Scope: spec issues (labelled `spec`) and their child tickets (labelled `ticket`, with a `## Parent` link to a spec). Any other `#<int>` follows "Resolving an issue" in [git-workflow.md](../../../docs/agents/git-workflow.md).

Implement a ticket with [sub-issue-workflow.md](../../../docs/agents/sub-issue-workflow.md), with the spec as the parent and the ticket as the child: the spec branch (`feat/schema-compiler`) is the parent branch, and each ticket branch (`feat/compiler-cli`) branches off it.

Call the Skill tool with "tdd" where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, call the Skill tool with "code-review" to review the work.

Commit your work to the current branch.
