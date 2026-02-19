require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Database Connection =====
require('./db/conn');

// ===== Middleware =====
app.use(helmet({
    contentSecurityPolicy: false,  // Allow inline styles for our design
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== Static Files (Frontend) =====
app.use(express.static(path.join(__dirname), {
    extensions: ['html'],
    index: 'index.html'
}));

// ===== API Routes =====
const preferencesRouter = require('./routes/preferences');
const transcriptionsRouter = require('./routes/transcriptions');
const summarizerRouter = require('./routes/summarizer');
const analyticsRouter = require('./routes/analytics');
const aiRouter = require('./routes/ai');

app.use('/api/preferences', preferencesRouter);
app.use('/api/transcriptions', transcriptionsRouter);
app.use('/api/summarize', summarizerRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/ai', aiRouter);

// ===== Health Check =====
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// ===== Error Handling =====
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ===== Start Server =====
app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════╗
  ║   ⚡ AdaptEd Server Running         ║
  ║   http://localhost:${PORT}             ║
  ║                                      ║
  ║   API:  /api/health                  ║
  ║         /api/preferences             ║
  ║         /api/transcriptions          ║
  ║         /api/summarize               ║
  ║         /api/analytics               ║
  ║         /api/ai                       ║
  ╚══════════════════════════════════════╝
  `);
});

module.exports = app;
