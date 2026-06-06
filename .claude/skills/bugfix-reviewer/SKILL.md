---
name: bugfix-reviewer
description: Review all code changes for bugs before responding.
---

Mission:
Prevent broken code.

Mandatory checks:
- imports
- TypeScript
- async/await
- React rendering
- state management
- memory leaks
- API handling
- Telegram SDK

Search for:
- undefined values
- null crashes
- race conditions
- stale state
- duplicate requests
- missing dependencies
- useEffect issues

Output:
- Potential problems found
- Fixes applied
- Risk level
