const { classifySession } = require("./classification.service.js");

/**
 * Aggregates session data into weekly performance metrics, excluding Sundays.
 * Performs session filtering, classification, and extracts key performance indicators.
 * 
 * @param {Array<Object>} sessions - Array of session objects (readings, paceSec, distance, date).
 * @param {Object} athleteZones - Heart rate zone boundaries.
 * @param {number} LT_pace - Lactate threshold pace (seconds per km).
 * @returns {Object} { totalDistance, totalSessions, zone2Sessions, bestZone2Pace }
 * @throws {Error} If no valid sessions exist after filtering for Monday-Saturday.
 */
exports.buildWeeklyMetrics = (sessions, athleteZones, LT_pace) => {
  // 1. Initial Validation
  if (!Array.isArray(sessions)) {
    throw new Error("Invalid input: sessions must be an array.");
  }

  // 2. Filter sessions: Keep only Monday (1) to Saturday (6). Exclude Sunday (0).
  const filteredSessions = sessions.filter(s => {
    const d = new Date(s.date);
    const day = d.getDay();
    return day !== 0; // 0 is Sunday
  });

  if (filteredSessions.length === 0) {
    return {
      totalDistance: 0,
      totalSessions: 0,
      zone2Sessions: 0,
      bestZone2Pace: null,
      totalLoad: 0,
      paces: []
    };
  }

  // 3. Aggregate Data
  let totalDistance = 0;
  let zone2Sessions = 0;
  let bestZone2Pace = null;
  let totalLoad = 0;
  const paces = [];

  const zoneMultipliers = { 1: 1.0, 2: 1.2, 3: 1.5, 4: 2.0, 5: 3.0 };

  filteredSessions.forEach(session => {
    // Add to total distance
    totalDistance += (session.distance || 0);

    // Extract pace with backward compatibility
    const effectivePace = session.paceSec || session.pace || 0;

    // Get zone classification
    const classification = classifySession(
      session.readings || [],
      effectivePace,
      athleteZones,
      LT_pace
    );

    // Calculate Load: duration (min) * multiplier
    const multiplier = zoneMultipliers[classification.zone] || 1.0;
    totalLoad += (session.duration || 0) * multiplier;

    // Collect Pace for consistency (Efficiency in estimated mode)
    if (effectivePace > 0) {
      paces.push(effectivePace);
    }

    // Process Zone 2 specific metrics
    if (classification.zone === 2) {
      zone2Sessions++;

      // Track fastest pace (lowest numeric value in sec/km)
      if (effectivePace > 0) {
        if (bestZone2Pace === null || effectivePace < bestZone2Pace) {
          bestZone2Pace = effectivePace;
        }
      }
    }
  });

  return {
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalSessions: filteredSessions.length,
    zone2Sessions,
    bestZone2Pace: bestZone2Pace ? Math.round(bestZone2Pace * 10) / 10 : null,
    totalLoad: Math.round(totalLoad * 10) / 10,
    paces
  };
};

/**
 * Calculates the Chronic Performance Index (CPI) based on session performance,
 * heart rate efficiency, and volume load relative to previous weeks and baselines.
 * 
 * Supports hybrid logic for "hr" or "estimated" onboarding types.
 * 
 * @param {Object} currentWeek - { totalDistance, bestZone2Pace, avgHR, totalLoad, paces }
 * @param {Object} previousWeek - { totalDistance, totalLoad }
 * @param {Object} baseline - { basePace, baseHR }
 * @param {string} onboardingType - "hr" (default) or "estimated"
 * @returns {Object} Result containing cpi and individual component scores.
 */
exports.calculateCPI = (currentWeek, previousWeek, baseline, onboardingType = "hr") => {
  // 1. Validation Logic
  if (!currentWeek || !previousWeek || !baseline) {
    throw new Error("Invalid input: Missing required week data.");
  }

  // Common: Performance Score (Always pace-based)
  // Use best Zone 2 pace if available, otherwise use a slightly dampened version of the weekly average pace
  // to avoid the "68.5" plateau for users who train in Zone 1.
  let effectivePace;
  if (currentWeek.bestZone2Pace) {
    effectivePace = currentWeek.bestZone2Pace;
  } else if (currentWeek.paces && currentWeek.paces.length > 0) {
    // If no Zone 2, use the average pace of all sessions but apply a 15% "Zone 1" penalty 
    // instead of the harsh 30% penalty.
    const avgPace = currentWeek.paces.reduce((a, b) => a + b, 0) / currentWeek.paces.length;
    effectivePace = Math.max(avgPace, baseline.basePace * 1.15);
  } else {
    effectivePace = baseline.basePace * 1.25; // Default fallback if no pace data
  }

  const performanceScore = Math.min(100, (baseline.basePace / effectivePace) * 100);

  let efficiencyScore = 0;
  let loadScore = 0;

  if (onboardingType === "estimated") {
    // 2a. Efficiency Score (Estimated Mode): Pace Consistency
    const paces = currentWeek.paces || [];
    if (paces.length >= 2) {
      const mean = paces.reduce((a, b) => a + b, 0) / paces.length;
      const variance = paces.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / paces.length;
      const stdDev = Math.sqrt(variance);
      const CV = stdDev / mean; 
      efficiencyScore = Math.min(100, Math.max(0, (1 - CV) * 100));
    } else {
      efficiencyScore = 100;
    }

    // 2b. Load Score (Estimated Mode): Weighted Volume Ratio
    if (previousWeek.totalLoad > 0) {
      const ratio = currentWeek.totalLoad / previousWeek.totalLoad;
      if (ratio >= 0.9 && ratio <= 1.1) {
        loadScore = 100;
      } else {
        loadScore = Math.max(0, 100 - Math.abs(1 - ratio) * 100);
      }
    } else {
      // NEW: Default to 100 (Stable) for users with no prior history to avoid "68.5" starting CPI
      loadScore = 100;
    }

  } else {
    // 3a. Efficiency Score (HR Mode): (baseHR / currentWeek.avgHR) * 100
    const avgHR = currentWeek.avgHR || baseline.baseHR;
    efficiencyScore = Math.min(100, (baseline.baseHR / avgHR) * 100);

    // 3b. Load Score (HR Mode): Distance Ratio
    if (previousWeek.totalDistance > 0) {
      const ratio = currentWeek.totalDistance / previousWeek.totalDistance;
      if (ratio >= 0.9 && ratio <= 1.1) {
        loadScore = 100;
      } else {
        loadScore = Math.max(0, 100 - Math.abs(1 - ratio) * 100);
      }
    } else {
      // NEW: Default to 100 (Stable) for users with no prior history
      loadScore = 100;
    }
  }

  // 4. Final CPI Calculation: (performance * 0.5) + (efficiency * 0.3) + (load * 0.2)
  const cpi = (performanceScore * 0.5) + (efficiencyScore * 0.3) + (loadScore * 0.2);

  return {
    cpi: Math.round(cpi * 10) / 10,
    performanceScore: Math.round(performanceScore * 10) / 10,
    efficiencyScore: Math.round(efficiencyScore * 10) / 10,
    loadScore: Math.round(loadScore * 10) / 10
  };
};
