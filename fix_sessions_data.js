const mongoose = require('mongoose');
const path = require('path');
const TrainingSession = require('./src/models/TrainingSession');

async function fixData() {
  try {
    await mongoose.connect('mongodb://localhost:27017/smart-athlete');
    console.log("Connected to DB...");

    // Find all sessions currently marked as coach that should be self (heuristic)
    const result = await TrainingSession.updateMany(
      { trainingMode: "coach" }, 
      { $set: { trainingMode: "self" } }
    );

    console.log(`Successfully fixed ${result.modifiedCount} sessions from 'coach' to 'self'.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixData();
