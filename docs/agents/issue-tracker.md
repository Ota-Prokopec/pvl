# Issue tracker: GitHub

Issues and specs live as GitHub issues on `Ota-Prokopec/pvl`, driven through the `gh` CLI, which infers the repo from the clone. [git-workflow.md](./git-workflow.md) holds the rules for what gets posted; this file holds the commands.

## Commands

- **Create**: `gh issue create --title "..." --body "..."`, with a heredoc for a multi-line body.
- **Read**: `gh issue view <n> --comments`, plus `--json labels` for the labels.
- **List**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`, narrowed with `--label` and `--state`.
- **Comment**: `gh issue comment <n> --body "..."`.
- **Label**: `gh issue edit <n> --add-label "..."` / `--remove-label "..."`.
- **Close**: the user's merge of a `Closes #<n>` PR closes the issue. The agent leaves every issue open.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: try `gh pr view 42`, then `gh issue view 42`.

A skill that says "publish to the issue tracker" means create a GitHub issue. One that says "fetch the relevant ticket" means `gh issue view <n> --comments`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## Wayfinding operations

Used by `/wayfinder`. The **map** is one issue, and its **child** issues are the tickets.

- **Map**: an issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint), labelled `wayfinder:<type>` (`research`, `prototype`, `grilling` or `task`). Once claimed, it is assigned to the driving dev.
- **Blocking**: GitHub's native issue dependencies. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`), never its `#number` or `node_id`. `issue_dependencies_summary.blocked_by` counts the open blockers, so a ticket is unblocked when it reads `0`.
- **Frontier query**: list the map's open sub-issues, drop any with an open blocker or an assignee; the first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then append a context pointer (gist + link) to the map's Decisions-so-far, then tell the user the ticket is answered and ready for them to close.
