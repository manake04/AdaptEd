const mongoose = require('mongoose');

const transcriptionSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    text: { type: String, required: true },
    language: { type: String, default: 'en-US' },
    durationSeconds: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transcription', transcriptionSchema);
