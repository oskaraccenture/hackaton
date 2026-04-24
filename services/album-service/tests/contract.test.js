// Contract tests for album-service.
// Key assertion: response shape matches the agreed API contract,
// and NO Spring-era field names or metadata appear in responses.

const request = require('supertest');
const app = require('../index');

describe('GET /health', () => {
  test('returns service name and status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('album-service');
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('ts');
  });
});

describe('GET /albums', () => {
  test('returns array', async () => {
    const res = await request(app).get('/albums');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('each album has clean field names', async () => {
    const res = await request(app).get('/albums');
    const album = res.body[0];
    if (!album) return;

    expect(album).toHaveProperty('id');
    expect(album).toHaveProperty('title');
    expect(album).toHaveProperty('artist');

    // Spring-era fields MUST NOT appear
    expect(album).not.toHaveProperty('_class');
    expect(album).not.toHaveProperty('_id');
    expect(album).not.toHaveProperty('albumId');
    expect(album).not.toHaveProperty('release_year');
    expect(album).not.toHaveProperty('track_count');
  });
});

describe('GET /albums/:id', () => {
  test('returns album by id', async () => {
    const res = await request(app).get('/albums/a1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('a1');
    expect(res.body.title).toBe('Kind of Blue');
  });

  test('returns 404 for missing album', async () => {
    const res = await request(app).get('/albums/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ALBUM_NOT_FOUND');
  });
});

describe('POST /albums', () => {
  test('creates album and returns clean response', async () => {
    const res = await request(app)
      .post('/albums')
      .send({ title: 'Test Album', artist: 'Test Artist', releaseYear: '2024', genre: 'Test', trackCount: 5 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Test Album');
    expect(res.body).not.toHaveProperty('_class');
    expect(res.body).not.toHaveProperty('albumId');
  });

  test('returns 400 if title missing', async () => {
    const res = await request(app).post('/albums').send({ artist: 'No Title' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELD');
  });

  test('returns 400 if artist missing', async () => {
    const res = await request(app).post('/albums').send({ title: 'No Artist' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELD');
  });

  test('returns 400 for invalid releaseYear', async () => {
    const res = await request(app).post('/albums').send({ title: 'Bad Year', artist: 'X', releaseYear: '24' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FIELD');
  });
});

describe('PUT /albums/:id', () => {
  test('updates album', async () => {
    const create = await request(app).post('/albums').send({ title: 'Original', artist: 'Artist' });
    const id = create.body.id;
    const res = await request(app).put(`/albums/${id}`).send({ title: 'Updated', artist: 'Artist' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
  });

  test('returns 404 for missing album', async () => {
    const res = await request(app).put('/albums/no-such-id').send({ title: 'X', artist: 'Y' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /albums/:id', () => {
  test('deletes album', async () => {
    const create = await request(app).post('/albums').send({ title: 'To Delete', artist: 'X' });
    const id = create.body.id;
    const del = await request(app).delete(`/albums/${id}`);
    expect(del.status).toBe(204);
    const get = await request(app).get(`/albums/${id}`);
    expect(get.status).toBe(404);
  });
});
