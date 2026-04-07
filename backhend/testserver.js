const http = require("http");

function checkServer(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:5000${path}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        console.log(`✅ ${path} → ${res.statusCode}`);
        console.log(data.slice(0, 100) + "..."); // print first 100 chars
        resolve();
      });
    }).on("error", (err) => {
      console.error(`❌ Error fetching ${path}:`, err.message);
      reject(err);
    });
  });
}

async function runTests() {
  console.log("🔍 Checking server on http://localhost:5000 ...\n");
  await checkServer("/");      // frontend (index.html)
  await checkServer("/api");   // backend test route
}

runTests();
