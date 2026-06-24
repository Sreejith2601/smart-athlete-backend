const TrainingSession = require("../models/TrainingSession");
const ActiveSession = require("../models/ActiveSession");
const TrainingProgram = require("../models/TrainingProgram");
const User = require("../models/User");

const logSession = async (req, res) => {
  console.log("=== [Backend] logSession Hit ===");
  console.log("[Backend] req.body:", JSON.stringify(req.body, null, 2));
  console.log("[Backend] req.user._id:", req.user?._id);
  try {
    const {
      sessionId,
      pulse,
      rpe,
      fatigue,
      feedback,
      source,

      // ✅ NEW: optional watch/manual inputs
      distance,
      caloriesBurned,
      duration, // optional fallback
      steps,
      effort,    // easy, moderate, hard
      avg_hr    // manual avg hr
    } = req.body;

    // Map effort to RPE if rpe is not provided
    let finalRPE = rpe;
    if (!finalRPE && effort) {
      if (effort.toLowerCase() === "easy") finalRPE = 3;
      else if (effort.toLowerCase() === "moderate") finalRPE = 6;
      else if (effort.toLowerCase() === "hard") finalRPE = 9;
    }

    const athleteId = req.user._id;

    let sessionData = { ...req.body, athlete: athleteId };
    let trainingId = null;

    let startTime = null;
    let endTime = new Date();
    let calculatedDuration = null;

    // 🔥 STEP 1: Handle Active Session
    if (sessionId) {
      const activeSession = await ActiveSession.findById(sessionId);

      if (activeSession) {
        startTime = activeSession.startTime;

        // ✅ Calculate duration (in minutes)
        if (startTime) {
          calculatedDuration = Math.floor(
            (endTime - new Date(startTime)) / (1000 * 60)
          );
        }

        // Fetch plan details
        if (activeSession.planId) {
          trainingId = activeSession.planId;
          const plan = await TrainingProgram.findById(activeSession.planId);

          if (plan) {
            // FIX: Rely on the precisely logged 'ActiveSession' slot (e.g., 'morning' vs 'evening') 
            // instead of blindly overwriting it with the top-level generic fallback ('Morning').
            sessionData.sessionSlot = activeSession.sessionSlot || plan.sessionSlot;
            sessionData.trainingType = plan.trainingType;
            sessionData.mainWork = plan.mainWork;
          }
        }

        // Delete active session
        await ActiveSession.findByIdAndDelete(sessionId);
      }
    }

    // 🔥 STEP 2: Final values 
    const finalDuration = duration || calculatedDuration || 0;
    const finalCalories = caloriesBurned || 0;
    
    // 🏃 Convert steps to raw distance (0.0008 km per step)
    const actualSteps = steps || 0;
    const rawDistance = actualSteps > 0 ? (actualSteps * 0.0008) : (distance || 0);
    const finalDistance = Math.round(rawDistance * 10) / 10;

    // ⏱️ Calculate Pace (min/km)
    let finalPace = null;
    if (rawDistance > 0 && finalDuration > 0) {
      finalPace = Math.round((finalDuration / rawDistance) * 10) / 10;
    }

    // 🔥 STEP 3: Save session
    const user = await User.findById(athleteId);
    let finalTrainingMode = "self";

    if (sessionId) {
      // It's a live session. If it's a coach-assigned plan, it's 'coach'.
      // If it's an AI Daily Plan or the user is in 'self' mode, it's 'self'.
      const plan = await TrainingProgram.findById(trainingId);
      if (plan && plan.planName !== "AI Daily Plan") {
        finalTrainingMode = "coach";
      } else {
        finalTrainingMode = (user && user.trainingMode) || "self";
      }
    } else {
      // Manual log 
      finalTrainingMode = (user && user.trainingMode) || "self";
    }

    const sessionRecord = await TrainingSession.create({
      athlete: athleteId,
      date: sessionData.date || Date.now(),
      
      sessionSlot: sessionData.sessionSlot,
      trainingType: sessionData.trainingType,
      mainWork: sessionData.mainWork,

      startTime,
      endTime,
      duration: finalDuration,
      caloriesBurned: finalCalories,
      distance: finalDistance,
      steps: actualSteps,
      pace: finalPace,
      paceSec: finalPace,

      pulse: (pulse || avg_hr) ? parseInt(pulse || avg_hr) : undefined,
      rpe: finalRPE ? parseInt(finalRPE) : undefined,
      fatigue: fatigue ? parseInt(fatigue) : undefined,
      feedback,
      source: source || "manual",
      status: "completed",
      trainingMode: finalTrainingMode
    });

    // Update training program specific session and top-level status
    if (trainingId) {
      const plan = await TrainingProgram.findById(trainingId);
      if (plan) {
        // Mark the specific session in the array as completed
        const slot = sessionData.sessionSlot || "";
        let sessionMatched = false;
        
        if (plan.sessions && plan.sessions.length > 0) {
          plan.sessions.forEach(s => {
            // FIX: Use robust case-insensitive matching because frontend AI generation 
            // uses "morning" but user's string typing / generic schemas use "Morning"
            if (s.sessionSlot && s.sessionSlot.toLowerCase() === slot.toLowerCase()) {
              s.status = "completed";
              sessionMatched = true;
            }
          });
        }

        // Check if all sessions are now completed
        const allSessionsFinished = plan.sessions.every(s => s.status === "completed");
        
        // Update top-level status
        if (allSessionsFinished) {
          plan.status = "completed";
        } else {
          // If at least one is done but others pending, maybe stay "active" or "pending" 
          // User wants evening to appear after morning, so we stay pending/active.
          plan.status = "active"; 
        }

        await plan.save();
        console.log(`[Backend] Updated TrainingProgram ${trainingId}: Session ${slot} set to completed.`);
      }
    }

    res.status(201).json({
      message: "Session logged successfully",
      session: sessionRecord,
    });

  } catch (error) {
    console.error("[Backend] logSession error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const getAthleteSessions = async (req, res) => {
  try {
    let athleteId = req.user._id;

    // If coach, they can request sessions for a specific athlete via query param or path param
    if (req.user.role === "coach") {
      athleteId = req.query.athleteId || req.params.athleteId || req.user._id;
    } else if (req.params.athleteId) {
      // Standard athlete can only request their own sessions (security check)
      if (String(req.params.athleteId) !== String(req.user._id)) {
        return res.status(403).json({ message: "Access denied" });
      }
      athleteId = req.params.athleteId;
    }

    const sessions = await TrainingSession.find({ athlete: athleteId })
      .populate("athlete", "name email profilePic")
      .sort({ date: -1 });
    res.status(200).json(sessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const startActiveSession = async (req, res) => {
  try {
    const { planId, sessionSlot } = req.body;
    const athleteId = req.user._id;

    // Create new active session
    const activeSession = await ActiveSession.create({
      athlete: athleteId,
      planId: planId || null,
      sessionSlot: sessionSlot || "Training",
      startTime: Date.now(),
    });

    // Update training program status if linked
    if (planId) {
      await TrainingProgram.findByIdAndUpdate(planId, { status: "active" });
    }

    res.status(201).json(activeSession);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getActiveSessions = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    console.log(`[Backend] getActiveSessions for user: ${userId} (${userRole})`);

    let query = { athlete: userId };
    const normalizedRole = userRole ? String(userRole).trim().toLowerCase() : "";
    
    if (normalizedRole === "coach") {
      query = {}; // In this simple model, coaches see all active sessions
    }

    const activeSessions = await ActiveSession.find(query)
      .populate("planId")
      .populate("athlete", "name email");

    console.log(`[Backend] Found ${activeSessions.length} active sessions. Query used:`, JSON.stringify(query));
    if (activeSessions.length > 0) {
      console.log(`[Backend] Sample active session athlete:`, activeSessions[0].athlete);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(activeSessions);
  } catch (error) {
    console.error("[Backend] getActiveSessions error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const endActiveSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const activeSession = await ActiveSession.findById(sessionId);

    if (!activeSession) {
      return res.status(404).json({ message: "Active session not found" });
    }

    // Revert training program status if it was just cancelled/ended without logging
    if (activeSession.planId) {
      // Only update if it wasn't already marked as completed by logSession
      const plan = await TrainingProgram.findById(activeSession.planId);
      if (plan && plan.status === "active") {
        plan.status = "pending";
        await plan.save();
      }
    }

    await ActiveSession.findByIdAndDelete(sessionId);
    res.status(200).json({ message: "Active session ended" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  logSession,
  getAthleteSessions,
  startActiveSession,
  getActiveSessions,
  endActiveSession,
};