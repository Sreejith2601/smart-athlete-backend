const express = require("express");
const router = express.Router();

const {
  createTrainingProgram,
  getAthleteTrainingPlans,
  editTrainingProgram,
  cancelTrainingProgram,
  deleteTrainingProgram,
  getActiveTrainingPlan
} = require("../controllers/trainingProgramController");

const {
  logSession,
  getAthleteSessions,
  startActiveSession,
  getActiveSessions,
  endActiveSession
} = require("../controllers/trainingSessionController");

const { protect, checkTrainingMode } = require("../middleware/authMiddleware");

// --- Training Programs (Plans from Coach) ---

// Create program
router.post("/create", protect, createTrainingProgram);

// Get programs for standard athlete (uses req.user._id)
router.get("/plans", protect, getAthleteTrainingPlans);

// Get programs for specific athlete (used by coach)
router.get("/plans/:athleteId", protect, getAthleteTrainingPlans);

// Edit program
router.put("/edit/:programId", protect, editTrainingProgram);

// cancel program
router.put("/cancel/:programId", protect, cancelTrainingProgram);

// delete program
router.delete("/delete/:programId", protect, deleteTrainingProgram);

// --- Training Sessions (Logged by Athlete) ---

// Log a session
router.post("/session", protect, logSession);

// Get all sessions for standard athlete
router.get("/sessions", protect, getAthleteSessions);

// Get sessions for specific athlete (used by coach)
router.get("/sessions/:athleteId", protect, getAthleteSessions);

// --- Live Active Session Tracking ---
router.post("/active-session", protect, startActiveSession);
router.delete("/active-session", protect, endActiveSession);
router.get("/active-sessions", protect, getActiveSessions);

// IMPORTANT: This catch-all route MUST be LAST
// Otherwise it catches /sessions, /active-sessions, etc. as athleteId
router.get("/:athleteId", protect, getActiveTrainingPlan);

module.exports = router;
