const mongoose = require("mongoose");

const quizResultSchema = new mongoose.Schema({
  // ========== CORE QUIZ DATA ==========
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quiz",
    required: true,
    index: true // ✅ Faster lookup by quiz
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true // ✅ Faster lookup by student
  },
  score: {
    type: Number,
    required: true,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 1
  },
  attempt: {
    type: Number,
    default: 1
  },
  submittedAt: {
    type: Date,
    default: Date.now,
    index: true // ✅ Sort by submission time
  },

  // ========== FACE VERIFICATION STATS (Summary) ==========
  verificationStats: {
    totalChecks: { type: Number, default: 0 },      // How many times we checked
    successfulVerifications: { type: Number, default: 0 }, // Passed checks
    failedVerifications: { type: Number, default: 0 },     // Failed checks
    noFaceDetected: { type: Number, default: 0 },    // Camera couldn't see face
    multipleFacesDetected: { type: Number, default: 0 }, // Anti-collusion triggers
    
    // Calculated fields (set before save)
    verificationScore: { 
      type: Number,
      default: 100 // 100% = all checks passed
    },
    integrityFlag: {
      type: String,
      enum: ['CLEAN', 'LOW_CONFIDENCE', 'SUSPICIOUS', 'COMPROMISED'],
      default: 'CLEAN'
    }
  },

  // ========== DETAILED VERIFICATION LOGS ==========
  verificationLogs: [{
    timestamp: { type: Date, default: Date.now },
    
    // What happened
    event: {
      type: String,
      enum: [
        'QUIZ_START',           // Initial verification
        'PERIODIC_CHECK',       // Routine monitoring
        'NO_FACE_DETECTED',     // Camera issue
        'MULTIPLE_FACES',       // Anti-collusion trigger
        'VERIFICATION_PASSED',  // Face matched
        'VERIFICATION_FAILED',  // Face mismatch
        'QUIZ_PAUSED',          // Security pause
        'QUIZ_RESUMED',         // After manual review
        'QUIZ_SUBMITTED'        // Final submission
      ],
      required: true
    },
    
    // Biometric data (for audit)
    distance: { type: Number },              // Euclidean distance (lower = better)
    confidence: { type: Number, min: 0, max: 100 }, // Confidence percentage
    threshold: { type: Number, default: 0.6 },      // Threshold used for comparison
    
    // Context
    facesDetected: { type: Number, default: 1 },   // How many faces in frame
    action: {
      type: String,
      enum: ['CONTINUE', 'WARN', 'PAUSE', 'FLAG'],
      default: 'CONTINUE'
    },
    message: { type: String } // Human-readable note
  }],

  // ========== SESSION & SECURITY METADATA ==========
  sessionId: { 
    type: String, 
    index: true // ✅ Track unique quiz sessions
  },
  
  // Device/environment info (for fraud detection)
  sessionMeta: {
    ipAddress: String,
    userAgent: String,
    screenResolution: String,
    timezone: String,
    startedAt: Date,
    completedAt: Date,
    totalTimeSeconds: Number,
    pausedDurationSeconds: { type: Number, default: 0 }
  },

  // ========== INSTRUCTOR REVIEW FIELDS ==========
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User" // Instructor who reviewed
  },
  reviewNotes: String,
  reviewStatus: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'FLAGGED', 'INVALIDATED'],
    default: 'PENDING'
  },
  reviewedAt: Date

}, {
  timestamps: true, // Adds createdAt/updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ========== INDEXES FOR PERFORMANCE ==========
// Composite index for instructor dashboard queries
quizResultSchema.index({ quizId: 1, studentId: 1 });
quizResultSchema.index({ 'verificationStats.integrityFlag': 1, submittedAt: -1 });
quizResultSchema.index({ sessionId: 1 });

// ========== VIRTUALS (Calculated Fields) ==========
// Overall verification pass rate
quizResultSchema.virtual('verificationPassRate').get(function() {
  if (this.verificationStats.totalChecks === 0) return null;
  return ((this.verificationStats.successfulVerifications / this.verificationStats.totalChecks) * 100).toFixed(1);
});

// Percentage score
quizResultSchema.virtual('percentageScore').get(function() {
  if (!this.total) return 0;
  return ((this.score / this.total) * 100).toFixed(1);
});

// Risk assessment summary
quizResultSchema.virtual('riskAssessment').get(function() {
  const stats = this.verificationStats;
  const passRate = parseFloat(this.verificationPassRate) || 100;
  
  if (stats.integrityFlag === 'COMPROMISED') return 'CRITICAL';
  if (stats.multipleFacesDetected > 0) return 'HIGH';
  if (stats.failedVerifications > stats.totalChecks * 0.3) return 'MEDIUM';
  if (passRate < 80) return 'LOW';
  return 'NONE';
});

// ========== PRE-SAVE MIDDLEWARE: Auto-calculate integrity ==========
quizResultSchema.pre('save', function(next) {
  const stats = this.verificationStats;
  
  // Calculate verification score
  if (stats.totalChecks > 0) {
    stats.verificationScore = Math.round(
      (stats.successfulVerifications / stats.totalChecks) * 100
    );
  }
  
  // Determine integrity flag based on rules
  if (stats.multipleFacesDetected > 0) {
    stats.integrityFlag = 'COMPROMISED';
  } else if (stats.failedVerifications > stats.totalChecks * 0.4) {
    stats.integrityFlag = 'SUSPICIOUS';
  } else if (stats.failedVerifications > 0 || stats.noFaceDetected > 3) {
    stats.integrityFlag = 'LOW_CONFIDENCE';
  } else {
    stats.integrityFlag = 'CLEAN';
  }
  
  next();
});

// ========== INSTANCE METHODS ==========
// Add a verification log entry
quizResultSchema.methods.addVerificationLog = function(logData) {
  this.verificationLogs.push({
    ...logData,
    timestamp: new Date()
  });
  
  // Update summary stats
  const stats = this.verificationStats;
  stats.totalChecks++;
  
  switch(logData.event) {
    case 'VERIFICATION_PASSED':
      stats.successfulVerifications++;
      break;
    case 'VERIFICATION_FAILED':
      stats.failedVerifications++;
      break;
    case 'NO_FACE_DETECTED':
      stats.noFaceDetected++;
      break;
    case 'MULTIPLE_FACES':
      stats.multipleFacesDetected++;
      break;
  }
  
  return this.save();
};

// Mark quiz as reviewed by instructor
quizResultSchema.methods.markReviewed = function(instructorId, status, notes) {
  this.reviewedBy = instructorId;
  this.reviewStatus = status;
  this.reviewNotes = notes;
  this.reviewedAt = new Date();
  return this.save();
};

// Get suspicious activity summary
quizResultSchema.methods.getSuspicionReport = function() {
  const logs = this.verificationLogs;
  return {
    totalEvents: logs.length,
    failedVerifications: logs.filter(l => l.event === 'VERIFICATION_FAILED').length,
    multipleFaceAlerts: logs.filter(l => l.event === 'MULTIPLE_FACES').length,
    pauseEvents: logs.filter(l => l.event === 'QUIZ_PAUSED').length,
    avgConfidence: logs.filter(l => l.confidence).length > 0
      ? (logs.filter(l => l.confidence).reduce((sum, l) => sum + l.confidence, 0) / 
         logs.filter(l => l.confidence).length).toFixed(1)
      : null,
    lowestConfidence: logs.filter(l => l.confidence).length > 0
      ? Math.min(...logs.filter(l => l.confidence).map(l => l.confidence))
      : null
  };
};

// ========== STATIC METHODS (Class-level) ==========
// Find quizzes needing instructor review
quizResultSchema.statics.findNeedingReview = function(quizId) {
  return this.find({
    quizId,
    'verificationStats.integrityFlag': { $in: ['SUSPICIOUS', 'COMPROMISED', 'LOW_CONFIDENCE'] },
    reviewStatus: 'PENDING'
  }).sort({ submittedAt: -1 });
};

// Get verification analytics for a quiz
quizResultSchema.statics.getVerificationAnalytics = async function(quizId) {
  const results = await this.find({ quizId });
  
  const total = results.length;
  const clean = results.filter(r => r.verificationStats.integrityFlag === 'CLEAN').length;
  const flagged = results.filter(r => r.verificationStats.integrityFlag !== 'CLEAN').length;
  
  const avgPassRate = results.length > 0
    ? (results.reduce((sum, r) => sum + (parseFloat(r.verificationPassRate) || 100), 0) / results.length).toFixed(1)
    : 100;
  
  return {
    totalSubmissions: total,
    cleanSubmissions: clean,
    flaggedSubmissions: flagged,
    flagRate: ((flagged / total) * 100).toFixed(1) + '%',
    averageVerificationPassRate: avgPassRate + '%',
    integrityBreakdown: {
      CLEAN: clean,
      LOW_CONFIDENCE: results.filter(r => r.verificationStats.integrityFlag === 'LOW_CONFIDENCE').length,
      SUSPICIOUS: results.filter(r => r.verificationStats.integrityFlag === 'SUSPICIOUS').length,
      COMPROMISED: results.filter(r => r.verificationStats.integrityFlag === 'COMPROMISED').length
    }
  };
};

module.exports = mongoose.model("QuizResult", quizResultSchema);