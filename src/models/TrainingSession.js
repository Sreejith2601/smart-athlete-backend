const mongoose = require("mongoose");

const trainingSessionSchema = new mongoose.Schema(
  {
    athlete: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    date: {
      type: Date,
      default: Date.now
    },

    sessionSlot: {
      type: String
    },

    trainingType: {
      type: String
    },

    mainWork: {
      type: String
    },

    // ✅ NEW: Start & End Time
    startTime: {
      type: Date
    },

    endTime: {
      type: Date
    },

    // ✅ FIXED: duration in minutes (Number)
    duration: {
      type: Number // in minutes
    },

    distance: {
      type: Number,
      default: 0
    },

    // ✅ NEW: calories
    caloriesBurned: {
      type: Number
    },

    steps: {
      type: Number,
      default: 0
    },

    // keeping your existing field
    pulse: {
      type: Number // avg heart rate
    },

    rpe: {
      type: Number
    },

    fatigue: {
      type: Number
    },

    feedback: {
      type: String
    },

    source: {
      type: String,
      enum: ["manual", "wearable"],
      default: "manual"
    },

    pace: {
      type: Number
    },

    paceSec: {
      type: Number
    },

    status: {
      type: String,
      enum: ["completed", "missed"],
      default: "completed"
    },

    // 🏆 NEW: High-level classification for CPI/Audit
    trainingMode: {
      type: String,
      enum: ["self", "coach"],
      default: "self"
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.models.TrainingSession ||
  mongoose.model("TrainingSession", trainingSessionSchema);