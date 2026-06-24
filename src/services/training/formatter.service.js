/**
 * Formatter Service: Combines raw training data, pace calculations, 
 * and strength exercises into a clean JSON structure.
 */

const formatTrainingResponse = (dayName, mlPrediction, sessions) => {
  return {
    day: dayName,
    mlPrediction: mlPrediction,
    sessions: sessions.map(session => {
      const formattedSession = {
        time: session.time || "morning",
        type: session.type,
        distance: session.distance || "",
        intensity: session.intensity || "",
        description: session.description || ""
      };

      // Add pace ONLY if running
      if (session.type.includes("run") || session.type.includes("interval")) {
        formattedSession.pace = session.calculatedPace || "N/A";
      }

      // Add exercises ONLY if strength
      if (session.type.includes("strength")) {
        formattedSession.exercises = session.generatedExercises || [];
      }

      return formattedSession;
    })
  };
};

module.exports = {
  formatTrainingResponse
};
