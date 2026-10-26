// Deployment config. If API_URL is empty, the site asks for it on first visit
// and remembers it in the browser (localStorage).
//   API_URL             the API: the Cloudflare Worker's address (worker/index.js), or the Apps Script URL without one
//   TURNSTILE_SITE_KEY  the Turnstile widget's site key ("are you human" on sign-up and recovery); '' = none
window.WINE_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbyTv2caw-G2RONpgjaua6e2aEZsEREBudw8Mjkn_YymdPwKYu-LsEbu68zfIGTV1_tj_w/exec",
  TURNSTILE_SITE_KEY: ""
};
