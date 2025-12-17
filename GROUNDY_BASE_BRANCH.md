# GroundY Consolidation Base Branch

This branch serves as the shared landing point for the in-flight groundY unification pull requests. It is cut from `work` with no gameplay changes so downstream PRs can merge cleanly and resolve conflicts in one place.

## How to use
- Rebase or retarget the open groundY-related PRs onto `groundy-unification-base`.
- Keep gameplay logic untouched in this branch so each PR remains focused on its original scope.
- Once all PRs land here and pass validation, merge this branch forward to your integration target.
