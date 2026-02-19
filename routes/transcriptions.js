const express = require('express');
const router = express.Router();
const Transcription = require('../models/Transcription');
const User = require('../models/User');

// GET /api/transcriptions/:userId — List saved transcriptions
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        const transcriptions = await Transcription.find({ userId })
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit);

        const total = await Transcription.countDocuments({ userId });

        // Map to match frontend expected format if needed, or update frontend to match schema
        // Frontend expects: id, text, language, duration_seconds, word_count, created_at
        const formatted = transcriptions.map(t => ({
            id: t._id,
            text: t.text,
            language: t.language,
            duration_seconds: t.durationSeconds,
            word_count: t.text.split(/\s+/).length,
            created_at: t.createdAt
        }));

        res.json({
            transcriptions: formatted,
            total,
            limit,
            offset
        });
    } catch (error) {
        console.error('Error loading transcriptions:', error);
        res.status(500).json({ error: 'Failed to load transcriptions' });
    }
});

// POST /api/transcriptions — Save a transcription
router.post('/', async (req, res) => {
    try {
        const { userId, text, language, durationSeconds } = req.body;

        if (!userId || !text) {
            return res.status(400).json({ error: 'userId and text are required' });
        }

        // Ensure user exists
        await User.updateOne(
            { userId },
            { $set: { lastActive: new Date() }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );

        const transcription = new Transcription({
            userId,
            text,
            language: language || 'en-US',
            durationSeconds: durationSeconds || 0
        });

        const result = await transcription.save();

        res.json({
            success: true,
            id: result._id,
            word_count: text.split(/\s+/).length
        });
    } catch (error) {
        console.error('Error saving transcription:', error);
        res.status(500).json({ error: 'Failed to save transcription' });
    }
});

// DELETE /api/transcriptions/:id — Delete a transcription
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Transcription.findByIdAndDelete(id);

        if (!result) {
            return res.status(404).json({ error: 'Transcription not found' });
        }

        res.json({ success: true, message: 'Transcription deleted' });
    } catch (error) {
        console.error('Error deleting transcription:', error);
        res.status(500).json({ error: 'Failed to delete transcription' });
    }
});

module.exports = router;
