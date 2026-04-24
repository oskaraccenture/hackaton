# New Services — Context

Microservices extracted from the spring-music monolith. No Spring, no Cloud Foundry.

## Rules

- **async/await only** — no callbacks
- **No Spring annotations in API responses** — use the ACL adapter
- **Structured errors:** `{ "error": { "code": "UPPER_SNAKE", "message": "Human readable" } }`
- **Contract tests** live in the service directory, not in `/tests`
- **Each service runs independently** — own `package.json`, own port

## Domain model mapping (legacy → service)

The legacy `Album.java` fields map to clean service fields as follows:

| Legacy field | Service field | Notes |
|---|---|---|
| `albumId` | `id` | Spring uses `albumId` for some backends |
| `title` | `title` | same |
| `artist` | `artist` | same |
| `releaseYear` | `releaseYear` | same |
| `genre` | `genre` | same |
| `trackCount` | `trackCount` | same |

The difference is NOT in field names (they're mostly clean) but in the Spring annotations and CF-specific metadata that must not leak into responses.

## Anti-Corruption Layer

Each service has `acl/` that translates legacy backend responses to domain objects. The ACL is the ONLY place that knows about Spring-specific structures.

## Service ports

| Service | Port |
|---|---|
| album-service | 3001 |
| (future) user-service | 3002 |
