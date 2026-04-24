# /characterize

Pin the current behavior of the spring-music monolith before making any changes.

## Usage

```
/characterize <endpoint-or-domain>
```

Examples:
- `/characterize albums` — pin all `/albums` endpoint behavior
- `/characterize GET /albums/:id` — pin a specific endpoint

## What this command does

1. **Sends test requests** to `http://localhost:8080` covering the target endpoint(s)
2. **Records actual responses**: status codes, response body shapes, error conditions
3. **Appends assertions** to `tests/characterization/run.sh` that pin the observed behavior
4. **Flags known issues** — fields that look like Spring internals (`_class`, Spring annotations) are noted as known leaks to strip in the ACL

## Rules

- Pins ACTUAL behavior, including bugs. Does NOT "fix" unexpected responses.
- If a test reveals behavior that differs from user stories, it notes the discrepancy but keeps the assertion.
- Adds a `[KNOWN BUG]` comment if the behavior is clearly wrong but intentionally pinned.

## Requires

- Monolith running: `cd legacy && ./gradlew bootRun`
- `curl` available in PATH
