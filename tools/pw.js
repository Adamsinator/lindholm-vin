// Playwright for the browser tests: the project's own install (npm i playwright, as in CI), or the one that comes
// with this machine's Node.
"use strict";
try { module.exports = require("playwright"); }
catch (e) { module.exports = require("/opt/node22/lib/node_modules/playwright"); }
