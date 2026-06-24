const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");


const registerUser = async (req, res) => {
  try {
    console.log("=== [Backend] Register endpoint hit ===");
    console.log("[Backend] req.body:", JSON.stringify(req.body, null, 2));

    const { name, email, password, role, age, gender, sport, specialization, experience, profile } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      console.log("[Backend] Missing required fields:", { name: !!name, email: !!email, password: !!password, role: !!role });
      return res.status(400).json({ message: "Missing required fields: name, email, password, role" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log("[Backend] User already exists:", email);
      return res.status(400).json({ message: "User already exists" });
    }

    // Encrypt password
    const hashedPassword = await bcrypt.hash(password, 10);

    const { trainingMode } = req.body;

    // Build user data
    const userData = {
      name,
      email,
      password: hashedPassword,
      role,
      age: age ? parseInt(age) : undefined,
      gender,
      sport,
      specialization,
      experience: experience ? parseInt(experience) : undefined,
      trainingMode: trainingMode || (profile && profile.trainingMode) || "self",
      profile: profile || {},
    };

    console.log("[Backend] Creating user with data:", JSON.stringify({ ...userData, password: "[HIDDEN]" }, null, 2));

    // Create user
    const user = await User.create(userData);

    console.log("[Backend] User created successfully. ID:", user._id);

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "User registered successfully",
      userId: user._id,
      token,
      role: user.role,
      trainingMode: user.trainingMode
    });

  } catch (error) {
    console.error("[Backend] Registration error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`[Backend] Login attempt for: ${email}`);

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[Backend] Login failed: User not found (${email})`);
      return res.status(404).json({ message: "User not found" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(`[Backend] Login failed: Invalid credentials for ${email}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    console.log(`[Backend] Login successful for: ${email} (Role: ${user.role})`);

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      role: user.role,
      userId: user._id,
      trainingMode: user.trainingMode
    });
  } catch (error) {
    console.error(`[Backend] Login server error: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    console.log("[Backend] GET /me hit for user:", req.user?._id);

    if (!req.user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(req.user);
  } catch (error) {
    console.error("[Backend] getProfile error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    console.log("[Backend] PUT /me hit for user:", req.user?._id);
    console.log("[Backend] Update data:", JSON.stringify(req.body, null, 2));

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update allowed fields
    const { name, age, gender, sport, specialization, experience, restingHR, profile, cycle } = req.body;

    if (name) user.name = name;
    if (age !== undefined) user.age = age;
    if (gender !== undefined) user.gender = gender;
    if (sport !== undefined) user.sport = sport;
    if (specialization !== undefined) user.specialization = specialization;
    if (experience !== undefined) user.experience = experience;
    if (restingHR !== undefined) user.restingHR = restingHR;

    if (profile !== undefined) {
      // Merge profile data so partial updates work
      user.profile = { ...user.profile, ...profile };
      user.markModified("profile"); // Required for Mixed type
    }

    if (cycle !== undefined) {
      user.cycle = { ...user.cycle, ...cycle };
      user.markModified("cycle");
    }

    await user.save();

    console.log("[Backend] Profile updated successfully for:", user._id);

    // Return updated user without password
    const updatedUser = await User.findById(user._id).select("-password");
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("[Backend] updateProfile error:", error.message);
    res.status(500).json({ message: error.message });
  }
};
const getAthletes = async (req, res) => {
  try {
    if (req.user.role !== "coach") {
      return res.status(403).json({ message: "Only coaches can access the athletes list." });
    }

    const athletes = await User.find({ role: "athlete", trainingMode: "coach" }).select("-password");
    res.status(200).json(athletes);
  } catch (error) {
    console.error("[Backend] getAthletes error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const getCoaches = async (req, res) => {
  try {
    const coaches = await User.find({ role: "coach" }).select("-password");
    res.status(200).json(coaches);
  } catch (error) {
    console.error("[Backend] getCoaches error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// ─── FORGOT / RESET PASSWORD (New) ──────────────────────────────────────────

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Return success even if user not found to avoid email enumeration
      return res.status(200).json({ message: "If that email exists, a reset code has been sent." });
    }

    // Generate a 6-digit numeric reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store hashed token + expiry (1 hour from now)
    user.resetPasswordToken = crypto.createHash("sha256").update(resetCode).digest("hex");
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // ── Email Transport: Try Gmail → Fall back to Ethereal preview ──────────
    let transporter;
    let useEthereal = false;

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    const gmailReady = gmailUser && gmailPass &&
      gmailUser !== "your_gmail@gmail.com" &&
      gmailPass !== "your_16_char_app_password";

    if (gmailReady) {
      transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: gmailUser, pass: gmailPass },
        tls: { rejectUnauthorized: false },
      });

      // Verify connection before sending
      try {
        await transporter.verify();
      } catch (verifyErr) {
        console.warn("[FORGOT PASSWORD] Gmail verify failed:", verifyErr.message);
        console.warn("[FORGOT PASSWORD] Switching to Ethereal preview...");
        useEthereal = true;
      }
    } else {
      useEthereal = true;
    }

    if (useEthereal) {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    }

    const mailOptions = {
      from: gmailReady && !useEthereal
        ? `"Smart Athlete" <${gmailUser}>`
        : '"Smart Athlete" <noreply@smartathlete.dev>',
      to: email,
      subject: "Your Smart Athlete Password Reset Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #FFF5F5; border-radius: 16px; padding: 32px;">
          <h2 style="color: #1E293B; margin-bottom: 4px;">Password Reset</h2>
          <p style="color: #64748B; font-size: 14px; margin-top: 0;">Smart Athlete — Your Training Companion</p>
          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
          <p style="color: #1E293B; font-size: 15px;">Hi there,</p>
          <p style="color: #475569; font-size: 14px; line-height: 22px;">
            We received a request to reset your password. Use the 6-digit code below. It expires in <strong>1 hour</strong>.
          </p>
          <div style="background: #FFFFFF; border: 2px solid #FF6B6B; border-radius: 12px; text-align: center; padding: 24px; margin: 24px 0;">
            <p style="margin: 0; color: #94A3B8; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">Your Reset Code</p>
            <p style="margin: 8px 0 0; color: #FF6B6B; font-size: 40px; font-weight: 900; letter-spacing: 8px;">${resetCode}</p>
          </div>
          <p style="color: #94A3B8; font-size: 12px; text-align: center;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      if (useEthereal) {
        // Print preview URL to console — open this in browser to see the email
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log("============================================================");
        console.log("[FORGOT PASSWORD] ETHEREAL PREVIEW (open in browser):");
        console.log(previewUrl);
        console.log("[FORGOT PASSWORD] Reset code for", email, ":", resetCode);
        console.log("============================================================");
      } else {
        console.log("[FORGOT PASSWORD] Email sent to:", email);
      }
    } catch (sendErr) {
      // Last resort: always log the code so development is never blocked
      console.error("[FORGOT PASSWORD] Send failed:", sendErr.message);
      console.warn("[FORGOT PASSWORD] Manual code for", email, ":", resetCode);
    }
    // ────────────────────────────────────────────────────────────────────────

    return res.status(200).json({ message: "If that email exists, a reset code has been sent." });
  } catch (error) {
    console.error("[Backend] forgotPassword error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: "Email, code, and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Hash the incoming code to compare
    const hashedCode = crypto.createHash("sha256").update(code).digest("hex");

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedCode,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);

    // Invalidate the token
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    console.log("[Backend] Password reset successful for:", email);
    return res.status(200).json({ message: "Password reset successful. Please log in." });
  } catch (error) {
    console.error("[Backend] resetPassword error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { registerUser, loginUser, getProfile, updateProfile, getAthletes, getCoaches, forgotPassword, resetPassword };
