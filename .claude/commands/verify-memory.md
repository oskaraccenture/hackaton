# /verify-memory

Checks memory files for consistency with the current repository state and updates any stale entries.

## What it checks

1. **adr_summary.md** — every `decisions/*.md` file is listed
2. **project_state.md** — challenge statuses match `README.md`
3. **project_architecture.md** — every directory under `services/` is documented
4. **settings.json** — `pre-tool-use` hook is wired
5. **MEMORY.md** — index has an entry for every file in `memory/`

## What it does when it finds a discrepancy

For each stale entry:
1. Shows which memory file is out of date and what changed
2. Reads the current state from the repository
3. Updates the memory file — no confirmation needed, just fixes it

## When to run

- At the start of a session if more than one day has passed
- After writing a new ADR
- After extracting a new service
- After updating a challenge status in `README.md`
- The `Stop` hook runs an automated version after every session

## Golden rule

If memory says X and the repo says Y — **the repo is truth**. Update memory, never the other way around.
