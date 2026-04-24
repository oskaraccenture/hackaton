# /check-boundary

Scan all service route files for Spring boundary violations before committing or deploying.

## Usage

```
/check-boundary
```

No arguments. Always scans all services under `services/`.

## Subagent orchestration

Spawn one subagent (subagent_type: Explore, thoroughness: very thorough):

```
Scan every file under services/*/routes/ and services/*/acl/ in the repo at
/home/oskarc35/workshop/claude-code-hackathon/hackaton for Spring boundary violations.

A violation is any of:
- String literal: @Document, @Entity, @Column, @RedisHash
- Field name: _class, albumId (Spring internal — clean services use "id" only), release_year, track_count
- Import or require of any spring.* package
- Any Java-style annotation syntax in a JS/TS response object

For each violation found report:
  - File path and line number
  - The offending text
  - Severity: HARD BLOCK (route response) or WARNING (test/comment)

Also check acl/ files to confirm the ACL is the ONLY place that references Spring field names.
If acl/ files reference Spring fields — that is expected and correct; do not flag as a violation.

Return: list of violations (file:line — text — severity) or "NO VIOLATIONS FOUND".
```

## After the subagent completes

- If violations found: list them, state which file needs fixing, reference `services/album-service/acl/albumAdapter.js` as the correct pattern.
- If clean: print `BOUNDARY CHECK CLEAN — safe to commit`.

## Note

This is a manual complement to the `PreToolUse` hook in `.claude/settings.json`, which blocks writes at tool-call time. Run `/check-boundary` after a merge or rebase when the hook may not have been active.
