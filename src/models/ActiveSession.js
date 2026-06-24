const mongoose = require("mongoose");

const activeSessionSchema = new mongoose.Schema(
  {
    athlete: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrainingProgram", // Can be null if impromptu
      default: null
    },
    sessionSlot: {
      type: String,
      default: "Training"
    },
    startTime: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.ActiveSession || mongoose.model("ActiveSession", activeSessionSchema);
