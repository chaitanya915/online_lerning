const API_URL = "https://online-lerning123.onrender.com";

const res = await fetch(`${API_URL}/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data)
});

// ========== INSTRUCTOR FORM SUBMISSION WITH FACE RECOGNITION ==========
document.getElementById("instructorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  // 🔹 Validate face capture for instructor
  const faceData = document.getElementById("faceDataInstructor").value;
  if (!faceData) {
    alert("⚠️ Please capture your face before registering as an instructor");
    const statusDiv = document.getElementById("faceStatusInstructor");
    if (statusDiv) {
      statusDiv.textContent = "⚠️ Face capture required for security!";
      statusDiv.className = "face-status error";
    }
    return;
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerText;
  submitBtn.disabled = true;
  submitBtn.innerText = "🔄 Registering...";
  
  try {
    const data = {
      name: document.getElementById("instructorName").value,
      email: document.getElementById("instructorEmail").value,
      password: document.getElementById("instructorPassword").value,
      department: document.getElementById("instructorDept").value,
      role: "instructor",
      // 🔹 ADD: Send face descriptor for instructor
      faceDescriptor: JSON.parse(faceData)
    };

    const res = await fetch("/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    
    if (res.ok) {
      alert("🎉 Instructor registration successful! You can now login.");
      // 🔹 Redirect instructor to instructor dashboard
      window.location.href = "instructor.html"; 
    } else {
      alert("❌ " + result.message);
    }
  } catch (err) {
    console.error("Instructor registration error:", err);
    alert("❌ Network error. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = originalText;
  }
});

// ========== STUDENT FORM SUBMISSION (Updated for consistency) ==========
document.getElementById("studentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  // Validate face capture for student
  const faceData = document.getElementById("faceDataStudent").value;
  if (!faceData) {
    alert("⚠️ Please capture your face before registering as a student");
    return;
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerText;
  submitBtn.disabled = true;
  submitBtn.innerText = "🔄 Registering...";
  
  try {
    const data = {
      name: document.getElementById("studentName").value,
      email: document.getElementById("studentEmail").value,
      password: document.getElementById("studentPassword").value,
      roll: document.getElementById("studentRoll").value,
      department: document.getElementById("studentDept").value,
      semester: document.getElementById("studentSem").value,
      role: "student",
      // ✅ Include face descriptor
      faceDescriptor: JSON.parse(faceData)
    };

    

const res = await fetch(`${API_URL}/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data)
});

    const result = await res.json();
    
    if (res.ok) {
      alert("🎉 Student registration successful! You can now login.");
      // 🔹 Redirect student to student dashboard
      window.location.href = "student.html"; 
    } else {
      alert("❌ " + result.message);
    }
  } catch (err) {
    console.error("Student registration error:", err);
    alert("❌ Network error. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = originalText;
  }
});


