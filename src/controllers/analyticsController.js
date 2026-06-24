const TrainingSession = require("../models/TrainingSession");
const TrainingProgram = require("../models/TrainingProgram");
const User = require("../models/User");
const { buildWeeklyMetrics, calculateCPI } = require("../services/analytics/cpi.service");
const { calculateOnboardingMetrics, estimateOnboardingMetrics } = require("../services/analytics/onboarding.service");
const http = require("http");

// ── ML Helper: call Python prediction service ─────────────────────────────────
const getMLPrediction = (payload) => {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: "localhost",
      port: 5001,
      path: "/predict",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 3000
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data).prediction || "unknown"); }
        catch { resolve("unknown"); }
      });
    });
    req.on("error", () => resolve("unknown"));
    req.on("timeout", () => { req.destroy(); resolve("unknown"); });
    req.write(body);
    req.end();
  });
};


const getWeeklyAnalytics = async (req, res) => {
  try {
    let athleteId = req.user._id;
    if (req.user.role === "coach" && req.query.athleteId) {
      athleteId = req.query.athleteId;
    }

    // Calculate start of current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);

    console.log(`[Analytics] Fetching sessions for athlete ${athleteId} from ${startOfWeek.toISOString()}`);

    const sessions = await TrainingSession.find({
      athlete: athleteId,
      createdAt: { $gte: startOfWeek },
      status: "completed"
    });

    let totalSteps = 0;
    let totalDuration = 0;
    let heartRateSum = 0;
    let heartRateCount = 0;
    let bestPace = null;

    sessions.forEach(session => {
      // Total Steps & Duration
      totalSteps += (session.steps || 0);
      totalDuration += (session.duration || 0);

      // Average Heart Rate (Pulse)
      if (session.pulse !== null && session.pulse !== undefined) {
        heartRateSum += session.pulse;
        heartRateCount++;
      }

      // Best Pace (Minimum value, as lower is faster)
      if (session.pace && session.pace > 0) {
        if (bestPace === null || session.pace < bestPace) {
          bestPace = session.pace;
        }
      }
    });

    const avgHeartRate = heartRateCount > 0 ? Math.round(heartRateSum / heartRateCount) : null;

    res.status(200).json({
      totalSteps,
      totalDuration,
      avgHeartRate,
      bestPace: bestPace ? parseFloat(bestPace.toFixed(1)) : null
    });

  } catch (error) {
    console.error("[Analytics Error]:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const getCPI = async (req, res) => {
  console.log("CPI API HIT");
  try {
    let athleteId = req.user._id;
    if (req.user.role === "coach" && req.query.athleteId) {
      athleteId = req.query.athleteId;
    }

    // 1. Get athlete onboarding data (zones and baseline)
    // 1. Get athlete onboarding data (zones and baseline)
    const user = await User.findById(athleteId);
    if (!user || !user.LTHR || !user.LT_pace || !user.zones) {
      return res.status(400).json({ message: "Onboarding metrics not found. Please complete onboarding first." });
    }

    const { zones, LTHR, LT_pace } = user;
    const athleteOnboardingType = user.onboardingType || "hr";


    const { mode = "all" } = req.query;
    console.log(`[Analytics] CPI request - Athlete: ${athleteId}, Mode: ${mode}`);

    // 2. Calculate Date Ranges
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    currentStart.setHours(0, 0, 0, 0);

    const previousStart = new Date(currentStart);
    previousStart.setDate(currentStart.getDate() - 7);

    // 3. Fetch all sessions for last 2 weeks (filtered by mode if not 'all')
    const query = {
      athlete: athleteId,
      date: { $gte: previousStart },
      status: "completed"
    };

    if (mode === "self") {
      // Include 'self' AND legacy data (where trainingMode field doesn't exist)
      query.$or = [
        { trainingMode: "self" },
        { trainingMode: { $exists: false } },
        { trainingMode: null }
      ];
    } else if (mode === "coach") {
      query.trainingMode = "coach";
    }

    const allSessions = await TrainingSession.find(query).sort({ date: 1 });

    // 4. Split into Weekly Buckets
    const currentSessions = allSessions.filter(s => new Date(s.date) >= currentStart);
    const previousSessions = allSessions.filter(s => new Date(s.date) < currentStart);

    // 4. Handle Case: No sessions (New Athlete or period with no activity)
    if (currentSessions.length === 0) {
      console.log(`[Analytics] No sessions found for athlete ${athleteId} in period. Returning baseline payload.`);
      
      const baselinePayload = {
        cpi: 100,
        loadScore: 100,
        performanceScore: 100,
        efficiencyScore: 100,
        trend: "stable",
        compliance: 100,
        weeklySessions: 0,
        avgDuration: 0,
        fatigueIndex: 5,
        stressScore: 10,
        recoveryScore: 90
      };

      const mlPrediction = await getMLPrediction(baselinePayload);

      return res.status(200).json({ 
        cpi: null, 
        performanceScore: null,
        efficiencyScore: null,
        loadScore: null,
        message: mode === "all" ? "Awaiting training sessions" : `No recent ${mode} sessions`, 
        mlPrediction,
        mlPayload: baselinePayload
      });
    }

    // 5. Build Metrics for Current Week
    const currentMetrics = buildWeeklyMetrics(
      currentSessions,
      zones,
      LT_pace
    );

    // Calculate current week avg HR from currentSessions
    const validHRs = currentSessions.filter(s => s.pulse > 0).map(s => s.pulse);
    const avgHR = validHRs.length > 0 ? validHRs.reduce((a, b) => a + b, 0) / validHRs.length : LTHR;

    // 6. Build Metrics for Previous Week (need distance and load)
    let previousDistance = 0;
    let previousLoad = 0;
    try {
      const prevMetrics = buildWeeklyMetrics(previousSessions, zones, LT_pace);
      previousDistance = prevMetrics.totalDistance;
      previousLoad = prevMetrics.totalLoad;
    } catch (err) {
      previousDistance = 0;
      previousLoad = 0;
    }

    // 7. Final CPI Calculation
    const cpiData = calculateCPI(
      { 
        totalDistance: currentMetrics.totalDistance,
        bestZone2Pace: currentMetrics.bestZone2Pace || LT_pace * 1.3,
        avgHR,
        totalLoad: currentMetrics.totalLoad,
        paces: currentMetrics.paces
      },
      { totalDistance: previousDistance, totalLoad: previousLoad },
      { basePace: LT_pace, baseHR: LTHR },
      athleteOnboardingType
    );

    // 8. ML Prediction — derive extra fields from session data
    const weeklySessions = currentSessions.length;
    const avgDuration = weeklySessions > 0
      ? currentSessions.reduce((sum, s) => sum + (s.duration || 0), 0) / weeklySessions
      : 0;

    const avgFatigue = weeklySessions > 0 
      ? currentSessions.reduce((sum, s) => sum + (s.fatigue || 5), 0) / weeklySessions 
      : 5;
    const avgRPE = weeklySessions > 0 
      ? currentSessions.reduce((sum, s) => sum + (s.rpe || 5), 0) / weeklySessions 
      : 5;

    // Compliance Score: Percentage of weekly goal (assuming 7 sessions/week for now)
    const complianceScore = Math.min(100, (weeklySessions / 7) * 100);

    // Trend: compare current loading to previous
    let trend = "stable";
    if (previousLoad > 0) {
      const ratio = currentMetrics.totalLoad / previousLoad;
      if (ratio > 1.05) trend = "improving";
      else if (ratio < 0.95) trend = "declining";
    }

    const mlPayload = {
      cpi: cpiData.cpi || 100,
      loadScore: cpiData.loadScore || 100,
      performanceScore: cpiData.performanceScore || 100,
      efficiencyScore: cpiData.efficiencyScore || 100,
      trend: trend || "stable",
      compliance: parseFloat(complianceScore.toFixed(2)) || 0,
      weeklySessions: weeklySessions || 0,
      avgDuration: parseFloat(avgDuration.toFixed(1)) || 0,
      fatigueIndex: parseFloat(avgFatigue.toFixed(1)) || 5,
      stressScore: parseFloat((avgRPE * 10).toFixed(1)) || 50,
      recoveryScore: Math.round(100 - (avgFatigue * 10)) || 50
    };

    const mlPrediction = await getMLPrediction(mlPayload);

    res.status(200).json({ ...cpiData, mlPrediction, mlPayload });

  } catch (error) {
    console.error("[CPI Error]:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const getCPITrend = async (req, res) => {
  try {
    let athleteId = req.user._id;
    if (req.user.role === "coach" && req.query.athleteId) {
      athleteId = req.query.athleteId;
    }

    // 1. Get athlete onboarding data
    const user = await User.findById(athleteId);
    if (!user || !user.LTHR || !user.LT_pace || !user.zones) {
      return res.status(400).json({ message: "Onboarding metrics not found." });
    }

    const { zones, LTHR, LT_pace } = user;
    const athleteOnboardingType = user.onboardingType || "hr";

    const { mode = "all" } = req.query;
    console.log(`[Analytics] CPI Trend request - Athlete: ${athleteId}, Mode: ${mode}`);

    // 2. Fetch all completed sessions (filtered by mode if selected)
    const query = {
      athlete: athleteId,
      status: "completed"
    };

    if (mode === "self") {
      query.$or = [
        { trainingMode: "self" },
        { trainingMode: { $exists: false } },
        { trainingMode: null }
      ];
    } else if (mode === "coach") {
      query.trainingMode = "coach";
    }

    const allSessions = await TrainingSession.find(query).sort({ date: 1 });

    if (allSessions.length === 0) return res.status(200).json([]);

    // 3. Group sessions by week (Monday start)
    const weekMap = {};
    allSessions.forEach(s => {
      const d = new Date(s.date);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);
      const key = monday.toISOString().split('T')[0];
      if (!weekMap[key]) weekMap[key] = [];
      weekMap[key].push(s);
    });

    const sortedWeekKeys = Object.keys(weekMap).sort();
    const trends = [];

    // 4. Calculate CPI for each week
    for (let i = 0; i < sortedWeekKeys.length; i++) {
      const currentWeekKey = sortedWeekKeys[i];
      const currentSessions = weekMap[currentWeekKey];

      try {
        // Build metrics for current week
        const currentMetrics = buildWeeklyMetrics(currentSessions, zones, LT_pace);
        const hrs = currentSessions.filter(s => s.pulse > 0).map(s => s.pulse);
        const avgHR = hrs.length > 0 ? hrs.reduce((a, b) => a + b, 0) / hrs.length : LTHR;

        // Get previous week distance and load
        let previousDistance = 0;
        let previousLoad = 0;
        if (i > 0) {
          const previousSessions = weekMap[sortedWeekKeys[i - 1]];
          try {
            const prevMetrics = buildWeeklyMetrics(previousSessions, zones, LT_pace);
            previousDistance = prevMetrics.totalDistance;
            previousLoad = prevMetrics.totalLoad;
          } catch (e) {
            previousDistance = 0;
            previousLoad = 0;
          }
        }

        // Calculate CPI
        const cpiRes = calculateCPI(
          { 
            totalDistance: currentMetrics.totalDistance, 
            bestZone2Pace: currentMetrics.bestZone2Pace || LT_pace * 1.3, 
            avgHR,
            totalLoad: currentMetrics.totalLoad,
            paces: currentMetrics.paces
          },
          { totalDistance: previousDistance, totalLoad: previousLoad },
          { basePace: LT_pace, baseHR: LTHR },
          athleteOnboardingType
        );

        trends.push({
          weekStart: currentWeekKey,
          cpi: cpiRes.cpi,
          performanceScore: cpiRes.performanceScore,
          efficiencyScore: cpiRes.efficiencyScore,
          loadScore: cpiRes.loadScore
        });
      } catch (err) {
        // Skip weeks that don't pass buildWeeklyMetrics (e.g. only Sunday sessions)
        continue;
      }
    }

    res.status(200).json(trends);
  } catch (error) {
    console.error("[CPI Trend Error]:", error.message);
    res.status(500).json({ message: error.message });
  }
};


const getSmartInsights = async (req, res) => {
  try {
    let athleteId = req.user._id;
    if (req.user.role === "coach" && req.query.athleteId) {
      athleteId = req.query.athleteId;
    }

    const user = await User.findById(athleteId);
    if (!user || !user.LTHR || !user.LT_pace || !user.zones) {
      return res.status(400).json({ message: "Metrics not found." });
    }

    const { zones, LTHR, LT_pace } = user;
    const athleteOnboardingType = user.onboardingType || "hr";

    const { mode = "all" } = req.query;
    console.log(`[Analytics] Smart Insights request - Athlete: ${athleteId}, Mode: ${mode}`);

    const query = {
      athlete: athleteId,
      status: "completed"
    };

    if (mode === "self") {
      query.$or = [
        { trainingMode: "self" },
        { trainingMode: { $exists: false } },
        { trainingMode: null }
      ];
    } else if (mode === "coach") {
      query.trainingMode = "coach";
    }

    const allSessions = await TrainingSession.find(query).sort({ date: 1 });

    if (allSessions.length === 0) return res.status(200).json({});

    // Group by weeks
    const weekMap = {};
    allSessions.forEach(s => {
      const d = new Date(s.date);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);
      const key = monday.toISOString().split('T')[0];
      if (!weekMap[key]) weekMap[key] = [];
      weekMap[key].push(s);
    });

    const sortedWeekKeys = Object.keys(weekMap).sort();
    if (sortedWeekKeys.length === 0) return res.status(200).json({});

    // Calculate metrics for available weeks (up to 3)
    const weeksToAnalyze = sortedWeekKeys.slice(-3);
    const weeklyCpiData = [];

    for (let i = 0; i < weeksToAnalyze.length; i++) {
      const key = weeksToAnalyze[i];
      const sessions = weekMap[key];
      let metrics;
      try {
        metrics = buildWeeklyMetrics(sessions, zones, LT_pace);
      } catch (err) {
        continue;
      }
      
      const hrs = sessions.filter(s => s.pulse > 0).map(s => s.pulse);
      const avgHR = hrs.length > 0 ? hrs.reduce((a, b) => a + b, 0) / hrs.length : LTHR;

      // Distance and Load from previous week for calculation
      let prevDist = 0;
      let prevLoad = 0;
      const currentIdxInMap = sortedWeekKeys.indexOf(key);
      if (currentIdxInMap > 0) {
        const prevKey = sortedWeekKeys[currentIdxInMap - 1];
        try {
          const prevMetrics = buildWeeklyMetrics(weekMap[prevKey], zones, LT_pace);
          prevDist = prevMetrics.totalDistance;
          prevLoad = prevMetrics.totalLoad;
        } catch (e) {
          prevDist = 0;
          prevLoad = 0;
        }
      }

      const cpiRes = calculateCPI(
        { 
          totalDistance: metrics.totalDistance, 
          bestZone2Pace: metrics.bestZone2Pace || LT_pace * 1.3, 
          avgHR,
          totalLoad: metrics.totalLoad,
          paces: metrics.paces
        },
        { totalDistance: prevDist, totalLoad: prevLoad }, 
        { basePace: LT_pace, baseHR: LTHR },
        athleteOnboardingType
      );
      
      weeklyCpiData.push(cpiRes);
    }

    const w0 = weeklyCpiData[weeklyCpiData.length - 1]; // Latest
    const w1 = weeklyCpiData.length > 1 ? weeklyCpiData[weeklyCpiData.length - 2] : null; // Previous
    const w2 = weeklyCpiData.length > 2 ? weeklyCpiData[weeklyCpiData.length - 3] : null; // 2 weeks ago

    // 4. Trend Logic (Weekly Stats)
    let insight = "🚀 Balanced training";
    let recommendation = "You're hitting the sweet spot! Your pace and volume are perfectly balanced this week.";
 
    if (w0.loadScore > 90) {
      insight = "⚡ High Workload";
      recommendation = "Weekly volume is high—your body needs rest to avoid burnout.";
    } else if (w0.loadScore < 50) {
      insight = "📉 Low Base Training";
      recommendation = "Weekly load is low—try increasing your distance or intensity slightly.";
    }
 
    if (w1 && w2) {
      if (w0.cpi > w1.cpi && w1.cpi > w2.cpi) {
        insight = "🔥 Consistent Improvement";
      } else if (w0.cpi < w1.cpi && w1.cpi < w2.cpi) {
        insight = "⚠️ Performance Downtrend";
      }
    }
 
    if (w1 && insight === "🚀 Balanced training") {
      if (Math.abs(w0.cpi - w1.cpi) <= 2) {
        insight = "➡️ Stable Performance";
      }
    }
 
    if (w1 && w0.loadScore > 90 && w0.efficiencyScore < w1.efficiencyScore) {
      insight = "⚡ Fatigue Warning";
    }

    // 5. Daily Context Logic (New: For top dashboard card)
    const lastSessionToday = allSessions.length > 0 ? allSessions[allSessions.length - 1] : null;
    const isToday = lastSessionToday && (new Date() - new Date(lastSessionToday.date)) < (12 * 60 * 60 * 1000); // Last 12 hrs

    let dailyContext = {
      type: "PRE_SESSION",
      title: "AI RECOMMENDATION",
      line1: "Ready to build your aerobic base today?",
      line2: "Ensure your heart rate data is syncing correctly."
    };

    if (isToday) {
      const dailyPace = lastSessionToday.paceSec || lastSessionToday.pace || 0;
      const dailyHR = lastSessionToday.pulse || 0;

      if (dailyPace > 0 && dailyHR > 0) {
        // POST-SESSION ANALYSIS
        const paceRatio = LT_pace / dailyPace;
        const hrRatio = LTHR / dailyHR;
        const efficiencyDelta = ((hrRatio / paceRatio) - 1) * 100;
      
      dailyContext.type = "POST_SESSION";
      dailyContext.title = "POST-SESSION INSIGHT";
      
      if (efficiencyDelta > 3) {
        dailyContext.line1 = "Excellent efficiency detected! 🚀";
        dailyContext.line2 = `Your heart rate was ${Math.abs(efficiencyDelta).toFixed(1)}% lower than expected for this pace.`;
      } else if (efficiencyDelta < -3) {
        dailyContext.line1 = "Tough session today? 🧊";
        dailyContext.line2 = "Your heart rate was slightly elevated. Prioritize recovery and sleep tonight.";
      } else {
        dailyContext.line1 = "Great consistency! ✅";
        dailyContext.line2 = "Your performance perfectly matched your current fitness baseline.";
      }
    } else {
      // PRE-SESSION ADVICE (Refined)
      if (w0.loadScore > 90) {
        dailyContext.line1 = "High fatigue detected.";
        dailyContext.line2 = "Prioritize a recovery walk or light stretching today.";
      } else if (w1 && w0.cpi > w1.cpi) {
        dailyContext.line1 = "Performance is trending up.";
        dailyContext.line2 = "Ready for a challenge? Push the pace in your next run.";
      }
      }
    }

    res.status(200).json({
      cpi: w0.cpi,
      insight,
      recommendation,
      dailyContext
    });

  } catch (error) {
    console.error("[Smart Insights Error]:", error.message);
    res.status(500).json({ message: error.message });
  }
};


const saveOnboardingMetrics = async (req, res) => {
  console.log("BODY:", req.body); // ✅ Debug log added

  try {
    const athleteId = req.user._id;
    // ✅ Use optional chaining and direct access (NOT nested under .user)
    const { hrReadings, distanceKm, age, restingHR } = req.body || {};
    const fitnessLevel = req.body?.fitnessLevel || "intermediate";

    let metrics;
    if (hrReadings && distanceKm) {
        metrics = calculateOnboardingMetrics(hrReadings, distanceKm);
    } else {
        metrics = estimateOnboardingMetrics(age, restingHR, fitnessLevel);
    }

    const onboardingType = (hrReadings && distanceKm) ? "hr" : "estimated";
    
    // Save to user - using the fields recently added to schema
    const updatedUser = await User.findByIdAndUpdate(
      athleteId,
      {
        $set: {
          onboardingType,
          fitnessLevel: metrics.fitnessLevel || fitnessLevel,
          restingHR: metrics.restingHR || restingHR,
          HRmax_estimate: metrics.HRmax_estimate,
          LTHR: metrics.LTHR,
          LT_pace: metrics.LT_pace,
          zones: metrics.zones
        }
      },
      { new: true }
    );

    if (!updatedUser) {
        return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "Onboarding metrics saved successfully.",
      data: {
          HRmax_estimate: updatedUser.HRmax_estimate,
          LTHR: updatedUser.LTHR,
          LT_pace: updatedUser.LT_pace,
          zones: updatedUser.zones
      }
    });

  } catch (error) {
    console.error("[Save Onboarding Metrics Error]:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const getTrainingComparison = async (req, res) => {
  try {
    let athleteId = req.user._id;
    if (req.user.role === "coach" && req.query.athleteId) {
      athleteId = req.query.athleteId;
    }

    // Range: Last 14 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 14);
    startDate.setHours(0, 0, 0, 0);

    // Fetch both plans and actual sessions
    const [plans, sessions] = await Promise.all([
      TrainingProgram.find({ athleteId, $or: [
        { date: { $gte: startDate } },
        { startDate: { $gte: startDate } },
        { endDate: { $gte: startDate } }
      ]}).sort({ createdAt: -1 }),
      TrainingSession.find({ athlete: athleteId, date: { $gte: startDate } }).sort({ date: -1 })
    ]);

    // Create a unified timeline map [YYYY-MM-DD]
    const timelineMap = {};

    // 1. Process Plans (Now with nested sessions)
    plans.forEach(plan => {
      // Process top-level session (Backward compatibility)
      if (plan.date) {
        const dateKey = new Date(plan.date).toISOString().split('T')[0];
        if (!timelineMap[dateKey]) timelineMap[dateKey] = { date: dateKey, plans: [], actuals: [] };
        timelineMap[dateKey].plans.push(plan);
      }

      // Process nested sessions (The new multi-session structure)
      if (plan.sessions && plan.sessions.length > 0) {
        plan.sessions.forEach(s => {
          if (s.date >= startDate) {
            const dateKey = new Date(s.date).toISOString().split('T')[0];
            if (!timelineMap[dateKey]) timelineMap[dateKey] = { date: dateKey, plans: [], actuals: [] };
            
            // Avoid duplicate pushing of the same session if it's already there
            const alreadyAdded = timelineMap[dateKey].plans.some(p => String(p._id || p.id) === String(s._id || s.id));
            if (!alreadyAdded) {
              timelineMap[dateKey].plans.push(s);
            }
          }
        });
      }
    });

    // 2. Process Actual Sessions
    sessions.forEach(session => {
      const dateKey = new Date(session.date).toISOString().split('T')[0];
      if (!timelineMap[dateKey]) timelineMap[dateKey] = { date: dateKey, plans: [], actuals: [] };
      timelineMap[dateKey].actuals.push(session);
    });

    // 3. Build Comparison List
    const timeline = Object.values(timelineMap).map(day => {
      let status = "extra"; // Default if session with no plan
      
      const hasPlan = day.plans.length > 0;
      const hasSession = day.actuals.length > 0;

      if (hasPlan && hasSession) status = "completed";
      else if (hasPlan && !hasSession) status = "missed";
      else if (!hasPlan && hasSession) status = "extra";

      return {
        date: day.date,
        planned: day.plans,
        actual: day.actuals,
        status
      };
    });

    // Sort newest first
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 4. Calculate Compliance Summary
    const totalPlanned = timeline.filter(d => d.planned.length > 0).length;
    const totalCompleted = timeline.filter(d => d.status === "completed").length;
    
    let score = 0;
    if (totalPlanned > 0) {
      score = Math.round((totalCompleted / totalPlanned) * 100);
    }

    let label = "Low adherence";
    let color = "#ef4444";
    if (score >= 90) {
      label = "Excellent";
      color = "#22c55e";
    } else if (score >= 60) {
      label = "Moderate";
      color = "#f59e0b";
    }

    res.status(200).json({
      timeline,
      summary: {
        score,
        label,
        color,
        totalPlanned,
        totalCompleted
      }
    });
  } catch (error) {
    console.error("[Comparison Error]:", error.message);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getWeeklyAnalytics,
  getCPI,
  getCPITrend,
  getSmartInsights,
  saveOnboardingMetrics,
  getTrainingComparison
};


