const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ===== Local Extractive Fallback =====
function localSummarize(text, numSentences = 3) {
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    if (!sentences || sentences.length <= numSentences) return text;

    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'to', 'of', 'in', 'for', 'on',
        'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'and',
        'but', 'or', 'if', 'while', 'this', 'that', 'it', 'its', 'they', 'them', 'he', 'she'
    ]);
    const wordFreq = {};
    text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
        if (!stopWords.has(w) && w.length > 2) wordFreq[w] = (wordFreq[w] || 0) + 1;
    });
    const scored = sentences.map((s, i) => {
        const words = s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
        let score = words.reduce((a, w) => a + (wordFreq[w] || 0), 0) / Math.max(words.length, 1);
        if (i < 2) score *= 1.3;
        return { sentence: s.trim(), score, index: i };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, numSentences)
        .sort((a, b) => a.index - b.index).map(s => s.sentence).join(' ');
}

// ===== 5-second Timeout =====
function withTimeout(promise, ms = 5000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), ms))
    ]);
}

// GET /api/ai/status — Check if AI is configured
router.get('/status', (req, res) => {
    res.json({
        configured: !!process.env.GEMINI_API_KEY,
        model: 'gemini-1.5-flash',
        fallback: 'extractive_local'
    });
});

// POST /api/ai/summarize — Summarize text using Gemini (with fallback)
router.post('/summarize', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Text is required' });
        }

        // No API key → immediate local fallback
        if (!process.env.GEMINI_API_KEY) {
            const summary = localSummarize(text);
            const originalWordCount = text.split(/\s+/).length;
            const summaryWordCount = summary.split(/\s+/).length;
            return res.json({
                success: true,
                summary,
                original_word_count: originalWordCount,
                summary_word_count: summaryWordCount,
                reduction_percent: Math.round((1 - summaryWordCount / originalWordCount) * 100),
                source: 'local',
                ai_powered: false
            });
        }

        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
        });

        const prompt = `Summarize the following text in a concise and clear manner. Match the tone of the original text. Text: "${text}"`;

        const result = await withTimeout(model.generateContent(prompt), 5000);
        const response = await result.response;
        const summary = response.text();

        if (!summary) throw new Error('Empty summary received from AI');

        const originalWordCount = text.split(/\s+/).length;
        const summaryWordCount = summary.split(/\s+/).length;

        res.json({
            success: true,
            summary,
            original_word_count: originalWordCount,
            summary_word_count: summaryWordCount,
            reduction_percent: Math.round((1 - summaryWordCount / originalWordCount) * 100),
            source: 'gemini',
            ai_powered: true
        });

    } catch (error) {
        console.error('Gemini AI Error:', error.message);
        // Fallback to local
        try {
            const text = req.body.text || '';
            const summary = localSummarize(text);
            const originalWordCount = text.split(/\s+/).length;
            const summaryWordCount = summary.split(/\s+/).length;
            res.json({
                success: true,
                summary,
                original_word_count: originalWordCount,
                summary_word_count: summaryWordCount,
                reduction_percent: Math.round((1 - summaryWordCount / originalWordCount) * 100),
                source: 'local',
                ai_powered: false,
                fallback_reason: error.message === 'AI_TIMEOUT' ? 'AI timed out (5s)' : error.message
            });
        } catch (fallbackErr) {
            res.status(500).json({ success: false, error: 'Summarization failed', details: fallbackErr.message });
        }
    }
});

module.exports = router;
