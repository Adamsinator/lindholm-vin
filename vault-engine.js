// Runs apps-script/Code.gs in the browser over a user's decrypted cellar (an in-memory spreadsheet, gas-fake.js), so
// an encrypted account's cellar logic is the very code the server runs for a plain one. vault.js feeds it the
// decrypted tabs, runs each private action here, and encrypts back whatever tabs changed.
//
//   const e = VAULT_ENGINE.create(codeGsText, { Ark1: rows, Journal: rows }, { sheetName: "Ark1" })
//   e.run({ action: "add", wine: {…} }) → { res: {ok, wines…}, trashed: [photo ids] };  e.tabs() → current tabs
(function (root) {
"use strict";
const FAKE = (typeof module !== "undefined" && module.exports) ? require("./gas-fake.js") : root.GAS_FAKE;

function create(src, tabs, opts) {
  opts = opts || {};
  const rt = FAKE.runtime(tabs || {}, { today: opts.today });
  const trashed = [];
  const hooks = {
    // vault.js uploads a journal photo encrypted first and passes "vault:<file id>" in place of the image
    savePhoto: (dataUrl) => { const s = String(dataUrl || ""); if (s.slice(0, 6) === "vault:") return s.slice(6); throw new Error("photo-not-uploaded"); },
    trashPhoto: (id) => { if (id) trashed.push(String(id)); },
    getPhoto: () => { throw new Error("photo-in-vault"); },
  };
  const names = Object.keys(rt.globals);
  const prelude = "var ENGINE = true; var SETTINGS = { ACCESS_CODE: 'engine', SHEET_NAME: " + JSON.stringify(opts.sheetName || "Ark1") + " };\n";
  const tail = "\n;savePhoto = HOOKS.savePhoto; trashPhoto = HOOKS.trashPhoto; getPhoto = HOOKS.getPhoto; return { handle: handle };";
  // eslint-disable-next-line no-new-func
  const mod = new Function(...names, "HOOKS", prelude + src + tail)(...names.map(n => rt.globals[n]), hooks);
  return {
    run(params) {
      trashed.length = 0;
      const p = JSON.parse(JSON.stringify(params)); delete p.user; delete p.token; p.code = "engine";
      const out = mod.handle(p);
      return { res: JSON.parse(out.s), trashed: trashed.slice() };
    },
    tabs: () => rt.tabs(),
  };
}

const api = { create };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.VAULT_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis);
