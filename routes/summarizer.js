const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Enhanced extractive summarization algorithm
function extractiveSummarize(text, numSentences = 3) {
    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    if (!sentences || sentences.length <= numSentences) return { summary: text, sentences: sentences || [] };

    // Stop words set
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
        'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
        'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
        'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
        'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
        'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
        'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
        'because', 'but', 'and', 'or', 'if', 'while', 'although', 'this',
        'that', 'these', 'those', 'it', 'its', 'which', 'who', 'whom',
        'what', 'their', 'they', 'them', 'he', 'she', 'his', 'her'
    ]);

    // Build word frequency map
    const wordFreq = {};
    const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
    words.forEach(word => {
        if (!stopWords.has(word) && word.length > 2) {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
    });

    // TF-IDF inspired scoring
    const totalSentences = sentences.length;
    const sentenceWordSets = sentences.map(s =>
        new Set(s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2))
    );

    // Document frequency for each word
    const docFreq = {};
    for (const word of Object.keys(wordFreq)) {
        docFreq[word] = sentenceWordSets.filter(set => set.has(word)).length;
    }

    // Score sentences with TF-IDF
    const scoredSentences = sentences.map((sentence, index) => {
        const sentWords = sentence.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
        let score = 0;

        sentWords.forEach(word => {
            if (wordFreq[word] && docFreq[word]) {
                // TF-IDF score
                const tf = wordFreq[word];
                const idf = Math.log(totalSentences / docFreq[word]);
                score += tf * idf;
            }
        });

        // Normalize by sentence length
        score = score / Math.max(sentWords.length, 1);

        // Position bonuses
        if (index === 0) score *= 1.5;        // First sentence bonus
        else if (index === 1) score *= 1.3;   // Second sentence bonus
        else if (index === totalSentences - 1) score *= 1.1; // Last sentence bonus

        // Length penalty for very short or very long sentences
        const wordCount = sentWords.length;
        if (wordCount < 5) score *= 0.7;
        if (wordCount > 40) score *= 0.8;

        return { sentence: sentence.trim(), score, index };
    });

    // Get top sentences in original order
    const topSentences = scoredSentences
        .sort((a, b) => b.score - a.score)
        .slice(0, numSentences)
        .sort((a, b) => a.index - b.index);

    return {
        summary: topSentences.map(s => s.sentence).join(' '),
        scores: topSentences.map(s => ({ index: s.index, score: s.score.toFixed(3) })),
        totalSentences
    };
}

// POST /api/summarize — Summarize text
router.post('/', (req, res) => {
    try {
        const { userId, text, numSentences } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const sentCount = Math.min(Math.max(numSentences || 3, 1), 10);
        const result = extractiveSummarize(text, sentCount);

        const originalWordCount = text.trim().split(/\s+/).length;
        const summaryWordCount = result.summary.trim().split(/\s+/).length;
        const reductionPercent = Math.round((1 - summaryWordCount / originalWordCount) * 100);

        // Save to database if userId provided
        if (userId) {
            db.prepare(`INSERT OR IGNORE INTO users (id) VALUES (?)`).run(userId);

            db.prepare(`
        INSERT INTO summaries (user_id, original_text, summary_text, original_word_count, summary_word_count, reduction_percent)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, text, result.summary, originalWordCount, summaryWordCount, reductionPercent);

            db.prepare(`
        INSERT INTO analytics (user_id, event_type, feature, metadata)
        VALUES (?, 'summary_generated', 'ai_summarizer', ?)
      `).run(userId, JSON.stringify({ originalWordCount, summaryWordCount, reductionPercent }));
        }

        res.json({
            summary: result.summary,
            original_word_count: originalWordCount,
            summary_word_count: summaryWordCount,
            reduction_percent: reductionPercent,
            total_sentences: result.totalSentences,
            selected_sentences: sentCount
        });
    } catch (error) {
        console.error('Error summarizing:', error);
        res.status(500).json({ error: 'Failed to summarize text' });
    }
});

// GET /api/summarize/history/:userId — Get summary history
router.get('/history/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        const summaries = db.prepare(`
      SELECT id, summary_text, original_word_count, summary_word_count, reduction_percent, created_at
      FROM summaries
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit);

        res.json({ summaries });
    } catch (error) {
        console.error('Error loading summaries:', error);
        res.status(500).json({ error: 'Failed to load summary history' });
    }
});

module.exports = router;
