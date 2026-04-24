# /characterize

Pin the current behavior of the spring-music monolith before making any changes.

## Usage

```
/characterize <endpoint-or-domain>
```

Examples:
- `/characterize albums` — pin all `/albums` endpoint behavior
- `/characterize GET /albums/:id` — pin a specific endpoint

## Subagent orchestration

This command runs two sequential subagents.

### Phase 1 — Behavior capture (subagent_type: Explore, thoroughness: medium)

Spawn an Explore subagent with this prompt:

```
The spring-music monolith is running at http://localhost:8080.
Probe the target endpoint "$ARGUMENTS" using curl and record:
1. HTTP status code for the happy path
2. Full response body shape (field names and types — sample values OK)
3. HTTP status for a missing resource (404 or other?)
4. HTTP status for malformed input (400 or other?)
5. Any field that looks like a Spring internal (_class, @Document, @Entity, albumId vs id discrepancy)

Run the probes; do not write any files. Return a structured findings report.
```

### Phase 2 — Test generation (subagent_type: general-purpose)

Spawn a general-purpose subagent, passing the Explore findings as context:

```
Append new characterization test cases to tests/characterization/run.sh.
Repo root: /home/oskarc35/workshop/claude-code-hackathon/hackaton
Findings: <Explore output>

Rules:
- Pin ACTUAL behavior, including bugs — do NOT fix unexpected responses
- Mark divergences from user stories with: # [KNOWN BUG] <description>
- Mark Spring metadata leaks with: # [KNOWN ISSUE] must be stripped in ACL
- Use the existing check() function pattern already in the file
- Do not delete existing assertions

After appending, run: cd tests/characterization && ./run.sh
Report each new assertion pass/fail.
```

## Rules

- Pins ACTUAL behavior, including bugs. Does NOT "fix" unexpected responses.
- If a test reveals behavior that differs from user stories, it notes the discrepancy but keeps the assertion.
- Adds a `[KNOWN BUG]` comment if the behavior is clearly wrong but intentionally pinned.

## Requires

- Monolith running: `cd legacy && ./gradlew bootRun`
- `curl` available in PATH
