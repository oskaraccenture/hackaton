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

## Architecture Guidance

### Bounded Contexts in the Monolith

The monolith has one real business domain. Three potential bounded contexts exist; only one is currently extracted:

| Context | Current state | Extraction candidate? |
|---|---|---|
| **Albums / Catalog** | Core entity + CRUD endpoints | Yes — already extracted to `album-service` |
| **Artists** | Free-text `String artist` field on Album | Yes — hidden aggregate; extract when Artist taxonomy is needed |
| **Genres** | Free-text `String genre` field on Album | Yes — if genre catalog/filtering is needed |
| **App Info / Platform** | `InfoController` — CF bindings, active profiles | No — operational tooling, not business domain |
| **System Diagnostics** | `ErrorController` — kill/OOM/throw endpoints | No — test harness only; remove before production |

`Artists` is the strongest next extraction candidate because it requires a **new aggregate** rather than copying the existing Album CRUD shape.

### Are Microservices the Right Target?

**Microservices are overkill for this domain at this scale.** Arguments:

- Single aggregate (`Album`), five CRUD endpoints, no inter-domain workflows
- No independent team deploying cadences that would justify separate services
- Operational overhead (service mesh, distributed tracing, service discovery) exceeds value
- Risk of **distributed monolith** — synchronous chains of services with no independent deployability

**Recommended intermediate step: Modular Monolith.**

Divide the codebase into vertical modules with hard compile-time boundaries before breaking into services:

```
spring-music/
  modules/
    catalog/      — Album entity, repository, service, controller
    artists/      — Artist entity (promoted from String field)
    genres/       — Genre taxonomy (promoted from String field)
    platform/     — Info, health, diagnostics
  shared/
    events/       — Domain events (if async flows are added later)
```

Extract a module to a standalone service only when a concrete driver exists: independent deployment cadence, different scaling profile, or team ownership boundary.

### Strangler Fig Continuation Path (current approach)

The current hackathon approach is valid as a **migration strategy**, not a target topology. To make it production-ready it requires:

1. **API Gateway** in front of both monolith and services (nginx / AWS ALB / Kong) to route traffic
2. **Feature-flag or header-based routing** to shift traffic incrementally
3. **Shared Postgres** (or replication) during cutover — monolith H2 + service SQLite is diverged state
4. **Cutover runbook** (see ADR-004 task)

### Recommended Stack Modernization

Apply these regardless of whether the target is modular monolith or microservices:

| Component | Current | Recommendation | Reason |
|---|---|---|---|
| Spring Boot 2.4.0 | EOL | Spring Boot 3.3+ or Quarkus | Security patches, virtual threads (Java 21) |
| Cloud Foundry deployment | `manifest.yml` + `VCAP_SERVICES` | Docker + Kubernetes / Cloud Run | CF is deprecated in most organizations |
| AngularJS 1.2.16 | EOL since 2021 | React or Vue 3 | No security updates |
| Multi-DB profile polymorphism | H2 / MySQL / Postgres / Mongo / Redis | Single engine (Postgres) | False flexibility; real operational risk |
| Dual identity (`albumId` + `id`) | Two fields for one identifier | Single `id` (UUID) | Eliminates ACL complexity at service boundary |
| SQLite in album-service | In-memory or file | Postgres (same as monolith) | Easier cutover, avoids data drift |

---

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
- Custom commands: `/extract-service`, `/characterize`, `/write-adr`, `/verify-memory`
- Pass scope explicitly in Task subagent calls — subagents don't inherit coordinator context

## Memory Maintenance Protocol (self-instructions)

Memory lives in: `~/.claude/projects/-home-oskarc35-workshop-claude-code-hackathon-hackaton/memory/`

**At session start:**
1. Read `MEMORY.md` index — it's auto-loaded, but verify pointers are not stale
2. If >1 day since last session, run `/verify-memory` to sync state

**During session — update memory immediately when:**
- A new ADR is written → add entry to `adr_summary.md` + update `project_state.md`
- A new service is extracted → update `project_architecture.md`
- A challenge status changes (partial → done) → update `project_state.md`
- A new convention is established or corrected → update `conventions.md`
- A new slash command or skill is available → update `skills_reference.md`

**At session end:**
- The `Stop` hook runs `memory-check.sh` automatically and prints any stale entries
- Act on every `[STALE]` or `[MISSING]` item before the session ends

**Golden rule:** If a memory file says X and the repo says Y, **the repo is truth**. Update memory, never the other way around.

## Language Rule

**All repository content must be in English** — ADRs, hook scripts, command definitions, comments, echo messages, CLAUDE.md additions. This applies regardless of the language the user writes in. Conversation happens in the user's language; the repo is always English.
