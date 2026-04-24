const Database = require('better-sqlite3');

let _db = null;

function getDb() {
  if (!_db) {
    _db = new Database(process.env.DB_PATH || ':memory:');
    _db.pragma('journal_mode = WAL');
    _initSchema(_db);
    if (!process.env.DB_PATH) _seedData(_db);
  }
  return _db;
}

async function query(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

async function run(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}

async function get(sql, params = []) {
  return getDb().prepare(sql).get(...params);
}

function _initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      releaseYear TEXT,
      genre TEXT,
      trackCount INTEGER
    );
  `);
}

function _seedData(db) {
  const seed = [
    { id: 'a1', title: 'Kind of Blue', artist: 'Miles Davis', releaseYear: '1959', genre: 'Jazz', trackCount: 5 },
    { id: 'a2', title: 'Nevermind', artist: 'Nirvana', releaseYear: '1991', genre: 'Rock', trackCount: 13 },
    { id: 'a3', title: 'Abbey Road', artist: 'The Beatles', releaseYear: '1969', genre: 'Rock', trackCount: 17 },
    { id: 'a4', title: 'Random Access Memories', artist: 'Daft Punk', releaseYear: '2013', genre: 'Electronic', trackCount: 13 }
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO albums (id, title, artist, releaseYear, genre, trackCount) VALUES (?,?,?,?,?,?)');
  seed.forEach(a => stmt.run(a.id, a.title, a.artist, a.releaseYear, a.genre, a.trackCount));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

module.exports = { query, run, get, generateId };
