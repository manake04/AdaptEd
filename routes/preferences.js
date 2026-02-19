const express = require('express');
const router = express.Router();
const Preference = require('../models/Preference');
const User = require('../models/User');

// GET /api/preferences/:userId — Load user preferences
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const prefs = await Preference.findOne({ userId });

        if (!prefs) {
            return res.json({
                theme: 'dark',
                font_size: 'normal',
                reduce_motion: false,
                is_default: true
            });
        }

        res.json({
            theme: prefs.theme,
            font_size: prefs.fontSize,
            reduce_motion: prefs.reduceMotion,
            updated_at: prefs.updatedAt,
            is_default: false
        });
    } catch (error) {
        console.error('Error loading preferences:', error);
        res.status(500).json({ error: 'Failed to load preferences' });
    }
});

// POST /api/preferences — Save/update preferences
router.post('/', async (req, res) => {
    try {
        const { userId, theme, fontSize, reduceMotion } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        // Ensure user exists
        await User.updateOne(
            { userId },
            { $set: { lastActive: new Date() }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );

        // Update preferences
        const updateData = { userId, updatedAt: new Date() };
        if (theme) updateData.theme = theme;
        if (fontSize) updateData.fontSize = fontSize;
        if (reduceMotion !== undefined) updateData.reduceMotion = reduceMotion;

        await Preference.updateOne(
            { userId },
            { $set: updateData },
            { upsert: true }
        );

        res.json({ success: true, message: 'Preferences saved' });
    } catch (error) {
        console.error('Error saving preferences:', error);
        res.status(500).json({ error: 'Failed to save preferences' });
    }
});

module.exports = router;
