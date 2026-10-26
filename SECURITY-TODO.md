# Security and housekeeping — to do

What's left after API 34. The invites, the account cap, login lockouts, session expiry and the size and rate limits
are done (see "Limits against abuse" in the README). Tick a box when an item ships, with the PR that did it.

## Do soon

- [x] **Redeploy `Code.gs` (API 34)** in Apps Script, then run `makeInvites` once and blank `SIGNUP_CODE` in
      `Settings.gs`. The new limits and backups only work once the new version is deployed. Add the new settings
      (`MAX_USERS`, `SESSION_DAYS`, `BACKUP_KEEP`, `RESTORE_USER`, `RESTORE_FROM`) to your `Settings.gs` from
      the template, or leave them out for the defaults.
- [x] **Run the tests on every pull request (GitHub Actions)** — `.github/workflows/tests.yml`, `tools/run-tests.js`.
  - [x] Node suites: i18n, import, export, messy, vault, sommelier, big-import, abuse, backup, worker.
  - [x] Browser suites with Playwright and a static server: import-ui, tidy-ui, vault-ui, sommelier-ui,
        add-suggest-ui, i18n-ui, cellar-flow (plain and vault), big-import-ui, fast-login-ui, csp-ui, smoke.
  - [x] Make "tests green" required before merging to `main`: GitHub → Settings → Branches (or Rules) → add a
        rule for `main` → require the "Tests / test" status check. Only the repository owner can do this.
- [x] **Backups** — `backupNow`, `installWeeklyBackup`, `restoreFromBackup` in `Code.gs`.
  - [x] A weekly time-driven trigger in Apps Script that copies the master spreadsheet (Users, Invites, Feed,
        Follows, atlas corrections) and each account's vault spreadsheet into a dated `Backups` folder, keeping the
        last 8.
  - [x] Restore tested: `tools/backup-test.js` restores an encrypted cellar and opens it with its password.
  - [x] After deploying: run `installWeeklyBackup` once in the editor.
  - [ ] Check that the first Sunday's folder (1 November) appears in `Backups`.
  - [ ] Remind users that their recovery code is the only way back into an encrypted cellar. Nobody, the owner
        included, can reset it.

## API gateway (done, 26 October 2026)

- [x] **A Cloudflare Worker in front of the Apps Script URL** — `worker/index.js`, `GATEWAY_SECRET` in `Code.gs` (API 35).
  - [x] Rate limits per IP address: 120 a minute, 10 a minute for login, sign-up and recovery.
  - [x] Turnstile on sign-up and recovery. Not on login, which stays one request; the IP limit and lockout cover it.
  - [x] Code.gs refuses requests that didn't come through the Worker, once `GATEWAY_SECRET` is set.
  - [x] Set up: secret, new Apps Script deployment, Turnstile widget, Worker `allwine-api.adamlenzing.workers.dev`.
  - [x] `config.js` points at the Worker with the Turnstile site key; the CSP allows only the Worker's address.
  - [x] Old Apps Script deployment archived: its URL (public in the git history) answers 404.

## When the site grows beyond friends, or abuse shows up

- [ ] **Email confirmation**, only if invites ever stop being enough. It means storing email addresses (GDPR), and
      Apps Script can send only about 100 emails a day from a personal account.

## Browser hardening

- [x] **Content-Security-Policy** as a `<meta http-equiv>` tag in `index.html`, `burgundy.html` and `domaine.html`
      (README → "Content-Security-Policy"; checked by `tools/csp-ui-test.js`).
  - [x] Scripts only from `'self'` (plus Turnstile's on the cellar page); no inline script.
  - [x] Requests only to the API and IGN; images from `'self'`, `data:`, `blob:` and IGN's tiles.
  - [x] Every page checked under it, the atlas maps included.
  - [x] Narrowed to the Worker's own address.
  - [ ] `'unsafe-eval'` stays while the encrypted cellar runs `Code.gs` through `new Function`. Removing it would
        mean running the engine in a Web Worker from a `.js` copy of `Code.gs`.
- [ ] Confirm **Enforce HTTPS** is ticked under the repository's Settings → Pages.
- [x] `rel="noopener"` on every `target="_blank"` link (all of them had it).
- [x] `<meta name="referrer" content="strict-origin-when-cross-origin">`.

## Privacy (GDPR — the site is run from Denmark)

- [ ] A short privacy page, linked from the front page and from the sign-up form:
  - what's stored: username, encrypted cellar, feed posts, follows;
  - where: the owner's Google Drive;
  - that cellars are encrypted in the browser and the owner can't read them;
  - how to get a copy (Export) and how to leave.
- [ ] **Delete my account** in the account dialog.
  - [ ] Removes the Users row, the vault spreadsheet and folder, and the photos.
  - [ ] Removes or anonymises the account's feed posts, comments and follows.
- [ ] Decide how long feed posts and old sessions are kept.

## Watching it run

- [ ] Check the Apps Script **Executions** page weekly for errors and unusual traffic.
- [ ] A daily time-driven trigger that emails the owner when sign-ups, lockouts or errors jump (counts from the
      Users and Invites tabs and the cache).
- [ ] Note the Google account's Drive usage now and then. Everything lives in one account, which is a single point
      of failure; consider moving the master sheet to a dedicated Google account for the site.

## Smaller things noticed along the way

- [ ] Server error messages from Google (e.g. "Could not save: Exception: …") reach the user untranslated. Map the
      common ones to friendly text.
- [ ] Dialog titles set while a dialog is open keep the old language until it's reopened.
- [ ] The non-Burgundy vintage charts (Napa above all) are a rough consensus. Revisit them with sources.
- [ ] Time a real 10 000-row import against Google Sheets: the tests use an in-memory fake.
