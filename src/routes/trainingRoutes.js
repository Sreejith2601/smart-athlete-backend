/**
 * Training Routes: API endpoints for all training-related operations.
 */

const express = require('express');
const router = express.Router();
const { protect, checkTrainingMode } = require("../middleware/authMiddleware");
const { getDailyPlan } = require('../controllers/trainingController');

// 1. Generate Daily Plan
// @route   POST /api/training/daily-plan
// @desc    Calculate today's training plan using dataset, ML, and sports science logic
router.post('/daily-plan', protect, checkTrainingMode(['self']), getDailyPlan);

module.exports = router;
