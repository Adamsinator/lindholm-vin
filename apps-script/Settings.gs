/**
 * AllWine — your settings. Keep this as a second file (Settings.gs) next to Code.gs in the Apps Script project.
 * Updating the API means replacing Code.gs only; this file is never overwritten, so set these once.
 * After changing a setting, redeploy (Deploy → Manage deployments → ✏️ → New version → Deploy): the web app runs the
 * files as they were when deployed. Functions run from the editor, and the daily backup, use what's saved now.
 */
var SETTINGS = {
  // Legacy single-user access code for the bound sheet. Leave '' to turn it off — logging in with a username and
  // password doesn't need it. If you set one, make it long and private (the placeholder 'CHANGE-ME' never works).
  ACCESS_CODE: '',

  // The tab in your Google Sheet that holds the wine list.
  SHEET_NAME: 'Ark1',

  // A shared invite code for sign-up. Better: leave this '' and make personal single-use codes with makeInvites()
  // (they go in the sheet's "Invites" tab). With neither, sign-up is off.
  SIGNUP_CODE: '',

  // The shared feed and follows: 'on' turns them on. Off (''), every cellar is private: no feed, no sharing, and
  // nobody sees who else has an account.
  SOCIAL: '',

  // The most accounts there can be, and how many days a login lasts without being used.
  MAX_USERS: 50,
  SESSION_DAYS: 30,

  // Backups: how many weeks of daily backups to keep (run installDailyBackup once to start them). To put one account back as
  // it was in a backup, fill in its username and the backup folder's name (e.g. '2026-11-01T04:00'), run
  // restoreFromBackup, then blank both again.
  BACKUP_KEEP: 8,
  RESTORE_USER: '',
  RESTORE_FROM: '',

  // The Cloudflare Worker in front of the API (worker/index.js): a long random value, the same one the Worker has as
  // GATEWAY_SECRET. Once set, only requests through the Worker are served. '' = off (the API answers anyone, as before).
  GATEWAY_SECRET: '',

  // Where the daily check (run installDailyReport once) sends its alerts: '' = the Google account that owns the script.
  REPORT_EMAIL: '',

  // Who may correct vineyard holdings in the Burgundy atlas: '' = anyone signed in,
  // or a comma-separated list of usernames, e.g. 'adam,anna'.
  ATLAS_EDITORS: '',

  // One-time setup of your own account (the one whose cellar is this spreadsheet): fill both in, run makeOwner
  // from the editor once, then blank the password again. Accounts live in the sheet's "Users" tab, so once yours
  // exists none of this is needed — updating Code.gs never touches it.
  OWNER_USER: '',
  OWNER_PASSWORD: '',
};
