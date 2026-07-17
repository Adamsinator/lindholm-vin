# Lindholm Vin — cellar site

A static web app (GitHub Pages) that reads and writes the wine collection in a
private Google Sheet through a Google Apps Script API.

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
and the drunk date is stamped whenever you mark a bottle as drunk. Both show on
a wine's detail, and you can backfill or correct either straight in the sheet.

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
fine. It's stored privately in a **Lindholm Vin – Journalfotos** folder in your
Google Drive (never shared), and the sheet's **Foto** column just holds the
file's id. The site loads photos back through the same access-code API, so only
someone with the code can see them; tap a thumbnail to view it full-size.
Deleting an entry also removes its photo from Drive.

> **One-time re-authorization:** because the script now writes to Drive, the
> next redeploy will ask you to allow Drive access (in addition to Sheets).
> That's expected — it only touches the photos folder it creates.

## Changing a wine's details

Add and "mark as drunk" happen in the site; anything else (editing a price,
fixing a typo) you do directly in the Google Sheet — the site picks it up on
the next refresh.

## Changing the code / deploying `Code.gs` updates

Edit the constants at the top of `Code.gs`, then **redeploy**: Deploy → Manage
deployments → pencil ✏️ on the active one → Version: **New version** → Deploy.
Editing the existing deployment keeps the same URL (no site change needed).
Then press **Lock** in the site and sign in again.
