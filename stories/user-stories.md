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
