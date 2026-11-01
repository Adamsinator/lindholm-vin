// The geology legends come from BRGM in French (BD Charm-50: 794 different descriptions across the regions). This turns a
// French description into a short label in English, Danish or German: its rock types, then its age ("Limestone and marl ·
// Kimmeridgian"), read off the description's own words. The French original stays one hover away (the title), and is
// what's shown in French or when no rock type is recognised. Nothing is guessed beyond the words the description uses.
//   GEOL_TR(description, lang) → label (or the description itself)
"use strict";
(function (root) {
  // rock types: French stems (accents stripped, lower case) → [en, da, de]; first match per row, in this order
  const ROCK = [
    [/\balluvion/, "Alluvium", "Alluvium", "Alluvium"], [/\bcolluvion/, "Colluvium", "Kolluvium", "Kolluvium"],
    [/\beboulis|\bgreze|cryoclast/, "Scree", "Skred", "Hangschutt"], [/\bloess/, "Loess", "Løss", "Löss"],
    [/\blimon/, "Silt", "Silt", "Schluff"], [/\bcraie/, "Chalk", "Kridt", "Kreide"],
    [/\bcalcschiste/, "Calc-schist", "Kalkskifer", "Kalkschiefer"], [/\bmicaschiste/, "Mica schist", "Glimmerskifer", "Glimmerschiefer"],
    [/\bcalcaire|\bcalcarenite|\bcalcilutite/, "Limestone", "Kalksten", "Kalkstein"], [/\bdolomi/, "Dolomite", "Dolomit", "Dolomit"],
    [/\bmarne|\bmarneu/, "Marl", "Mergel", "Mergel"], [/\bargile|\bargileu|\bargilite/, "Clay", "Ler", "Ton"],
    [/\bgres\b|\bgreseu|\bgreso/, "Sandstone", "Sandsten", "Sandstein"], [/\bsable|\bsableu|\bsablo/, "Sand", "Sand", "Sand"],
    [/\bgalet|\bgravier|\bcailloutis|\bgrave\b|\bgreve/, "Gravel", "Grus", "Kies"], [/\bconglomerat|\bpoudingue/, "Conglomerate", "Konglomerat", "Konglomerat"], [/\bbreche/, "Breccia", "Breccie", "Brekzie"],
    [/\bhydro|\blacs\b|\bcours d'eau|^hydro$/, "Water", "Vand", "Wasser"], [/\btuffeau/, "Tuffeau (soft chalk)", "Tuffeau (blødt kridt)", "Tuffeau (weiche Kreide)"],
    [/\bfalun/, "Shelly sand (falun)", "Skalsand (falun)", "Muschelsand (Falun)"], [/\bsilcrete/, "Silcrete", "Silcrete", "Silcrete"],
    [/\bhouill/, "Coal measures", "Kulførende lag", "Steinkohlenschichten"], [/\blacustre/, "Lake deposits", "Søaflejringer", "Seeablagerungen"],
    [/\balteration|\balterite|\bregolithe|\bresiduel/, "Weathered rock", "Forvitret bjergart", "Verwittertes Gestein"],
    [/\bphyllonite|\bmylonite|\banatexite|\bmigmati|\bleptyn|\bphtanite/, "Metamorphic rock", "Metamorf bjergart", "Metamorphes Gestein"],
    [/\blamprophyre|\bgranitoide|\bmicrogrenu|\bmonzon/, "Igneous rock", "Dybbjergart", "Tiefengestein"], [/\bversant/, "Slope deposits", "Skråningsaflejringer", "Hangablagerungen"],
    [/\bsilex|\bchaille/, "Flint", "Flint", "Feuerstein"], [/\bgypse/, "Gypsum", "Gips", "Gips"],
    [/\btuf\b|\btufs\b|\btravertin/, "Tufa", "Kildekalk", "Kalktuff"], [/\bmolasse/, "Molasse", "Molasse", "Molasse"],
    [/\bgranite|\bgranodiorite|\bmonzogranite|\bleucogranite/, "Granite", "Granit", "Granit"], [/\bgneiss/, "Gneiss", "Gnejs", "Gneis"],
    [/\bschiste/, "Schist", "Skifer", "Schiefer"], [/\bbasalte/, "Basalt", "Basalt", "Basalt"],
    [/\bmigmatite/, "Migmatite", "Migmatit", "Migmatit"], [/\bquartzite/, "Quartzite", "Kvartsit", "Quarzit"],
    [/\bpelite|\bsiltite|\bsilt\b/, "Siltstone", "Siltsten", "Siltstein"], [/\btourbe/, "Peat", "Tørv", "Torf"],
    [/\bremblai|\banthropique/, "Made ground", "Opfyld", "Aufschüttung"], [/\blehm/, "Loam", "Lerjord", "Lehm"],
    [/\bcone|\bcones\b|\bdejection/, "Alluvial fan", "Alluvialvifte", "Schwemmfächer"], [/\bsoliflu/, "Solifluction deposits", "Solifluktionsaflejringer", "Solifluktionsschutt"],
    [/\bepandage|\bglacis/, "Outwash gravel", "Smeltevandsgrus", "Schotter"], [/\bterrasse/, "River terrace", "Flodterrasse", "Flussterrasse"],
    [/\brhyolit|\bignimbrit|\blatite|\bdiabase|\bvolcan|\bpyroclast|\bcinerite|\btrachy|\bandesit/, "Volcanic rock", "Vulkansk bjergart", "Vulkangestein"],
    [/\bmicrogranite|\bgranophyre|\bporphyr/, "Granite", "Granit", "Granit"], [/\bfilon/, "Vein", "Gang", "Gang"],
    [/\barkose/, "Arkose", "Arkose", "Arkose"], [/\bquartz\b/, "Quartz", "Kvarts", "Quarz"],
    [/\bdiorite|\bgabbro|\bsyenite/, "Igneous rock", "Dybbjergart", "Tiefengestein"], [/\bamphibolite|\bleptynite|\bcorneenne|\bhornfels/, "Metamorphic rock", "Metamorf bjergart", "Metamorphes Gestein"], [/\bmeuliere/, "Millstone grit", "Møllestenskvarts", "Mühlsteinquarzit"],
  ];
  // ages: French stems → [en, da, de], the most precise that appears wins (stages before epochs before periods)
  // a stage is named as itself (Visean, not "Carboniferous": "upper Visean" is not the upper Carboniferous), in each
  // language's form: English -ian, Danish -ien, German -ium
  const ST = (re, stem, en, da, de) => [re, en || stem + "ian", da || stem + "ien", de || stem + "ium"];
  const AGE = [
    ["holocene", "Holocene", "Holocæn", "Holozän"], ST("weichselien|wurm", "Weichsel", "Weichselian", "Weichsel", "Weichsel"),
    ST("riss", "", "Riss", "Riss", "Riß"), ST("mindel", "", "Mindel", "Mindel", "Mindel"),
    ["pleistocene", "Pleistocene", "Pleistocæn", "Pleistozän"], ST("villafranchien", "Villafranch"),
    ST("messinien", "Messin"), ST("tortonien", "Torton"), ST("serravallien", "Serravall"), ST("langhien", "Langh"), ST("helvetien", "Helvet"),
    ST("burdigalien", "Burdigal"), ST("aquitanien", "Aquitan"), ST("redonien", "Redon"), ["pliocene", "Pliocene", "Pliocæn", "Pliozän"], ["miocene", "Miocene", "Miocæn", "Miozän"],
    ST("chattien", "Chatt"), ST("stampien", "Stamp"), ST("rupelien", "Rupel"), ST("sannoisien", "Sannois"), ["oligocene", "Oligocene", "Oligocæn", "Oligozän"],
    ST("priabonien", "Priabon"), ST("ludien", "Lud"), ST("bartonien", "Barton"), ST("lutetien", "Lutet"), ST("cuisien", "Cuis"), ST("ypresien", "Ypres"), ST("sparnacien", "Sparnac"),
    ["eocene", "Eocene", "Eocæn", "Eozän"], ST("thanetien", "Thanet"), ST("montien", "Mont"), ST("danien", "Dan"), ["paleocene", "Paleocene", "Palæocæn", "Paläozän"],
    ST("maastrichtien", "Maastricht"), ST("campanien", "Campan"), ST("santonien", "Santon"), ST("coniacien", "Coniac"), ST("turonien", "Turon"), ST("cenomanien", "Cenoman"),
    ST("albien", "Alb"), ST("aptien", "Apt"), ST("barremien", "Barrem"), ST("hauterivien", "Hauteriv"), ST("valanginien", "Valangin"), ST("berriasien", "Berrias"),
    ["cretace", "Cretaceous", "Kridttid", "Kreide"],
    ST("portlandien", "Portland"), ST("tithonien", "Tithon"), ST("kimmeridgien", "Kimmeridg"), ST("sequanien", "Sequan"), ST("argovien", "Argov"), ST("rauracien", "Raurac"),
    ST("oxfordien", "Oxford"), ST("callovien", "Callov"), ST("bathonien", "Bathon"), ST("bajocien", "Bajoc"), ST("aalenien", "Aalen"), ST("toarcien", "Toarc"),
    ST("domerien", "Domer"), ST("carixien", "Carix"), ST("pliensbachien", "Pliensbach"), ST("lotharingien", "Lothering"), ST("sinemurien", "Sinemur"), ST("hettangien", "Hettang"),
    ST("rhetien", "", "Rhaetian", "Rhætien", "Rhätium"), ["lias", "Early Jurassic (Lias)", "Tidlig jura (Lias)", "Früher Jura (Lias)"], ["jurassique", "Jurassic", "Jura", "Jura"],
    ["keuper", "Keuper (Triassic)", "Keuper (trias)", "Keuper (Trias)"], ["muschelkalk", "Muschelkalk (Triassic)", "Muschelkalk (trias)", "Muschelkalk (Trias)"],
    ["buntsandstein|gres vosgien", "Buntsandstein (Triassic)", "Buntsandstein (trias)", "Buntsandstein (Trias)"], ["trias", "Triassic", "Trias", "Trias"],
    ST("saxonien", "Saxon"), ST("autunien", "Autun"), ["permien", "Permian", "Perm", "Perm"],
    ST("stephanien", "Stephan"), ST("westphalien", "Westphal"), ST("namurien", "Namur"), ST("viseen|visean", "", "Visean", "Viséen", "Viséum"), ST("tournaisien", "Tournais"),
    ST("dinantien", "Dinant"), ["carbonifere", "Carboniferous", "Karbon", "Karbon"], ST("famennien", "Famenn"), ST("frasnien", "Frasn"), ["devonien", "Devonian", "Devon", "Devon"],
    ["llandovery|llandoverien", "Llandovery (Silurian)", "Llandovery (silur)", "Llandovery (Silur)"], ["silurien", "Silurian", "Silur", "Silur"], ["ordovicien", "Ordovician", "Ordovicium", "Ordovizium"],
    ["quaternaire", "Quaternary", "Kvartær", "Quartär"], ["tertiaire", "Tertiary", "Tertiær", "Tertiär"],
  ].map(([re, ...n]) => [new RegExp("\\b(" + re + ")"), n]);
  const SUB = [[/\b(superieur|sup\.?)\b/, ["Upper", "Øvre", "Oberes"]], [/\b(inferieur|inf\.?)\b/, ["Lower", "Nedre", "Unteres"]], [/\bmoyen\b/, ["Middle", "Mellem", "Mittleres"]]];
  const AND = { en: " and ", da: " og ", de: " und " };
  const plain = s => String(s).replace(/œ/g, "oe").replace(/Œ/g, "Oe").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  function gloss(desc, lang) {
    if (!desc || lang === "fr") return desc;
    const L = lang === "da" ? 1 : lang === "de" ? 2 : 0, p = plain(desc);
    // the rock types in the order the description names them, at most three
    const found = ROCK.map(r => [p.search(r[0]), r[1 + L]]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0]).map(r => r[1]);
    const rocks = [...new Set(found)].slice(0, 3);
    // in a list, the later words lower case, except in German, where nouns keep their capitals
    const low = (w, i) => i && L !== 2 ? w.toLowerCase() : w;
    const head = !rocks.length ? "" : rocks.length === 1 ? rocks[0] : rocks.slice(0, -1).map(low).join(", ") + (AND[lang] || AND.en) + low(rocks.at(-1), 1);
    // the age: the first stage, epoch or period named; "supérieur/inférieur/moyen" right after it qualifies it
    let age = "";
    for (const [re, n] of AGE) { const m = p.match(re); if (m) { age = n[L];
      // "moyen et supérieur", "inférieur à moyen": both ends, as "Middle–Upper"
      const after = p.slice(m.index + m[0].length, m.index + m[0].length + 30).split(/[):;,.]/)[0];
      const qs = [...after.matchAll(/\b(superieur|sup|inferieur|inf|moyen)\b/g)].map(x => SUB.find(([r]) => r.test(x[0]))[1][L]);
      if (qs.length && !/^(Early|Late|Tidlig|Sen|Frühes|Spätes)\b/.test(age)) {
        const q = qs.length > 1 && qs.at(-1) !== qs[0] ? qs[0] + "–" + (L === 2 ? qs.at(-1) : qs.at(-1).toLowerCase()) : qs[0];
        age = q + " " + (L === 1 ? age.toLowerCase() : age); }
      break; } }
    // no rock type named but an age ("Muschelkalk inférieur indifférencié"): the age alone says more than French
    if (!head) return age || desc;
    return age ? `${head} · ${age}` : head;
  }
  root.GEOL_TR = gloss;
  if (typeof module !== "undefined") module.exports = gloss;
})(typeof window !== "undefined" ? window : globalThis);
