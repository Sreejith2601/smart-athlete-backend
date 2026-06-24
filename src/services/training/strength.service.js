/**
 * Strength Training Engine: Generates specific sets and reps based on 
 * athlete level, event specialization, and current ML training state.
 */

const EXERCISE_POOL = {
  levels: {
    beginner: ["Bodyweight Squats", "Lunges", "Plank", "Glute Bridges", "Calf Raises"],
    intermediate: ["Goblet Squats", "Walking Lunges", "Deadbugs", "Single-Leg RDLs", "Box Jumps"],
    advanced: ["Barbell Back Squats", "Bulgarian Split Squats", "Swiss Ball Pikes", "Weighted RDLs", "Depth Jumps"]
  },
  specialization: {
    explosive: ["Power Cleans (Light)", "Medicine Ball Slams"],
    speed_strength: ["Jump Squats", "Broad Jumps"],
    endurance_strength: ["Step-ups (High Rep)", "Stability Ball Curls"],
    injury_prevention: ["Tibialis Raises", "Hip Abduction (Banded)"]
  }
};

const getEventTheme = (event) => {
  const e = event.toLowerCase();
  if (e === '800m') return 'explosive';
  if (e === '1500m') return 'speed_strength';
  if (e === '3000m' || e === '5000m' || e === '10k') return 'endurance_strength';
  return 'injury_prevention';
};

/**
 * Generates an array of exercise objects.
 * @param {string} level - beginner, intermediate, advanced
 * @param {string} mlState - optimal, overtraining, undertraining
 * @param {string} event - 800m, 1500m, etc.
 */
const getStrengthExercises = (level, mlState, event) => {
  try {
    const l = level.toLowerCase();
    const state = mlState.toLowerCase();
    const eventTheme = getEventTheme(event);

    // 1. Overtraining -> Override with recovery focus
    if (state === 'overtraining') {
      return [
        { name: "Dynamic Mobility Flow", volume: "10 mins" },
        { name: "Static Stretching", volume: "15 mins" },
        { name: "Light Plank", volume: "3 x 30s" },
        { name: "Hip Circles", volume: "2 x 15 reps" }
      ];
    }

    // 2. Select base pool from Level
    const basePool = EXERCISE_POOL.levels[l] || EXERCISE_POOL.levels.beginner;
    
    // 3. Select specialized exercises
    const specialPool = EXERCISE_POOL.specialization[eventTheme] || [];

    // 4. Combine
    const fullPool = [...basePool, ...specialPool];

    // 5. Volume adjustment based on ML
    let sets = "3";
    let reps = "12";
    
    if (state === 'undertraining') {
      sets = "4";
      reps = "15";
    }

    // 6. Format
    return fullPool.map(ex => ({
      name: ex,
      volume: `${sets} sets x ${reps} reps`
    }));

  } catch (error) {
    console.error("[Strength Engine Error]:", error.message);
    return [{ name: "General Strength Maintenance", volume: "3 x 12 reps" }];
  }
};

module.exports = {
  getStrengthExercises
};
