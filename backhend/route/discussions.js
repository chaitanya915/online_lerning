const express = require("express");
const router = express.Router();
const mongoose = require("mongoose"); // 🔹 ADD: For ObjectId validation
const Discussion = require('../models/Discussion');
const auth = require("../middleware/auth");

// ✅ GET all discussions for a course - WITH VALIDATION
router.get("/course/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const { sort = "newest", tag, lang } = req.query;
    
    // 🔹 Validate courseId format (prevents CastError)
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      console.warn("⚠️ Invalid courseId format:", courseId);
      return res.status(400).json({ 
        success: false, 
        message: "Invalid course ID format" 
      });
    }
    
    let sortOptions = {};
    if (sort === "newest") sortOptions.createdAt = -1;
    else if (sort === "oldest") sortOptions.createdAt = 1;
    else if (sort === "popular") sortOptions.upvotes = -1;
    else if (sort === "active") sortOptions.updatedAt = -1;
    
    let query = { courseId };
    
    // 🔹 Filter by language if specified
    if (lang && lang !== 'all') {
      query.language = lang;
    }
    
    if (tag && tag !== "all") {
      query.tags = tag;
    }
    
    const discussions = await Discussion.find(query)
      .populate("author", "name email role faceVerified") // 🔹 Added faceVerified
      .populate("replies.author", "name email role")
      .sort(sortOptions)
      .lean();
    
    // Calculate reply count and last activity for each discussion
    const discussionsWithStats = discussions.map(disc => ({
      ...disc,
      replyCount: disc.replies?.length || 0,
      upvoteCount: disc.upvotes?.length || 0,
      lastActivity: disc.replies?.length > 0 
        ? disc.replies[disc.replies.length - 1].createdAt 
        : disc.createdAt,
      // 🔹 Add language info for frontend display
      languageDisplay: disc.language || 'Unknown'
    }));
    
    res.json({
      success: true,
      count: discussionsWithStats.length,
      discussions: discussionsWithStats,
      // 🔹 Return available languages for filter dropdown
      availableLanguages: [...new Set(discussions.map(d => d.language))].filter(Boolean)
    });
  } catch (err) {
    console.error("❌ Error fetching discussions:", err);
    
    // 🔹 Handle CastError specifically
    if (err.name === 'CastError' && err.path === 'courseId') {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid course ID format" 
      });
    }
    
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ GET single discussion by ID - WITH VALIDATION
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // 🔹 Validate discussion ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid discussion ID format" 
      });
    }
    
    const discussion = await Discussion.findById(id)
      .populate("author", "name email role department faceVerified")
      .populate("replies.author", "name email role faceVerified")
      .populate("courseId", "title");
    
    if (!discussion) {
      return res.status(404).json({ success: false, message: "Discussion not found" });
    }
    
    // Increment view count
    discussion.views = (discussion.views || 0) + 1;
    await discussion.save();
    
    // 🔹 Add language info and sanitize for response
    const discussionWithStats = {
      ...discussion.toObject(),
      replyCount: discussion.replies?.length || 0,
      upvoteCount: discussion.upvotes?.length || 0,
      languageDisplay: discussion.language || 'Unknown',
      replies: discussion.replies?.map(reply => ({
        ...reply,
        languageDisplay: reply.language || 'Unknown'
      })) || []
    };
    
    res.json({ success: true, discussion: discussionWithStats });
  } catch (err) {
    console.error("❌ Error fetching discussion:", err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid discussion ID format" 
      });
    }
    
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ CREATE new discussion - COMPLETE WITH VALIDATION & LOGGING
router.post("/create", auth("student"), async (req, res) => {
  console.log("🔍 [DEBUG] POST /api/discussions/create received");
  console.log("🔍 [DEBUG] req.user:", { id: req.user?.id, role: req.user?.role });
  
  try {
    const { courseId, title, content, tags, language } = req.body;
    
    // 🔹 Validate required fields
    if (!courseId || !title || !content) {
      console.warn("⚠️ Missing required fields:", { 
        courseId: !!courseId, 
        title: !!title, 
        content: !!content 
      });
      return res.status(400).json({ 
        success: false, 
        message: "Course ID, title, and content are required",
        errors: {
          courseId: courseId ? null : "Missing",
          title: title ? null : "Missing", 
          content: content ? null : "Missing"
        }
      });
    }
    
    // 🔹 Validate courseId is a valid ObjectId (prevents CastError)
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      console.warn("⚠️ Invalid courseId format:", courseId);
      return res.status(400).json({ 
        success: false, 
        message: "Invalid course ID format" 
      });
    }
    
    // 🔹 Create discussion with all required fields and defaults
    console.log("💾 Saving discussion to database...");
    
    const discussion = new Discussion({
      courseId,
      title: title.trim(),
      content: content.trim(),
      tags: tags ? tags.split(",").map(t => t.trim()).filter(t => t) : [],
      author: req.user.id,
      language: language || 'en', // 🔹 Default to English if not provided
      upvotes: [], // 🔹 Ensure array fields exist
      views: 0,
      replies: [],
      isPinned: false,
      isSolved: false
    });
    
    console.log("💾 Discussion object:", {
      _id: discussion._id,
      author: discussion.author,
      courseId: discussion.courseId,
      title: discussion.title.substring(0, 50) + "..."
    });
    
    const saved = await discussion.save();
    console.log("✅ Discussion saved successfully! ID:", saved._id);
    
    // Populate author info for response
    await saved.populate("author", "name email role faceVerified");
    
    // Return complete discussion object with all fields
    res.status(201).json({ 
      success: true, 
      message: "Discussion created successfully ✨",
      discussion: {
        _id: saved._id,
        title: saved.title,
        content: saved.content,
        author: saved.author,
        courseId: saved.courseId,
        tags: saved.tags,
        language: saved.language,
        languageDisplay: saved.language || 'Unknown',
        upvotes: saved.upvotes,
        upvoteCount: saved.upvotes?.length || 0,
        views: saved.views,
        replies: saved.replies,
        replyCount: saved.replies?.length || 0,
        isPinned: saved.isPinned,
        isSolved: saved.isSolved,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt
      }
    });
    
  } catch (err) {
    console.error("❌ [ERROR] Failed to create discussion:", err);
    console.error("❌ [ERROR] Error details:", {
      name: err.name,
      message: err.message,
      code: err.code,
      keyValue: err.keyValue,
      errors: err.errors,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    
    // 🔹 Return specific error based on type for better debugging
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: "Validation failed",
        errors: Object.values(err.errors).map(e => e.message)
      });
    }
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: "Duplicate entry" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Server error while creating discussion",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ✅ ADD reply to discussion - WITH VALIDATION
router.post("/:id/reply", auth("student"), async (req, res) => {
  try {
    const { id } = req.params;
    const { content, language } = req.body;
    
    // 🔹 Validate discussion ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid discussion ID format" 
      });
    }
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Reply content is required" 
      });
    }
    
    const discussion = await Discussion.findById(id);
    
    if (!discussion) {
      return res.status(404).json({ success: false, message: "Discussion not found" });
    }
    
    if (discussion.isLocked) {
      return res.status(403).json({ 
        success: false, 
        message: "This discussion is locked" 
      });
    }
    
    // 🔹 Create reply with all fields
    const reply = {
      _id: new mongoose.Types.ObjectId(), // 🔹 Ensure reply has an ID
      author: req.user.id,
      content: content.trim(),
      language: language || 'en',
      upvotes: [],
      isBestAnswer: false,
      createdAt: new Date()
    };
    
    discussion.replies = discussion.replies || []; // 🔹 Ensure replies array exists
    discussion.replies.push(reply);
    discussion.markModified('replies'); // 🔹 Mark as modified for Mongoose
    
    await discussion.save();
    
    // Populate the new reply with author info
    await discussion.populate("replies.author", "name email role faceVerified");
    
    // Find the just-added reply to return
    const newReply = discussion.replies[discussion.replies.length - 1];
    
    res.json({ 
      success: true, 
      message: "Reply added successfully ✨",
      reply: {
        ...newReply.toObject(),
        languageDisplay: newReply.language || 'Unknown'
      }
    });
  } catch (err) {
    console.error("❌ Error adding reply:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ UPVOTE discussion - WITH VALIDATION
router.post("/:id/upvote", auth("student"), async (req, res) => {
  try {
    const { id } = req.params;
    
    // 🔹 Validate discussion ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid discussion ID format" 
      });
    }
    
    const discussion = await Discussion.findById(id);
    
    if (!discussion) {
      return res.status(404).json({ success: false, message: "Discussion not found" });
    }
    
    const userId = req.user.id;
    const upvotes = discussion.upvotes || []; // 🔹 Ensure array exists
    const upvoteIndex = upvotes.indexOf(userId);
    
    if (upvoteIndex > -1) {
      // Remove upvote (unvote)
      upvotes.splice(upvoteIndex, 1);
    } else {
      // Add upvote
      upvotes.push(userId);
    }
    
    discussion.upvotes = upvotes;
    discussion.markModified('upvotes');
    await discussion.save();
    
    res.json({ 
      success: true, 
      upvotes: upvotes.length,
      isUpvoted: upvoteIndex === -1
    });
  } catch (err) {
    console.error("❌ Error upvoting:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ UPVOTE reply - WITH VALIDATION
router.post("/:id/reply/:replyId/upvote", auth("student"), async (req, res) => {
  try {
    const { id, replyId } = req.params;
    
    // 🔹 Validate IDs
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(replyId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid ID format" 
      });
    }
    
    const discussion = await Discussion.findById(id);
    
    if (!discussion) {
      return res.status(404).json({ success: false, message: "Discussion not found" });
    }
    
    const reply = discussion.replies?.id(replyId);
    
    if (!reply) {
      return res.status(404).json({ success: false, message: "Reply not found" });
    }
    
    const userId = req.user.id;
    const upvotes = reply.upvotes || []; // 🔹 Ensure array exists
    const upvoteIndex = upvotes.indexOf(userId);
    
    if (upvoteIndex > -1) {
      upvotes.splice(upvoteIndex, 1);
    } else {
      upvotes.push(userId);
    }
    
    reply.upvotes = upvotes;
    discussion.markModified('replies');
    await discussion.save();
    
    res.json({ 
      success: true, 
      upvotes: upvotes.length,
      isUpvoted: upvoteIndex === -1
    });
  } catch (err) {
    console.error("❌ Error upvoting reply:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ MARK best answer (instructor only) - WITH VALIDATION
router.post("/:id/best-answer/:replyId", auth("instructor"), async (req, res) => {
  try {
    const { id, replyId } = req.params;
    
    // 🔹 Validate IDs
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(replyId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid ID format" 
      });
    }
    
    const discussion = await Discussion.findById(id);
    
    if (!discussion) {
      return res.status(404).json({ success: false, message: "Discussion not found" });
    }
    
    const reply = discussion.replies?.id(replyId);
    
    if (!reply) {
      return res.status(404).json({ success: false, message: "Reply not found" });
    }
    
    // Reset all replies
    if (discussion.replies) {
      discussion.replies.forEach(r => r.isBestAnswer = false);
    }
    
    // Set new best answer
    reply.isBestAnswer = true;
    discussion.bestAnswer = reply._id;
    discussion.isSolved = true; // 🔹 Mark discussion as solved
    
    discussion.markModified('replies');
    await discussion.save();
    
    res.json({ success: true, message: "Best answer marked successfully ✨" });
  } catch (err) {
    console.error("❌ Error marking best answer:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ SEARCH discussions - WITH COURSE FILTER & VALIDATION
router.get("/search/:query", async (req, res) => {
  try {
    const { query } = req.params;
    const { courseId } = req.query; // 🔹 Added courseId filter
    
    // Build search query
    const searchQuery = {
      $or: [
        { title: { $regex: query, $options: "i" } },
        { content: { $regex: query, $options: "i" } },
        { tags: { $in: [new RegExp(query, "i")] } }
      ]
    };
    
    // 🔹 Filter by courseId if provided
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      searchQuery.courseId = courseId;
    }
    
    const discussions = await Discussion.find(searchQuery)
      .populate("author", "name email role faceVerified")
      .limit(20)
      .lean();
    
    // Add stats and language info
    const discussionsWithStats = discussions.map(disc => ({
      ...disc,
      replyCount: disc.replies?.length || 0,
      upvoteCount: disc.upvotes?.length || 0,
      languageDisplay: disc.language || 'Unknown'
    }));
    
    res.json({ 
      success: true, 
      count: discussionsWithStats.length, 
      discussions: discussionsWithStats 
    });
  } catch (err) {
    console.error("❌ Error searching:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// ✅ CREATE new discussion - WITH DEBUG LOGGING
router.post("/create", auth("student"), async (req, res) => {
  console.log("🔍 [BACKEND DEBUG] POST /api/discussions/create received");
  console.log("🔍 [BACKEND DEBUG] req.user:", { id: req.user?.id, role: req.user?.role });
  console.log("🔍 [BACKEND DEBUG] req.body:", {
    courseId: req.body.courseId,
    title: req.body.title?.substring(0, 50),
    contentLength: req.body.content?.length,
    tags: req.body.tags,
    language: req.body.language
  });
  
  try {
    const { courseId, title, content, tags, language } = req.body;
    
    // 🔹 Validate required fields
    if (!courseId || !title || !content) {
      console.warn("⚠️ [BACKEND DEBUG] Missing required fields:", { 
        courseId: !!courseId, 
        title: !!title, 
        content: !!content 
      });
      return res.status(400).json({ 
        success: false, 
        message: "Course ID, title, and content are required",
        errors: {
          courseId: courseId ? null : "Missing",
          title: title ? null : "Missing", 
          content: content ? null : "Missing"
        }
      });
    }
    
    // 🔹 Validate courseId is a valid ObjectId
    const mongoose = require("mongoose");
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      console.warn("⚠️ [BACKEND DEBUG] Invalid courseId format:", courseId);
      return res.status(400).json({ 
        success: false, 
        message: "Invalid course ID format" 
      });
    }
    
    // 🔹 Create discussion
    console.log("💾 [BACKEND DEBUG] Saving discussion to database...");
    
    const discussion = new Discussion({
      courseId,
      title: title.trim(),
      content: content.trim(),
      tags: tags ? tags.split(",").map(t => t.trim()).filter(t => t) : [],
      author: req.user.id,
      language: language || 'en',
      upvotes: [],
      views: 0,
      replies: []
    });
    
    console.log("💾 [BACKEND DEBUG] Discussion object before save:", {
      _id: discussion._id,
      author: discussion.author,
      courseId: discussion.courseId,
      title: discussion.title.substring(0, 50)
    });
    
    const saved = await discussion.save();
    console.log("✅ [BACKEND DEBUG] Discussion saved successfully! ID:", saved._id);
    
    // Populate author for response
    await saved.populate("author", "name email role faceVerified");
    
    res.status(201).json({ 
      success: true, 
      message: "Discussion created successfully ✨",
      discussion: {
        _id: saved._id,
        title: saved.title,
        content: saved.content,
        author: saved.author,
        courseId: saved.courseId,
        tags: saved.tags,
        language: saved.language,
        createdAt: saved.createdAt
      }
    });
    
  } catch (err) {
    console.error("❌ [BACKEND DEBUG] Failed to create discussion:", err);
    console.error("❌ [BACKEND DEBUG] Error details:", {
      name: err.name,
      message: err.message,
      code: err.code,
      keyValue: err.keyValue,
      errors: err.errors
    });
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: "Validation failed",
        errors: Object.values(err.errors).map(e => e.message)
      });
    }
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: "Duplicate entry" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Server error while creating discussion",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ✅ NEW: Get supported languages endpoint (for frontend dropdown)
router.get("/languages", (req, res) => {
  const languages = [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
    { code: 'te', name: 'Telugu', native: 'తెలుగు' },
    { code: 'bn', name: 'Bengali', native: 'বাংলা' },
    { code: 'mr', name: 'Marathi', native: 'मराठी' }
  ];
  
  res.json({ success: true, languages });
});

module.exports = router;