# User Stories — spring-music Modernization

## Background

Capabilities identified from the spring-music monolith. Prioritized by extraction risk × business value.

---

## Story 1 — Browse the Album Catalog

**As a** user of the music app,  
**I want to** see a list of all albums in the catalog,  
**So that** I can browse what's available without knowing album IDs in advance.

**Acceptance Criteria:**
- [ ] `GET /albums` returns all albums as a JSON array
- [ ] Each album has: `id`, `title`, `artist`, `releaseYear`, `genre`, `trackCount`
- [ ] Empty catalog returns `[]`, HTTP 200 (not 404)
- [ ] Response does NOT include Spring-internal fields (`_class`, `_id`, Spring annotations metadata)
- [ ] Works regardless of which storage backend is active (H2/MongoDB/Redis)

**Out of scope:** Pagination, sorting, filtering by genre.

**Stakeholder note:** The frontend (AngularJS in `src/main/resources/static`) calls `GET /albums` directly. The new service must return the same field names or the frontend breaks during transition. The ACL adapter handles this.

---

## Story 2 — Add a New Album

**As an** admin user,  
**I want to** add a new album to the catalog,  
**So that** the catalog stays up to date without requiring a developer.

**Acceptance Criteria:**
- [ ] `POST /albums` with `{ title, artist, releaseYear, genre, trackCount }` creates the album
- [ ] Response is the created album with a server-assigned `id`, HTTP 201
- [ ] `title` and `artist` are required; missing either returns HTTP 400 with `{ "error": { "code": "MISSING_FIELD", ... } }`
- [ ] `releaseYear` must be 4 digits if provided; invalid year returns HTTP 400
- [ ] Duplicate check: same `title` + `artist` combination returns HTTP 409

**Out of scope:** Authentication/authorization (the legacy app has none either).

---

## Story 3 — Edit or Delete an Album

**As an** admin user,  
**I want to** update an existing album's metadata or remove it,  
**So that** mistakes and outdated entries can be corrected.

**Acceptance Criteria:**
- [ ] `PUT /albums/:id` with updated fields returns the updated album, HTTP 200
- [ ] Partial update: only provided fields are changed; omitted fields retain their values
- [ ] `DELETE /albums/:id` removes the album, returns HTTP 204
- [ ] Both operations return HTTP 404 if the album doesn't exist
- [ ] Updating a non-existent album does NOT create it (no upsert)

**Stakeholder disagreement noted:** Product wants `PATCH` semantics (partial update). Engineering says `PUT` with partial semantics is what the legacy app uses — changing to `PATCH` would break the AngularJS frontend during the transition. Decision: keep `PUT` with partial update behavior for now; document it as tech debt.

---

## Story 4 — Service Health and Observability

**As an** ops engineer,  
**I want to** check whether the album service is healthy,  
**So that** I can include it in uptime monitoring and deployment gates.

**Acceptance Criteria:**
- [ ] `GET /health` returns `{ "service": "album-service", "status": "ok", "ts": "<ISO timestamp>" }`, HTTP 200
- [ ] Response time under 200ms (no DB call in the health endpoint)
- [ ] A failing DB connection does NOT cause `/health` to return 500 (liveness vs readiness separation)
- [ ] The legacy monolith's Spring Actuator health endpoint (`/actuator/health`) is separate and not a dependency

**Out of scope:** Distributed tracing, metrics endpoint (Prometheus/OpenTelemetry — backlog).

---

## Story 5 — Retrieve a Single Album

**As a** frontend developer integrating with the album service,  
**I want to** fetch a specific album by its ID,  
**So that** I can display the album detail view without fetching the entire catalog.

**Acceptance Criteria:**
- [ ] `GET /albums/:id` returns the album as a JSON object, HTTP 200
- [ ] Response shape matches the `GET /albums` item shape: `id`, `title`, `artist`, `releaseYear`, `genre`, `trackCount`
- [ ] Request with a non-existent `:id` returns HTTP 404 with `{ "error": { "code": "ALBUM_NOT_FOUND", ... } }`
- [ ] Response does NOT include Spring-internal fields (`_class`, `albumId` as a separate key, etc.)
- [ ] The `id` field in the response matches the `:id` used in the request path

**Out of scope:** Fetching albums by title or artist (search is a separate story).

**Note:** The legacy `AlbumController` maps this to `@GetMapping("/{id}")`. The `albumAdapter.js` ACL normalises the `albumId` field to `id` before the response is sent.

---

## Story 6 — Pin Legacy Behavior Before Extraction (Characterization Tests)

**As a** developer preparing to extract a domain from the monolith,  
**I want to** have a set of characterization tests that record the monolith's actual HTTP behavior,  
**So that** any regression caused by the extraction is caught before it reaches production.

**Acceptance Criteria:**
- [ ] A characterization test suite exists for the `/albums` endpoint (`tests/characterization/albums.http`)
- [ ] The suite covers: `GET /albums` (happy path), `GET /albums/:id` (found + not found), `POST /albums` (create), `PUT /albums/:id` (update), `DELETE /albums/:id`
- [ ] `tests/characterization/run.sh` executes all tests against a running monolith on `:8080` and reports pass/fail counts
- [ ] Tests pin the response shape including field names returned by each storage backend profile (H2 default)
- [ ] The suite records actual legacy behavior — including quirks — not idealized behavior. A test is not "wrong" because the legacy response looks odd
- [ ] A new characterization test can be added via the `/characterize <endpoint>` custom command

**Out of scope:** Load testing, performance benchmarking, mutation testing.

**Stakeholder note:** Characterization tests are a safety net, not a quality gate on the legacy code. They exist to catch breakage caused by our extraction, not to validate whether the legacy behavior was correct in the first place.

---

## Story 7 — Enforce the Service Boundary (Anti-Corruption Layer)

**As a** developer working on the extracted album-service,  
**I want to** be certain that Spring-specific metadata from the legacy data model cannot reach the new service's public API responses,  
**So that** the new service has a clean, framework-independent contract that consumers can rely on.

**Acceptance Criteria:**
- [ ] All route handlers in `services/album-service/routes/` call `toAlbum()` or `toAlbumList()` from `acl/albumAdapter.js` before sending a response
- [ ] The ACL adapter strips Spring-internal fields: `_class`, `_id`, `@type` metadata, and any field starting with `spring.`
- [ ] The `albumId` legacy field is normalised to `id` by the adapter before any route sends a response
- [ ] A contract test in `services/album-service/tests/contract.test.js` asserts that `_class` and `albumId` are absent from all responses
- [ ] The `PreToolUse` hook in `.claude/hooks/pre-tool-use.sh` blocks any Write/Edit to `services/*/routes/` that contains `@Document`, `@Entity`, `@Column`, `@RedisHash`, or `spring.` — blocking the write before it happens
- [ ] If the hook fires, Claude receives a structured error and must re-route through the ACL adapter to resolve it

**Out of scope:** Validating the legacy monolith's own responses; enforcing the boundary in non-route files (tests, adapters, utilities).

**Decision reference:** ADR-003 — the hook is the hard block; CLAUDE.md prompt is the preference signal. Both are required because the hook stops violations but the prompt prevents them.

---

## Story 8 — Deploy the Album Service Independently of the Monolith

**As an** ops engineer,  
**I want to** start, stop, and redeploy the album-service without touching the legacy monolith,  
**So that** the extracted service can be iterated on and deployed at its own cadence.

**Acceptance Criteria:**
- [ ] `cd services/album-service && npm install && npm start` starts the service on port 3001 with no dependency on the monolith running
- [ ] The album-service starts successfully when the monolith is not running
- [ ] The album-service starts successfully when the monolith IS running on `:8080` (no port conflict)
- [ ] `GET /health` returns HTTP 200 within 200ms immediately after startup — no warm-up needed
- [ ] The service does not read from `legacy/` source files at runtime
- [ ] All configuration is via environment variables (`DB_PATH`, `PORT`) with safe defaults — no hardcoded paths to the legacy repo

**Out of scope:** Container/Docker packaging, CI/CD pipeline, Kubernetes deployment (these are next-phase infrastructure tasks).

**Stakeholder note:** "Independently deployable" is a necessary precondition before any traffic can be shifted. Until this story is done, the Strangler Fig pattern cannot progress beyond parallel-run mode.

---

## Story 9 — Gradually Shift Traffic from Monolith to Album Service (Strangler Fig Cutover)

**As an** architect leading the modernization,  
**I want to** route a progressively larger share of `/albums` traffic to the new album-service while the monolith remains live,  
**So that** we can validate the new service under real load before decommissioning the legacy path.

**Acceptance Criteria:**
- [ ] A cutover runbook (ADR-004) documents the traffic-shifting plan: 0% → 10% → 50% → 100% → monolith decommission
- [ ] Each traffic-shift step has a defined rollback criterion: if contract test failure rate > 1% or p99 latency > 500ms, revert to previous split
- [ ] The new service passes all characterization tests (as a proxy for "behaviorally equivalent") before any traffic is shifted
- [ ] During the transition, both endpoints are live: `legacy :8080/albums` and `album-service :3001/albums`
- [ ] After 100% cutover, `GET /albums` on the legacy monolith returns HTTP 301 or 410 (not silently serve stale data)
- [ ] The AngularJS frontend continues to work throughout the transition without code changes (field names in the new service match legacy via ACL)

**Out of scope:** API gateway implementation (scaffolded but not built), real-time traffic weighting (requires infrastructure not in scope for this hackathon).

**Decision reference:** ADR-001 — Strangler Fig was chosen specifically to enable this incremental cutover. Big-Bang would skip this story entirely and skip the safety net.

---

## Story 10 — Extract a New Domain Service Using Project Tooling

**As a** developer continuing the modernization after the Album domain is extracted,  
**I want to** have a repeatable, tooling-assisted process for extracting the next bounded context from the monolith,  
**So that** the second and third extraction take less time than the first and follow the same patterns.

**Acceptance Criteria:**
- [ ] The `/extract-service <domain>` custom command scaffolds a new service directory under `services/<domain>-service/` with: `index.js`, `routes/<domain>.js`, `acl/<domain>Adapter.js`, `tests/contract.test.js`, `package.json`
- [ ] The `/characterize <endpoint>` custom command generates a new `.http` file pinning the monolith behavior for a given endpoint
- [ ] The `/write-adr <title>` custom command creates a new ADR in `/decisions/` with the standard header template (Status, Date, Context, Decision, Rationale, Consequences)
- [ ] Each new service starts on the next available port (album-service: 3001; next service: 3002; etc.)
- [ ] The new service skeleton passes `npm test` with zero test failures immediately after scaffolding (contract tests are written against the scaffolded routes)
- [ ] CLAUDE.md documents the custom commands and is readable by a new team member who has not seen the prior session

**Out of scope:** Automatic migration of legacy Java code to Node.js; extraction of the frontend (separate epic); user management domain (high risk, unclear requirements per ADR-001).

**Note:** The candidate next domains per ADR-001 are: storage backend selection (medium risk) → frontend (medium risk) → user management (high risk). This story enables all three without prescribing which is next.
