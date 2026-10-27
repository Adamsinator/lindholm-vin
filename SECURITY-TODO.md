# Security and housekeeping — to do

What's left after API 34. The invites, the account cap, login lockouts, session expiry and the size and rate limits
are done (see "Limits against abuse" in the README). Tick a box when an item ships, with the PR that did it.

## Do soon

- [ ] **Deploy `Code.gs` API 40** (the server keeps bottle counts at 1–9999 and prices at 0 or more): paste it,
      Manage deployments → ✏️ → New version. Encrypted cellars get it at once (the browser runs the site's copy);
      the deploy is for anything still kept in a plain sheet.
- [x] **Deploy `Code.gs` API 38 and 39** (private mode, email at sign-up, the admin page, Remove a member): done
      27 October 2026; the Worker reports v:39.
- [x] **Deploy `Code.gs` API 36/37** (Delete my account, the event log, daily backups, Recently deleted): done
      27 October 2026, with `installDailyBackup` run.
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
- [x] **Backups** — `backupNow`, `installDailyBackup`, `restoreFromBackup` in `Code.gs`; daily since API 37, kept 8 weeks.
  - [x] A weekly time-driven trigger in Apps Script that copies the master spreadsheet (Users, Invites, Feed,
        Follows, atlas corrections) and each account's vault spreadsheet into a dated `Backups` folder, keeping the
        last 8.
  - [x] Restore tested: `tools/backup-test.js` restores an encrypted cellar and opens it with its password.
  - [x] After deploying: run `installWeeklyBackup` once in the editor. (Since API 37 the daily check backs up every day by itself; `installDailyBackup` also moves the schedule to every night.)
  - [x] Deleted wines are kept 30 days under Recently deleted (API 37).
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

- [x] A short privacy page (`privacy.html`, four languages), linked from the login form and the Account dialog:
  - what's stored: username, encrypted cellar, feed posts, follows;
  - where: the owner's Google Drive;
  - that cellars are encrypted in the browser and the owner can't read them;
  - how to get a copy (Export) and how to leave.
- [x] **Delete my account** in the Account dialog (API 36).
  - [x] Removes the Users row, and sends the vault spreadsheet, folder and photos to the Drive trash.
  - [x] Removes the account's feed posts, comments, cheers and follows; signs its invites and atlas corrections
        "(deleted account)".
- [x] How long things are kept: sessions end after 30 days unused; feed posts stay until deleted; backups 8 weeks
      (stated on the privacy page).

## Watching it run

- [ ] Check the Apps Script **Executions** page weekly for errors and unusual traffic.
- [x] A daily check that emails the owner when sign-ups, lockouts, errors or refused requests jump, accounts near
      `MAX_USERS`, or the backup is missing (`dailyReport`, the "Log" tab; API 36).
  - [ ] Run `installDailyReport` once in the editor after deploying API 36, and check that the test email arrives.
- [ ] Note the Google account's Drive usage now and then. Everything lives in one account, which is a single point
      of failure; consider moving the master sheet to a dedicated Google account for the site.

## Smaller things noticed along the way

- [x] Server error messages from Google reach users in plain words, in their language (`errText` in `app.js`).
- [x] Dialog titles follow the language picker while the dialog is open (`trSet`).
- [ ] The non-Burgundy vintage charts (Napa above all) are a rough consensus. Revisit them with sources.
- [ ] Time a real 10 000-row import against Google Sheets: the tests use an in-memory fake.
