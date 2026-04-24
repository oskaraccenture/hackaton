const express = require('express');
const router = express.Router();
const { query, run, get, generateId } = require('../db');
const { toAlbum, toAlbumList, fromCreateRequest } = require('../acl/albumAdapter');

const apiError = (code, message) => ({ error: { code, message } });

// GET /albums
router.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM albums ORDER BY artist, title');
    res.json(toAlbumList(rows));
  } catch (e) {
    res.status(500).json(apiError('INTERNAL_ERROR', e.message));
  }
});

// GET /albums/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await get('SELECT * FROM albums WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json(apiError('ALBUM_NOT_FOUND', `Album ${req.params.id} not found`));
    res.json(toAlbum(row));
  } catch (e) {
    res.status(500).json(apiError('INTERNAL_ERROR', e.message));
  }
});

// POST /albums
router.post('/', async (req, res) => {
  try {
    const { title, artist, releaseYear } = req.body;
    if (!title) return res.status(400).json(apiError('MISSING_FIELD', 'title is required'));
    if (!artist) return res.status(400).json(apiError('MISSING_FIELD', 'artist is required'));
    if (releaseYear && !/^\d{4}$/.test(releaseYear)) {
      return res.status(400).json(apiError('INVALID_FIELD', 'releaseYear must be a 4-digit year'));
    }

    const existing = await get('SELECT id FROM albums WHERE title = ? AND artist = ?', [title, artist]);
    if (existing) return res.status(409).json(apiError('DUPLICATE_ALBUM', `Album "${title}" by ${artist} already exists`));

    const data = fromCreateRequest(req.body);
    const id = generateId();
    await run(
      'INSERT INTO albums (id, title, artist, releaseYear, genre, trackCount) VALUES (?,?,?,?,?,?)',
      [id, data.title, data.artist, data.releaseYear, data.genre, data.trackCount]
    );
    const row = await get('SELECT * FROM albums WHERE id = ?', [id]);
    res.status(201).json(toAlbum(row));
  } catch (e) {
    res.status(500).json(apiError('INTERNAL_ERROR', e.message));
  }
});

// PUT /albums/:id  (partial update semantics — matches legacy behavior)
router.put('/:id', async (req, res) => {
  try {
    const existing = await get('SELECT * FROM albums WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json(apiError('ALBUM_NOT_FOUND', `Album ${req.params.id} not found`));

    const updates = fromCreateRequest({ ...existing, ...req.body });
    await run(
      'UPDATE albums SET title=?, artist=?, releaseYear=?, genre=?, trackCount=? WHERE id=?',
      [updates.title, updates.artist, updates.releaseYear, updates.genre, updates.trackCount, req.params.id]
    );
    const row = await get('SELECT * FROM albums WHERE id = ?', [req.params.id]);
    res.json(toAlbum(row));
  } catch (e) {
    res.status(500).json(apiError('INTERNAL_ERROR', e.message));
  }
});

// DELETE /albums/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await get('SELECT id FROM albums WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json(apiError('ALBUM_NOT_FOUND', `Album ${req.params.id} not found`));
    await run('DELETE FROM albums WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (e) {
    res.status(500).json(apiError('INTERNAL_ERROR', e.message));
  }
});

module.exports = router;
