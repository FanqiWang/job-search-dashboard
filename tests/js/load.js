// Loads the dashboard's plain browser scripts into one shared context, the
// same way index.html does, and returns their top-level functions and constants.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const APP = path.resolve(__dirname, "../../app");

function load(...files) {
  const context = vm.createContext({ console });
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(APP, file), "utf8"), context, { filename: file });
  }
  // Top-level const/let live in the context's global scope, not on the context object.
  return new Proxy({}, { get: (_, name) => vm.runInContext(String(name), context) });
}

module.exports = { load, APP };
