// Where the site sends API requests (API_URL in config.js), for the browser tests to answer in its place, plus Apps
// Script's own address, which the site used before the gateway: page.route(require("./api-route"), …).
"use strict";
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8");
const host = new URL(src.match(/API_URL:\s*"([^"]+)"/)[1]).host.replace(/\./g, "\\.");
module.exports = new RegExp(`^https://(script\\.google\\.com|${host})/`);
