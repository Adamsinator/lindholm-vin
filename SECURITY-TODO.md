# Security and housekeeping — to do

What's left after API 34. The invites, the account cap, login lockouts, session expiry and the size and rate limits
are done (see "Limits against abuse" in the README). Tick a box when an item ships, with the PR that did it.

## Do soon

- [ ] **Redeploy `Code.gs` (API 34)** in Apps Script, then run `makeInvites` once and blank `SIGNUP_CODE` in
      `Settings.gs`. The new limits and backups only work once the new version is deployed. Add the new settings
      (`MAX_USERS`, `SESSION_DAYS`, `BACKUP_KEEP`, `RESTORE_USER`, `RESTORE_FROM`) to your `Settings.gs` from
      the template, or leave them out for the defaults.
- [x] **Run the tests on every pull request (GitHub Actions)** — `.github/workflows/tests.yml`, `tools/run-tests.js`.
  - [x] Node suites: i18n, import, export, messy, vault, sommelier, big-import, abuse, backup.
  - [x] Browser suites with Playwright and a static server: import-ui, tidy-ui, vault-ui, sommelier-ui,
        add-suggest-ui, i18n-ui, cellar-flow (plain and vault), big-import-ui, smoke.
  - [ ] Make "tests green" required before merging to `main`: GitHub → Settings → Branches (or Rules) → add a
        rule for `main` → require the "Tests / test" status check. Only the repository owner can do this.
- [x] **Backups** — `backupNow`, `installWeeklyBackup`, `restoreFromBackup` in `Code.gs`.
  - [x] A weekly time-driven trigger in Apps Script that copies the master spreadsheet (Users, Invites, Feed,
        Follows, atlas corrections) and each account's vault spreadsheet into a dated `Backups` folder, keeping the
        last 8.
  - [x] Restore tested: `tools/backup-test.js` restores an encrypted cellar and opens it with its password.
  - [ ] After deploying: run `installWeeklyBackup` once in the editor, and check the first Sunday's folder.
  - [ ] Remind users that their recovery code is the only way back into an encrypted cellar. Nobody, the owner
        included, can reset it.

## When the site grows beyond friends, or abuse shows up

- [ ] **A Cloudflare Worker in front of the Apps Script URL** (free tier: 100 000 requests a day).
  - [ ] Rate limits per IP address (Apps Script can't see IPs).
  - [ ] Turnstile (invisible "are you human") on sign-up and login.
  - [ ] Point `config.js` at the Worker. Keep the Apps Script URL out of the site, so it can't be called directly.
- [ ] **Email confirmation**, only if invites ever stop being enough. It means storing email addresses (GDPR), and
      Apps Script can send only about 100 emails a day from a personal account.

## Browser hardening

- [ ] **Content-Security-Policy** as a `<meta http-equiv>` tag in `index.html`, `burgundy.html` and `domaine.html`.
      GitHub Pages can't send headers.
  - [ ] Scripts only from `'self'`.
  - [ ] Requests only to the Apps Script URL (and the IGN/INAO tile hosts for the atlas).
  - [ ] Images from `'self'`, `data:`, `blob:` and the tile hosts.
  - [ ] Check every page still works, the atlas maps included.
- [ ] Confirm **Enforce HTTPS** is ticked under the repository's Settings → Pages.
- [ ] `rel="noopener"` on every `target="_blank"` link. Most have it; sweep the rest.
- [ ] `<meta name="referrer" content="strict-origin-when-cross-origin">`.

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
