const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

const User = require('./src/models/User');

async function migrate() {
  try {
    const uri = process.env.MONGO_URI || "mongodb://localhost:27017/smart-athlete";
    console.log("Connecting to:", uri);
    
    await mongoose.connect(uri);
    console.log("Connected to MongoDB.");

    // Update all users who don't have trainingMode to "self"
    const result = await User.updateMany(
      { trainingMode: { $exists: false } },
      { $set: { trainingMode: 'self' } }
    );

    console.log(`Migration complete. Updated ${result.modifiedCount} users.`);
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
