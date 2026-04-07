const mongoose = require("mongoose");

const discussionSchema = new mongoose.Schema({
  // 🔹 Course/Topic this discussion belongs to
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: [true, "Course ID is required"]
  },
  
  // 🔹 User who started the discussion
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Author is required"]
  },
  
  // 🔹 Discussion title
  title: {
    type: String,
    required: [true, "Title is required"],
    trim: true,
    maxlength: [200, "Title cannot exceed 200 characters"],
    minlength: [3, "Title must be at least 3 characters"]
  },
  
  // 🔹 Main question/content
  content: {
    type: String,
    required: [true, "Content is required"],
    trim: true,
    maxlength: [5000, "Content cannot exceed 5000 characters"],
    minlength: [10, "Content must be at least 10 characters"]
  },
  
  // 🔹 Tags for categorization
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 30
  }],
  
  // 🔹 Multi-lingual support
  language: {
    type: String,
    default: "en",
    enum: {
      values: ["en", "hi", "es", "fr", "ta", "te", "bn", "mr", "gu", "kn", "ml", "pa", "ur", "zh", "ar", "ja", "ko", "pt", "ru", "de", "it"],
      message: "Unsupported language code"
    }
  },
  
  // 🔹 Replies to this discussion (with _id for each reply)
  replies: [{
    _id: { 
      type: mongoose.Schema.Types.ObjectId, 
      default: () => new mongoose.Types.ObjectId() 
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reply author is required"]
    },
    content: {
      type: String,
      required: [true, "Reply content is required"],
      trim: true,
      maxlength: [2000, "Reply cannot exceed 2000 characters"],
      minlength: [1, "Reply cannot be empty"]
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    upvotes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }],
    isBestAnswer: {
      type: Boolean,
      default: false
    },
    language: {
      type: String,
      default: "en",
      enum: ["en", "hi", "es", "fr", "ta", "te", "bn", "mr", "gu", "kn", "ml", "pa", "ur", "zh", "ar", "ja", "ko", "pt", "ru", "de", "it"]
    }
  }],
  
  // 🔹 Upvotes for the main question
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  
  // 🔹 View count
  views: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // 🔹 Is this discussion pinned?
  isPinned: {
    type: Boolean,
    default: false
  },
  
  // 🔹 Is this discussion locked (no new replies)?
  isLocked: {
    type: Boolean,
    default: false
  },
  
  // 🔹 Is this discussion solved (has best answer)?
  isSolved: {
    type: Boolean,
    default: false
  },
  
  // 🔹 Best answer (reply _id)
  bestAnswer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Discussion.replies"
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 🔹 Virtual: Reply count (computed, not stored)
discussionSchema.virtual("replyCount").get(function() {
  return this.replies?.length || 0;
});

// 🔹 Virtual: Upvote count (computed, not stored)
discussionSchema.virtual("upvoteCount").get(function() {
  return this.upvotes?.length || 0;
});

// 🔹 Virtual: Language display name
discussionSchema.virtual("languageDisplay").get(function() {
  const names = {
    en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French',
    ta: 'Tamil', te: 'Telugu', bn: 'Bengali', mr: 'Marathi',
    gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi',
    ur: 'Urdu', zh: 'Chinese', ar: 'Arabic', ja: 'Japanese',
    ko: 'Korean', pt: 'Portuguese', ru: 'Russian', de: 'German', it: 'Italian'
  };
  return names[this.language] || this.language || 'Unknown';
});

// 🔹 Indexes for faster queries
discussionSchema.index({ courseId: 1, createdAt: -1 }); // Fast course discussions by date
discussionSchema.index({ tags: 1 }); // Fast tag-based filtering
discussionSchema.index({ author: 1, createdAt: -1 }); // Fast user's discussions
discussionSchema.index({ language: 1, createdAt: -1 }); // Fast language filtering
discussionSchema.index({ title: "text", content: "text", tags: "text" }); // Full-text search

// 🔹 Pre-save middleware: Auto-trim tags
discussionSchema.pre("save", function(next) {
  if (this.tags && Array.isArray(this.tags)) {
    this.tags = this.tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0);
  }
  next();
});

// 🔹 Method: Add a reply with validation
discussionSchema.methods.addReply = function({ author, content, language = "en" }) {
  if (!content || content.trim().length === 0) {
    throw new Error("Reply content cannot be empty");
  }
  
  const reply = {
    author,
    content: content.trim(),
    language: language || "en",
    upvotes: [],
    isBestAnswer: false
  };
  
  this.replies = this.replies || [];
  this.replies.push(reply);
  this.markModified("replies");
  
  return reply;
};

// 🔹 Method: Toggle upvote on discussion
discussionSchema.methods.toggleUpvote = function(userId) {
  this.upvotes = this.upvotes || [];
  const index = this.upvotes.indexOf(userId);
  
  if (index > -1) {
    this.upvotes.splice(index, 1); // Remove upvote
    return false; // Was upvoted, now removed
  } else {
    this.upvotes.push(userId); // Add upvote
    return true; // Newly upvoted
  }
};

// 🔹 Method: Toggle upvote on reply
discussionSchema.methods.toggleReplyUpvote = function(replyId, userId) {
  const reply = this.replies?.id(replyId);
  if (!reply) return null;
  
  reply.upvotes = reply.upvotes || [];
  const index = reply.upvotes.indexOf(userId);
  
  if (index > -1) {
    reply.upvotes.splice(index, 1);
    return false;
  } else {
    reply.upvotes.push(userId);
    return true;
  }
};

// 🔹 Method: Mark best answer
discussionSchema.methods.markBestAnswer = function(replyId) {
  const reply = this.replies?.id(replyId);
  if (!reply) return false;
  
  // Reset all replies
  if (this.replies) {
    this.replies.forEach(r => r.isBestAnswer = false);
  }
  
  // Set new best answer
  reply.isBestAnswer = true;
  this.bestAnswer = reply._id;
  this.isSolved = true;
  
  this.markModified("replies");
  return true;
};

// 🔹 Static: Search discussions with filters
discussionSchema.statics.search = function(query, options = {}) {
  const { courseId, language, tags, limit = 20, sort = "-createdAt" } = options;
  
  const searchQuery = {
    $or: [
      { title: { $regex: query, $options: "i" } },
      { content: { $regex: query, $options: "i" } },
      { tags: { $in: [new RegExp(query, "i")] } }
    ]
  };
  
  if (courseId) searchQuery.courseId = courseId;
  if (language) searchQuery.language = language;
  if (tags && Array.isArray(tags)) {
    searchQuery.tags = { $in: tags };
  }
  
  return this.find(searchQuery)
    .sort(sort)
    .limit(limit)
    .populate("author", "name email role faceVerified");
};

module.exports = mongoose.model("Discussion", discussionSchema);