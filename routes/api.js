// ===== Unified API Router =====
// All API endpoints for AdaptEd Adaptive Accessibility Engine

const express = require('express');
const router = express.Router();

const aiController = require('../controllers/aiController');
const accessController = require('../controllers/accessibilityController');

// ---------- AI Processing Routes ----------
router.post('/ai/summarize', aiController.summarizeText);
router.post('/ai/simplify', aiController.simplifyContent);
router.post('/ai/interpret', aiController.interpretCommand);

// ---------- Profile Management Routes ----------
router.post('/profile/save', accessController.saveProfile);
router.get('/profile/:userId', accessController.getProfile);

module.exports = router;
