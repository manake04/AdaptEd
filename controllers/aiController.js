// ===== AI Controller — Gemini-Powered Processing (Hardened) =====
// 5-second timeout on all Gemini calls + local extractive fallback

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ===== Local Extractive Summarization Fallback =====
function localSummarize(text, numSentences = 3) {
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    if (!sentences || sentences.length <= numSentences) return text;

    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
        'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again',
        'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
        'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same',
        'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while', 'this',
        'that', 'these', 'those', 'it', 'its', 'which', 'who', 'whom', 'what', 'their', 'they',
        'them', 'he', 'she', 'his', 'her', 'need', 'used'
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

// ===== 5-second Timeout Wrapper =====
function withTimeout(promise, ms = 5000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), ms))
    ]);
}

// ---------- 1. Summarize Text ----------
exports.summarizeText = async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Text is required' });
        }

        // If no API key, go straight to local fallback
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

        const prompt = `Summarize the following text in a concise and clear manner. Keep the key points. Match the tone of the original.\n\nText:\n"${text}"`;

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
        console.error('Summarize Error:', error.message);

        // Fallback to local summarization on ANY failure
        try {
            const text = req.body.text || '';
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
                ai_powered: false,
                fallback_reason: error.message === 'AI_TIMEOUT' ? 'AI timed out (5s)' : error.message
            });
        } catch (fallbackErr) {
            res.status(500).json({ success: false, error: 'Summarization failed completely', details: fallbackErr.message });
        }
    }
};

// ---------- 2. Simplify Content ----------
exports.simplifyContent = async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Text is required' });
        }

        if (!process.env.GEMINI_API_KEY) {
            // Simple fallback: just return first few sentences
            const sentences = text.match(/[^.!?]+[.!?]+/g);
            const simplified = sentences ? sentences.slice(0, 5).join(' ') : text;
            return res.json({ success: true, simplified, source: 'local', ai_powered: false });
        }

        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: { maxOutputTokens: 400, temperature: 0.5 }
        });

        const prompt = `Rewrite the following text so it is very easy to understand. Use short sentences, simple words, and a friendly tone. Avoid jargon.\n\nOriginal:\n"${text}"`;

        const result = await withTimeout(model.generateContent(prompt), 5000);
        const response = await result.response;
        const simplified = response.text();

        if (!simplified) throw new Error('Empty result from AI');

        res.json({ success: true, simplified, source: 'gemini', ai_powered: true });

    } catch (error) {
        console.error('Simplify Error:', error.message);
        // Fallback: return truncated original
        const text = req.body.text || '';
        const sentences = text.match(/[^.!?]+[.!?]+/g);
        const simplified = sentences ? sentences.slice(0, 5).join(' ') : text.substring(0, 500);
        res.json({
            success: true,
            simplified,
            source: 'local',
            ai_powered: false,
            fallback_reason: error.message === 'AI_TIMEOUT' ? 'AI timed out (5s)' : error.message
        });
    }
};

// ---------- 3. Interpret Command ----------
exports.interpretCommand = async (req, res) => {
    try {
        const { command } = req.body;

        if (!command) {
            return res.status(400).json({ success: false, error: 'Command is required' });
        }

        const cmd = command.toLowerCase().trim();
        const KEYWORD_MAP = {
            'summarize': 'summarize',
            'summary': 'summarize',
            'read': 'read',
            'speak': 'read',
            'next': 'next',
            'forward': 'next',
            'stop': 'stop',
            'pause': 'stop',
            'repeat': 'repeat',
            'again': 'repeat',
            'scroll down': 'scroll_down',
            'scroll up': 'scroll_up',
            'contrast': 'toggle_contrast',
            'bigger': 'increase_font',
            'smaller': 'decrease_font'
        };

        for (const [keyword, action] of Object.entries(KEYWORD_MAP)) {
            if (cmd.includes(keyword)) {
                return res.json({ success: true, action, confidence: 0.95, matched_keyword: keyword });
            }
        }

        res.json({ success: true, action: 'unknown', confidence: 0, original: command });

    } catch (error) {
        console.error('Interpret Error:', error.message);
        res.status(500).json({ success: false, error: 'Command interpretation failed' });
    }
};
