document.addEventListener("DOMContentLoaded", () => {
  // ----------------- INSTRUCTOR SIDE -----------------
  const courseForm = document.getElementById("courseForm");
  const courseList = document.getElementById("instructorCourses");

  // Load saved courses from localStorage
  let courses = JSON.parse(localStorage.getItem("instructorCourses")) || [];

  function renderCourses() {
    if (!courseList) return; // Only for instructor page
    courseList.innerHTML = "";
    courses.forEach((course, index) => {
      const div = document.createElement("div");
      div.classList.add("course-item");
      div.innerHTML = `
        <img src="${course.img}" alt="${course.title}" style="max-width:200px; border-radius:8px;">
        <h3>${course.title}</h3>
        <p>${course.desc}</p>
        <button onclick="deleteCourse(${index})">Delete</button>
      `;
      courseList.appendChild(div);
    });
  }

  if (courseForm) {
    courseForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const title = document.getElementById("courseTitle").value;
      const desc = document.getElementById("courseDesc").value;
      const img = document.getElementById("courseImg").value;

      courses.push({ title, desc, img });
      localStorage.setItem("instructorCourses", JSON.stringify(courses));

      courseForm.reset();
      renderCourses();
    });
  }

  window.deleteCourse = function(index) {
    courses.splice(index, 1);
    localStorage.setItem("instructorCourses", JSON.stringify(courses));
    renderCourses();
  };

  renderCourses();

  // ----------------- STUDENT SIDE -----------------
  const studentCourseList = document.getElementById("studentCourses");

  function renderStudentCourses() {
    if (!studentCourseList) return; // Only for student page
    studentCourseList.innerHTML = "";

    if (courses.length === 0) {
      studentCourseList.innerHTML = "<p>No courses available yet. Please check back later.</p>";
      return;
    }

    courses.forEach((course) => {
      const div = document.createElement("div");
      div.classList.add("course-item");
      div.innerHTML = `
        <img src="${course.img}" alt="${course.title}" style="max-width:200px; border-radius:8px;">
        <h3>${course.title}</h3>
        <p>${course.desc}</p>
        <button onclick="enroll('${course.title}')">Enroll</button>
      `;
      studentCourseList.appendChild(div);
    });
  }

  // Enrollment handler
  window.enroll = function(courseTitle) {
    alert(`You have successfully enrolled in "${courseTitle}" 🎉`);
  };

  renderStudentCourses();
});

