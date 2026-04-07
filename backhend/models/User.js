const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  roll: String,
  department: String,
  semester: String,
  role: String,
  // Add to your User schema
faceDescriptor: {
    type: [Number], // Array of 128 floats
    required: function() { return this.role === 'student'; }
},
verificationHistory: [{
    timestamp: { type: Date, default: Date.now },
    action: String, // 'signup', 'quiz_start', 'quiz_monitor'
    confidence: Number,
    distance: Number,
    ipAddress: String,
    userAgent: String
}]
});

// enforce unique roll + dept + semester for students
userSchema.index(
  { roll: 1, department: 1, semester: 1, role: 1 },
  { unique: true, partialFilterExpression: { role: "student" } }
);

module.exports = mongoose.model("User", userSchema);
