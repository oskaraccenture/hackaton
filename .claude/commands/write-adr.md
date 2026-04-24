# /write-adr

Write an Architecture Decision Record for a decision made during the hackathon.

## Usage

```
/write-adr <title>
```

Example: `/write-adr database-per-service-split`

## What this command does

Creates `decisions/00N-<title>.md` with the following sections:

1. **Status** — Accepted / Proposed / Superseded
2. **Context** — what problem prompted this decision
3. **Decision** — what we decided
4. **Rationale** — why, with explicit comparison to alternatives
5. **What we chose NOT to do** — required section; name at least 2 rejected alternatives with reasons
6. **Consequences** — positive and negative

## Rules

- "What we chose NOT to do" is mandatory — judges look for this
- Include concrete thresholds where relevant ("< 5ms", "more than 3 retries")
- Avoid vague language: "significant", "appropriate", "better" without definition
- Link to other ADRs if this decision depends on or supersedes one
