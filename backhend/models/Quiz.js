const mongoose = require("mongoose");   
const quizSchema = new mongoose.Schema({
  title: String,
  course: String,

  department: String,   // ✅ ADD
  semester: Number,     // ✅ ADD

  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  questions: [
    {
      question: String,
      options: [String],
      answer: String
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model("Quiz", quizSchema);



