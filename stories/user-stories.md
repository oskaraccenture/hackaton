# User Stories — spring-music Modernization

**Strategy:** Strangler Fig extraction from Spring Boot monolith to Node.js microservices.  
**Full plan with acceptance criteria:** see `stories/modernization-plan.md`

---

## Phase 1: Understand & Stabilize
*Goal: pin legacy behavior, document coupling, set guardrails before any code is extracted.*

---

### Story 1.1 — Run the Monolith Reliably

**As a** Developer,  
**I want** a single command that starts the legacy monolith on a known port,  
**So that** every team member has the same reproducible baseline to run characterization tests against.

**Acceptance Criteria:**
- [ ] `cd legacy && ./gradlew bootRun` starts with no exception stack traces and emits `Started Application`
- [ ] `GET http://localhost:8080/albums` returns HTTP 200 with a JSON array within 10 seconds of startup
- [ ] `GET http://localhost:8080/` returns HTTP 200 (AngularJS SPA served)
- [ ] H2 in-memory profile is active by default — no external DB required
- [ ] `README.md` contains the exact startup command and Java 17+ prerequisite

---

### Story 1.2 — Pin All Album Endpoint Behaviors as Characterization Tests

**As a** Tester,  
**I want** a runnable characterization test suite asserting the exact HTTP behavior of every `AlbumController` endpoint,  
**So that** any regression introduced by extraction is caught before migration work begins.

**Acceptance Criteria:**
- [ ] `tests/characterization/run.sh` passes all assertions against `http://localhost:8080` with exit code 0
- [ ] Suite covers: `GET /albums` (200, array), `GET /albums/:id` (200 + 404), `POST /albums` (201), `PUT /albums/:id` (200), `DELETE /albums/:id` (204), `GET /` (200)
- [ ] `_class` field leak is flagged as `[KNOWN ISSUE]` in output — CI does not fail on it
- [ ] Suite exits 1 on any status code assertion failure; exits 0 otherwise
- [ ] Results recorded as a CI artefact so the baseline is reproducible

---

### Story 1.3 — Document the Monolith's Domain Model and Coupling Points

**As an** Architect,  
**I want** a written map of every coupling point in the monolith,  
**So that** the extraction team understands what must be cut before the service can stand alone.

**Acceptance Criteria:**
- [ ] ADR-002 lists all five anti-patterns: multi-DB repo bundling, `manifest.yml`+`java-cfenv-boot` CF binding, AngularJS bundled as WebJars, absence of OpenAPI spec, no characterization tests
- [ ] Coupling-point table names files that must change to break each dependency (`SpringApplicationContextInitializer.java`, `manifest.yml`, `build.gradle`, `AlbumController.java`)
- [ ] Extraction order ranked by risk: Album CRUD (Low), Storage backend (Medium), Frontend (Medium), User management (High)
- [ ] Document status `Accepted` in `decisions/002-spring-music-as-legacy.md`
- [ ] No inline changes to any file in `legacy/` in this phase

---

### Story 1.4 — Establish Team Conventions and Tooling Guardrails

**As a** Platform Engineer,  
**I want** repository conventions and a Claude Code boundary enforcement hook defined before any code is written,  
**So that** the entire extraction happens inside a consistent, enforceable guardrail.

**Acceptance Criteria:**
- [ ] `CLAUDE.md` contains: commit vocabulary, branch naming, critical boundary rule, ACL adapter location
- [ ] `.claude/hooks/pre-tool-use.sh` exits 1 with `BOUNDARY VIOLATION` when `@Document`, `@Entity`, `@Column`, or `@RedisHash` are written to `services/*/routes/`
- [ ] `.claude/settings.json` registers the hook for `Write` and `Edit` tool calls
- [ ] Manual test confirms hook blocks: simulating write of `@Entity` to a service route file returns exit code 1
- [ ] All repository text files (ADRs, CLAUDE.md, commands) are in English

---

### Story 1.5 — Record the Modernization Strategy in an ADR

**As an** Architect,  
**I want** a signed-off ADR explaining why Strangler Fig was chosen over big-bang and lift-and-shift,  
**So that** future engineers understand the rationale and the constraints that must be respected.

**Acceptance Criteria:**
- [ ] `decisions/001-modernization-strategy.md` exists with status `Accepted`
- [ ] All three strategies evaluated with explicit reasons for rejecting big-bang and lift-and-shift
- [ ] Extraction Order by Risk table with four rows: Album CRUD, Storage backend, Frontend, User management
- [ ] "What We Chose NOT to Do" rules out event sourcing, GraphQL, DB-per-service from day one, frontend rewrite in Phase 1
- [ ] Document referenced from both `CLAUDE.md` and `README.md`

---

## Phase 2: Extract
*Goal: build and prove album-service against a pinned contract. Monolith continues to serve all live traffic.*

---

### Story 2.1 — Stand Up the album-service Skeleton

**As a** Developer,  
**I want** a Node.js/Express application in `services/album-service/` that starts independently on port 3001,  
**So that** it can be developed, tested, and deployed without the monolith present.

**Acceptance Criteria:**
- [ ] `cd services/album-service && npm install && npm start` logs `album-service running on port 3001`
- [ ] `GET http://localhost:3001/health` returns HTTP 200 with `{ "service": "album-service", "status": "ok", "ts": "<ISO 8601>" }`
- [ ] `package.json` has `name: "northwind-album-service"`, `start` and `test` scripts; no Spring/Java dependency
- [ ] `GET /health` responds in under 200ms with no database call
- [ ] Service starts whether or not the monolith is running on `:8080`

---

### Story 2.2 — Implement All Five Album CRUD Endpoints

**As a** Developer,  
**I want** `routes/albums.js` to implement all five HTTP endpoints with correct semantics,  
**So that** the new service is a drop-in replacement for `AlbumController.java` at the HTTP level.

**Acceptance Criteria:**
- [ ] `GET /albums` returns HTTP 200 and a JSON array; empty catalog returns `[]` not 404
- [ ] `POST /albums` returns HTTP 201 with a server-assigned `id`; missing `title` or `artist` → 400 `MISSING_FIELD`; invalid `releaseYear` (not `/^\d{4}$/`) → 400 `INVALID_FIELD`; duplicate `title`+`artist` → 409 `DUPLICATE_ALBUM`
- [ ] `GET /albums/:id` returns HTTP 200 with album; non-existent id → 404 `ALBUM_NOT_FOUND`
- [ ] `PUT /albums/:id` applies partial-update semantics (present fields overwrite; absent fields retained); returns 200; non-existent id → 404; no upsert
- [ ] `DELETE /albums/:id` returns HTTP 204; non-existent id → 404
- [ ] All error responses: `{ "error": { "code": "UPPER_SNAKE_CASE", "message": "..." } }` — no plain-text error strings

---

### Story 2.3 — Enforce the Anti-Corruption Layer

**As an** Architect,  
**I want** `acl/albumAdapter.js` to be the only place that knows about Spring-era field names,  
**So that** `_class`, `_id`, `albumId`, `release_year`, `track_count` can never appear in a route response.

**Acceptance Criteria:**
- [ ] `acl/albumAdapter.js` exports exactly: `toAlbum(row)`, `toAlbumList(rows)`, `fromCreateRequest(body)`
- [ ] `toAlbum` maps `row.albumId || row._id` → `id`, `row.releaseYear || row.release_year` → `releaseYear`; all legacy variants handled here only
- [ ] No file in `routes/` references `albumId`, `_class`, `_id`, `release_year`, or `track_count` directly — enforced by pre-tool-use hook
- [ ] `contract.test.js` contains explicit negative assertions: `_class`, `_id`, `albumId` are NOT present on any album response
- [ ] ADR-003 (`decisions/003-service-boundary.md`) written with status `Accepted`, documenting hook vs. prompt enforcement split

---

### Story 2.4 — Write and Pass All Contract Tests

**As a** Tester,  
**I want** a Jest contract test suite covering every endpoint and every error path,  
**So that** the API contract is machine-verified on every code change.

**Acceptance Criteria:**
- [ ] `cd services/album-service && npm test` exits 0 with all tests passing
- [ ] Suite covers: `GET /health` (status, service, ts), `GET /albums` (array, clean fields), `GET /albums/a1` (correct id + title), `GET /albums/does-not-exist` (404 `ALBUM_NOT_FOUND`), `POST /albums` (201, id present, no `_class`), `POST` missing title (400 `MISSING_FIELD`), `POST` with `releaseYear: "24"` (400 `INVALID_FIELD`), `PUT` update (200), `PUT /no-such-id` (404), `DELETE` (204 then 404)
- [ ] Each test is deterministic — creates its own data; no dependency on another test's seed state
- [ ] CI fails the build if any test fails
- [ ] All Spring-internal field assertions are negative (`not.toHaveProperty`)

---

### Story 2.5 — Seed Data Parity with the Legacy Catalog

**As a** Product Manager,  
**I want** the album-service to start with the same seed catalog as the legacy monolith,  
**So that** a side-by-side demo shows the same data without manual setup.

**Acceptance Criteria:**
- [ ] `db.js` seeds at least: "Kind of Blue" (Miles Davis, id `a1`), "Nevermind" (Nirvana, id `a2`), "Abbey Road" (The Beatles, id `a3`), "Random Access Memories" (Daft Punk, id `a4`)
- [ ] Seed uses `INSERT OR IGNORE` semantics — not re-inserted on restart with persistent `DB_PATH`
- [ ] `GET /albums/a1` returns `{ "id": "a1", "title": "Kind of Blue", "artist": "Miles Davis" }` in in-memory mode
- [ ] Seed data contains no `_class` fields or Spring metadata
- [ ] `npm test` passes with seeded data present

---

### Story 2.6 — Write User Stories with Testable Acceptance Criteria

**As a** Product Manager,  
**I want** each extracted capability to have a user story with concrete, testable acceptance criteria,  
**So that** the team and judges can verify what was built against what was promised.

**Acceptance Criteria:**
- [ ] `stories/user-stories.md` contains stories for all phases organized by phase
- [ ] Each story uses "As a [role], I want [action] so that [benefit]" format
- [ ] Every acceptance criterion references a specific HTTP method, path, status code, or field name — no vague goals
- [ ] Story 2.2 names the 409 `DUPLICATE_ALBUM` error code and the `releaseYear` regex constraint
- [ ] Story 2.2 documents the `PUT` vs `PATCH` decision as tech debt

---

## Phase 3: Route
*Goal: API gateway deployed, DB migrated to Postgres, canary traffic shift, CI gate added.*

---

### Story 3.1 — Deploy an API Gateway in Front of Both Services

**As a** Platform Engineer,  
**I want** a reverse proxy routing `/albums` traffic based on a configurable weight,  
**So that** traffic can be shifted incrementally without DNS changes or client reconfiguration.

**Acceptance Criteria:**
- [ ] Gateway config in `gateway/` routes 100% of `/albums` to the legacy monolith by default (weight `legacy: 100, album-service: 0`)
- [ ] `GET <gateway>/albums` returns the same response as `GET http://localhost:8080/albums` at 100/0 weight
- [ ] Response header `X-Routed-To: legacy` or `X-Routed-To: album-service` identifies which backend served each request
- [ ] Changing weight to 50/50: approximately half of 100 sequential requests return `X-Routed-To: album-service` (within ±20%)
- [ ] All non-`/albums` paths (`/appinfo`, `/service`, `/errors/*`, `/`) always forward to legacy only

---

### Story 3.2 — Replace SQLite with Postgres in album-service

**As a** Platform Engineer,  
**I want** `album-service` to connect to a real Postgres database when `DATABASE_URL` is set,  
**So that** data is not lost on service restart and the service is ready for production load.

**Acceptance Criteria:**
- [ ] `db.js` uses `pg` driver when `DATABASE_URL` is set; falls back to `better-sqlite3` in-memory when absent
- [ ] Schema DDL runs as idempotent migration (`CREATE TABLE IF NOT EXISTS albums ...`) against Postgres without error
- [ ] All five CRUD endpoints pass `npm test` against both SQLite (no env var) and Postgres backends
- [ ] `docker-compose.yml` in `services/album-service/` starts a Postgres container with correct `DATABASE_URL`
- [ ] `SETUP.md` updated with `DATABASE_URL` format (`postgres://user:pass@host:5432/dbname`)

---

### Story 3.3 — Migrate Seed Data from Legacy to Postgres

**As a** Developer,  
**I want** a migration script that reads `legacy/src/main/resources/albums.json` and inserts it into the Postgres `albums` table,  
**So that** album-service starts with the full 28-album catalog from the monolith.

**Acceptance Criteria:**
- [ ] `scripts/migrate-seed.js` reads all 28 entries from `albums.json` and inserts with `ON CONFLICT DO NOTHING`
- [ ] After migration `GET /albums` returns exactly 28 entries
- [ ] No `_class` field in any Postgres row — migration strips it using ACL adapter logic
- [ ] Script is idempotent: running twice does not create duplicate rows
- [ ] Script exits 0 on success and 1 with a descriptive error on failure

---

### Story 3.4 — Canary Traffic Shift with CI Gate

**As a** Platform Engineer,  
**I want** a CI pipeline step that shifts 10% of traffic to album-service, runs characterization tests, and fails if any regression is detected,  
**So that** no traffic shift is promoted without evidence of behavioral equivalence.

**Acceptance Criteria:**
- [ ] CI job steps: set weight 90/10 → run `tests/characterization/run.sh <gateway-url>` → assert exit code 0 → revert to 100/0
- [ ] `run.sh` accepts a `BASE_URL` argument; CI job passes the gateway URL
- [ ] If any characterization test fails at 10% traffic, CI exits 1 and reverts weight to 100/0 in a `finally`/`post` block
- [ ] CI result visible as required PR status check named `canary-smoke`
- [ ] `X-Routed-To` header logged so the report shows which backend served each failing request

---

### Story 3.5 — Incremental Traffic Promotion to 100%

**As a** Product Manager,  
**I want** a documented runbook for promoting album-service from 10% to 100% of traffic in safe increments,  
**So that** the team can execute the cutover without an on-call incident.

**Acceptance Criteria:**
- [ ] `decisions/004-cutover-runbook.md` (ADR-004) exists with status `Draft` or `Accepted`
- [ ] Runbook defines milestones 10% → 25% → 50% → 100% with hold time (≥30 min) and rollback trigger (suite failure or error rate > 1%)
- [ ] Each milestone specifies the exact config change and verification command
- [ ] Rollback is a single command restoring 100/0 weight immediately
- [ ] Runbook references `tests/characterization/run.sh` as the smoke test that must exit 0 before promotion

---

### Story 3.6 — OpenAPI Contract Specification for album-service

**As a** Developer,  
**I want** an OpenAPI 3.0 specification for album-service,  
**So that** consumers have an explicit contract rather than relying on observed behavior.

**Acceptance Criteria:**
- [ ] `services/album-service/openapi.yml` passes `npx swagger-cli validate openapi.yml` with exit code 0
- [ ] All six paths defined: `GET /albums`, `GET /albums/{id}`, `POST /albums`, `PUT /albums/{id}`, `DELETE /albums/{id}`, `GET /health`
- [ ] `Album` schema defines exactly: `id` (string), `title` (string, required), `artist` (string, required), `releaseYear` (string, nullable, pattern `^\d{4}$`), `genre` (string, nullable), `trackCount` (integer, nullable) — no `_class`, `albumId`, `_id`, `release_year`, `track_count`
- [ ] All error responses reference the `Error` schema: `{ error: { code: string, message: string } }`
- [ ] `POST /albums` 409 response documents `code: DUPLICATE_ALBUM`

---

## Phase 4: Retire
*Goal: decommission CF deployment, archive legacy, extract SPA, remove all CF-specific files.*

---

### Story 4.1 — Remove Cloud Foundry Deployment Artifacts

**As a** Platform Engineer,  
**I want** all Cloud Foundry deployment files removed once album-service carries 100% of `/albums` traffic,  
**So that** there is no path for anyone to accidentally re-deploy the monolith to CF.

**Acceptance Criteria:**
- [ ] `legacy/manifest.yml` deleted from the active branch (or moved to `legacy/archive/manifest.yml` with archived note)
- [ ] `build.gradle` no longer contains `io.pivotal.cfenv:java-cfenv-boot`; `./gradlew build` still passes
- [ ] `SpringApplicationContextInitializer.java` deleted; `Application.java` no longer references it
- [ ] `GET http://localhost:8080/service` returns 404 or empty services array — not CF binding metadata
- [ ] Characterization suite exits 0 after the commit (album-service now serves `/albums`)

---

### Story 4.2 — Extract the AngularJS SPA into a Standalone Host

**As a** Developer,  
**I want** the AngularJS frontend extracted from `legacy/src/main/resources/static/` into a standalone directory,  
**So that** the frontend and backend can be deployed and versioned independently.

**Acceptance Criteria:**
- [ ] All frontend files moved to `frontend/` (index.html, js/*.js, css/*.css, templates/*.html)
- [ ] `frontend/js/albums.js` points `$resource` to gateway host via a single configurable base URL constant — not a hard-coded relative path
- [ ] `npx serve frontend/` serves the SPA at `http://localhost:5000/` with HTTP 200 at `GET /`
- [ ] SPA's `GET /albums` reaches the gateway without CORS errors
- [ ] Frontend files removed from `legacy/src/main/resources/static/`; `./gradlew bootRun` still starts

---

### Story 4.3 — Archive the Legacy Codebase

**As a** Platform Engineer,  
**I want** `legacy/` moved to a git-tagged archive state,  
**So that** the codebase is preserved for reference but cannot be accidentally deployed.

**Acceptance Criteria:**
- [ ] Git tag `legacy-archived-YYYYMMDD` created on the last commit before any legacy files are removed
- [ ] `legacy/CLAUDE.md` updated with `# ARCHIVED — Do not deploy` header and reference to the tag
- [ ] `legacy/` deleted from main branch (history preserved) or retained with README: "This directory is archived. Replacement is `services/album-service`."
- [ ] `tests/characterization/run.sh` updated to run against gateway host (not `:8080`) and exits 0 against the fully decommissioned stack
- [ ] `SETUP.md` no longer references `./gradlew bootRun` as a required startup step

---

### Story 4.4 — Decommission InfoController and ErrorController

**As a** Developer,  
**I want** `InfoController` (`/appinfo`, `/service`) and `ErrorController` (`/errors/*`) removed or blocked at the gateway,  
**So that** CF-specific diagnostic and crash-induction endpoints are unreachable.

**Acceptance Criteria:**
- [ ] `GET <gateway>/appinfo` returns HTTP 404 or 410 — not forwarded to any backend
- [ ] `GET <gateway>/service` returns HTTP 404 or 410 — not CF binding metadata
- [ ] `GET <gateway>/errors/kill`, `/errors/fill-heap`, `/errors/throw` return HTTP 404 or 403 from gateway; no request forwarded
- [ ] `InfoController.java` and `ErrorController.java` deleted, or gateway blocks their paths with static 404
- [ ] Regression test asserts all six paths return non-2xx; test exits 0 only when all six are blocked

---

### Story 4.5 — Post-Migration Observability and Documentation

**As a** Product Manager,  
**I want** a final state document capturing what was built, what was decommissioned, and how to operate the new system,  
**So that** engineers who were not part of the migration can maintain it without re-reading the entire ADR history.

**Acceptance Criteria:**
- [ ] `README.md` references only: `cd services/album-service && npm start`, gateway start command, `cd frontend && npx serve .`
- [ ] `README.md` or `MIGRATION-COMPLETE.md` lists every decommissioned component: `manifest.yml`, `SpringApplicationContextInitializer.java`, `InfoController.java`, `ErrorController.java`, WebJars dependencies, legacy static files
- [ ] `GET <gateway>/health` returns HTTP 200 with `{ "service": "album-service", "status": "ok" }`
- [ ] `tests/characterization/run.sh <gateway-url>` exits 0 against fully decommissioned stack (no monolith running)
- [ ] ADR-004 status updated to `Completed` with actual completion date and the `legacy-archived-YYYYMMDD` git tag

---

## Out of Scope (all phases)

- Authentication / authorization — legacy app has none; added as a separate epic after retirement
- Pagination, sorting, filtering on `GET /albums`
- Distributed tracing, Prometheus/OpenTelemetry metrics
- User management domain extraction (high risk, unclear requirements per ADR-001)
- Frontend rewrite (AngularJS → modern framework) — separate initiative after SPA is extracted
