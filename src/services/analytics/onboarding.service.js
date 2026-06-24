/**
 * Estimates heart rate metrics and zones based on age, resting HR, and fitness level.
 * 
 * @param {number} age - User's age.
 * @param {number} restingHR - (Optional) User's resting heart rate.
 * @param {string} fitnessLevel - beginner, intermediate, or advanced.
 * @returns {Object} Calculated metrics including HRmax estimate, LTHR, LT pace, and HR zones.
 */
exports.estimateOnboardingMetrics = (age, restingHR, fitnessLevel) => {
  if (!age || age <= 0) {
    throw new Error("Invalid input: age is required and must be greater than 0.");
  }

  // 1. Estimate HRmax (Tanaka formula is more accurate than 220-age, but user requested 220-age)
  // User Requested: HRmax = 220 - age
  const HRmax_estimate = 220 - age;

  // 2. Estimate LTHR = 0.85 * HRmax
  const LTHR = Math.round(HRmax_estimate * 0.85);

  // 3. Estimate LT_pace (seconds per km) based on fitness level
  // Since we don't have a test, we provide sensible defaults for middle-distance running
  let LT_pace = 360; // Default (6:00 min/km)
  if (fitnessLevel === "beginner") LT_pace = 420; // 7:00 min/km
  if (fitnessLevel === "intermediate") LT_pace = 330; // 5:30 min/km
  if (fitnessLevel === "advanced") LT_pace = 270; // 4:30 min/km

  // 4. Calculate Zones (same logic as before, anchored to LTHR)
  const z2_min = Math.round(LTHR * 0.85);
  const z3_min = Math.round(LTHR * 0.90);
  const z4_min = Math.round(LTHR * 0.95);
  const z5_min = LTHR;

  const zones = {
    z1: { min: 0, max: z2_min - 1 },
    z2: { min: z2_min, max: z3_min - 1 },
    z3: { min: z3_min, max: z4_min - 1 },
    z4: { min: z4_min, max: z5_min - 1 },
    z5: { min: z5_min, max: Math.min(220, HRmax_estimate + 10) } // Safety cap
  };

  return {
    HRmax_estimate,
    LTHR,
    LT_pace,
    zones,
    restingHR,
    zoneMeta: { method: "estimation_based", fitnessLevel }
  };
};

/**
 * Calculates onboarding heart rate metrics and training zones for Smart Athlete.
 * 
 * @param {Array<{time_sec: number, bpm: number}>} hrReadings - Array of heart rate readings with timestamp and BPM.
 * @param {number} distanceKm - Total distance covered during the test in kilometers.
 * @returns {Object} Calculated metrics including HRmax estimate, LTHR, LT pace, and HR zones with min/max ranges.
 * @throws {Error} If hrReadings is empty, distanceKm <= 0, no valid BPM readings exist, or zone boundaries collapse.
 */
exports.calculateOnboardingMetrics = (hrReadings, distanceKm) => {
  // 1. Initial Validation
  if (!Array.isArray(hrReadings) || hrReadings.length === 0) {
    throw new Error("Invalid input: hrReadings must be a non-empty array.");
  }

  if (typeof distanceKm !== "number" || distanceKm <= 0) {
    throw new Error("Invalid input: distanceKm must be a number greater than 0.");
  }

  // 2. Filter Valid Readings (Ignore invalid or missing BPM values)
  const validReadings = hrReadings.filter(
    r => typeof r.bpm === "number" && !isNaN(r.bpm)
  );

  if (validReadings.length === 0) {
    throw new Error("Invalid data: No valid BPM readings found in hrReadings.");
  }

  // 3. HRmax_estimate = max bpm + 3 buffer
  const maxBpm = Math.max(...validReadings.map(r => r.bpm));
  const HRmax_estimate = maxBpm + 3;

  // 4. LTHR = average bpm from time_sec 600 to 1800 (Excludes first 10 minutes)
  const lthrData = validReadings.filter(r => r.time_sec >= 600 && r.time_sec <= 1800);
  
  if (lthrData.length === 0) {
    throw new Error("Invalid data: No valid HR readings found between 10m (600s) and 30m (1800s).");
  }

  const sumBpm = lthrData.reduce((acc, r) => acc + r.bpm, 0);
  const LTHR = Math.round(sumBpm / lthrData.length);

  // 5. LT_pace (seconds per km) - Raw number
  const LT_pace = 1800 / distanceKm;

  // 6. Zone Boundaries (based on LTHR)
  const z2_min = Math.round(LTHR * 0.85);
  const z3_min = Math.round(LTHR * 0.90);
  const z4_min = Math.round(LTHR * 0.95);
  const z5_min = LTHR;

  // 7. Collapse Validation (min >= next_min)
  if (0 >= z2_min || z2_min >= z3_min || z3_min >= z4_min || z4_min >= z5_min) {
    throw new Error("Invalid heart rate data: Zone boundaries collapsed. Ensure LTHR is high enough to differentiate training zones.");
  }

  // 8. Define Zones sequentially with no gaps or overlaps
  const zones = {
    z1: { min: 0, max: z2_min - 1 },
    z2: { min: z2_min, max: z3_min - 1 },
    z3: { min: z3_min, max: z4_min - 1 },
    z4: { min: z4_min, max: z5_min - 1 },
    z5: { min: z5_min, max: Infinity }
  };

  return {
    HRmax_estimate,
    LTHR,
    LT_pace,
    zones,
    zoneMeta: { method: "lthr_based" }
  };
};
