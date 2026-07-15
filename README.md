# Lindholm Vin — cellar site

A static web app (GitHub Pages) that reads and writes the wine collection in a
private Google Sheet through a Google Apps Script API.

- **The Google Sheet stays private** — it is never shared or published.
- The Apps Script web app is the only way in; it requires an **access code**
  for everything and a separate **price code** before it will include prices
  in any response.
- This repo contains only UI code: no wine data, no codes.

## Setup (one time)

### 1. The API (in your Google account)

1. Open the Google Sheet with the wine list.
2. Extensions → Apps Script.
3. Delete any starter code and paste in `apps-script/Code.gs`.
4. At the top of the file, set `ACCESS_CODE` and `PRICE_CODE` to codes of your
   choosing, and check that `SHEET_NAME` matches the tab name (default `Ark1`).
5. Deploy → New deployment → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Authorize when prompted, then copy the web app URL
   (`https://script.google.com/macros/s/…/exec`).

> "Anyone" only means the URL doesn't require a Google login — the script
> itself rejects every request without the access code.

### 2. The site

Open the site, and on first visit enter the web app URL and the access code.
Both are remembered in that browser. Prices stay hidden until you press
**Show prices** and enter the price code (remembered for the tab session only).

## Changing a wine's details

Add and "mark as drunk" happen in the site; anything else (editing a price,
fixing a typo) you do directly in the Google Sheet — the site picks it up on
the next refresh.

## Brute-force lockout

After 3 wrong access codes in a row the API locks for 5 minutes (`MAX_FAILS` /
`LOCK_SECONDS` in `Code.gs`). This is enforced **server-side** — a correct code
is refused while locked too, so clearing browser storage or switching device
does not bypass it. Apps Script cannot see the caller's IP, so the counter is
**global** (shared across everyone), not per-IP. Trade-offs: it can briefly lock
you out too, and someone who knows the URL could keep it locked by failing every
5 minutes — annoying but harmless, since they still can't read anything.

## Changing the code / deploying `Code.gs` updates

Edit the constants at the top of `Code.gs`, then **redeploy**: Deploy → Manage
deployments → pencil ✏️ on the active one → Version: **New version** → Deploy.
Editing the existing deployment keeps the same URL (no site change needed). Then
press **Lock** in the site and sign in again. The lockout only becomes active
once this redeploy is done.
