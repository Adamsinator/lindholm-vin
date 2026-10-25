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

  // One-time setup of your own account (the one whose cellar is this spreadsheet): fill both in, run makeOwner
  // from the editor once, then blank the password again. Accounts live in the sheet's "Users" tab, so once yours
  // exists none of this is needed — updating Code.gs never touches it.
  OWNER_USER: '',
  OWNER_PASSWORD: '',

  // The AI helper (✨ in a wine's details: drink window and critics' reviews, found by Claude with web search). It's
  // off until you put an Anthropic API key in Project Settings → Script properties as ANTHROPIC_API_KEY — never here.
  // Each lookup costs you roughly $0.10–0.40 (Claude Opus 5.5 + web search). Who may use it: '' = everyone signed in, or e.g. 'adam,anna'.
  AI_USERS: '',
  AI_DAILY_LIMIT: 10,   // lookups per user per day
  AI_MONTHLY_USD: 20,   // the site stops asking once the month's estimated spend reaches this
};
