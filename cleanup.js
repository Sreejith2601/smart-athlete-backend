const mongoose = require('mongoose');
require('dotenv').config();

const TrainingProgram = require('./src/models/TrainingProgram');
const TrainingSession = require('./src/models/TrainingSession');

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Show what exists
    const allPrograms = await TrainingProgram.find();
    console.log(`\nTotal TrainingPrograms in DB: ${allPrograms.length}`);
    allPrograms.forEach(p => {
      console.log(`  - ID: ${p._id} | Athlete: ${p.athleteId} | Type: ${p.trainingType} | Status: ${p.status} | Date: ${p.date}`);
    });

    // Delete today's programs
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const deletedPrograms = await TrainingProgram.deleteMany({
      date: { $gte: startOfToday, $lte: endOfToday }
    });
    console.log(`\nDeleted ${deletedPrograms.deletedCount} today's TrainingPrograms`);

    // Also delete today's training sessions (missed records created by the old logic)
    const deletedSessions = await TrainingSession.deleteMany({
      date: { $gte: startOfToday, $lte: endOfToday }
    });
    console.log(`Deleted ${deletedSessions.deletedCount} today's TrainingSessions`);

    // Show remaining
    const remaining = await TrainingProgram.find();
    console.log(`\nRemaining TrainingPrograms: ${remaining.length}`);

    console.log("\n✅ Cleanup done! You can now assign a new training from the coach.");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

cleanup();
