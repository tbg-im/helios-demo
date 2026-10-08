@AGENTS.md

## Working on this app (Claude Code)

AGENTS.md is the contract for how the app looks and how it talks to Teambridge. These are the working habits that keep Claude from shipping fixes that don't hold.

### Find the real cause before changing code

Most "it silently does nothing" bugs here have come from one layer, while the fix went into another. Before editing anything for a data bug:

1. Log the exact request (method, path, body) and the full response or `TBApiError` (status, body). Remove any `catch` that turns an error into empty data or a no-op, at least while debugging.
2. Check the field metadata the code depends on: does the field resolve, what are its `type`, `readOnly` and `writeFormatHint`, and is the value actually in the raw record?
3. Only then change code, and change the layer the evidence points at. If a write fails, suspect the write's encoding before rewriting the read path.

If a fix doesn't work, go back to step 1 instead of stacking another change on top. When you report the fix, say what the cause was and how you confirmed it.

### Know what dev mode can and can't prove

`TB_DEV_MODE=true` runs the app standalone at `localhost:3000`, with no Teambridge host around it. Locally you can verify rendering, data reads and writes (with real credentials), types, and lint. You **can't** verify anything that needs the host: the record detail panel opening and reopening (`?rid=`), URL sync with the parent, the `/apps/<slug>` base path, the proxy's 30 s timeout and buffering, or the real user's `X-User-Context` permissions.

For changes in those areas, say plainly that they need checking in the embedded app, and give the test steps (for record detail: the checklist in AGENTS.md → "Record detail"). Don't report them as verified.

### Ask about the account, don't guess

- Before writing code against a collection, look at its real field list (`getFields`), not the names you'd expect. Put what you find in `app/schema.ts`, with ids pinned once you have them.
- If the account is missing a field or collection the feature needs, tell the user which ones to add and with what type, and build the feature to degrade (see AGENTS.md → "When a field or collection doesn't exist"). Don't substitute a similarly named field.
- Ask before assuming anything about business rules: which shifts count, which statuses mean "done", who should see what.

### Before you finish

- `yarn typecheck` and `yarn lint` pass. The lint rule against bare `fetch` is intentional; use `tbFetch`.
- No new hex colors, raw `<button>`/`<input>`, or `min-h-screen` (see AGENTS.md → "Common mistakes").
- New pages handle loading, error and empty states, and a setup notice when the schema isn't ready.
- Error copy never says the app can't connect to Teambridge.
