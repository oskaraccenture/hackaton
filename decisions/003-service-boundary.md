# ADR-003: Service Boundary Enforcement — PreToolUse Hook vs. CLAUDE.md Prompt

**Status:** Accepted  
**Date:** 2026-04-24

---

## Context

When using Claude Code to assist with service extraction, we need to prevent Spring-specific implementation details from leaking into the new services' public APIs. Specifically: Spring annotations (`@Document`, `@Entity`, `@Column`), CF-specific config fields, and Spring Data naming conventions must not appear in route responses in `services/*/routes/*.js`.

Two mechanisms are available:

| Mechanism | Reliability | Scope |
|---|---|---|
| `PreToolUse` hook | Deterministic — runs as shell command before every tool call | Hard block |
| CLAUDE.md prompt | Probabilistic — shapes model behavior across the session | Preference signal |

---

## Decision

**Both — used for different enforcement levels:**

- **`PreToolUse` hook** → hard block. Scans file content of any Write/Edit to `services/*/routes/` for known Spring annotation strings. If found, blocks with a structured error.
- **CLAUDE.md prompt** → preference. Lists the ACL adapter location, the field mapping table, and the "why." This is what teaches Claude *how* to stay within bounds; the hook is what enforces it when comprehension fails.

---

## Rationale: Why Each Is Which

**Hooks are for deterministic, mechanical enforcement.**
A `PreToolUse` hook runs as a shell process. It doesn't depend on model context, prompt state, or conversation length. A `grep` for `@Document` in a file path is 100% reliable. Any invariant where a silent failure causes a contract violation belongs in a hook.

**Prompts are for probabilistic preferences.**
A well-written CLAUDE.md shapes behavior across the session — but it can be overridden by conflicting instructions, drift in long sessions, or misapplication in edge cases. "Prefer the ACL adapter," "translate legacy fields before writing to a route," "here is the mapping table" — these are guidance signals, not guarantees.

**The rule of thumb:**
> If the failure mode is silent data corruption or API contract violation → hook.  
> If the failure mode is a suboptimal but correctable choice → prompt.

This distinction shows up on the Claude Code Architecture cert. The ADR exists to make the reasoning explicit for future maintainers and for judges.

---

## What We Chose NOT to Do

- **Hook only** — blocks but doesn't teach. Claude would hit the wall repeatedly without understanding why. The CLAUDE.md prompt is what makes Claude generate correct code on the first attempt.
- **Prompt only** — not reliable enough for a hard contract guarantee. A prompt can be overridden; a hook cannot.
- **PostToolUse hook** — catches violations after the fact, not before. PreToolUse is strictly better for this use case because it prevents the write from happening at all.
- **CI lint rule** — would catch it in CI, but the feedback loop is too slow for interactive development. PreToolUse gives instant feedback in the same session.

---

## Hook Implementation

```bash
# .claude/hooks/pre-tool-use.sh
# Triggered before Write and Edit tool calls
FILE="$1"
CONTENT="$2"

if [[ "$FILE" =~ services/.*/routes/ ]]; then
  if echo "$CONTENT" | grep -qE '@Document|@Entity|@Column|@RedisHash|spring\.'; then
    echo "BOUNDARY VIOLATION: Spring annotation detected in service route."
    echo "File: $FILE"
    echo "Translate Spring types via services/album-service/acl/albumAdapter.js first."
    exit 1
  fi
fi
```

The hook fires, Claude receives the error, and self-corrects by routing through the ACL adapter.
