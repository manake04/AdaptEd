// ===== AdaptEd — Adaptive Accessibility Engine =====
// Express Server — hardened for demo stability

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Global Uncaught Exception Handlers — prevent server crash =====
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    // Don't exit — keep running for demo stability
});
process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
});

// ===== Middleware =====
app.use(helmet({
    contentSecurityPolicy: false,   // Allow inline styles & CDN scripts
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '1mb' })); // Reduced from 5mb for safety
app.use(express.urlencoded({ extended: true }));

// ===== Lightweight Rate Limiter (no extra dependency) =====
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 60;       // 60 requests per minute per IP

app.use('/api', (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, start: now };

    if (now - entry.start > RATE_LIMIT_WINDOW) {
        // Reset window
        entry.count = 1;
        entry.start = now;
    } else {
        entry.count++;
    }
    rateLimitMap.set(ip, entry);

    if (entry.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
});

// Clean up rate limit map every 5 minutes to prevent memory growth
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now - entry.start > RATE_LIMIT_WINDOW * 2) rateLimitMap.delete(ip);
    }
}, 300000);

// ===== Input Length Validation Middleware for POST =====
app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && req.body) {
        const textFields = ['text', 'command', 'content'];
        for (const field of textFields) {
            if (req.body[field] && typeof req.body[field] === 'string' && req.body[field].length > 50000) {
                return res.status(400).json({ error: `Field '${field}' exceeds maximum length of 50,000 characters.` });
            }
        }
    }
    next();
});

// ===== Serve Frontend Static Files =====
app.use(express.static(path.join(__dirname, 'frontend'), {
    extensions: ['html'],
    index: 'index.html'
}));

// Also serve from root directory (for script.js, style.css, index.html at root)
app.use(express.static(__dirname, {
    extensions: ['html'],
    index: 'index.html'
}));

// ===== API Routes =====
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

// ===== Health Check =====
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        version: '2.1.0',
        geminiConfigured: !!process.env.GEMINI_API_KEY,
        features: [
            'ai_summarization',
            'content_simplification',
            'command_interpretation',
            'profile_management',
            'gesture_recognition',
            'voice_commands',
            'adaptive_ui'
        ]
    });
});

// ===== AI Status Endpoint (used by frontend) =====
app.get('/api/ai/status', (req, res) => {
    res.json({
        configured: !!process.env.GEMINI_API_KEY,
        model: 'gemini-1.5-flash',
        fallback: 'extractive_local'
    });
});

// ===== 404 Handler =====
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// ===== Global Error Handler (catches async errors) =====
app.use((err, req, res, next) => {
    console.error('Server Error:', err.message || err);
    res.status(err.status || 500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ===== Start =====
app.listen(PORT, () => {
    const keyStatus = process.env.GEMINI_API_KEY ? '✅ Configured' : '⚠️  NOT SET (local fallback mode)';
    console.log(`
  ╔══════════════════════════════════════════╗
  ║   ⚡ AdaptEd v2.1 — Accessibility Engine ║
  ║   http://localhost:${PORT}                  ║
  ║                                          ║
  ║   Gemini API Key: ${keyStatus.padEnd(21)}║
  ║                                          ║
  ║   API Endpoints:                         ║
  ║     GET  /api/health                     ║
  ║     GET  /api/ai/status                  ║
  ║     POST /api/ai/summarize               ║
  ║     POST /api/ai/simplify               ║
  ║     POST /api/ai/interpret              ║
  ║     POST /api/profile/save              ║
  ║     GET  /api/profile/:userId           ║
  ╚══════════════════════════════════════════╝
    `);
});

module.exports = app;
