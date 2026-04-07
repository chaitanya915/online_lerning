const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
  department: { type: String, required: true },  // e.g. "CSE"
  semester: { type: Number, required: true },    // e.g. 2
  name: { type: String, required: true },        // e.g. "Data Structures"
  description: { type: String },                 // subject details
  progress: { type: Number, default: 0 }         // default progress
});

module.exports = mongoose.model("Subject", subjectSchema);
