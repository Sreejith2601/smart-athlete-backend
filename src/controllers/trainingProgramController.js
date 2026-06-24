const TrainingProgram = require("../models/TrainingProgram");
const User = require("../models/User");
const TrainingSession = require("../models/TrainingSession");

const createTrainingProgram = async (req, res) => {
  try {
    const {
      athleteId,
      planName,
      startDate,
      endDate,
      sessions,
      trainingType,
      sessionSlot,
      mainWork,
      duration,
      intensity,
      notes,
      date, 
    } = req.body;

    const coachId = req.user._id;

    if (req.user.role !== "coach") {
      return res
        .status(403)
        .json({ message: "Only coaches can create training programs" });
    }

    // Check athlete exists
    const athlete = await User.findById(athleteId);
    if (!athlete || athlete.role !== "athlete") {
      return res.status(404).json({ message: "Athlete not found" });
    }

    // Create training program / plan
    const program = await TrainingProgram.create({
      coachId,
      athleteId,
      planName: planName || "Training Plan",
      startDate: startDate || date || Date.now(),
      endDate: endDate || date || Date.now(),
      sessions: sessions || [],
      // Compatibility fields
      trainingType,
      sessionSlot,
      mainWork,
      duration,
      intensity,
      notes,
      date: date || Date.now(),
      status: "pending"
    });

    console.log("Training assigned → only program created");

    res.status(201).json({
      message: "Training program created successfully",
      programId: program._id,
      program
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const getAthleteTrainingPlans = async (req, res) => {
  try {
    let athleteId = req.user.role === "athlete" ? req.user._id : req.params.athleteId;

    if (!athleteId) {
      console.error("[Backend] getAthleteTrainingPlans: No Athlete ID provided");
      return res.status(400).json({ message: "Athlete ID is required" });
    }

    const now = new Date();
    const currentHour = now.getHours();
    
    // Create a start of today date object for comparison
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    console.log(`[Backend] Processing plans for athlete: ${athleteId}. Server time: ${now.toISOString()} (Hour: ${currentHour})`);

    // 1. Detect missed sessions
    // ONLY mark plans from PREVIOUS days as missed.
    // Do NOT mark today's plans as missed — athlete should still see them.
    const pendingPlans = await TrainingProgram.find({
      athleteId,
      status: "pending",
    });

    console.log(`[Backend] Found ${pendingPlans.length} total pending plans for state check.`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const plan of pendingPlans) {
      const sessionDate = new Date(plan.date);
      sessionDate.setHours(0, 0, 0, 0);

      if (sessionDate < today) {
        // Only mark as missed if the plan date is BEFORE today
        console.log(`[Backend] Plan ${plan._id} from ${sessionDate.toDateString()} is past today. Marking missed.`);
        
        plan.status = "missed";
        await plan.save();

        // ✅ DATA INTEGRITY FIX: Check if a missed session already exists for this date/athlete
        // Avoids creating multiple 'MISSED' records if the user refreshes the training tab.
        const existingMissed = await TrainingSession.findOne({
          athlete: athleteId,
          date: plan.date,
          status: "missed",
          trainingType: plan.trainingType
        });

        if (!existingMissed) {
          await TrainingSession.create({
            athlete: athleteId,
            date: plan.date,
            sessionSlot: plan.sessionSlot,
            trainingType: plan.trainingType,
            mainWork: plan.mainWork,
            status: "missed",
            source: "manual"
          });
        }
      }
    }

    // STEP 1 — BACKEND DEBUG (IMPORTANT)
    console.log(`[Backend] Searching for plans for athleteId: ${athleteId}, User role: ${req.user.role}`);
    
    const programs = await TrainingProgram.find({
      athleteId: athleteId
    }).sort({ date: -1 });

    console.log(`[Backend] Found ${programs.length} programs for athlete: ${athleteId}`);
    if (programs.length > 0) {
      console.log(`[Backend] Top plan statuses: ${programs.map(p => p.status).join(", ")}`);
    }

    // STEP 2 — VERIFY DATA FORMAT
    res.status(200).json(programs || []);
  } catch (error) {
    console.error("[Backend] getAthleteTrainingPlans error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const editTrainingProgram = async (req, res) => {
  try {
    const { programId } = req.params;
    const updates = req.body;

    if (req.user.role !== "coach") {
      return res
        .status(403)
        .json({ message: "Only coaches can edit training programs" });
    }

    const program = await TrainingProgram.findById(programId);

    if (!program) {
      return res.status(404).json({ message: "Training program not found" });
    }

    if (program.coachId.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to edit this program" });
    }

    if (program.status === "cancelled") {
      return res
        .status(400)
        .json({ message: "Cancelled program cannot be edited" });
    }

    // Apply updates
    Object.assign(program, updates);
    await program.save();

    res.status(200).json({
      message: "Training program updated successfully",
      program
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const cancelTrainingProgram = async (req, res) => {
  try {
    const { programId } = req.params;

    if (req.user.role !== "coach") {
      return res
        .status(403)
        .json({ message: "Only coaches can cancel training programs" });
    }

    const program = await TrainingProgram.findById(programId);

    if (!program) {
      return res.status(404).json({ message: "Training program not found" });
    }

    if (program.coachId.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to cancel this program" });
    }

    if (program.status === "cancelled") {
      return res
        .status(400)
        .json({ message: "Training program already cancelled" });
    }

    program.status = "cancelled";
    await program.save();

    res.status(200).json({
      message: "Training program cancelled successfully"
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteTrainingProgram = async (req, res) => {
  try {
    const { programId } = req.params;
    const program = await TrainingProgram.findById(programId);

    if (!program) {
      return res.status(404).json({ message: "Training program not found" });
    }

    // Role-based check: Coach who created it OR the Athlete it belongs to
    if (req.user.role === "coach") {
      if (program.coachId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Not authorized to delete this program" });
      }
    } else if (req.user.role === "athlete") {
      if (program.athleteId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Not authorized to delete this program" });
      }
    }

    await TrainingProgram.findByIdAndDelete(programId);

    res.status(200).json({
      message: "Training program deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getActiveTrainingPlan = async (req, res) => {
  try {
    const { athleteId } = req.params;
    
    // Find the most recent active plan for this athlete
    const plan = await TrainingProgram.findOne({
      athleteId,
      status: { $ne: "cancelled" }
    }).sort({ createdAt: -1 });

    if (!plan) {
      return res.status(404).json({ message: "No active training plan found" });
    }

    res.status(200).json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createTrainingProgram,
  getAthleteTrainingPlans,
  editTrainingProgram,
  cancelTrainingProgram,
  deleteTrainingProgram,
  getActiveTrainingPlan
};
