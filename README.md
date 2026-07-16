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

## Live market values (CellarTracker)

If you keep the same wines on [CellarTracker](https://www.cellartracker.com),
the site can pull each wine's **community average value** and show what the
cellar is worth today next to what you paid.

1. In `Code.gs`, set `CT_USER` and `CT_PASSWORD` to your CellarTracker login,
   then redeploy (see below).
2. In CellarTracker, set your display currency to **DKK**
   (Account → Preferences) so the values come back in kroner.
3. In the site, press **🔄 Sync CT values**. Each cellar wine is matched to
   CellarTracker — by a stored `iWine` id if it has one, otherwise by producer +
   vintage + cuvée — and its value is written back to the sheet (new columns
   **CT iWine** and **Værdi kr (CT)** are created automatically). A first fuzzy
   match stores the `iWine` id, so later syncs are exact.

The overview then adds **Market value (CT)** and an **unrealised gain/loss** vs.
the purchase price (over the wines CellarTracker could value), and each wine's
detail shows its per-bottle CellarTracker value. If a match is wrong, put the
correct CellarTracker `iWine` number in the **CT iWine** column and re-sync.

Leaving `CT_USER`/`CT_PASSWORD` empty simply hides the button — everything else
works as before.

## Journal

The **Journal** tab is a tasting log for any wine, anywhere — bottles from the
cellar (open a wine → "Log in journal" prefills it), or wines had at a
restaurant or a friend's place. Entries have a date, place, 1–10 rating and a
note, and live in a separate **Journal** tab in the same Google Sheet
(auto-created on first use).

## Changing a wine's details

Add and "mark as drunk" happen in the site; anything else (editing a price,
fixing a typo) you do directly in the Google Sheet — the site picks it up on
the next refresh.

## Changing the code / deploying `Code.gs` updates

Edit the constants at the top of `Code.gs`, then **redeploy**: Deploy → Manage
deployments → pencil ✏️ on the active one → Version: **New version** → Deploy.
Editing the existing deployment keeps the same URL (no site change needed).
Then press **Lock** in the site and sign in again.
