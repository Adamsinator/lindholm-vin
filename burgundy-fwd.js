// burgundy.html was the Côte d'Or's own atlas; the Côte d'Or is now a region of the Wine atlas (atlas.html#r=cotedor),
// which takes every link burgundy.html took: #c= a climat, #v= a commune, #p= an owner, #l= a lieu-dit, #color=…&y=….
// Forward to it, keeping ?lang= and the link, and replacing this page in the history (Back doesn't land here again).
(function () {
  var h = location.hash.replace(/^#/, "");
  location.replace("atlas.html" + location.search + "#r=cotedor" + (h ? "&" + h : ""));
})();
