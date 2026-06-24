const TrainingProgram = require('../models/TrainingProgram');
const TrainingSession = require('../models/TrainingSession');
const { generateDailyPlan } = require('../services/training/orchestrator.service');

const getDailyPlan = async (req, res) => {
  try {
    const { 
      event, 
      level, 
      startDate, 
      raceTime, 
      raceDistance, 
      mlFeatures 
    } = req.body;

    const userId = req.user._id || req.user.id;

    // 1. Basic Validation
    if (!event || !level || !startDate || !raceTime || !raceDistance || !mlFeatures) {
      return res.status(400).json({ 
        message: "Missing required inputs: event, level, startDate, raceTime, raceDistance, or mlFeatures." 
      });
    }

    // 2. Check if a plan already exists for today to avoid duplicates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    let existingPlan = await TrainingProgram.findOne({
      athleteId: userId,
      date: { $gte: today, $lt: tomorrow },
      planName: "AI Daily Plan"
    });

    if (existingPlan) {
      console.log("[Training Controller] Returning existing AI plan for today.");
      return res.status(200).json(existingPlan);
    }

    // 3. Adaptive AI: Check for missed sessions in the last 7 days
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const missedSessions = await TrainingSession.countDocuments({
      athlete: userId,
      status: "missed",
      date: { $gte: sevenDaysAgo }
    });

    console.log(`[Adaptive AI] Athlete missed ${missedSessions} sessions in the last 7 days.`);

    // 4. Generate Plan through Orchestrator
    const aiPlan = await generateDailyPlan({
      event,
      level,
      startDate,
      raceTime,
      raceDistance,
      mlFeatures
    });

    // 5. Transform & Adapt AI Plan
    let sessions = (aiPlan.sessions || []).map(s => ({
      trainingType: s.type || "Training",
      sessionSlot: s.time || "Morning", 
      mainWork: s.description || s.mainWork || "AI Generated Session",
      duration: s.distance || s.duration || "N/A",
      intensity: s.intensity || "Moderate",
      status: "pending",
      date: new Date()
    }));

    // If more than 3 sessions missed, we force a "Re-Entry Recovery" session
    if (missedSessions >= 3 && sessions.length > 0) {
      console.log("[Adaptive AI] Triggering RE-ENTRY RECOVERY mode.");
      sessions[0].intensity = "Low";
      sessions[0].mainWork = `Welcome back! 🌿 Since you've been away, we've adjusted this to a gentle re-entry: ${sessions[0].mainWork}`;
      
      // Reduce distance/duration if numeric
      if (!isNaN(parseFloat(sessions[0].duration))) {
        const reduced = parseFloat(sessions[0].duration) * 0.6;
        sessions[0].duration = `${reduced.toFixed(1)}km (reduced for recovery)`;
      }
    }

    // For simplicity, we also populate the top-level fields for the first session
    const firstSession = sessions[0] || {};

    const newPlan = await TrainingProgram.create({
      athleteId: userId,
      coachId: userId, 
      planName: "AI Daily Plan",
      date: new Date(),
      sessions: sessions,
      trainingType: firstSession.trainingType || "AI Training",
      sessionSlot: firstSession.sessionSlot || "Morning",
      mainWork: firstSession.mainWork || "AI Generated",
      duration: firstSession.duration || "N/A",
      intensity: firstSession.intensity || "Moderate",
      status: "pending"
    });

    console.log("[Training Controller] New AI plan persisted to DB:", newPlan._id);

    // 5. Return the newly created persistent plan
    return res.status(201).json(newPlan);

  } catch (error) {
    console.error("[Training Controller Error]:", error.message);
    return res.status(500).json({ 
      error: "Failed to generate training plan",
      details: error.message 
    });
  }
};

module.exports = {
  getDailyPlan
};
