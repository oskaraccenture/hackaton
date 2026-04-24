# Spring Music → Music Catalog System: Modernization Plan

**Strategy:** Strangler Fig extraction — monolith stays live throughout all four phases.  
**Legend:** Every acceptance criterion is a binary pass/fail gate.

---

## Phase Summary

| Phase | Goal | Duration | Key Deliverable | CI Gate |
|---|---|---|---|---|
| 1 — Understand & Stabilize | Pin legacy behavior, document coupling, set guardrails | 1 week | Characterization suite passing; 3 ADRs written | Characterization suite on every commit |
| 2 — Extract | album-service proven in isolation, ACL enforced, contract tested | 1–2 weeks | `npm test` all green; ADR-003; user stories | Contract tests on every PR |
| 3 — Route | Gateway deployed, DB migrated to Postgres, canary traffic shift | 2–3 weeks | Gateway config; ADR-004 cutover runbook; openapi.yml | Canary smoke test required on every release |
| 4 — Retire | CF artifacts removed, SPA extracted, legacy archived | 1–2 weeks | `legacy-archived-YYYYMMDD` git tag; characterization suite passing against gateway only | Retired-endpoints test exits 0 |

---

## Cross-Phase Dependencies

- Phase 2 cannot start until characterization suite (Phase 1) exits 0.
- Phase 3 cannot shift any live traffic until `npm test` (Phase 2) exits 0.
- Phase 4 retirement of any CF artifact requires the gateway to carry 100% of traffic and the Phase 3 canary CI gate to have passed at each milestone.
- The `pre-tool-use.sh` hook from Phase 1 Story 1.4 must remain active for the entire duration of Phases 2 and 3.

---

## Phase 1: Understand & Stabilize

**Goal:** Pin the monolith's observable behavior so that any regression is caught immediately. Establish team conventions and guardrails before any code is extracted.

**Duration:** 1 week

---

### Story 1.1 — Run the Monolith Reliably

*As a **Developer**, I want a single command that starts the legacy monolith on a known port, so that every team member has the same reproducible baseline to run characterization tests against.*

**Acceptance Criteria:**
- `cd legacy && ./gradlew bootRun` starts successfully and emits `Started Application` in stdout with no exception stack traces.
- `GET http://localhost:8080/albums` returns HTTP 200 with a JSON array containing at least one album entry within 10 seconds of startup.
- `GET http://localhost:8080/` returns HTTP 200 (the AngularJS SPA index.html is served).
- The H2 in-memory profile is active by default (no external DB required); confirmed by `GET http://localhost:8080/appinfo` returning a `profiles` field containing `"in-memory"` or empty (JPA default).
- The project README contains the exact startup command and Java version prerequisite (Java 17+).

---

### Story 1.2 — Pin All Album Endpoint Behaviors as Characterization Tests

*As a **Tester**, I want a runnable characterization test suite that asserts the exact HTTP behavior of every `AlbumController` endpoint, so that any future change to the monolith is caught before migration work begins.*

**Acceptance Criteria:**
- `tests/characterization/run.sh` passes all assertions against `http://localhost:8080` with exit code 0.
- The suite covers: `GET /albums` (200, array, all six fields present), `GET /albums/:id` (200 with correct id), `GET /albums/nonexistent-id` (404), `POST /albums` (201 or 200, id present), `PUT /albums/:id` (200), `DELETE /albums/:id` (204 or 200), and `GET /` (200).
- The `_class` field leak is documented as a known issue: the script prints `[KNOWN ISSUE] GET /albums leaks '_class' Spring metadata` when the field is present; the CI run does not fail on this — it is flagged, not fixed, in this phase.
- The suite exits 1 if any status code assertion fails; 0 if all pass (even with the `_class` annotation).
- Results are recorded in a file or CI artefact so the baseline is reproducible.

---

### Story 1.3 — Document the Monolith's Domain Model and Coupling Points

*As an **Architect**, I want a written map of every coupling point in the monolith, so that the extraction team understands what must be cut before the service can stand alone.*

**Acceptance Criteria:**
- ADR-002 (`decisions/002-spring-music-as-legacy.md`) is written and lists all five known anti-patterns: (1) multi-DB coupling — all three repository classes (JPA/MongoDB/Redis) bundled in one JAR with profile-based activation; (2) `manifest.yml` + `java-cfenv-boot` CF service binding; (3) AngularJS SPA bundled in the JAR as WebJars; (4) `java-cfenv-boot` tying deployment to Cloud Foundry; (5) absence of any OpenAPI contract.
- A coupling-point table is present identifying which files must change to break each dependency: `SpringApplicationContextInitializer.java`, `manifest.yml`, `build.gradle` (WebJars block + `java-cfenv-boot`), `AlbumController.java`.
- The document is in `decisions/` with filename `002-spring-music-as-legacy.md` and status `Accepted`.
- The document names the extraction order ranked by risk (Album CRUD: Low; Storage backend selection: Medium; Frontend: Medium; User management: High).
- No inline changes are made to any file in `legacy/` in this phase.

---

### Story 1.4 — Establish Team Conventions and Tooling Guardrails

*As a **Platform Engineer**, I want repository conventions and a Claude Code boundary enforcement hook defined before any code is written, so that the entire extraction happens inside a consistent, enforceable guardrail.*

**Acceptance Criteria:**
- `CLAUDE.md` at the repo root contains: commit type vocabulary (`feat`, `fix`, `test`, `adr`, `chore`), branch naming (`feature/<name>`, `fix/<name>`, `adr/<number>`), the critical boundary rule (no Spring annotations in service route responses), and the location of the ACL adapter (`services/album-service/acl/albumAdapter.js`).
- `.claude/hooks/pre-tool-use.sh` exists and, when called with a file path matching `services/*/routes/` and content containing `@Document`, `@Entity`, `@Column`, or `@RedisHash`, exits with code 1 and prints `BOUNDARY VIOLATION: Spring annotation detected in service route.`
- `.claude/settings.json` registers the hook for `Write` and `Edit` tool calls.
- A manual test of the hook confirms it blocks: simulating a write of `@Entity` to `services/album-service/routes/test.js` returns exit code 1.
- All repository text files (ADRs, CLAUDE.md, hook scripts, command definitions) are in English.

---

### Story 1.5 — Record the Modernization Strategy in an ADR

*As an **Architect**, I want a signed-off ADR explaining why Strangler Fig was chosen over big-bang rewrite and lift-and-shift, so that future engineers understand the rationale and the constraints.*

**Acceptance Criteria:**
- `decisions/001-modernization-strategy.md` exists with status `Accepted`.
- The document evaluates all three strategies (Big-Bang, Lift-and-Shift, Strangler Fig) and explicitly names why each rejected option fails for this system.
- An "Extraction Order by Risk" table is present with four rows: Album CRUD, Storage backend selection, Frontend, User management.
- The "What We Chose NOT to Do" section explicitly rules out event sourcing, GraphQL, database-per-service from day one, and frontend rewrite in Phase 1.
- The document is referenced from `CLAUDE.md` and `README.md`.

---

## Phase 2: Extract

**Goal:** Build and prove `album-service` against a pinned contract. The monolith continues to serve all live traffic. The extracted service is proven in isolation first.

**Duration:** 1–2 weeks

---

### Story 2.1 — Stand Up the album-service Skeleton

*As a **Developer**, I want a Node.js/Express application in `services/album-service/` that starts independently on port 3001, so that it can be developed, tested, and deployed without the monolith present.*

**Acceptance Criteria:**
- `cd services/album-service && npm install && npm start` starts the service and logs `album-service running on port 3001`.
- `GET http://localhost:3001/health` returns HTTP 200 with body `{ "service": "album-service", "status": "ok", "ts": "<ISO 8601 timestamp>" }`.
- `package.json` has `name: "northwind-album-service"`, a `start` script, and a `test` script; it references no Spring or Java dependency.
- `GET /health` responds in under 200ms with no database call (timing assertion in `contract.test.js`).
- Starting the service does not require the monolith to be running; both can run simultaneously without port conflict.

---

### Story 2.2 — Implement All Five Album CRUD Endpoints

*As a **Developer**, I want `services/album-service/routes/albums.js` to implement all five HTTP endpoints with correct semantics, so that the new service is a drop-in replacement for `AlbumController.java` at the HTTP level.*

**Acceptance Criteria:**
- `GET /albums` returns HTTP 200 and a JSON array; empty catalog returns `[]` not 404.
- `POST /albums` with `{ title, artist, releaseYear, genre, trackCount }` returns HTTP 201 with a server-assigned `id`. Missing `title` or `artist` → 400 `MISSING_FIELD`. Invalid `releaseYear` (not `/^\d{4}$/`) → 400 `INVALID_FIELD`. Duplicate `title` + `artist` → 409 `DUPLICATE_ALBUM`.
- `PUT /albums/:id` applies partial-update semantics (fields present overwrite; absent fields are retained) and returns HTTP 200. Non-existent id → 404. No upsert.
- `DELETE /albums/:id` returns HTTP 204 with empty body. Non-existent id → 404.
- All error responses conform to `{ "error": { "code": "UPPER_SNAKE_CASE", "message": "..." } }` — no plain-text error strings.

---

### Story 2.3 — Enforce the Anti-Corruption Layer

*As an **Architect**, I want the ACL adapter in `acl/albumAdapter.js` to be the only place that knows about Spring-era field names, so that `_class`, `_id`, `albumId`, `release_year`, `track_count` can never appear in a route response.*

**Acceptance Criteria:**
- `acl/albumAdapter.js` exports exactly: `toAlbum(row)`, `toAlbumList(rows)`, `fromCreateRequest(body)`.
- `toAlbum` maps `row.albumId || row._id` → `id`, `row.releaseYear || row.release_year` → `releaseYear`, `row.trackCount || row.track_count` → `trackCount`. All legacy field name variants are handled here and nowhere else.
- No file in `routes/` references `albumId`, `_class`, `_id`, `release_year`, or `track_count` directly. The pre-tool-use hook enforces this mechanically.
- `contract.test.js` contains explicit assertions that `_class`, `_id`, `albumId`, `release_year`, and `track_count` are NOT present on any album response object.
- ADR-003 (`decisions/003-service-boundary.md`) is written with status `Accepted`, explaining the PreToolUse hook vs. CLAUDE.md prompt enforcement split.

---

### Story 2.4 — Write and Pass All Contract Tests

*As a **Tester**, I want a Jest contract test suite that covers every endpoint and every error path, so that the API contract is machine-verified on every code change.*

**Acceptance Criteria:**
- `cd services/album-service && npm test` exits with code 0 and all tests pass.
- The suite covers: `GET /health` (status, service name, ts field), `GET /albums` (array shape, clean field names), `GET /albums/a1` (correct id and title "Kind of Blue"), `GET /albums/does-not-exist` (404 `ALBUM_NOT_FOUND`), `POST /albums` (201, id present, no `_class`, no `albumId`), `POST /albums` missing title (400 `MISSING_FIELD`), `POST /albums` with `releaseYear: "24"` (400 `INVALID_FIELD`), `PUT /albums/:id` (200, updated title), `PUT /albums/no-such-id` (404), `DELETE /albums/:id` (204 then 404 on re-fetch).
- Each test is deterministic: creates its own data, does not depend on seed state from another test.
- The CI job fails the build if any test fails.
- All Spring-internal field assertions are negative (`not.toHaveProperty`).

---

### Story 2.5 — Seed Data Parity with the Legacy Catalog

*As a **Product Manager**, I want the album-service to start with the same seed catalog as the legacy monolith, so that a side-by-side demo shows the same data without manual setup.*

**Acceptance Criteria:**
- `db.js` seeds the database with at least four albums: "Kind of Blue" (Miles Davis, id `a1`), "Nevermind" (Nirvana, id `a2`), "Abbey Road" (The Beatles, id `a3`), "Random Access Memories" (Daft Punk, id `a4`).
- Seed data is not re-inserted on restart if a persistent `DB_PATH` is configured (`INSERT OR IGNORE` semantics).
- `GET /albums/a1` returns `{ "id": "a1", "title": "Kind of Blue", "artist": "Miles Davis" }` in in-memory mode.
- The seed does not contain `_class` fields or any other Spring metadata.
- `npm test` passes with the seeded data present.

---

### Story 2.6 — Write User Stories with Testable Acceptance Criteria

*As a **Product Manager**, I want each extracted capability to have a user story with concrete, testable acceptance criteria in `stories/user-stories.md`, so that the team and judges can verify what was built against what was promised.*

**Acceptance Criteria:**
- `stories/user-stories.md` contains at least four stories: Browse the Album Catalog, Add a New Album, Edit or Delete an Album, Service Health and Observability.
- Each story uses the format "As a [role], I want [action] so that [benefit]".
- Every acceptance criterion references a specific HTTP method, path, status code, or field name — no vague goals.
- Story 2 (Add Album) names the 409 `DUPLICATE_ALBUM` error code and the `releaseYear` regex constraint.
- Story 3 (Edit/Delete) documents the decision to keep `PUT` with partial semantics as tech debt.

---

## Phase 3: Route

**Goal:** Put an API gateway in front of both systems. Shift album traffic from the monolith to album-service incrementally. Split the database to Postgres. Add a CI canary gate.

**Duration:** 2–3 weeks

---

### Story 3.1 — Deploy an API Gateway in Front of Both Services

*As a **Platform Engineer**, I want a reverse proxy sitting in front of both services that routes `/albums` traffic based on a configurable weight, so that traffic can be shifted incrementally without DNS changes.*

**Acceptance Criteria:**
- A gateway config file exists in `gateway/` routing 100% of `/albums` to the legacy monolith by default (weight `legacy: 100, album-service: 0`).
- `GET <gateway>/albums` returns the same response as `GET http://localhost:8080/albums` at 100/0 weight.
- The gateway adds a response header `X-Routed-To: legacy` or `X-Routed-To: album-service` so tests can identify which backend served each request.
- Changing weight to 50/50 causes approximately half of 100 sequential requests to return `X-Routed-To: album-service` (within ±20% tolerance).
- All non-`/albums` traffic (`/appinfo`, `/service`, `/errors/*`, `/`) is always forwarded to the legacy monolith exclusively.

---

### Story 3.2 — Replace SQLite with Postgres in album-service

*As a **Platform Engineer**, I want `album-service` to connect to a real Postgres database when `DATABASE_URL` is set, so that data is not lost on service restart.*

**Acceptance Criteria:**
- `db.js` switches to the `pg` driver when `DATABASE_URL` is set; falls back to `better-sqlite3` in-memory when absent.
- The schema DDL runs as an idempotent migration (`CREATE TABLE IF NOT EXISTS albums ...`) against Postgres without error.
- All five CRUD endpoints pass `npm test` against both SQLite (no `DATABASE_URL`) and Postgres backends.
- A `docker-compose.yml` is added to `services/album-service/` that starts a Postgres container and sets `DATABASE_URL`.
- `SETUP.md` is updated with the `DATABASE_URL` format (`postgres://user:pass@host:5432/dbname`).

---

### Story 3.3 — Migrate Seed Data from Legacy to Postgres

*As a **Developer**, I want a migration script that reads `legacy/src/main/resources/albums.json` and inserts it into the Postgres `albums` table, so that album-service starts with the full 28-album catalog.*

**Acceptance Criteria:**
- `scripts/migrate-seed.js` reads all 28 entries from `albums.json` and inserts them using `ON CONFLICT DO NOTHING` semantics.
- After migration, `GET /albums` returns a JSON array with exactly 28 entries.
- No `_class` field appears in any Postgres row; the migration strips it (reusing the ACL adapter logic).
- The script is idempotent: running it twice does not create duplicate rows.
- The script exits 0 on success and 1 with a descriptive error on failure.

---

### Story 3.4 — Canary Traffic Shift with CI Gate

*As a **Platform Engineer**, I want a CI pipeline step that shifts 10% of `/albums` traffic to album-service, runs the characterization test suite against the gateway, and fails the pipeline if any regression is detected.*

**Acceptance Criteria:**
- A CI job exists with steps: set gateway weight to 90/10, run `tests/characterization/run.sh <gateway-url>`, assert exit code 0, revert weight to 100/0.
- `run.sh` accepts a `BASE_URL` argument; the CI job passes the gateway URL.
- If any characterization test fails at 10% traffic, the CI job exits 1 and reverts weight to 100/0 in a `finally`/`post` block.
- The CI job result is visible as a required PR status check named `canary-smoke`.
- The `X-Routed-To` header is logged so the test report shows which backend served each failing request.

---

### Story 3.5 — Incremental Traffic Promotion to 100%

*As a **Product Manager**, I want a documented runbook for promoting album-service from 10% to 100% of traffic in safe increments, so that the team can execute the cutover without an incident.*

**Acceptance Criteria:**
- `decisions/004-cutover-runbook.md` (ADR-004) exists with status `Draft` or `Accepted`.
- The runbook defines milestones: 10% → 25% → 50% → 100%, each with a hold time (30 minutes minimum) and a rollback trigger (characterization suite failure or error rate > 1% on `X-Routed-To: album-service`).
- Each milestone step specifies the exact config change and verification command.
- The rollback procedure is a single command that restores 100/0 weight immediately.
- The runbook references `tests/characterization/run.sh` as the smoke test that must exit 0 before promotion to the next milestone.

---

### Story 3.6 — OpenAPI Contract Specification for album-service

*As a **Developer**, I want an OpenAPI 3.0 specification file for album-service, so that consumers have an explicit contract rather than relying on observed behavior — fixing the anti-pattern identified in ADR-002.*

**Acceptance Criteria:**
- `services/album-service/openapi.yml` exists and passes `npx swagger-cli validate openapi.yml` with exit code 0.
- All six paths are defined: `GET /albums`, `GET /albums/{id}`, `POST /albums`, `PUT /albums/{id}`, `DELETE /albums/{id}`, `GET /health`.
- The `Album` schema defines exactly six fields: `id` (string), `title` (string, required), `artist` (string, required), `releaseYear` (string, nullable, pattern `^\d{4}$`), `genre` (string, nullable), `trackCount` (integer, nullable). No `_class`, `albumId`, `_id`, `release_year`, `track_count` fields appear.
- Each error response references the `Error` schema: `{ error: { code: string, message: string } }`.
- The `POST /albums` 409 response documents `code: DUPLICATE_ALBUM`.

---

## Phase 4: Retire

**Goal:** Decommission the Cloud Foundry deployment, archive the legacy codebase, extract the AngularJS SPA into a standalone host, and remove all CF-specific files.

**Duration:** 1–2 weeks

---

### Story 4.1 — Remove Cloud Foundry Deployment Artifacts

*As a **Platform Engineer**, I want all Cloud Foundry deployment files removed from the active codebase once album-service carries 100% of `/albums` traffic, so that there is no path for anyone to accidentally re-deploy the monolith to CF.*

**Acceptance Criteria:**
- `legacy/manifest.yml` is deleted from the active branch (or moved to `legacy/archive/manifest.yml` with an archived note).
- `build.gradle` no longer contains `io.pivotal.cfenv:java-cfenv-boot`; removing it does not break `./gradlew build`.
- `SpringApplicationContextInitializer.java` is deleted; `Application.java` no longer references it.
- `GET http://localhost:8080/service` returns 404 or an empty services array — not CF binding metadata.
- The characterization suite still exits 0 after the commit (the `/albums` path is now served by album-service anyway).

---

### Story 4.2 — Extract the AngularJS SPA into a Standalone Host

*As a **Developer**, I want the AngularJS frontend extracted from `legacy/src/main/resources/static/` into a separate directory that can be served independently, so that the frontend and backend can be deployed and versioned independently.*

**Acceptance Criteria:**
- All frontend files are copied to `frontend/` (index.html, js/*.js, css/*.css, templates/*.html).
- `frontend/js/albums.js` points `$resource` to the gateway host via a single configurable base URL constant, not a hard-coded relative path.
- `npx serve frontend/` serves the SPA at `http://localhost:5000/` with HTTP 200 at `GET /`.
- The SPA's `GET /albums` call reaches the gateway without CORS errors (gateway configured with `Access-Control-Allow-Origin: *` or the correct origin).
- The frontend files are removed from `legacy/src/main/resources/static/`; `./gradlew bootRun` still starts without them.

---

### Story 4.3 — Archive the Legacy Codebase

*As a **Platform Engineer**, I want the `legacy/` directory moved to a git-tagged archive state, so that the codebase is preserved for reference but cannot be accidentally deployed.*

**Acceptance Criteria:**
- A git tag `legacy-archived-YYYYMMDD` is created on the last commit before any legacy files are removed.
- `legacy/CLAUDE.md` is updated with header `# ARCHIVED — Do not deploy` and a note referencing the tag and date.
- `legacy/` is either deleted from main (history preserved in git) or retained with a README stating "This directory is archived. The replacement is `services/album-service`."
- `tests/characterization/run.sh` is updated to run against the gateway host (not `:8080`) and passes with exit code 0 against the fully decommissioned stack.
- `SETUP.md` no longer references `./gradlew bootRun` as a required startup step.

---

### Story 4.4 — Decommission InfoController and ErrorController

*As a **Developer**, I want `InfoController` (`/appinfo`, `/service`) and `ErrorController` (`/errors/*`) removed or blocked at the gateway, so that CF-specific diagnostic and crash-induction endpoints are not reachable.*

**Acceptance Criteria:**
- `GET <gateway>/appinfo` returns HTTP 404 or 410; it does not reach a backend service.
- `GET <gateway>/service` returns HTTP 404 or 410; it does not return CF service binding metadata.
- `GET <gateway>/errors/kill`, `/errors/fill-heap`, `/errors/throw` return HTTP 404 or 403 from the gateway; no request is forwarded to any backend.
- `InfoController.java` and `ErrorController.java` are either deleted or the gateway explicitly blocks their paths with a static 404.
- A regression test in `tests/characterization/` asserts all six paths return non-2xx; the test exits 0 only when all six are blocked.

---

### Story 4.5 — Post-Migration Observability and Documentation

*As a **Product Manager**, I want a final state document that captures what was built, what was decommissioned, and how to operate the new system, so that engineers can maintain it without re-reading the entire ADR history.*

**Acceptance Criteria:**
- `README.md` references only: `cd services/album-service && npm start`, the gateway start command, and `cd frontend && npx serve .`.
- A `MIGRATION-COMPLETE.md` (or equivalent README section) lists every decommissioned component: `manifest.yml`, `SpringApplicationContextInitializer.java`, `InfoController.java`, `ErrorController.java`, WebJars dependencies, legacy static files.
- `GET <gateway>/health` returns HTTP 200 with `{ "service": "album-service", "status": "ok" }`.
- `tests/characterization/run.sh <gateway-url>` passes all album CRUD assertions against the fully decommissioned stack (no monolith running) with exit code 0.
- ADR-004 (`decisions/004-cutover-runbook.md`) status is updated to `Completed` with the actual completion date and the git tag of the archived legacy codebase.
