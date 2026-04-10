require('dotenv').config();

const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const path = require("node:path");
const multer = require("multer");
const fs = require("fs");

const uploadDir = path.join(__dirname, "uploads/videos");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/videos");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files allowed"), false);
  },
});

// Models
const User = require("./models/User");
const Subject = require("./models/Subject");
const Content = require("./models/Content");
const Assignment = require("./models/Assignment");
const Course = require("./models/Course");
const Quiz = require("./models/Quiz");
const QuizResult = require("./models/QuizResult");
const Discussion = require("./models/Discussion");

const app = express();
const discussionRoutes = require("./route/discussions");

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if (req.path.includes('/models/') && req.path.includes('shard')) {
    res.setHeader('Content-Type', 'application/octet-stream');
  }
  next();
});
app.use(bodyParser.json());
app.use(cors());
app.use("/uploads", express.static("uploads"));
app.use("/models", express.static(path.join(__dirname, "public")));
app.use("/api/discussions", discussionRoutes);

// ✅ Connect MongoDB
mongoose
  .connect(process.env.MONGO_URI || "mongodb+srv://appuser123:appuser123@cluster0.yiofgea.mongodb.net/sspm", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ✅ JWT Secret
const JWT_SECRET = "305d963719cf4c43bb471d0e446ee73029550d6592e80045844b6731f0f48d14fb02615df2753b8827f00bc7f5ec98c74e8b1087529ced81bcfef80f8e433cff";

// ✅ OTP memory store
let otpStore = {};

// 🔹 NEW: Euclidean distance helper (for face recognition)
function euclideanDistance(arr1, arr2) {
  if (!arr1 || !arr2 || arr1.length !== arr2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    sum += Math.pow(arr1[i] - arr2[i], 2);
  }
  return Math.sqrt(sum);
}

// ✅ Middleware to check token & role
function auth(requiredRole) {
  return (req, res, next) => {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided ❌" });
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token ❌" });
      }
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ message: "Access denied ❌" });
      }
      req.user = decoded;
      next();
    });
  };
}

app.use(express.static(path.join(__dirname, "../fronthend")));

app.get("/api", (req, res) => {
  res.send("Backend is running 🚀");
});

// 🔹 UPDATED: Signup with face recognition for BOTH students AND instructors
app.post("/signup", async (req, res) => {
  const {
    name,
    email,
    password,
    roll,
    department,
    semester,
    role,
    faceDescriptor
  } = req.body;

  try {
    // 🔹 Face capture required for BOTH students AND instructors
    if ((role === "student" || role === "instructor") && !faceDescriptor) {
      return res.status(400).json({
        message: `Please capture your face before registering as ${role}.`
      });
    }

    // Check student roll duplicate (only for students)
    if (role === "student") {
      const existingStudent = await User.findOne({
        roll,
        department,
        semester,
        role: "student"
      });
      if (existingStudent) {
        return res.status(400).json({
          message: "Roll number already registered in this department and semester."
        });
      }
    }

    // Check email duplicate
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        message: "Email already registered."
      });
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
      roll,
      department,
      semester,
      role,
      faceDescriptor  // 🔹 Save face descriptor for instructors too
    });

    await user.save();

    res.json({
      message: "Signup successful",
      role: role
    });

  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/debug-files", (req, res) => {
  const frontendPath = path.join(__dirname, "../fronthend");
  res.json({
    lookingIn: frontendPath,
    exists: fs.existsSync(frontendPath),
    files: fs.existsSync(frontendPath) 
      ? fs.readdirSync(frontendPath).filter(f => f.endsWith('.html'))
      : "Folder not found"
  });
});

app.get("/video/:filename", (req, res) => {
  const videoPath = path.join(__dirname, "uploads/videos", req.params.filename);
  if (!fs.existsSync(videoPath)) {
    return res.status(404).send("Video not found");
  }
  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    });
    fs.createReadStream(videoPath).pipe(res);
    return;
  }
  const parts = range.replace(/bytes=/, "").split("-");
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
  const chunkSize = end - start + 1;
  const stream = fs.createReadStream(videoPath, { start, end });
  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": chunkSize,
    "Content-Type": "video/mp4",
  });
  stream.pipe(res);
});

// 🔹 UPDATED: Login with optional face verification for instructors
app.post("/login", async (req, res) => {
  try {
    const { email, password, role, faceDescriptor } = req.body;
    
    // Find user
    const user = await User.findOne({ email, password, role });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials ❌" });
    }

    // 🔹 If instructor and face descriptor provided, verify face
    if (role === "instructor" && faceDescriptor && user.faceDescriptor) {
      const distance = euclideanDistance(user.faceDescriptor, faceDescriptor);
      const THRESHOLD = 0.6;
      
      if (distance >= THRESHOLD) {
        console.log(`[INSTRUCTOR_LOGIN] ${email} | Face verification FAILED | Distance: ${distance.toFixed(4)}`);
        return res.status(403).json({ 
          message: "Face verification failed. Please ensure you're the authorized instructor ❌" 
        });
      }
      console.log(`[INSTRUCTOR_LOGIN] ${email} | Face verification SUCCESS | Distance: ${distance.toFixed(4)}`);
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful 🎉",
      token,
      role: user.role,
      userId: user._id
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Error logging in" });
  }
});

// 🔹 NEW: Instructor face verification endpoint (for secure actions)
app.post("/verify-instructor-face", auth("instructor"), async (req, res) => {
  try {
    const { descriptor, action } = req.body; // action: "login", "add-quiz", "grade", etc.
    
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ 
        verified: false, 
        message: "Invalid face descriptor format" 
      });
    }

    const instructor = await User.findById(req.user.id);
    if (!instructor || !instructor.faceDescriptor || !Array.isArray(instructor.faceDescriptor)) {
      return res.status(404).json({ 
        verified: false, 
        message: "Instructor face data not found. Please register your face first." 
      });
    }

    const distance = euclideanDistance(instructor.faceDescriptor, descriptor);
    const THRESHOLD = 0.6;
    const confidence = Math.max(0, (1 - distance / THRESHOLD) * 100).toFixed(2);
    const isVerified = distance < THRESHOLD;
    
    console.log(`[INSTRUCTOR_VERIFY] ${instructor.email} | Action: ${action} | Distance: ${distance.toFixed(4)} | Verified: ${isVerified}`);
    
    // Log suspicious attempts
    if (!isVerified) {
      console.warn(`⚠️ Suspicious instructor verification attempt: ${instructor.email} for action: ${action}`);
    }
    
    res.json({ 
      verified: isVerified, 
      confidence: parseFloat(confidence),
      distance: distance.toFixed(4),
      message: isVerified ? "Instructor identity verified ✅" : "Identity mismatch - access denied ⚠️"
    });
    
  } catch (err) {
    console.error("❌ Instructor face verification error:", err);
    res.status(500).json({ 
      verified: false, 
      message: "Verification service unavailable" 
    });
  }
});

// ✅ Face verification for students (existing - now also supports instructors)
app.post("/verify-face", async (req, res) => {
  try {
    const { email, descriptor, sessionId } = req.body;
    
    if (!email || !descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ 
        verified: false, 
        message: "Invalid face descriptor format" 
      });
    }

    const user = await User.findOne({ email });
    if (!user || !user.faceDescriptor || !Array.isArray(user.faceDescriptor)) {
      return res.status(404).json({ 
        verified: false, 
        message: "User not found or no face data registered" 
      });
    }

    const distance = euclideanDistance(user.faceDescriptor, descriptor);
    const THRESHOLD = 0.6;
    const confidence = Math.max(0, (1 - distance / THRESHOLD) * 100).toFixed(2);
    const isVerified = distance < THRESHOLD;
    
    console.log(`[FACE_VERIFY] ${email} (${user.role}) | Distance: ${distance.toFixed(4)} | Confidence: ${confidence}% | Verified: ${isVerified}`);
    
    if (!isVerified && sessionId && user.role === "student") {
      await QuizResult.updateOne(
        { sessionId },
        { $push: { verificationLogs: {
          timestamp: new Date(),
          distance,
          confidence: parseFloat(confidence),
          verified: false,
          action: "FLAGGED"
        }}}
      );
    }
    
    res.json({ 
      verified: isVerified, 
      confidence: parseFloat(confidence),
      distance: distance.toFixed(4),
      message: isVerified ? "Identity verified ✅" : "Identity mismatch ⚠️"
    });
    
  } catch (err) {
    console.error("❌ Face verification error:", err);
    res.status(500).json({ 
      verified: false, 
      message: "Verification service unavailable" 
    });
  }
});

// 🔹 NEW: Continuous verification for instructor quiz monitoring
app.post("/api/instructor/verify-session", auth("instructor"), async (req, res) => {
  try {
    const { quizId, descriptor, sessionId } = req.body;
    const instructorEmail = req.user.email;
    
    const instructor = await User.findById(req.user.id);
    if (!instructor?.faceDescriptor) {
      return res.status(400).json({ status: "ERROR", message: "No face data found for instructor" });
    }
    
    const distance = euclideanDistance(instructor.faceDescriptor, descriptor);
    const THRESHOLD = 0.6;
    
    let status, action;
    if (distance < THRESHOLD * 0.8) {
      status = "VERIFIED";
      action = "CONTINUE";
    } else if (distance < THRESHOLD) {
      status = "LOW_CONFIDENCE";
      action = "WARN";
    } else {
      status = "MISMATCH";
      action = "FLAG";
    }
    
    // Log verification
    if (sessionId) {
      await QuizResult.updateOne(
        { _id: sessionId },
        { 
          $push: { 
            verificationLogs: {
              timestamp: new Date(),
              distance,
              confidence: ((1 - distance/THRESHOLD)*100).toFixed(2),
              status,
              action,
              verifiedBy: "instructor"
            }
          },
          $set: { lastInstructorVerification: new Date() }
        }
      );
    }
    
    console.log(`[INSTRUCTOR_SESSION] ${instructorEmail} | Quiz: ${quizId} | ${status}`);
    
    res.json({
      status,
      action,
      confidence: ((1 - distance/THRESHOLD)*100).toFixed(2),
      distance: distance.toFixed(4),
      timestamp: new Date()
    });
    
  } catch (err) {
    console.error("Instructor session verification error:", err);
    res.status(500).json({ status: "ERROR", message: "Verification failed" });
  }
});

// 🔹 UPDATED: Add quiz with optional face verification for instructor
app.post("/api/add-quiz", auth("instructor"), async (req, res) => {
  try {
    const { title, course, questions, department, semester, faceDescriptor } = req.body;

    // 🔹 Optional: Require face verification for sensitive actions
    if (faceDescriptor) {
      const instructor = await User.findById(req.user.id);
      if (instructor?.faceDescriptor) {
        const distance = euclideanDistance(instructor.faceDescriptor, faceDescriptor);
        if (distance >= 0.6) {
          return res.status(403).json({ message: "Face verification failed. Cannot add quiz ❌" });
        }
      }
    }

    if (!title || !course || !questions || !questions.length) {
      return res.status(400).json({ message: "All fields are required ❌" });
    }

    const newQuiz = await Quiz.create({
      title,
      course,
      department: String(department).trim().toUpperCase(),
      semester: Number(semester),
      questions,
      instructorId: mongoose.Types.ObjectId(req.user.id)
    });

    res.status(201).json({
      message: "Quiz added successfully ✅",
      quiz: newQuiz,
    });
  } catch (err) {
    console.error("❌ Error adding quiz:", err);
    res.status(500).json({ message: "Error adding quiz ❌" });
  }
});
// 🔹 NEW: Create Quiz Endpoint (Matches Frontend "Create Questions" logic)
// 🔹 FIXED: Create Quiz Endpoint
app.post("/api/create-quiz", auth("instructor"), async (req, res) => {
  try {
    const { title, course, department, semester, questions } = req.body;

    // Validation
    if (!title || !course || !department || !semester) {
      return res.status(400).json({ message: "Missing quiz details (Title, Course, Dept, Semester) ❌" });
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: "Quiz must have at least one question ❌" });
    }

    // Validate each question structure
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question || !q.options || !q.answer) {
        return res.status(400).json({ message: `Question ${i + 1} is incomplete ❌` });
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        return res.status(400).json({ message: `Question ${i + 1} needs at least 2 options ❌` });
      }
    }

    // Create the Quiz in MongoDB
    const newQuiz = await Quiz.create({
      title,
      course,
      department: String(department).trim().toUpperCase(),
      semester: Number(semester),
      questions,
      // ✅ FIXED: Use req.user.id directly (Mongoose auto-casts to ObjectId)
      instructorId: req.user.id
    });

    console.log(`✅ Quiz Created: ${title} by Instructor ${req.user.id}`);

    res.status(201).json({
      message: "Quiz created successfully ✅",
      quiz: newQuiz
    });

  } catch (err) {
    console.error("❌ Error creating quiz:", err);
    res.status(500).json({ 
      message: "Server error while creating quiz ❌", 
      error: err.message 
    });
  }
});

// 🧑‍🏫 Instructor adds an assignment (with optional face verification)
app.post("/api/add-assignment", auth("instructor"), async (req, res) => {
  try {
    const { title, desc, due, department, semester, faceDescriptor } = req.body;

    // 🔹 Optional face verification for sensitive actions
    if (faceDescriptor) {
      const instructor = await User.findById(req.user.id);
      if (instructor?.faceDescriptor) {
        const distance = euclideanDistance(instructor.faceDescriptor, faceDescriptor);
        if (distance >= 0.6) {
          return res.status(403).json({ message: "Face verification failed ❌" });
        }
      }
    }

    if (!title || !desc || !due || !department || !semester) {
      return res.status(400).json({ message: "All fields are required ❌" });
    }

    const newAssignment = new Assignment({
      title,
      desc,
      due,
      department,
      semester,
      instructorId: req.user.id,
    });

    await newAssignment.save();
    res.status(201).json({ message: "✅ Assignment added successfully!", assignment: newAssignment });
  } catch (err) {
    console.error("❌ Error adding assignment:", err);
    res.status(500).json({ message: "Error adding assignment ❌" });
  }
});

// ✅ Add Course with VIDEO UPLOAD (with optional face verification)
app.post(
  "/api/add-course-upload",
  auth("instructor"),
  upload.single("videoFile"),
  async (req, res) => {
    try {
      const { title, module, description, img, faceDescriptor } = req.body;

      // 🔹 Optional face verification
      if (faceDescriptor) {
        const instructor = await User.findById(req.user.id);
        if (instructor?.faceDescriptor) {
          const distance = euclideanDistance(instructor.faceDescriptor, faceDescriptor);
          if (distance >= 0.6) {
            return res.status(403).json({ message: "Face verification failed ❌" });
          }
        }
      }

      if (!title || !description) {
        return res.status(400).json({ message: "Title and description required" });
      }

      const course = await Course.create({
        title,
        description,
        img,
        instructorId: req.user.id
      });

      await Content.create({
        title,
        module,
        description,
        video: `/uploads/videos/${req.file?.filename}`,
        courseId: course._id,
        instructorId: req.user.id
      });

      res.json({
        message: "Course created successfully ✅",
        courseId: course._id
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error creating course ❌" });
    }
  }
);

app.post(
  "/api/add-content",
  auth("instructor"),
  upload.single("video"),
  async (req, res) => {
    try {
      const { title, module, description, courseId, faceDescriptor } = req.body;

      // 🔹 Optional face verification
      if (faceDescriptor) {
        const instructor = await User.findById(req.user.id);
        if (instructor?.faceDescriptor) {
          const distance = euclideanDistance(instructor.faceDescriptor, faceDescriptor);
          if (distance >= 0.6) {
            return res.status(403).json({ message: "Face verification failed ❌" });
          }
        }
      }

      const videoPath = req.file ? `/uploads/videos/${req.file.filename}` : null;

      const content = await Content.create({
        title,
        module,
        description,
        video: videoPath,
        courseId,
        instructorId: req.user.id
      });
      res.json({ message: "Content uploaded successfully ✅", content });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to upload content ❌" });
    }
  }
);

// 🧑‍🏫 Instructor fetches own quizzes
app.get("/api/instructor-quizzes-with-results", auth("instructor"), async (req, res) => {
  try {
    const quizzes = await Quiz.find({ instructorId: req.user.id }).select("_id title");
    const quizIds = quizzes.map(q => q._id);
    const results = await QuizResult.find({ quizId: { $in: quizIds } })
      .populate("studentId", "name email");
    res.json({ quizzes, results });
  } catch (err) {
    console.error("❌ Error fetching quizzes with results:", err);
    res.status(500).json({ message: "Failed to load quizzes ❌" });
  }
});

// 📊 Instructor views quiz results
app.get("/api/quiz-results/:quizId", auth("instructor"), async (req, res) => {
  try {
    const results = await QuizResult.find({ quizId: req.params.quizId })
      .populate("studentId", "name email")
      .sort({ submittedAt: -1 });
    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching quiz results:", err);
    res.status(500).json({ message: "Failed to fetch results ❌" });
  }
});

// 🎓 Student fetches a single quiz with questions
app.get("/api/quiz/:id", auth("student"), async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found ❌" });
    }
    res.json(quiz);
  } catch (err) {
    console.error("❌ Error fetching quiz:", err);
    res.status(500).json({ message: "Error fetching quiz ❌" });
  }
});

// ✅ Student submits quiz result
app.post("/api/submit-quiz-result", auth("student"), async (req, res) => {
  try {
    const { quizId, score, total } = req.body;
    const studentId = req.user.id;
    if (!quizId || score === undefined || !total) {
      return res.status(400).json({ message: "Missing data ❌" });
    }
    const previousAttempts = await QuizResult.countDocuments({ quizId, studentId });
    const result = new QuizResult({
      quizId,
      studentId,
      score,
      total,
      attempt: previousAttempts + 1,
    });
    await result.save();
    res.json({
      message: "Quiz result saved successfully ✅",
      attempt: result.attempt,
    });
  } catch (err) {
    console.error("❌ Error saving quiz result:", err);
    res.status(500).json({ message: "Failed to save quiz result ❌" });
  }
});

// 🎓 Student fetches assignments by department & semester
app.get("/api/assignments", auth("student"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "Student not found ❌" });
    const assignments = await Assignment.find({
      department: user.department,
      semester: user.semester,
    }).sort({ createdAt: -1 });
    res.json(assignments);
  } catch (err) {
    console.error("❌ Error fetching assignments:", err);
    res.status(500).json({ message: "Error fetching assignments ❌" });
  }
});

const subjectsByDepartment = {
  CSE: {
    1: ["Mathematics I", "Physics", "Chemistry", "Engineering Mechanics", "Basic Electrical & Electronics Engineering", "C Programming", "Professional and Communication Ethics"],
    2: ["Mathematics II", "Elective Physics", "Elective Chemistry", "Engineering Graphics", "Python Programming", "Program Core Course"],
    3: ["Database Systems", "Object-Oriented Programming", "Discrete Math", "Computer Organization"],
    4: ["Operating Systems", "Software Engineering", "Design & Analysis of Algorithms", "Probability & Statistics"],
    5: ["Computer Networks", "Artificial Intelligence", "Web Technologies", "Compiler Design"],
    6: ["Machine Learning", "Cloud Computing", "Cyber Security", "Big Data Analytics"],
    7: ["Deep Learning", "Blockchain", "Internet of Things", "Mobile Computing"],
    8: ["Project Work", "Seminar", "Research Paper", "Internship"],
  },
  CE: {
    1: ["Mathematics I", "Physics", "Chemistry", "Engineering Mechanics", "Basic Electrical & Electronics Engineering", "C Programming", "Professional and Communication Ethics"],
    2: ["Mathematics II", "Elective Physics", "Elective Chemistry", "Engineering Graphics", "Python Programming", "Program Core Course"],
    3: ["Mathematics – III", "Data Structures", "Digital Logic & Computer Architecture", "Discrete Structures", "Computer Graphics", "Business Communication & Ethics I"],
    4: ["Mathematics – IV", "Analysis of Algorithm", "Database Management Systems", "Operating System", "Microprocessor"],
    5: ["Theoretical Computer Science", "Software Engineering", "Computer Networks", "Data Warehouse And Mining", "Professional Communication and Ethics-2", "Internet Programming"],
    6: ["Internet of Things", "System Programming and Compiler Contruction", "Cryptography and System Security", "Mobile Computing", "Artificial Intelligence"],
    7: ["Artificial Intelligence", "Big Data Analytics", "Blockchain", "IoT"],
    8: ["Project Work", "Seminar", "Internship", "Research Paper"],
  },
  AIML: {
    1: ["Mathematics I", "Physics", "Chemistry", "Engineering Mechanics", "Basic Electrical & Electronics Engineering", "C Programming", "Professional and Communication Ethics"],
    2: ["Mathematics II", "Elective Physics", "Elective Chemistry", "Engineering Graphics", "Python Programming", "Program Core Course"],
    3: ["Database Systems", "Object-Oriented Programming", "Probability & Statistics", "Discrete Math"],
    4: ["Operating Systems", "Software Engineering", "Design & Analysis of Algorithms", "Linear Algebra"],
    5: ["Artificial Intelligence", "Machine Learning", "Natural Language Processing", "Deep Learning"],
    6: ["Computer Vision", "Reinforcement Learning", "Data Mining", "Cloud Computing"],
    7: ["Big Data Analytics", "Robotics", "Ethics in AI", "IoT for AI"],
    8: ["Capstone Project", "Seminar", "Internship", "Research Paper"],
  },
  MECH: {
    1: ["Mathematics I", "Physics", "Chemistry", "Engineering Mechanics", "Basic Electrical & Electronics Engineering", "C Programming", "Professional and Communication Ethics"],
    2: ["Mathematics II", "Elective Physics", "Elective Chemistry", "Engineering Graphics", "Python Programming", "Program Core Course"],
    3: ["Fluid Mechanics", "Mechanics of Solids", "Manufacturing Technology", "Electrical Machines"],
    4: ["Kinematics of Machinery", "Heat Transfer", "Machine Drawing", "Mathematics III"],
    5: ["Dynamics of Machinery", "Design of Machine Elements", "IC Engines", "Metrology"],
    6: ["Refrigeration & Air Conditioning", "Finite Element Analysis", "Robotics", "Energy Engineering"],
    7: ["Automobile Engineering", "Power Plant Engineering", "Advanced Manufacturing", "CAD/CAM"],
    8: ["Major Project", "Seminar", "Internship", "Industrial Training"],
  },
  Mechatronics: {
    1: ["Mathematics I", "Physics", "Chemistry", "Engineering Mechanics", "Basic Electrical & Electronics Engineering", "C Programming", "Professional and Communication Ethics"],
    2: ["Mathematics II", "Elective Physics", "Elective Chemistry", "Engineering Graphics", "Python Programming", "Program Core Course"],
    3: ["Fluid Mechanics", "Microcontrollers", "Manufacturing Technology", "Signals & Systems"],
    4: ["Robotics Basics", "Control Systems", "Kinematics of Machinery", "Mechatronic Systems"],
    5: ["Embedded Systems", "Sensors & Actuators", "Automobile Systems", "Machine Design"],
    6: ["Advanced Robotics", "Industrial Automation", "AI in Mechatronics", "Hydraulics & Pneumatics"],
    7: ["Smart Manufacturing", "IoT in Mechatronics", "Cyber-Physical Systems", "Machine Vision"],
    8: ["Capstone Project", "Seminar", "Internship", "Industrial Training"],
  },
  ELE: {
    1: ["Mathematics I", "Physics", "Chemistry", "Engineering Mechanics", "Basic Electrical & Electronics Engineering", "C Programming", "Professional and Communication Ethics"],
    2: ["Mathematics II", "Elective Physics", "Elective Chemistry", "Engineering Graphics", "Python Programming", "Program Core Course"],
    3: ["Electrical Machines I", "Digital Electronics", "Signals & Systems", "Control Systems"],
    4: ["Electrical Machines II", "Power Systems I", "Power Electronics", "Electromagnetic Fields"],
    5: ["Power Systems II", "Microprocessors & Applications", "Renewable Energy Systems", "Measurements & Instrumentation"],
    6: ["Switchgear & Protection", "High Voltage Engineering", "Control of Electric Drives", "Embedded Systems"],
    7: ["Smart Grid", "Energy Auditing", "FACTS Devices", "Industrial Automation"],
    8: ["Major Project", "Seminar", "Internship", "Industrial Training"],
  },
};

// ✅ Student Dashboard
app.get("/student-dashboard", auth("student"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "Student not found ❌" });
    const studentDept = String(user.department).trim().toUpperCase();
    const studentSem = Number(user.semester);
    const studentSubjects = await Subject.find({ department: studentDept, semester: studentSem });
    const subjectsWithContents = await Promise.all(
      studentSubjects.map(async (subject) => {
        const contents = await Content.find({ subject: subject._id });
        return {
          subjectId: subject._id,
          subjectName: subject.name,
          contents: contents.map((c) => ({
            title: c.title,
            description: c.description,
            resources: c.resources,
          })),
        };
      })
    );
    const assignments = await Assignment.find({
      department: studentDept,
      semester: studentSem,
    }).sort({ createdAt: -1 });
    const courses = await Course.find({
      $or: [
        { department: studentDept },
        { semester: studentSem },
        { department: { $exists: false } },
      ],
    }).sort({ createdAt: -1 });
    const quizzes = await Quiz.find({
      department: studentDept,
      semester: studentSem
    }).sort({ createdAt: -1 });
    res.json({
      message: "Welcome Student 🎓",
      profile: {
        name: user.name,
        email: user.email,
        roll: user.roll,
        department: studentDept,
        semester: studentSem,
        progress: user.progress || 50,
      },
      learning: subjectsWithContents,
      courses,
      assignments,
      quizzes,
    });
  } catch (err) {
    console.error("❌ Error fetching student dashboard:", err);
    res.status(500).json({ message: "Error loading student dashboard ❌" });
  }
});

// 🔹 NEW: Instructor Dashboard with face verification status
app.get("/instructor-dashboard", auth("instructor"), async (req, res) => {
  try {
    const instructor = await User.findById(req.user.id).select("-password");
    res.json({ 
      message: "Welcome Instructor! 👩‍🏫",
      profile: {
        name: instructor?.name,
        email: instructor?.email,
        department: instructor?.department,
        hasFaceData: !!instructor?.faceDescriptor  // 🔹 Tell frontend if face is registered
      }
    });
  } catch (err) {
    console.error("❌ Error fetching instructor dashboard:", err);
    res.status(500).json({ message: "Error loading instructor dashboard ❌" });
  }
});

app.post("/forgot", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Email not registered ❌" });
    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStore[email] = otp;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { 
        user: process.env.EMAIL_USER || "your_email@gmail.com", 
        pass: process.env.EMAIL_PASS || "your_app_password" 
      },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_USER || "your_email@gmail.com",
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP is ${otp}`,
    });
    res.json({ message: "OTP sent to your email ✅" });
  } catch (err) {
    console.error("❌ Error sending OTP:", err);
    res.status(500).json({ message: "Error sending OTP ❌" });
  }
});

app.post("/reset", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (otpStore[email] && otpStore[email] == otp) {
      await User.updateOne({ email }, { $set: { password: newPassword } });
      delete otpStore[email];
      res.json({ message: "Password reset successful ✅" });
    } else {
      res.status(400).json({ message: "Invalid OTP ❌" });
    }
  } catch (err) {
    console.error("❌ Reset error:", err);
    res.status(500).json({ message: "Error resetting password" });
  }
});

app.get("/subjects/:dept/:sem", async (req, res) => {
  try {
    const { dept, sem } = req.params;
    const subjects = await Subject.find({ department: dept, semester: sem });
    res.json({ subjects });
  } catch (err) {
    console.error("❌ Subjects fetch error:", err);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

// GET: Instructor fetches own uploads
app.get("/api/my-uploads", auth("instructor"), async (req, res) => {
  try {
    const uploads = await Content.find({ instructorId: req.user.id });
    res.json(uploads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load uploads ❌" });
  }
});

// PUT: Update existing upload
app.put(
  "/api/my-uploads/:id",
  auth("instructor"),
  upload.single("video"),
  async (req, res) => {
    try {
      const { title, module, description } = req.body;
      const content = await Content.findById(req.params.id);
      if (!content) return res.status(404).json({ message: "Content not found ❌" });
      if (title) content.title = title;
      if (module) content.module = module;
      if (description) content.description = description;
      if (req.file) content.video = `/uploads/videos/${req.file.filename}`;
      await content.save();
      res.json({ message: "Upload updated successfully ✅", content });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update upload ❌" });
    }
  }
);

// ✅ Get single course + all instructor contents
app.get("/api/course/:id", auth("student"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found ❌" });
    const contents = await Content.find({ courseId: course._id });
    res.json({
      _id: course._id,
      title: course.title,
      desc: course.desc,
      img: course.img,
      contents: contents.map(c => ({
        _id: c._id,
        title: c.title,
        module: c.module,
        description: c.description,
        videoUrl: `http://localhost:5000${c.video}`
      }))
    });
  } catch (err) {
    console.error("❌ Error loading course:", err);
    res.status(500).json({ message: "Failed to load course ❌" });
  }
});

app.get("/contents/:subjectId", auth("student"), async (req, res) => {
  try {
    const { subjectId } = req.params;
    const contents = await Content.find({ subject: subjectId });
    const contentsWithSubjectName = await Promise.all(
      contents.map(async (c) => {
        const subject = await Subject.findById(c.subject);
        return {
          _id: c._id,
          title: c.title,
          description: c.description,
          resources: c.resources,
          subjectName: subject ? subject.name : "Unknown",
        };
      })
    );
    res.json(contentsWithSubjectName);
  } catch (err) {
    console.error("❌ Error fetching contents:", err);
    res.status(500).json({ message: "Error fetching contents ❌" });
  }
});

app.get("/contents/:dept/:sem", auth("student"), async (req, res) => {
  try {
    const { dept, sem } = req.params;
    const subjects = await Subject.find({ department: dept, semester: sem });
    const contents = await Content.find({
      subject: { $in: subjects.map((s) => s._id) },
    });
    res.json({ subjects, contents });
  } catch (err) {
    console.error("❌ Contents fetch error:", err);
    res.status(500).json({ message: "Error fetching contents ❌" });
  }
});

async function seedSubjects() {
  try {
    const count = await Subject.countDocuments();
    if (count === 0) {
      console.log("🌱 Seeding subjects into MongoDB...");
      for (const dept in subjectsByDepartment) {
        for (const sem in subjectsByDepartment[dept]) {
          for (const name of subjectsByDepartment[dept][sem]) {
            await Subject.create({ name, department: dept, semester: Number(sem) });
          }
        }
      }
      console.log("✅ Subjects seeded successfully!");
    } else {
      console.log("ℹ️ Subjects already exist, skipping seeding.");
    }
  } catch (err) {
    console.error("❌ Error seeding subjects:", err);
  }
}
mongoose.connection.once("open", seedSubjects);

app.use(express.static(path.join(__dirname, "../fronthend")));

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
