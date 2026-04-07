const mongoose = require("mongoose");

const contentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    module: {                     
      type: String,
      default: "General"
    },

    description: {
      type: String,
      required: true
    },

    video: {
      type: String
    },

    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course"
    },

    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Content", contentSchema);




