const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: ["athlete", "coach"],
      required: true
    },

    // Top-level fields
    age: Number,
    onboardingType: {
      type: String,
      enum: ["hr", "estimated"],
      default: "hr"
    },
    gender: String,
    sport: String,
    specialization: String,
    experience: Number,
    fitnessLevel: String, // beginner, intermediate, advanced
    trainingMode: {
      type: String,
      enum: ["self", "coach"],
      default: "self"
    },
    restingHR: Number,
    HRmax_estimate: Number,
    LTHR: Number,
    LT_pace: Number,
    zones: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },


    // Full profile object — stores all onboarding + editable data
    profile: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Cycle tracking (female athletes)
    cycle: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Password reset
    resetPasswordToken: String,
    resetPasswordExpires: Date
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
