/**
 * Loader Service: Filters the training programs dataset for a specific event, level, week, and day.
 */

const fs = require('fs');
const path = require('path');

const DATASET_PATH = path.resolve(process.cwd(), 'data/training_programs_improved.json');

const getTodaySessions = (event, level, weekIndex, dayName) => {
  try {
    // 1. Read dataset
    const rawData = fs.readFileSync(DATASET_PATH, 'utf-8');
    const programs = JSON.parse(rawData);

    // 2. Find matching program (event + level)
    let program = programs.find(p => 
      p.event.toLowerCase() === event.toLowerCase() && 
      p.level.toLowerCase() === level.toLowerCase()
    );

    // Fallback: If event not found (e.g. "Skill"), default to 5000m
    if (!program) {
      console.warn(`[Loader] Event '${event}' not found. Falling back to 5000m.`);
      const fallbackEvent = "5000m";
      program = programs.find(p => 
        p.event.toLowerCase() === fallbackEvent.toLowerCase() && 
        p.level.toLowerCase() === level.toLowerCase()
      );
    }

    if (!program) {
      throw new Error(`Training program for ${event} (or 5000m fallback) not found.`);
    }

    // 3. Find correct week
    const weekData = program.weeks.find(w => w.week === weekIndex);
    if (!weekData) {
      throw new Error(`Week ${weekIndex} not found in the selected program.`);
    }

    // 4. Find correct day
    const dayData = weekData.days.find(d => d.day.toLowerCase() === dayName.toLowerCase());
    if (!dayData) {
      // If day not found, usually means it's a rest day or doesn't exist in template
      return [];
    }

    return dayData.sessions || [];

  } catch (error) {
    console.error("[Loader Service Error]:", error.message);
    throw error;
  }
};

module.exports = {
  getTodaySessions
};
