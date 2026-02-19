const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
// NOTE: Make sure GEMINI_API_KEY is set in .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// GET /api/ai/status — Check if AI is configured
router.get('/status', (req, res) => {
    res.json({
        configured: !!process.env.GEMINI_API_KEY,
        model: 'gemini-pro'
    });
});

// POST /api/ai/summarize — Summarize text using Gemini
router.post('/summarize', async (req, res) => {
    try {
        const { text, userId, style } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            return res.status(503).json({ error: 'AI service not configured (Server missing API Key)' });
        }

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                maxOutputTokens: 300,
                temperature: 0.7,
            }
        });

        const prompt = `Summarize the following text in a concise and clear manner. Match the tone of the original text. Text: "${text}"`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

        if (!summary) {
            throw new Error('Empty summary received from AI');
        }

        const originalWordCount = text.split(/\s+/).length;
        const summaryWordCount = summary.split(/\s+/).length;
        const reductionPercent = Math.round((1 - (summaryWordCount / originalWordCount)) * 100);

        res.json({
            summary,
            original_word_count: originalWordCount,
            summary_word_count: summaryWordCount,
            reduction_percent: reductionPercent,
            ai_powered: true
        });

    } catch (error) {
        console.error('Gemini AI Error:', error);
        res.status(500).json({
            error: 'AI generation failed',
            details: error.message
        });
    }
});

module.exports = router;
