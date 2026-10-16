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

  // Invite code friends type to create their own account (each gets a private spreadsheet). '' = signups off.
  SIGNUP_CODE: '',

  // Who may correct vineyard holdings in the Burgundy atlas: '' = anyone signed in,
  // or a comma-separated list of usernames, e.g. 'adam,anna'.
  ATLAS_EDITORS: '',
};
