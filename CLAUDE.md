# Northwind Hackathon — Code Modernization (spring-music)

## START HERE — Hackathon Session Guide

**What is already scaffolded (do not regenerate):**
- `/legacy/` — spring-music monolith (Spring Boot, Gradle). Run: `cd legacy && ./gradlew bootRun` → `:8080`
- `/services/album-service/` — extracted Node.js service skeleton. Run: `cd services/album-service && npm install && npm start` → `:3001`
- `/services/album-service/acl/albumAdapter.js` — anti-corruption layer (Spring → clean domain)
- `/tests/characterization/run.sh` + `albums.http` — characterization test scripts
- `/services/album-service/tests/contract.test.js` — contract tests (`npm test`)
- `/decisions/001`, `002`, `003` — 3 ADRs already written
- `/stories/user-stories.md` — 4 user stories with acceptance criteria
- `CLAUDE.md` (this file), `presentation.html`, `README.md`

**What still needs to be done during the hackathon:**

| Priority | Task | Owner hint | How |
|---|---|---|---|
| 1 | Verify both apps run | All | `./gradlew bootRun` + `npm start` |
| 2 | Run characterization tests against live monolith | Tester | `cd tests/characterization && ./run.sh` |
| 3 | Run contract tests on album-service | Developer | `cd services/album-service && npm test` |
| 4 | Fill in `README.md` team names and actual results | PM | Edit directly |
| 5 | Update `presentation.html` with real team names | PM | Edit slide 1 |
| 6 | Implement `PreToolUse` hook for boundary enforcement | Developer | See ADR-003 for the hook script |
| 7 | Write ADR-004 cutover runbook | Architect | Use `/write-adr cutover-runbook` |
| 8 | (stretch) Extract a second service or add eval harness | All | Use `/extract-service` |

**First 15 minutes checklist:**
1. `cd legacy && ./gradlew bootRun` — confirm monolith starts on `:8080`
2. `cd services/album-service && npm install && npm start` — confirm service starts on `:3001`
3. `cd tests/characterization && ./run.sh` — run characterization tests, note any failures
4. `cd services/album-service && npm test` — contract tests should pass green
5. Fill in team names in `README.md` and `presentation.html`
6. Each team member opens this repo in their own Claude Code session and reads this file

**Custom commands available in this session:**
- `/extract-service <domain>` — extract a new service from the monolith
- `/characterize <endpoint>` — pin monolith HTTP behavior as characterization tests
- `/write-adr <title>` — create a new ADR in `/decisions/`

---

## Scenario

Strangler Fig extraction of the `spring-music` Spring Boot monolith (`/legacy`) toward independent microservices (`/services`). The monolith uses Spring Data with profile-based multi-database backends (H2/MySQL/PostgreSQL/MongoDB/Redis) and Cloud Foundry deployment config. New services use plain REST, no Spring, no CF.

## Repository Layout

```
/legacy             — spring-music monolith (do not refactor inline)
/services           — extracted microservices (new code only)
/tests              — characterization + contract tests
/decisions          — Architecture Decision Records (ADRs)
/stories            — user stories with acceptance criteria
presentation.html   — HTML slide deck for judging
```

## Team Conventions

- **Commits:** `type(scope): description` — types: `feat`, `fix`, `test`, `adr`, `chore`
- **Branches:** `feature/<name>`, `fix/<name>`, `adr/<number>`
- **Legacy:** Java/Spring Boot — do not convert to another language
- **New services:** Node.js/Express, async/await, no callbacks, no inline SQL
- **No comments** unless the WHY is non-obvious

## Critical Boundary Rule

**The legacy Spring data model must not leak into new service public APIs.**

Fields from `legacy/src/main/java/.../Album.java` (e.g. `id`, `title`, `artist`, `genre`, `trackCount`, `albumId`) may be re-used in domain models, but legacy Spring annotations (`@Document`, `@Entity`, `@Column`, Spring-specific naming) MUST NOT appear in service route responses.

- The anti-corruption layer lives in `services/album-service/acl/`
- This rule is enforced by a `PreToolUse` hook (see `.claude/settings.json`) AND by this CLAUDE.md
- The hook is the hard block; this prompt is the preference signal
- See `decisions/003-service-boundary.md` for the ADR on why each is which

## Code Generation Rules

- When working with legacy code: understand before changing; pin behavior first with characterization tests
- When generating service code: async/await, structured errors `{ "error": { "code": "UPPER_SNAKE", "message": "..." } }`, no Spring annotations
- Do NOT refactor legacy inline — propose extraction with an ADR first

## Testing Philosophy

- Characterization tests pin actual HTTP behavior of the monolith (bugs included)
- Contract tests live in each service directory and prove the API contract
- A failing test when a legacy annotation appears in a service response is a first-class citizen

## Claude Code Patterns

- Use Plan Mode before any extraction touching more than one file
- Custom commands: `/extract-service`, `/characterize`, `/write-adr`
- Pass scope explicitly in Task subagent calls — subagents don't inherit coordinator context
