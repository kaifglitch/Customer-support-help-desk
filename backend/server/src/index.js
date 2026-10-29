const express = require('express');
const ticketRoutes = require('./routes/tickets');
const metaRoutes = require('./routes/meta');

const app = express();
app.use(express.json());

app.use('/api', metaRoutes);
app.use('/api/tickets', ticketRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

// malformed JSON and unexpected errors
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
