const { getSteadyStateHR } = require("./hr.service.js");

/**
 * Classifies a training session into a training zone using heart rate data
 * or falling back to pace-based classification if HR data is unreliable.
 * 
 * @param {Array<{time_sec: number, bpm: number}>} readings - Raw heart rate readings.
 * @param {number} paceSec - Average session pace in seconds per kilometer.
 * @param {Object} athleteZones - Heart rate zone boundaries (z1-z5).
 * @param {number} LT_pace - Lactate threshold pace (seconds per kilometer).
 * @returns {Object} Result containing the classified zone, method used, and flagged status.
 * @throws {Error} If any of the required inputs are invalid or missing.
 */
exports.classifySession = (readings, paceSec, athleteZones, LT_pace) => {
  // 1. Validation
  if (!Array.isArray(readings)) {
    throw new Error("Invalid input: readings must be an array.");
  }
  if (typeof paceSec !== "number" || isNaN(paceSec)) {
    throw new Error("Invalid input: paceSec must be a valid number.");
  }
  if (!athleteZones || typeof athleteZones !== "object") {
    throw new Error("Invalid input: athleteZones must be provided as an object.");
  }
  if (typeof LT_pace !== "number" || isNaN(LT_pace)) {
    throw new Error("Invalid input: LT_pace must be a valid number.");
  }

  // 2. Attempt Steady State HR Analysis
  let steadyHR;
  try {
    steadyHR = getSteadyStateHR(readings);
  } catch (error) {
    // If hr.service throws (e.g. data too short), we treat as unreliable
    steadyHR = { reliable: false };
  }

  // 3. HR Classification (Preferred)
  if (steadyHR.reliable === true) {
    const hr = steadyHR.value;
    let zone = 1;

    // Compare with athleteZones (z1-z5 min/max)
    // Checking from highest zone down to lowest via min boundaries
    if (hr >= athleteZones.z5.min) {
      zone = 5;
    } else if (hr >= athleteZones.z4.min) {
      zone = 4;
    } else if (hr >= athleteZones.z3.min) {
      zone = 3;
    } else if (hr >= athleteZones.z2.min) {
      zone = 2;
    } else {
      zone = 1;
    }

    return {
      zone,
      method: "hr",
      flagged: false
    };
  }

  // 4. Pace Fallback Classification (Reliable is false)
  let zone = 1;

  // Comparison logic based on LT_pace multipliers
  // Note: Higher multiplier means slower pace (seconds per km)
  if (paceSec <= LT_pace * 1.09) {
    // Faster than or within Zone 4 upper bound
    if (paceSec >= LT_pace * 1.00) {
      zone = 4;
    } else {
      zone = 5; // Faster than threshold
    }
  } else if (paceSec >= LT_pace * 1.10 && paceSec <= LT_pace * 1.19) {
    zone = 3;
  } else if (paceSec >= LT_pace * 1.15 && paceSec <= LT_pace * 1.40) {
    zone = 2;
  } else {
    zone = 1; // Slower than Zone 2 (Base/Recovery)
  }

  return {
    zone,
    method: "pace_fallback",
    flagged: true
  };
};
