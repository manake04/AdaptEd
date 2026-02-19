const mongoose = require('mongoose');

const preferenceSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    theme: { type: String, default: 'dark' },
    fontSize: { type: String, default: 'normal' },
    reduceMotion: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Preference', preferenceSchema);
