# Team [Print Corner]

## Participants
- Grzegorz Jankowiak (PM / Product)
- Oskar Cieślikiewicz (Architect)
- Jacek Kucharski (Developer)
- Marcin Kurek (Tester / Quality)

## Scenario
Scenario 1: Code Modernization — "The Monolith"

## What We Built

Spring Music is a Spring Boot application originally built for Cloud Foundry. It manages an album catalog and demonstrates multi-database backends (MySQL, PostgreSQL, MongoDB, Redis) through Spring profiles and profile-based `CrudRepository` implementations (JPA / MongoDB / Redis). The deployment model is tied to Cloud Foundry `manifest.yml` and `java-cfenv-boot` — both of which are end-of-life.

We applied the **Strangler Fig pattern** to extract the Album domain into a standalone REST microservice with a clean, Cloud-Foundry-free API contract. The legacy monolith remains operational. A new `album-service` sits behind an API façade with an anti-corruption layer that prevents the legacy Spring data model from leaking into the new service's public shape.

What runs: the legacy monolith (Spring Boot via Gradle), the album-service (Node.js/Express), characterization test suite (HTTP-based), contract tests.
What's scaffolded: CI pipeline, full database-per-service split.
What's faked: real database backends — H2 in-memory for demo.

## Challenges Attempted

| # | Challenge | Status | Notes |
|---|---|---|---|
| 1 | The Stories | done | 22 user stories with acceptance criteria in `/stories` |
| 2 | The Patient | done (option B) | spring-music monolith in `/legacy` |
| 3 | The Map | done | Decomposition ADR in `/decisions/001-modernization-strategy.md` |
| 4 | The Pin | done | Characterization tests in `/tests/characterization` |
| 5 | The Cut | done | Album service extracted to `/services/album-service` |
| 6 | The Fence | done | ACL in place, PreToolUse hook enforces boundary (JSON stdin, jq, blocks @Entity/@Document/albumId in routes/) |
| 7 | The Scorecard | skipped | |
| 8 | The Weekend | done | Cutover runbook in `/decisions/004-cutover-runbook.md` — 4-stage canary with gate criteria and rollback matrix |

## Key Decisions

1. **Spring Music as legacy (option B)** — multi-DB profile pattern and CF coupling are the real anti-patterns worth attacking. See `/decisions/002-spring-music-as-legacy.md`.
2. **Strangler Fig over Big-Bang rewrite** — monolith stays live; new service proven independently before any traffic shift. See `/decisions/001-modernization-strategy.md`.
3. **ACL enforced by `PreToolUse` hook + CLAUDE.md prompt** — deterministic hard block vs probabilistic preference, each for its right use case. See `/decisions/003-service-boundary.md`.
4. **Node.js for extracted service** — lower ceremony for a clean REST service, team knows it, easy to demo.

## How to Run It

```bash
# Run the legacy monolith (requires Java 17+)
cd legacy
./gradlew bootRun
# → http://localhost:8080

# Run the album service
cd services/album-service
npm install
npm start
# → http://localhost:3001

# Run characterization tests (monolith must be running on :8080)
cd tests/characterization
./run.sh

# Run contract tests (album-service must be running on :3001)
cd services/album-service
npm test
```

Requires: Java 17+, Node.js 18+. No Docker needed for demo.

## If We Had More Time

1. Complete the database-per-service split (currently sharing in-memory H2)
2. Add an API gateway / façade in front of both legacy and new service
3. Extract the storage backend selection into an `inventory-service` (the multi-DB pattern is coupling)
4. Full `PreToolUse` hook that blocks legacy field names from reaching service routes
5. CI pipeline: characterization suite as regression gate on every commit

## How We Used Claude Code

- **Legacy archaeology** — used Claude to map the profile-based `CrudRepository` implementations and rank extraction risk per seam. Matched our human analysis in 3 of 4 decisions.
- **Characterization tests** — Claude pinned actual HTTP behavior (response shapes, status codes, known edge cases) faster than writing them manually.
- **CLAUDE.md-driven boundaries** — taught Claude the ACL rule once; it respected it across all subsequent service code generations.
- **ADR writing** — Claude drafted ADR-001 and ADR-003 from a bullet list; we edited the "what we chose not to do" sections.
- **presentation.html** — generated from this README in one shot, then tweaked styling.

Biggest surprise: Claude identified the multi-DB profile pattern as the primary coupling risk — not the entity model, which we assumed going in.
