const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use('/albums', require('./routes/albums'));

app.get('/health', (req, res) => {
  res.json({ service: 'album-service', status: 'ok', ts: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`album-service running on port ${PORT}`));
}

module.exports = app;
