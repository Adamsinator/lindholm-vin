/**
 * AllWine — your settings. Keep this as a second file (Settings.gs) next to Code.gs in the Apps Script project.
 * Updating the API means replacing Code.gs only; this file is never overwritten, so set these once.
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

  // The most accounts there can be, and how many days a login lasts without being used.
  MAX_USERS: 50,
  SESSION_DAYS: 30,

  // Who may correct vineyard holdings in the Burgundy atlas: '' = anyone signed in,
  // or a comma-separated list of usernames, e.g. 'adam,anna'.
  ATLAS_EDITORS: '',

  // One-time setup of your own account (the one whose cellar is this spreadsheet): fill both in, run makeOwner
  // from the editor once, then blank the password again. Accounts live in the sheet's "Users" tab, so once yours
  // exists none of this is needed — updating Code.gs never touches it.
  OWNER_USER: '',
  OWNER_PASSWORD: '',
};
