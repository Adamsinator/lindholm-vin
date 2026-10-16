# AllWine — cellar site

A static web app (GitHub Pages) that reads and writes the wine collection in a
private Google Sheet through a Google Apps Script API.

> Formerly **Lindholm Vin**. The app is being renamed **AllWine** and moving to
> **https://allwine.dk** — see [Domain](#domain-allwinedk) for the cutover.

- **The Google Sheet stays private** — it is never shared or published.
- The Apps Script web app is the only way in; it requires an **access code**
  for every request.
- This repo contains only UI code: no wine data, no codes.

## Setup (one time)

### 1. The API (in your Google account)

1. Open the Google Sheet with the wine list.
2. Extensions → Apps Script.
3. Delete any starter code and paste in `apps-script/Code.gs`.
4. At the top of the file, set `ACCESS_CODE` to a code of your choosing, and
   check that `SHEET_NAME` matches the tab name (default `Ark1`).
5. Deploy → New deployment → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Authorize when prompted, then copy the web app URL
   (`https://script.google.com/macros/s/…/exec`).

> "Anyone" only means the URL doesn't require a Google login — the script
> itself rejects every request without the access code.

### 2. The site

Open the site, and on first visit enter the web app URL and the access code.
Both are remembered in that browser.

## Prices

Prices are **shown by default**. The **Hide prices** button masks them (for
showing the site to someone over your shoulder); pressing **Show prices**
brings them straight back — no extra code. The choice is remembered per
browser.

## Current value

Beyond the purchase price, you can track what each wine is **worth now**. Open a
wine and type a figure in the **Value kr** box (shown when prices are visible).
It saves to a **Værdi kr** column in the sheet, created automatically the first
time you set one; clearing the box removes it.

The overview then adds two figures, computed over just the wines you've valued:

- **Current value** — the cellar's worth today (value per bottle × bottles left).
- **Unrealised gain / loss** — that current value vs. what you paid for the same
  wines, in kroner and percent.

Wines you leave blank simply don't count toward those totals, so you can value
only the bottles you care about. Update a figure whenever you like — it's your
own number, no external service involved.

## Collection over time

Two date columns are tracked automatically (created on demand): **Anskaffet**
(when a wine was acquired) and **Drukket dato** (when it was last drunk).
Acquired is set to the date you enter when adding a wine (defaulting to today),
and the drunk date is stamped whenever you mark a bottle as drunk. Both are
editable in the app — open any wine and use the date pickers in its detail to
set the **Acquired** date, or the **Last drunk** date (shown once a bottle's
been drunk); handy on the Enjoyed page for fixing when something was actually
opened. You can also backfill or correct either straight in the sheet.

The overview's **Collection over time** chart draws from these: a running line
of how many bottles you held since your first acquisition, with a green dot for
each addition and a red dot for each drink. Wines without an acquired date
aren't plotted (the caption says how many) — add dates to include them.

## Enjoyed

The **Enjoyed** tab is a permanent record of everything you've finished — a wine
doesn't vanish when its last bottle is drunk, it moves here. Its own totals sit
on top (**bottles enjoyed**, **value enjoyed** at purchase price, your
**most-enjoyed producer**), followed by three visuals: a **by-style** donut, a
**most-enjoyed producers** bar list, and a **drinking-over-time** chart (bottles
enjoyed per month, stacked by style). Click a slice or a producer bar to filter
the list below. The table lists every wine with `drukket > 0` — searchable and
sortable, each row expanding to the full detail (rating, price, acquired/
last-drunk dates, journal link). Wines still in the cellar keep showing under
**Cellar**; a partly-drunk wine appears in both.

It also covers wines you drank but never owned. Press **＋ Add a wine I've had**
to record one from a restaurant or a friend's table — it's saved as an
already-drunk row, so it shows in Enjoyed but never in the live cellar. And when
you write a **journal** entry, an **Also add to Enjoyed** box (on by default for
a wine you don't own, off when logging one from your cellar) does the same in one
step, keeping journal and Enjoyed in sync.

**Classification.** Every way of logging a wine has a **Classification** field (AOC, 1. cru, Grand cru, Special
club) and a **Commune**: the journal, *Add a wine I've had*, and a wine's details. For Burgundy, the app
suggests a classification from the name and commune, using the atlas's climats and INAO's premiers crus
(`burgundy-match.js`, shared with the atlas):
- "Clos St-Jacques" in Gevrey → 1. cru, and "Chambertin" → Grand cru.
- "Gevrey-Chambertin" stays village (AOC).
- A premier cru needs its commune, because there are three Les Cras.
- Outside Burgundy, only an explicit "Grand cru" / "1er cru" on the label counts.

The suggestion is pre-selected until you pick one yourself. In the lists, an unsaved suggestion shows as
"≈ Grand cru" with a dashed underline. A wine that already has a classification is never changed.

**Fill in the ones already logged.** The Enjoyed page lists every wine (cellar, Enjoyed and journal) that has
no classification but a confident suggestion. **Fill them in** writes them all in one go, blank ones only.

**Autofill.** Typing a producer and a wine you've logged before fills in the empty fields from last time:
country, region, commune, grape, classification and type. The form says what it filled. The wine field
suggests the names you've used for that producer.

**Filters.** The Enjoyed list filters by classification (Grand cru / 1. cru / Village / Other) and by where the
bottle came from (from my cellar / elsewhere). The totals add your average score and the bottles drunk
elsewhere.

### How the cellar, Enjoyed and the journal stay in step

- **A bottle is counted once.** If you mark a bottle drunk and then write its journal entry, or the reverse,
  the entry sees a bottle of that wine was drunk that day and doesn't drink another or add a duplicate row.
  This also covers the last-bottle prompt.
- **Your score carries over.** A score given in the journal becomes the cellar wine's score if it had none.
- **Editing an entry.**
  - "Also add to Enjoyed" is no longer pre-ticked, so fixing an old note never drinks another bottle.
  - If the entry created its Enjoyed row (a wine drunk elsewhere), the row follows the edit: name, vintage,
    date, score, price, place, note and classification.
  - For a cellar bottle, only the drunk date moves.
- **Deleting an entry** asks whether its Enjoyed row goes too. A wine drunk elsewhere is removed; a cellar
  bottle is put back.
- **A wine drunk elsewhere** gets a *Drukket ude* marker column. Older rows are recognised by their shape:
  one bottle, drunk, no acquired date. These wines offer **Remove from Enjoyed** instead of *Undo drink*,
  which would have invented a bottle in the cellar.

`tools/cellar-flow-test.js` walks all of this in a browser. It runs against the real `Code.gs`, executed in Node
by `tools/gas-harness.js` on an in-memory sheet.

## Cellar insights

The overview shows a **Cellar insights** strip of at-a-glance facts about what's
in the cellar: oldest vintage, priciest bottle, top region and grape, your
average score, and how many bottles are in their drink window right now. It's
all derived from the wines you already have — nothing to fill in.

## Bottle formats

A wine can be held in something other than a 75 cl bottle — pick a **Format**
when adding it, or change it later in the wine's detail. The choices run
Piccolo, Half, Bottle, Magnum, Jeroboam, Rehoboam, Methuselah, Salmanazar,
Balthazar, Nebuchadnezzar. It saves to a **Størrelse** column in the sheet,
created automatically the first time you set one; blank means an ordinary
bottle, so nothing needs migrating.

Anything that isn't a plain bottle gets a small chip on its row, and once the
cellar holds one, the *Bottles in cellar* KPI shows the total volume in litres
alongside the count. **Counts stay counts** — a magnum is one bottle, the way a
cellar book counts it — and prices stay per bottle.

Format is a record of what's in the rack, nothing more: it does **not** touch
drink windows. A magnum and a bottle of the same wine get the same window.

## Drink windows

Every wine gets a **drink window** so the app can tell you when to open it —
each cellar bottle shows a badge: **Too young**, **Drink now** (or **Drink soon**
when it's closing this year or next), or **Past peak**. The cellar filters gain a
readiness dropdown so you can pull up, say, everything ready now or closing soon.

**It's automatic by default.** With no input from you, the app *estimates* a
window from the wine's type, origin and vintage — red Burgundy scaled by cru
level, white Burgundy shorter, vintage Champagne vs NV, Barolo/Bordeaux/Riesling
longer-lived, rosé young, and sensible fallbacks otherwise. Estimated badges show
with a dashed outline (and the detail shows the guessed years as a placeholder)
so you can tell them from ones you've set.

**Override any wine** by typing your own years in the *Drink window* boxes in its
detail (*Drik fra* / *Drik til*); a set window always wins over the estimate and
loses the dashed styling. Editing is inline and the row stays open while you set
both years. The estimates are frontend-only, so they work immediately; saving
your own window needs the API redeploy.

**When-to-drink timeline.** Above the cellar table, a *When to drink* chart draws
every wine as a bar across its drink window — coloured too young / soon / now /
past, with a line at today. The year axis stays pinned as you scroll. It
**follows the current filters**, so narrow the list (a region, "Drink now", a
search) and the chart narrows with it. Click a bar to jump to that producer.

## Journal

The **Journal** tab is a tasting log for any wine, anywhere — bottles from the
cellar (open a wine → "Log in journal" prefills it), or wines had at a
restaurant or a friend's place. Entries have a date, place, 1–10 rating and a
note, and live in a separate **Journal** tab in the same Google Sheet
(auto-created on first use).

Each entry can be reopened and revised: press **✏️** to edit any field (or
its photo — replace it, or **Remove photo**), or **🗑** to delete it.

### Photos

Each entry can carry a **photo** — a label, the bottle, the table. Pick one when
writing the entry; the browser shrinks it before upload, so big phone photos are
fine. It's stored privately in a **Journalfotos** folder next to your own sheet in your
Google Drive (never shared), and the sheet's **Foto** column just holds the
file's id. The site loads photos back through the same access-code API, so only
someone with the code can see them; tap a thumbnail to view it full-size.
Deleting an entry also removes its photo from Drive.

> **One-time re-authorization:** because the script now writes to Drive, the
> next redeploy will ask you to allow Drive access (in addition to Sheets).
> That's expected — it only touches the photos folder it creates.

## Wishlist

The **Wishlist** tab is for wines you're after but don't own yet. Add a wish
(producer, cuvée, vintage, region, target price, note), edit or remove it, and
when you actually buy a bottle press **＋ Add to cellar** — it copies the wine
into the cellar (1 bottle, acquired today) and clears it from the list. Lives in
its own **Ønskeliste** tab in the same Google Sheet, auto-created on first use.

## Journal ↔ cellar

The two halves talk to each other. Open a cellar wine and, if you've logged it
before, its **journal entries show right in the detail** (date, place, score,
note) — matched by producer with the wine name or vintage. And when you drink a
wine's **last** bottle, the app offers to log a tasting note, prefilled from the
wine, so the memory is captured before it leaves the cellar.

## Front page

allwine.dk opens on a front page with two ways in: the **Burgundy atlas**,
open to everyone with no login, and **Your cellar**, the login form. Logging
in goes to the cellar as before, and anyone already logged in skips the front
page and lands straight in their cellar. The atlas preview picture is
`atlas-preview.jpg`; re-shoot it if the map's look changes a lot.

## Burgundy atlas

**Burgundy atlas ↗** in the tab bar opens `burgundy.html`, a separate page with a
clickable map of the Côte de Nuits from Marsannay to Corgoloin. It covers every
grand cru, around a hundred premiers crus and the notable village climats.

- **Click a vineyard** to see its classification, area, monopole status, a short
  note, and its owners with their hectares and share of the climat.
- **Filters:** grand cru / premier cru / village, monopoles only, a climat search
  and a producer box. Picking a producer, or clicking a name in a vineyard's
  holdings, highlights everything they own, coloured by their share.
- **Colour by** classification, commune, producer's share, size or number of
  owners. With **my cellar** selected, the vineyards you hold bottles from are
  coloured by how many you have.
- **Your cellar:** if you're logged in on the Cellar page in the same browser, the
  atlas reads your wines (the same API call the cellar uses) and puts a gold dot
  on each climat you own. It matches the wine name and commune to the climat, so
  "Gevrey-Chambertin" stays a village wine and doesn't count as Chambertin.
- Drag to pan, scroll or pinch to zoom, use the commune buttons to jump. The URL
  hash remembers the selection (`#c=latache`, `#p=drc`), so a view can be shared.

**The Vosne-Romanée domaines** panel under the map has a card for each of the
big Vosne names: DRC, Liger-Belair, Leroy, Méo-Camuzet, Grivot, Cathiard,
Arnoux-Lachaux, Rouget, Lamarche, Bizot, Pacalet and more. Each card shows the
hectares it holds in Vosne and Flagey, its grands crus and monopoles. Clicking
a card maps everything that producer holds, and opens a profile with:

- its full Côte de Nuits holdings
- what it holds that isn't on the map (village wine, Côte de Beaune)
- links to the sources the figures came from

A holding is one of three kinds:

- **owned**, the default
- **leased**, for vines farmed under a fermage or métayage, such as
  Liger-Belair's ex-Lamarche parcels from 2022
- **buys grapes**, for négociant sourcing, such as Pacalet, who owns no vines.
  These are drawn dotted gold and never counted as ownership or as a share of
  the climat.

The map also has stone walls around genuine clos, vine rows when zoomed in,
contour lines, the Route des Grands Crus, village streets and houses, and
landmarks such as the Croix de Romanée-Conti and the Château du Clos de
Vougeot.

It covers the whole Côte d'Or: the Côte de Nuits and, from Corton southwards,
the Côte de Beaune down to Maranges. The commune bar has a button for each Côte.
Below the map are a **domaines** panel (tabs for Vosne-Romanée and the Côte de
Beaune), **Compare two producers** (climat by climat), and **Who owns the
grands crus** (one bar per grand cru, split by owner). Grands crus and key
premiers crus also show their altitude band, which way they face, soil, and the
lieux-dits within them.

**On a phone** the map handles like a phone map:
- a flick keeps gliding and slows down;
- a pinch keeps the spot under your fingers under them as you zoom;
- lifting one finger carries on as a pan;
- double-tap zooms in where you tapped, and a two-finger tap zooms out;
- a deliberate two-finger twist turns the surveyed map.

Tapping a vineyard opens its details in a **bottom sheet** over the map, holders first. Drag the grip up for full
height, or down to shrink and close. Commune borders are drawn as a dark dash-dot line on a pale casing, so they
read over vineyards of any colour.

**Search.** One box finds communes, vineyards, domaines and lieux-dits. Each word you type must start a word
of the name ("gr rue" → La Grande Rue). The same rule filters the map and the Domaines list. With the box
empty, it offers **Near me** and your recent picks. Recent picks are kept in this browser only. Near me uses
the phone's location to put a blue dot on the surveyed map and open the vineyard you're standing in. If you're
more than 3 km from the nearest vineyard, it only says how far away that is.

**Domaine pages.** `domaine.html?p=<key>` is a shareable page for one domaine:
- its holdings, numbered, with hectares, share of each climat, leased or bought, and since when;
- hectares by class;
- its communes;
- small surveyed maps, one for each stretch of the Côte it holds in, numbered like the table;
- sources.

It assembles holdings exactly as the atlas does, including INAO's extra premiers crus and the shared
corrections. `domaine.html` alone lists every domaine, and the atlas's producer panel links to each page.

### Correcting a holding

Holdings drift: parcels get bought, swapped and leased. Anyone logged in to the
cellar in the same browser gets a **✎ Correct the holdings** button on each
vineyard. You can:

- set a producer's hectares, kind (owned, leased, buys grapes) and first
  vintage
- add a producer who isn't listed yet
- remove a producer

Each correction needs a source note. Corrections are stored in an
**AtlasEdits** tab in the master spreadsheet, shared with everyone who opens the
atlas, and logged with the editor's username, which is never shown publicly.
The newest correction for a vineyard and producer wins. Deleting the row in the
sheet brings back the figure shipped in the code.

To restrict who may edit, set `ATLAS_EDITORS` at the top of `Code.gs` to a
comma-separated list of usernames; blank lets any signed-in user edit.

**This needs the updated `Code.gs` redeployed** (API version 25), the same way
as any other Apps Script change. Until then the button explains that a
redeploy is needed.

The data lives in `burgundy-data.js` (Côte de Nuits), `burgundy-data-beaune.js`
(Côte de Beaune) and `burgundy-detail.js` (altitude, aspect, soil, lieux-dits). **The map is schematic:** each commune is
drawn on its own grid, so neighbours, slope position and rough size are right,
but it is not a survey. Vosne's smallest grands crus are drawn larger than life
so they stay clickable. Holdings are approximate figures from published
ownership lists, domaine sites and trade press. To correct one, edit the `p:` list of
that climat; a third element `"f"` marks a lease, `"s"` bought grapes. Domaine
profiles and their sources are in `PROFILES`. When you change the JS, bump the
`?v=` on the `<script>` tags in `burgundy.html`.

## Changing a wine's details

Add and "mark as drunk" happen in the site, along with score, current value, acquired/drunk dates, drink window
and bottle format, all inline in the wine's detail.

**✏️ Edit details** in the same panel renames a wine or fixes its producer, vintage, commune, classification,
region, country, grape or type. If journal entries were written under the old name, a tick-box renames them too.
Only the fields you changed are written.

These features need **API version 26**: paste the new `apps-script/Code.gs` into the script and redeploy.
They are:
- editing details;
- filling in classifications;
- keeping Enjoyed in step when a journal entry is edited;
- the classification and commune columns in the journal.

Until you redeploy, the site says so instead of failing silently.

## Surveyed vineyard outlines (INAO)

The atlas can draw the real vineyard boundaries from INAO's *Délimitation
parcellaire des AOC viticoles* instead of its schematic grid:

1. Put the INAO files in `data/inao/`. They can be GeoJSON or a shapefile
   (`.shp` + `.dbf`); Lambert-93 coordinates are converted automatically. The
   whole national file works, but a Côte d'Or extract is faster.
2. Run `cd tools && npm install && cd .. && node tools/inao-import.js`.
3. It writes `burgundy-geo.js` and prints a report:
   - atlas vineyards without an outline (village lieux-dits and enclaves are
     expected here)
   - INAO names it couldn't match to a vineyard, which it never guesses
   - vineyards whose surveyed area differs from the atlas's figure by more
     than 20%

   The source is the national shapefile on data.gouv.fr
   ("Délimitation parcellaire des AOC viticoles de l'INAO"); the importer keeps
   departments 21 and 71 (for Maranges) by INSEE code. INAO repeats the
   appellation as the denomination for grands crus and village AOCs and spells
   premiers crus in full ("Vosne-Romanée premier cru Les Suchots"); spelling
   variants are mapped in `ALIAS`. Two areas are adjusted: Clos de Bèze is
   taken out of Chambertin (it may be sold as Chambertin), and the combined
   Charmes/Mazoyères area is split east–west by the atlas's area ratio, which
   the drawer flags as an estimate.

Once `burgundy-geo.js` has outlines, the atlas opens on the surveyed map with a
scale bar, and a **Surveyed / Schematic** switch on the map changes between the
two; the choice is remembered per browser. The surveyed map turns in 15° steps
(⟲ ⟳ or the `[` `]` keys; 90° gives the classic "slope up" view) and the compass
puts north back up. A locator map shows where the view sits on the Côte, the pill
at the top names the commune under the centre, and a climat's details show the
published area next to INAO's delimited area. With the placeholder file (`BURG_GEO =
null`) nothing changes. Credit: INAO data from data.gouv.fr under the Licence
Ouverte; INAO notes the official boundaries are the plans held in the town
halls.

## Map furniture and terrain (IGN)

Two more importers fill in the surveyed map from IGN's Géoplateforme (Licence Ouverte). Both need curl and cache
their downloads in `tools/.topo-cache` / `tools/.dem-cache`, so reruns are quick:

- `node tools/topo-import.js` → `burgundy-topo.js`: roads and vineyard tracks, railways, streams, woods and planted
  vines, buildings, 5 m contour lines, place names (villages, hamlets, lieux-dits) and commune boundaries from BD TOPO,
  for the strip the INAO outlines cover. Coordinates are delta-encoded; the atlas loads the file after its first paint
  and shows buildings, tracks, minor contours and lieux-dits only when zoomed in.
- `node tools/dem-import.js` → `burgundy-dem.js` (sampling shared with the lieux-dits through `tools/dem-lib.js`): altitude band (5th–95th percentile), mean slope and the direction
  each climat faces, sampled from the RGE ALTI® terrain model on a grid inside its outline. A climat that wraps round
  a hill (Corton-Charlemagne) is marked "varied". These replace the estimated bands in the vineyard panel and drive
  the **By altitude** / **By slope** colour modes.
- `node tools/lieuxdits-import.js` → `burgundy-lieuxdits.js`: every cadastral lieu-dit on appellation land (Etalab
  cadastre, cadastre.data.gouv.fr, Licence Ouverte): 1,471 across the 52 communes, kept when it lies on an INAO outline
  (village, premier or grand cru). The cadastre writes in capitals without accents. Names get proper capitals and,
  where the atlas already knows the whole name, its spelling. Otherwise words are accented one at a time, but only a
  word the atlas always writes the same accented way ("Corvées", "Perrière"). Ambiguous words such as Prés/Près, or
  Échezeaux/Echézeaux, stay as written, and the import lists every change it makes. Each lieu-dit also gets measured
  terrain, sampled like the climats': altitude band, slope and the direction it faces. The atlas draws dotted outlines
  and names when zoomed in, replacing BD TOPO's own lieu-dit names. A tap on one (or a search, or a climat's list)
  opens its panel: area, terrain, and the climats it lies in. Downloads are cached in `tools/.cadastre-cache` and
  `tools/.dem-cache`.

`inao-import.js` also keeps INAO's premiers crus and Corton climats that the atlas has no notes for (about 300) as
extra climats on the surveyed map; those lying inside an atlas climat (Chassagne's Morgeot holds La Boudriotte, Les
Grands Clos…) are nested in it.

## Languages

`i18n.js` holds the interface strings in English, Danish and French and draws the flag picker (front page and atlas
header); the choice is remembered per browser. `burgundy-i18n-da.js` and `burgundy-i18n-fr.js` hold translated
climat, commune, domaine and soil texts, keyed like the English data; anything missing falls back to English. The
cellar app itself is still English.

## Smoke test

`tools/smoke-test.js` drives the whole site in a headless browser against a fake
Apps Script backend, so no real data is touched. It covers the front page,
login, every cellar tab and dialog, the atlas (every colour mode, filter,
vineyard and producer panel, a correction) and logout, on desktop, phone and
dark mode. It reports page errors, failed requests and sideways scrolling.
Serve the repo with `npx http-server -p 8765 -c-1 .`, then run
`node tools/smoke-test.js` (needs Playwright).

## Changing the front-end

Merging to `main` publishes via GitHub Pages within a minute or two. But Pages
serves `app.js` / `notes.js` / `config.js` with `cache-control: max-age=600`, so
a browser that already has the old copy keeps using it for up to ten minutes —
the site then runs **new HTML against old JS**, which looks like the change
never shipped. Avoid it by bumping the `?v=` on the three `<script src=…>` tags
in `index.html` in the same commit as any JS change.

## Changing the code / deploying `Code.gs` updates

Edit the constants at the top of `Code.gs`, then **redeploy**: Deploy → Manage
deployments → pencil ✏️ on the active one → Version: **New version** → Deploy.
Editing the existing deployment keeps the same URL (no site change needed).
Then press **Log out** in the site and sign in again.

## Accounts (multi-user)

Others can keep their own cellar behind a username + password:

- Set `SIGNUP_CODE` in `Code.gs` to an invite phrase (blank `''` turns signups
  off), redeploy, and share the site URL + that phrase.
- A friend taps **Sign up**, picks a username/password + the invite code, and
  gets their own empty cellar. Everything (wines, enjoyed, journal, wishlist,
  ratings) is scoped to their own spreadsheet — they never see anyone else's.
- **Your own account:** set the username/password in `makeOwner()`, save, then
  Run it once from the editor. It points your account at *this* (the master)
  spreadsheet so your existing wines carry over. The old `ACCESS_CODE` path
  still works too.
- Remove someone: delete their row from the `Users` tab (and their folder from
  your Drive).
- **Signed in on several devices at once** is fine: the `Token` cell keeps the
  five most recent sessions, so logging in on a phone no longer signs out the
  laptop. To force every device of an account to sign in again, clear that
  row's `Token` cell. Sessions still expire on their own after 60 idle minutes.

## Drive layout

Keep everything inside one folder so it doesn't sprawl as people join:

```
AllWine/                          ← your master folder (put the master sheet here)
├─ AllWine (spreadsheet)          ← your own cellar (the bound script lives on it)
├─ Journalfotos/                  ← your journal photos
├─ AllWine — anna/                ← auto-created for each signup
│  ├─ AllWine — anna (sheet)
│  └─ Journalfotos/
└─ AllWine — bob/
   └─ …
```

Just move the master spreadsheet into a folder — the script finds that folder
and creates every new user's subfolder (sheet + photos) inside it automatically.
Moving the sheet is safe: the script binds by file **id**, not location, so the
URL never changes.

Folders and sheets created before the rename are still called *Lindholm Vin —
…*; only new signups get *AllWine — …*. Renaming them in Drive is optional and
safe (everything binds by id), and so is leaving them alone.

## Domain (allwine.dk)

The site currently serves from `https://adamsinator.github.io/lindholm-vin/`.
Everything in the repo is already pointed at the new home — title, manifest,
canonical and Open Graph tags all say **AllWine / allwine.dk**. Only two things
are left, and they have to happen together:

1. **DNS** at the registrar for `allwine.dk`:

   | Type | Host | Value |
   | --- | --- | --- |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `adamsinator.github.io.` |

2. **The `CNAME` file.** Once DNS resolves, add a file named `CNAME` at the
   repo root containing one line, `allwine.dk`, and push it (or set the custom
   domain in Settings → Pages, which writes the same file). Then tick
   **Enforce HTTPS** after GitHub finishes issuing the certificate.

Do *not* add `CNAME` before DNS is in place — Pages stops serving the
`github.io` URL as soon as a custom domain is set, so the site would be
unreachable until the records propagate. (This is why it was rolled back the
first time.)

Nothing else needs to change on cutover: `config.js` holds an absolute Apps
Script URL, and every other path in the app is relative.
