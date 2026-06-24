const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const User = require('./src/models/User');

async function migrate() {
  try {
    const uri = process.env.MONGO_URI || "mongodb://localhost:27017/smart-athlete";
    await mongoose.connect(uri);
    console.log("Connected to MongoDB.");

    // Sync from profile.trainingMode to top-level trainingMode
    const coachResult = await User.updateMany(
      { 'profile.trainingMode': 'coach' },
      { $set: { trainingMode: 'coach' } }
    );
    console.log(`Synced 'coach' mode for ${coachResult.modifiedCount} users.`);

    const selfResult = await User.updateMany(
      { 'profile.trainingMode': 'self', trainingMode: { $ne: 'self' } },
      { $set: { trainingMode: 'self' } }
    );
    console.log(`Synced 'self' mode for ${selfResult.modifiedCount} users.`);

    // Final sweep for those with NO trainingMode anywhere
    const defaultResult = await User.updateMany(
      { trainingMode: { $exists: false } },
      { $set: { trainingMode: 'self' } }
    );
    console.log(`Defaulted 'self' mode for ${defaultResult.modifiedCount} users.`);

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
