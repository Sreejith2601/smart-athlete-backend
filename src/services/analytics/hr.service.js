/**
 * Computes the session average heart rate by removing warm-up and cool-down noise.
 * 
 * Trims the first 5 minutes and the last 5 minutes of data, then calculates the
 * average of the remaining valid heart rate readings.
 * 
 * @param {Array<{time_sec: number, bpm: number}>} readings - Raw session heart rate readings.
 * @returns {number} The rounded average heart rate for the core part of the session.
 * @throws {Error} If readings is empty, missing valid BPM values, or if the trimmed dataset is empty.
 */
exports.getSessionAvgHR = (readings) => {
  // 1. Initial Validation
  if (!Array.isArray(readings) || readings.length === 0) {
    throw new Error("Invalid input: readings must be a non-empty array.");
  }

  // 2. Determine Session Bounds
  const maxTime = Math.max(...readings.map(r => r.time_sec || 0));
  const startTimeThreshold = 300; // First 5 minutes
  const endTimeThreshold = maxTime - 300; // Last 5 minutes

  // 3. Trim Data and Filter Valid BPMs
  const processedReadings = readings.filter(r => {
    const isWithinTimeRange = r.time_sec >= startTimeThreshold && r.time_sec <= endTimeThreshold;
    const hasValidBpm = typeof r.bpm === "number" && !isNaN(r.bpm);
    return isWithinTimeRange && hasValidBpm;
  });

  // 4. Edge Case: Trimmed data too small
  if (processedReadings.length === 0) {
    throw new Error("Invalid session data: No valid heart rate readings found after trimming warm-up/cool-down periods.");
  }

  // 5. Compute Average (Rounded)
  const sumBpm = processedReadings.reduce((acc, r) => acc + r.bpm, 0);
  const averageHR = Math.round(sumBpm / processedReadings.length);

  return averageHR;
};

/**
 * Finds the most stable 10-minute heart rate window in a session.
 * 
 * Uses a sliding window (600s) across valid readings to find the period
 * with the lowest heart rate variance.
 * 
 * @param {Array<{time_sec: number, bpm: number}>} readings - Raw heart rate readings.
 * @returns {Object} { value: number, variance: number, reliable: boolean }
 * @throws {Error} If not enough data exists for a 10-minute window.
 */
exports.getSteadyStateHR = (readings) => {
  if (!Array.isArray(readings) || readings.length === 0) {
    throw new Error("Invalid input: readings must be a non-empty array.");
  }

  // 1. Preprocess: Filter valid bpm values
  const validData = readings.filter(r => typeof r.bpm === "number" && !isNaN(r.bpm));
  if (validData.length === 0) {
    throw new Error("Invalid data: No valid heart rate readings found.");
  }

  // 2. Sort by time just in case (optional but safer for sliding window)
  validData.sort((a, b) => a.time_sec - b.time_sec);

  // 3. Sliding Window (window size = 600s)
  const windowSize = 600;
  let bestWindow = null;

  for (let i = 0; i < validData.length; i++) {
    const startReading = validData[i];
    const endTime = startReading.time_sec + windowSize;
    
    // Find end of window
    // Optimization: a real sliding window wouldn't re-filter, but for simplicity:
    const windowPoints = [];
    for (let j = i; j < validData.length; j++) {
      if (validData[j].time_sec <= endTime) {
        windowPoints.push(validData[j]);
      } else {
        break;
      }
    }

    // Edge case: Ensure window actually spans 600s
    if (windowPoints.length > 0) {
      const span = windowPoints[windowPoints.length - 1].time_sec - startReading.time_sec;
      if (span < windowSize) {
        // Not enough data left for a full 600s window starting here
        continue; 
      }

      // Calculate mean
      const sum = windowPoints.reduce((acc, p) => acc + p.bpm, 0);
      const mean = sum / windowPoints.length;

      // Calculate variance
      const variance = windowPoints.reduce((acc, p) => acc + Math.pow(p.bpm - mean, 2), 0) / windowPoints.length;

      if (bestWindow === null || variance < bestWindow.variance) {
        bestWindow = {
          value: Math.round(mean),
          variance: variance,
          reliable: variance <= 64
        };
      }
    }
  }

  if (!bestWindow) {
    throw new Error("Invalid session data: Total duration is too short for a stable 10-minute window.");
  }

  return bestWindow;

  
};

/**
 * Computes the 7-day rolling average of resting heart rate by sorting logs
 * and taking the last 7 valid entries.
 * 
 * @param {Array<{date: string, bpm: number}>} dailyLogs - Array of daily resting HR logs.
 * @returns {number} The rounded 7-day average resting heart rate.
 * @throws {Error} If dailyLogs is not an array or has fewer than 7 valid entries.
 */
exports.getWeeklyRestingHR = (dailyLogs) => {
  // 1. Validation
  if (!Array.isArray(dailyLogs)) {
    throw new Error("Invalid input: dailyLogs must be an array.");
  }

  // 2. Filter valid bpm (number > 0)
  const validLogs = dailyLogs.filter(log => 
    typeof log.bpm === "number" && log.bpm > 0 && !isNaN(log.bpm)
  );

  // 3. Edge Case: If less than 7 valid entries -> throw error
  if (validLogs.length < 7) {
    throw new Error("Insufficient data: At least 7 valid resting HR logs are required.");
  }

  // 4. Sort logs by date (latest last)
  validLogs.sort((a, b) => new Date(a.date) - new Date(b.date));

  // 5. Take last 7 entries
  const lastSeven = validLogs.slice(-7);

  // 6. Compute average bpm (Rounded)
  const sumBpm = lastSeven.reduce((acc, log) => acc + log.bpm, 0);
  const averageHR = Math.round(sumBpm / 7);

  return averageHR;
};
