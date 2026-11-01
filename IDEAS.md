# Ideas for later

Things agreed as worth doing, not yet started. Newest first. When one is picked up, move it into a PR and delete it here.

## Hosting, mail, company and security: the checklist (1 November 2026)

Where things stand: allwine.dk is registered in the owner's name at Punktum dk, with one.com as registrar; mail is
one.com's Email Essential (5 mailboxes, info@allwine.dk, paid a year ahead); the site is on GitHub Pages from a public
repo; the API runs on Cloudflare (Worker) in front of Apps Script in the owner's personal Google account. AllWine is a
PMV: no VAT, at most 50,000 kr. income in 12 months (about 9 restaurants at 449 kr. a month).

- [ ] Check that the owner (not one.com) is the registrant of allwine.dk at Punktum dk.
- [ ] Ask one.com: "If allwine.dk's nameservers point to Cloudflare and I recreate your MX, SPF and DKIM records there,
      does Email Essential keep working and stay supported? Which exact records?" (Their panel warns that external
      nameservers end one.com email; a help article suggests MX can be set elsewhere. Get it in writing.)
- [ ] **Before the first paying customer**, move the site off GitHub Pages: GitHub's terms don't allow Pages to host a
      commercial service (SaaS). Route depends on one.com's answer:
      yes → Cloudflare DNS + Pages, one.com mail kept (0 kr.); no → move mail (Google Workspace or similar) then
      Cloudflare; or → a one.com package with web space and an automatic upload from GitHub.
      Cloudflare Pages: an apex domain needs Cloudflare as nameserver; free plan 20,000 files (AllWine ≈ 11,400).
      Code side when moving: remove CNAME, add `_headers` (HSTS, CSP, frame-ancestors), keep apps-script/Code.gs served.
- [ ] Then make the repo private (on GitHub Free once Pages isn't used; Pro only if Pages must serve a private repo).
      Actions minutes: Free $12/month ≈ 2,000 Linux minutes, Pro $18 ≈ 3,000; a full test run ≈ 16 minutes.
- [ ] Before the 10th paying business: PMV → enkeltmandsvirksomhed on virk.dk, VAT registration, prices + 25 %.
- [ ] Once there's revenue: Google Workspace for the business (mail, a data processing agreement with Google, higher
      Apps Script limits) and move the Apps Script backend from the personal account to the business one.
- [ ] Fill site-info.js with the name and address (and CVR when there is one).
- [ ] Security: confirm GATEWAY_SECRET is set in the live Settings.gs (so the Apps Script answers only through the
      Worker); add HSTS and frame-ancestors as real headers after the move (today: a script stops framing, GitHub sends
      no HSTS); keep the daily live check.

## Look less machine-made (raised 1 November 2026)

What readers say gives a site away as generated, from surveys and design write-ups (see the business plan's sources): emoji
used as icons, a coloured left edge on boxes, em dashes in every other sentence, vague copy, the same fade-in on every
element. People trust a site less when they think it's AI-made, even when it isn't. AllWine already avoids the worst
(own words, real numbers, a serif of its own, official data, the sommelier is rule-based, not AI). Done: the coloured
left edges are gone, the business buttons have words, not emoji. Still to do:

- **One drawn icon set** in place of the ~100 emoji in the cellar app (🍷 🗑 ✏ 🔒 📍 ⬆ ⬇ 🔗 🧹 🎲 …): small line icons
  in the site's own stroke, the same on every page; keep 🍷 only where it's a wink, not an icon.
- **Fewer em dashes** in the interface (about 33 strings in app.js): a full stop or a colon reads more like a person.
- **Calmer motion:** the bottles' slide-in on the rack is fine once; check nothing else fades in by default.

## Account kinds, the next steps (raised 1 November 2026; the first slice is built)

Built: Account (and sign-up) asks what kind of account it is: private, restaurant or wine bar, wine merchant or shop,
winemaker. A business kind gets the menu/sale price and the price by the glass on each wine (VAT included, as the guest
sees it), the margin without VAT and the mark-up, the stock at cost and at sale price, its suppliers (the "Bought at"
field), and a printable wine card or price list of what's in stock and priced. A winemaker names its domaine and sees its
own wines by vintage. Still to do, roughly in order:

- **Sales, more:** (built: "Sold a bottle" / "Sold a glass" with Undo, the week's sales, eight weeks, best sellers and
  slow movers) a sales export for the accountant, sales by staff member, and suggesting by the glass what's past its window.
- **Par levels and reorder:** a minimum per wine, an alert when stock falls under it, a reorder list per supplier.
- **Allocations, en primeur and deliveries:** what was offered, accepted, paid, and when it arrives; stock that's bought
  but not yet in the cellar.
- **The wine card as a page:** a public read-only page (as shared lists are, share.html) with a QR code for the table;
  needs Code.gs API 44 deployed first.
- **Money for the accountant:** exports for e-conomic, Dinero and Excel; excise (afgift) where relevant. Check the VAT
  rules with an accountant before calling anything "VAT-correct".
- **Merchant:** a shareable catalogue, reserved stock per customer, customer lists (with their consent).
- **Winemaker:** a public page per wine (tasting notes, drink window), allocations to importers, and "send your parcels":
  a domaine correcting its own holdings on the atlas (the public side of the holdings checker).
- **To decide before building:**
  - several people on one account (staff with roles, an audit trail): today one person's password unlocks one cellar,
    so each member's key would have to wrap a shared key; a real change to the encryption model;
  - pricing and plans per kind, if it's ever sold, so a private member never pays for business features.
