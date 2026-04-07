// models/Assignment.js
const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  desc: { type: String, required: true },
  due: { type: String, required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" }, // Optional
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  department: String,
  semester: String,
}, { timestamps: true });

module.exports = mongoose.model("Assignment", assignmentSchema);
