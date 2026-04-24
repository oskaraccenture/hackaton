# ADR-002: Using spring-music as the Legacy Monolith (Option B)

**Status:** Accepted  
**Date:** 2026-04-24

---

## Context

The hackathon scenario requires a legacy monolith realistic enough that working on it is interesting. We had two options:

- **Option A:** Generate a custom monolith with Claude (e.g., Node.js callback hell, PHP 5, Enterprise Java 2010)
- **Option B:** Use the provided spring-music reference app (`github.com/rishikeshradhakrishnan/spring-music`)

---

## Decision

**Option B — spring-music.**

---

## Rationale

**Why Option B:**
- Real code from a real repository — archaeology tools, call-graph analysis, and characterization tests all work against actual behavior, not generated approximations
- spring-music has *authentic* anti-patterns (multi-annotation entity, CF coupling, profile-based DB wiring) rather than artificially introduced ones
- Saves 30–45 minutes that would otherwise go into generating and validating the monolith
- The CF deployment model is genuinely outdated, making the modernization story credible

**Anti-patterns present in spring-music (the "ugliness"):**
1. `Album.java` carries `@Document` (MongoDB), `@Entity` (JPA), and `@RedisHash` (Redis) simultaneously — the entity is tightly coupled to all storage backends
2. `manifest.yml` with CF service bindings — infrastructure is baked into the app config
3. Frontend (AngularJS) bundled inside the Spring Boot JAR — frontend/backend cannot scale independently
4. `spring-cloud-connectors` dependency — end-of-life library for CF service binding
5. No API contract or OpenAPI spec — consumers depend on observed behavior
6. Tests are minimal — no characterization tests exist; behavior is unpinned

---

## What We Chose NOT to Do

- **Option A (custom generation):** We would have full control over the ugliness, but we'd spend time generating and validating code instead of modernizing it. The real-world constraints in spring-music are more interesting than designed-in callback hell.
- **Using a completely different Java enterprise app:** spring-music is well-known and documented; the team can quickly understand the intent of each component.

---

## Consequences

- The domain is albums/music catalog — less business-realistic than logistics, but architecturally representative
- The team works with Gradle + Spring Boot toolchain (Java 17+ required)
- Characterization tests are HTTP-based (curl/REST files) rather than unit tests, because the multi-DB abstraction makes unit testing without Spring context impractical
