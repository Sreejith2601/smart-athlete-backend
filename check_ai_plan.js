const mongoose = require('mongoose');
require('dotenv').config();

const TrainingProgram = require('./src/models/TrainingProgram');

async function checkDB() {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/smartathlete";
    await mongoose.connect(mongoUri);
    
    console.log("Connected to MongoDB.");
    
    const recentPlans = await TrainingProgram.find({ planName: "AI Daily Plan" })
      .sort({ createdAt: -1, date: -1 })
      .limit(1);
      
    if (recentPlans.length === 0) {
      console.log("No AI plans found.");
      process.exit(0);
    }
    
    const plan = recentPlans[0];
    console.log("--- LATEST AI DAILY PLAN ---");
    console.log(`Plan ID: ${plan._id}`);
    console.log(`Status: ${plan.status}`);
    console.log(`Date: ${plan.date}`);
    console.log(`Sessions count: ${plan.sessions?.length}`);
    
    if (plan.sessions) {
      plan.sessions.forEach((s, i) => {
        console.log(`  [${i}]: slot='${s.sessionSlot}' | status='${s.status}' | _id=${s._id}`);
      });
    }
    
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

checkDB();
