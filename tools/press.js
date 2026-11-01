// For the browser tests: press a button the way a person would on this screen. On a wide screen that's the button
// itself; on a phone (index.html's app shell) some live elsewhere: adding is the ＋ button, the pages are the tabs at the
// bottom, the cellar's tools are under ⋯ and the account under your initial. Then the press goes through those.
//   const press = require("./press"); await press(p, "#impBtn");
const MORE = ["#impBtn", "#expBtn", "#lsBtn", "#tidyBtn", "#tonightBtn", "#priceBtn", "#delBtn", "#refreshBtn"];
const ME = ["#acctBtn", "#adminBtn", "#lockBtn"];
const ADD = ["#addBtn", "#eAddBtn", "#wAddBtn", "#jAddBtn"];
module.exports = async (p, sel, opt = {}) => {
  if (await p.isVisible(sel)) return p.click(sel, opt);
  const tab = sel.match(/^\.tab\[data-page="?(\w+)"?\]$/);
  if (tab && await p.isVisible("#ptabs")) return p.click(`#ptabs button[data-page="${tab[1]}"]`, opt);
  if (ADD.includes(sel) && await p.isVisible("#pFab")) return p.click("#pFab", opt);
  if (MORE.includes(sel) && await p.isVisible("#pMore")) { await p.click("#pMore"); return p.click(`#moreMenu [data-press="${sel.slice(1)}"]`, opt); }
  if (ME.includes(sel) && await p.isVisible("#pMe")) { await p.click("#pMe"); return p.click(`#meMenu [data-press="${sel.slice(1)}"]`, opt); }
  return p.click(sel, opt); // as before: it waits, and fails if the button never shows
};
