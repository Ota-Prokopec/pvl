# Sub-issue workflow

How to implement a **sub-issue**, a child of a parent issue. It covers a sub-issue requested alone and one reached while orchestrating its parent, and a `/to-spec` spec with its tickets runs the same way ([skill-extensions.md](../specification/skill-extensions.md#implement) has the additions). Branch, commit and PR naming follow [git-workflow.md](./git-workflow.md).

The agent's work ends at an open PR. The user merges every PR and closes every issue.

## Steps

1. **Orient.** Read the sub-issue and its parent (`gh issue view <n> --comments`), and look up the sub-issue's own sub-issues (`gh issue view <n> --json subIssues`). Done when the sub-issue is confirmed a leaf. If it has open sub-issues, report them as the work that lands first and stop: scheduling them is the user's call.
2. **Branch.** Done when the child branch `<type>/<child-slug>` exists off the parent branch `<type>/<parent-slug>`, which itself branches off `main` (create it if it's missing).
3. **Implement.** One dedicated commit on the child branch. Done when the post-modification checklist ([README.md](../../README.md)) is green and every `/code-review` finding, reviewed against the parent branch, is fixed.
4. **Child PR.** Push and open a PR from the child branch into the parent branch, body `Part of #<parent>, resolves #<child>.` (a closing keyword fires only on `main`). Done when the PR is open and the sub-issue carries a comment linking it.
5. **Parent PR.** Keep one **draft** PR from the parent branch into `main`, whose body carries a closing keyword for the parent and for every child merged into the parent branch (`Closes #14. Closes #16.`). Draft status keeps it from merging before every child is in; the user promotes and merges it. GitHub refuses a PR with no diff, so open it once the user has merged the first child PR, and add each later child's keyword as it lands.
6. **Report.** Tell the user:
   - the PR created, and the parent PR (or that it waits on the first child merge);
   - the sibling sub-issues still open.
