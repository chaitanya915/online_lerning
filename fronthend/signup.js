const API_URL = "https://online-lerning123.onrender.com";

// ========== INSTRUCTOR ==========
document.getElementById("instructorForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const faceData = document.getElementById("faceDataInstructor").value;
  if (!faceData) {
    alert("⚠️ Please capture your face before registering");
    return;
  }

  try {
    const data = {
      name: document.getElementById("instructorName").value,
      email: document.getElementById("instructorEmail").value,
      password: document.getElementById("instructorPassword").value,
      department: document.getElementById("instructorDept").value,
      role: "instructor",
      faceDescriptor: JSON.parse(faceData)
    };

    const res = await fetch(`${API_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.ok) {
      alert("Instructor registered");
      window.location.href = "instructor.html";
    } else {
      alert(result.message);
    }

  } catch (err) {
    alert("server error");
  }
});


// ========== STUDENT ==========
document.getElementById("studentForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const faceData = document.getElementById("faceDataStudent").value;
  if (!faceData) {
    alert("⚠️ Capture face first");
    return;
  }

  try {
    const data = {
      name: document.getElementById("studentName").value,
      email: document.getElementById("studentEmail").value,
      password: document.getElementById("studentPassword").value,
      roll: document.getElementById("studentRoll").value,
      department: document.getElementById("studentDept").value,
      semester: document.getElementById("studentSem").value,
      role: "student",
      faceDescriptor: JSON.parse(faceData)
    };

    const res = await fetch(`${API_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.ok) {
      alert("Student registered");
      window.location.href = "student.html";
    } else {
      alert(result.message);
    }

  } catch (err) {
    alert("Server error");
  }
});