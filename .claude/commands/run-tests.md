# /run-tests

Run characterization tests (monolith) and contract tests (album-service) in parallel and report combined results.

## Usage

```
/run-tests
```

No arguments needed.

## Subagent orchestration

Spawn two subagents IN PARALLEL (both in a single Agent tool call):

### Subagent A — Characterization tests (subagent_type: general-purpose)

```
Run the characterization test suite against the spring-music monolith.
Repo root: /home/oskarc35/workshop/claude-code-hackathon/hackaton

Command: cd tests/characterization && ./run.sh

Capture stdout. Return:
- Total passed / total failed
- Names of any FAIL assertions with their actual vs expected values
- Whether the [KNOWN ISSUE] Spring metadata leak was detected
```

### Subagent B — Contract tests (subagent_type: general-purpose)

```
Run the contract test suite for album-service.
Repo root: /home/oskarc35/workshop/claude-code-hackathon/hackaton

Command: cd services/album-service && npm test

Capture stdout. Return:
- Total passed / total failed
- Names of any failing tests with error message
```

## After both subagents complete

Render a combined results table:

| Suite | Passed | Failed | Status |
|---|---|---|---|
| Characterization (monolith :8080) | N | N | PASS / FAIL |
| Contract (album-service :3001) | N | N | PASS / FAIL |

List every failing test by name. If both suites are fully green, print: ALL TESTS PASSING.

## Requires

- Monolith running on :8080 — `cd legacy && ./gradlew bootRun`
- album-service running on :3001 — `cd services/album-service && npm start`
