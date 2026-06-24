/**
 * Pace Engine: Implements distance-adjusted equivalent pacing (VDOT-style)
 * with dynamic adjustments for level and ML state.
 */

const getExponent = (distanceInMeters) => {
  if (distanceInMeters <= 1500) return 1.03;
  if (distanceInMeters <= 5000) return 1.05;
  if (distanceInMeters <= 10000) return 1.06;
  if (distanceInMeters <= 21100) return 1.07;
  return 1.08;
};

const ZONES = {
  recovery: { min: 0.60, max: 0.65 },
  easy: { min: 0.65, max: 0.75 },
  moderate: { min: 0.75, max: 0.82 },
  tempo: { min: 0.83, max: 0.88 },
  interval: { min: 0.95, max: 1.02 }
};

/**
 * Calculates adjusted pace based on race input and state.
 * @param {number} raceDistance - meters
 * @param {number} raceTime - minutes
 * @param {string} intensity - e.g., 'easy', 'tempo'
 * @param {string} level - 'beginner', 'intermediate', 'advanced'
 * @param {string} mlState - 'optimal', 'overtraining', 'undertraining'
 */
const calculatePace = (raceDistance, raceTime, intensity, level, mlState) => {
  try {
    const timeInSeconds = raceTime * 60;
    const exponent = getExponent(raceDistance);
    
    // 1. Equivalent 5K Time (T2)
    // T2 = T1 * (5000 / D1)^exponent
    const t5k = timeInSeconds * Math.pow((5000 / raceDistance), exponent);
    
    // 2. 5K Velocity (v5k) in m/s
    const v5k = 5000 / t5k;
    
    // 3. Get Zone Range
    const zone = ZONES[intensity.toLowerCase()] || ZONES.easy; // default to easy
    
    // 4. Base Intensity % based on Level
    // beginner -> lower bound, intermediate -> midpoint, advanced -> upper bound
    let intensityTarget;
    if (level.toLowerCase() === 'beginner') {
      intensityTarget = zone.min;
    } else if (level.toLowerCase() === 'advanced') {
      intensityTarget = zone.max;
    } else {
      intensityTarget = (zone.min + zone.max) / 2; // intermediate
    }
    
    // 5. ML Adjustment within the range
    // overtraining -> shift down, undertraining -> shift up, optimal -> no change
    const rangeSize = zone.max - zone.min;
    const shiftAmount = rangeSize * 0.25; // adjust by 25% of the range's width

    if (mlState === 'overtraining') {
      intensityTarget = Math.max(zone.min, intensityTarget - shiftAmount);
    } else if (mlState === 'undertraining') {
      intensityTarget = Math.min(zone.max, intensityTarget + shiftAmount);
    }
    
    // 6. Final Velocity
    const targetVelocity = v5k * intensityTarget;
    
    // 7. Convert to Pace (min:sec / km)
    // 1000 / v = total seconds per km
    const secondsPerKm = 1000 / targetVelocity;
    const mins = Math.floor(secondsPerKm / 60);
    const secs = Math.round(secondsPerKm % 60);
    
    return `${mins}:${secs.toString().padStart(2, '0')}/km`;

  } catch (error) {
    console.error("[Pace Engine Error]:", error.message);
    return "N/A";
  }
};

module.exports = {
  calculatePace
};
