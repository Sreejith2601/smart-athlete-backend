
const express = require("express");
const router = express.Router();

const {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  getAthletes,
  getCoaches,
  forgotPassword,
  resetPassword
} = require("../controllers/authController");

const { protect, checkTrainingMode } = require("../middleware/authMiddleware");

// Register
router.post("/register", registerUser);

// Login
router.post("/login", loginUser);

// Get authenticated user profile
router.get("/me", protect, getProfile);

// Update authenticated user profile
router.put("/me", protect, updateProfile);

// Get all athletes (coach only)
router.get("/athletes", protect, getAthletes);

// Get all coaches (athlete chat)
router.get("/coaches", protect, getCoaches);

// Forgot / Reset Password (no auth required)
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
