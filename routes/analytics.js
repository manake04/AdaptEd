const express = require('express');
const router = express.Router();
const db = require('../db/database');

// POST /api/analytics/event — Log a feature usage event
router.post('/event', (req, res) => {
    try {
        const { userId, eventType, feature, metadata } = req.body;

        if (!eventType || !feature) {
            return res.status(400).json({ error: 'eventType and feature are required' });
        }

        db.prepare(`
      INSERT INTO analytics (user_id, event_type, feature, metadata)
      VALUES (?, ?, ?, ?)
    `).run(userId || null, eventType, feature, metadata ? JSON.stringify(metadata) : null);

        res.json({ success: true });
    } catch (error) {
        console.error('Error logging event:', error);
        res.status(500).json({ error: 'Failed to log event' });
    }
});

// GET /api/analytics/stats — Get aggregated usage statistics
router.get('/stats', (req, res) => {
    try {
        // Feature usage counts
        const featureStats = db.prepare(`
      SELECT feature, COUNT(*) as usage_count,
             COUNT(DISTINCT user_id) as unique_users
      FROM analytics
      GROUP BY feature
      ORDER BY usage_count DESC
    `).all();

        // Recent activity (last 24 hours)
        const recentActivity = db.prepare(`
      SELECT feature, event_type, COUNT(*) as count
      FROM analytics
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY feature, event_type
      ORDER BY count DESC
    `).all();

        // Total users
        const totalUsers = db.prepare(`SELECT COUNT(*) as count FROM users`).get();

        // Total events
        const totalEvents = db.prepare(`SELECT COUNT(*) as count FROM analytics`).get();

        // Events per day (last 7 days)
        const dailyStats = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as events
      FROM analytics
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all();

        res.json({
            feature_stats: featureStats,
            recent_activity: recentActivity,
            total_users: totalUsers.count,
            total_events: totalEvents.count,
            daily_stats: dailyStats
        });
    } catch (error) {
        console.error('Error loading stats:', error);
        res.status(500).json({ error: 'Failed to load statistics' });
    }
});

// GET /api/analytics/dashboard — Simple dashboard data
router.get('/dashboard', (req, res) => {
    try {
        const stats = {
            users: db.prepare(`SELECT COUNT(*) as count FROM users`).get().count,
            transcriptions: db.prepare(`SELECT COUNT(*) as count FROM transcriptions`).get().count,
            summaries: db.prepare(`SELECT COUNT(*) as count FROM summaries`).get().count,
            events: db.prepare(`SELECT COUNT(*) as count FROM analytics`).get().count,
            most_used_feature: db.prepare(`
        SELECT feature, COUNT(*) as count FROM analytics
        GROUP BY feature ORDER BY count DESC LIMIT 1
      `).get() || { feature: 'none', count: 0 }
        };

        res.json(stats);
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

module.exports = router;
