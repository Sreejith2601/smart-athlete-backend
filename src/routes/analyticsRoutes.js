const express = require("express");
const router = express.Router();
const { getWeeklyAnalytics, getCPI, getCPITrend, getSmartInsights, saveOnboardingMetrics, getTrainingComparison } = require("../controllers/analyticsController");

const { protect } = require("../middleware/authMiddleware");

// GET /api/analytics/weekly
router.get("/weekly", protect, getWeeklyAnalytics);

// GET /api/analytics/cpi
router.get("/cpi", protect, getCPI);

// GET /api/analytics/cpi-trend
router.get("/cpi-trend", protect, getCPITrend);

// GET /api/analytics/insights
router.get("/insights", protect, getSmartInsights);

// GET /api/analytics/comparison
router.get("/comparison", protect, getTrainingComparison);


// POST /api/analytics/onboarding
router.post("/onboarding", protect, saveOnboardingMetrics);


module.exports = router;

