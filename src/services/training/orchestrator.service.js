/**
 * Training Orchestrator: Main entry point for the daily training plan generation pipeline.
 * Coordinates between date, loader, ML, pace, strength, and formatter services.
 */

const { getTrainingDate } = require('./date.service');
const { getTodaySessions } = require('./loader.service');
const { getMLPrediction } = require('./ml.service');
const { calculatePace } = require('./pace.service');
const { getStrengthExercises } = require('./strength.service');
const { formatTrainingResponse } = require('./formatter.service');

/**
 * Orchestrates the generation of today's training plan.
 */
const generateDailyPlan = async (input) => {
  const { 
    event, 
    level, 
    startDate, 
    raceTime, 
    raceDistance, 
    mlFeatures 
  } = input;

  try {
    // 1. DATE ENGINE: Calculate current day index
    const dateInfo = getTrainingDate(startDate);
    const { weekIndex, dayName } = dateInfo;

    // 2. DATASET LOADER: Fetch template sessions
    const rawSessions = getTodaySessions(event, level, weekIndex, dayName);

    // 3. ML INTEGRATION: Predict training state
    const mlState = await getMLPrediction(mlFeatures);

    // 4. PROCESS SESSIONS (Pace engine & Strength engine)
    const processedSessions = rawSessions.map(session => {
      const processed = { ...session };

      // Type-based logic
      const isRunning = session.type.includes("run") || session.type.includes("interval");
      const isStrength = session.type.includes("strength");

      // Running Logic: Apply Pacing
      if (isRunning) {
        processed.calculatedPace = calculatePace(
          raceDistance,
          raceTime,
          session.intensity,
          level,
          mlState
        );

        // Volume Adjustment (Optional if overtraining)
        if (mlState === 'overtraining' && session.distance) {
          // e.g. "3km" -> "2.4km"
          const distMatch = session.distance.match(/^([\d.]+)(\w+)$/);
          if (distMatch) {
            const num = parseFloat(distMatch[1]);
            const unit = distMatch[2];
            processed.distance = `${(num * 0.8).toFixed(1)}${unit} (reduced for recovery)`;
          }
        }
      }

      // Strength Logic: Apply Exercises
      if (isStrength) {
        processed.generatedExercises = getStrengthExercises(level, mlState, event);
      }

      return processed;
    });

    // 5. FINAL FORMATTER: Final structure
    return formatTrainingResponse(dayName, mlState, processedSessions);

  } catch (error) {
    console.error("[Orchestrator Error]:", error.message);
    throw error;
  }
};

module.exports = {
  generateDailyPlan
};
