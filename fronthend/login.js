document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
    role: document.getElementById("role").value
  };

  const res = await fetch("https://online-lerning123.onrender.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await res.json();

  if (res.ok) {
    alert(result.message);
    if (result.role === "student") {
      window.location.href = "student.html";
    } else {
      window.location.href = "instructor.html";
    }
  } else {
    alert(result.message);
  }
});
