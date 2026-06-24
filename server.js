const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./src/config/db");
const authRoutes = require("./src/routes/authRoutes");
const trainingProgramRoutes = require("./src/routes/trainingProgramRoutes");
const chatRoutes = require("./src/routes/chatRoutes");
const analyticsRoutes = require("./src/routes/analyticsRoutes");

// Pre-load models to ensure they are registered for population
require("./src/models/User");
require("./src/models/TrainingProgram");
require("./src/models/ActiveSession");
require("./src/models/Message");
require("./src/models/TrainingSession");

const trainingEngineRoutes = require("./src/routes/trainingRoutes");

//coonect database
connectDB();

const app = express();
console.log("server file loaded");

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/training", trainingProgramRoutes);
app.use("/api/training-program", trainingProgramRoutes);
app.use("/api/training-engine", trainingEngineRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/analytics", analyticsRoutes);

app.get("/test", (req, res) => {
  res.send("TEST WORKING");
});

// Test route
app.get("/", (req, res) => {
  res.send("Smart Athlete Backend is running");
});

// Port
const PORT = process.env.PORT || 5000;

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

app.get("/test", (req, res) => {
  res.send("TEST WORKING");
});