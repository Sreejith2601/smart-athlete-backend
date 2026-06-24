const mongoose = require("mongoose");

const trainingProgramSchema = new mongoose.Schema(
  {
    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    planName: {
      type: String,
      default: "Training Plan"
    },
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    sessions: [
      {
        trainingType: String,
        sessionSlot: String,
        mainWork: String,
        duration: String,
        intensity: String,
        notes: String,
        date: Date,
        status: {
          type: String,
          enum: ["pending", "completed", "missed", "cancelled"],
          default: "pending"
        }
      }
    ],
    // Keep top-level fields for backward compatibility with single-session plans
    trainingType: {
      type: String
    },
    sessionSlot: {
      type: String // Morning / Evening
    },
    mainWork: {
      type: String
    },
    duration: {
      type: String
    },
    intensity: {
      type: String
    },
    notes: {
      type: String
    },
    date: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ["pending", "active", "cancelled", "completed", "missed"],
      default: "pending"
    }
  },
  {
    timestamps: true
  }
);

// We keep the old model name to not break existing references
module.exports = mongoose.models.TrainingProgram || mongoose.model("TrainingProgram", trainingProgramSchema);
