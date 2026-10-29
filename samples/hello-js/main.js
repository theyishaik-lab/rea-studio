const { greet, isEnabled } = require("./lib/greet");

const API = "https://api.example.com/v1";

async function fetchProfile(id) {
  const res = await fetch(`${API}/users/${id}`);
  return res.json();
}

function main() {
  console.log(greet("world"));
  if (isEnabled("new-dashboard")) console.log("dashboard on");
  return fetchProfile(42);
}

module.exports = { main, fetchProfile };
