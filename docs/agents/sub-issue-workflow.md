# Sub-issue workflow

How to implement a **sub-issue**: a child of a parent issue outside the `/to-spec` → `/to-tickets` pipeline (that pipeline follows [skill-extensions.md](../specification/skill-extensions.md)). Applies whether the sub-issue is requested alone or while orchestrating its parent. Branch, commit and PR naming follow [git-workflow.md](./git-workflow.md).

The agent's work ends at an open PR. The user merges every PR and closes every issue.

## Steps

1. **Orient.** Read the sub-issue and its parent (`gh issue view <n> --comments`). Look up the sub-issue's own sub-issues (`gh issue view <n> --json subIssues`). If any are open, stop here and report them as the work that has to land first; they are the user's call to schedule. Done when the sub-issue is confirmed a leaf, or its open sub-issues are reported.
2. **Branch.** Create the parent branch `<type>/<parent-slug>` off `main` if it doesn't exist yet, then the child branch `<type>/<child-slug>` off the parent branch.
3. **Implement.** One dedicated commit on the child branch. Done when the post-modification checklist ([README.md](../../README.md)) is green and every `/code-review` finding (reviewed against the parent branch) is fixed.
4. **Child PR.** Push and open a PR from the child branch into the parent branch, body `Part of #<parent>, resolves #<child>.` Comment on the sub-issue linking the PR.
5. **Parent PR.** Keep one **draft** PR from the parent branch into `main`, listing the parent and every child it contains in prose. GitHub refuses a PR with no diff, so it can open only once the user has merged a first child PR into the parent branch: open it then, and on later children add the new child to its body.
6. **Report.** Tell the user:
   - the PR created (and the parent PR, or that it is pending the first child merge),
   - the issues that PR resolves, for the user to close,
   - the sibling sub-issues still open.
