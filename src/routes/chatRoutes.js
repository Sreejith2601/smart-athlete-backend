const express = require("express");
const router = express.Router();

const {
  sendMessage,
  getMessages
} = require("../controllers/chatController");

const { protect } = require("../middleware/authMiddleware");

// Send a message
router.post("/send", protect, sendMessage);

// Get chat history with a specific user
router.get("/:otherUserId", protect, getMessages);

module.exports = router;
