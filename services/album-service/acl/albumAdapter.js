// Anti-corruption layer: translates legacy spring-music Album data to the service domain model.
// This is the ONLY place in the service that knows about Spring-era field names or structures.
// If a Spring field name or annotation name escapes this file into a route response, the ACL has failed.

function toAlbum(row) {
  if (!row) return null;
  return {
    id: row.id || row.albumId || row._id,
    title: row.title,
    artist: row.artist,
    releaseYear: row.releaseYear || row.release_year || null,
    genre: row.genre || null,
    trackCount: row.trackCount || row.track_count || null
  };
}

function toAlbumList(rows) {
  return (rows || []).map(toAlbum).filter(Boolean);
}

function fromCreateRequest(body) {
  return {
    title: body.title,
    artist: body.artist,
    releaseYear: body.releaseYear || null,
    genre: body.genre || null,
    trackCount: body.trackCount ? parseInt(body.trackCount, 10) : null
  };
}

module.exports = { toAlbum, toAlbumList, fromCreateRequest };
