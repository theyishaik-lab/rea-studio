const FEATURE_FLAG = "new-dashboard";

function greet(name) {
  return `Hello, ${name}!`;
}

function isEnabled(flag) {
  return flag === FEATURE_FLAG;
}

module.exports = { greet, isEnabled };
