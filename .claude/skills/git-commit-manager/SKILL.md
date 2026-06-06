---
name: git-commit-manager
description: Generate clean git commits and changelogs.
---

After every code change:

1. Summarize changes.
2. Generate commit message.
3. Use Conventional Commits.

Allowed types:
- feat
- fix
- refactor
- perf
- style
- docs
- chore

Format:

type(scope): short description

Examples:

feat(import): add drag and drop image upload

fix(auth): resolve Telegram login issue

perf(canvas): reduce rerenders during image editing

refactor(store): simplify image state management

Always provide:

## Commit Message

git commit -m "..."

## Changelog

- change 1
- change 2
- change 3
