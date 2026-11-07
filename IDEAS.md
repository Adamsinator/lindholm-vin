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

## Housekeeping: index.html's size (raised 5 November 2026)

index.html was at its 280 KB budget; the owner's admin code now lives in admin.js, loaded when Admin is opened (271 KB).
(the admin panel, usage, account help, test users) out of app.js into admin.js, loaded only when the owner opens Admin.

## Feedback after testing (5 November 2026) — to work through before the business pages

1. Kom i gang: "Tilføj vin" in quotation marks, so the sentence reads right.
2. "Pas på din gendannelseskode": rewrite now that the owner can help a member back in.
3. The region atlases closer to the Côte d'Or one (more of its tools on every region).
   *Done (round F, 5 November 2026):* each region's panel now has "The wines": the grapes of the appellations on its
   map, each with body, acidity and tannin as bars and its typical aromas; how long the longest-lived appellations
   on the map keep; and, where AllWine has a chart for the region itself, its last 16 vintages as a strip (Bordeaux's
   Left and Right Bank and Sauternes, Champagne, the northern and southern Rhône, German Riesling). The atlases
   already had the vineyard comparison, the terrain search, the slope profile and the geology. Still the Côte d'Or's
   own: owners and producers (no open data for the other regions), the vintage chart per côte, the rotating map.
4. Add wine: classifications beyond the French, by country/region.
5. Add wine: port (and other fortified wines) as a choice.
6. Add wine: "a gift" (no price).
7. The cellar's map: wines from countries without a region shape (Croatia…) should show too.
8. Define "icon producers" (what makes one, shown where it's used).
9. Edit wine: change the number of bottles; price per bottle or for all (multiplied), for businesses above all.
10. Add wine: more drop-downs (grapes, areas…), cf. tannino.dk/vinguide/lande.
11. Natural wine: a mark/check.
12. Wine style: sweet/dry, acidity, oak and so on.
13. Enjoyed: the food with it, and how the pairing went.
14. winefolly.com: what it does well that we could do too. (Looked at for ideas only; nothing is copied, and what we
    build is drawn from our own data.) What it does well is make a wine's style visible at a glance: a few graded
    traits as bars, aromas as words, maps that say what grows where, and food matches by style. Taken up so far: the
    atlas's grape bars and aromas (round F), the sommelier's dishes for a wine (round E). Still open: a wine's style
    card in its details in the cellar (from its grape and region), a "find wines like this one" from those traits, a
    simple chart of the cellar by style (light to full, dry to sweet), and serving cards (glass, temperature, decant)
    printable for a dinner.
15. Sommelier: fewer suggestions at first and when it doesn't know; more varied replies; more knowledge; small
    talk (the time); remember the conversation, so a follow-up question builds on the last.
    *Done (round E):* three suggestions to start and two when it doesn't know, chips that follow the last answer
    (each checked to give one), three ways of not knowing, small talk (hello, thanks, the time with a thought for the
    hour, goodbye), "it/den/le" meaning the wine of the last answers, "yes" taking up an offer, the dishes for a wine,
    the journal's food pairings, a few more terms and dishes. The chat is cleared when someone logs out.
16. "Kælderoversigt" by the flags: why is it there?
17. Terms: the owner is in control and may remove accounts (misuse, or at their discretion).
18. "Om bedømmelser" and "Nuværende værdi" at the foot of the cellar: to Help, or side by side at least.
19. Fonts: checked: none are shipped (system fonts only), so nothing to license.

## Business accounts as their own app, and smoother editing (raised 2 November 2026)

The personal setup is right as it is. A business shouldn't feel like a personal cellar with a chart or two more:

- **Pages by kind.** Enjoyed, Wishlist and Journal are for personal accounts only. A business gets its own pages:
  1. **Inventory** as the first page: the stock list, built for counting and selling (stock, cost, card price, glass
     price, supplier, minimum, reorder), not the collector's list.
  2. **Statistics & accounts** as a page of its own, not the right-hand pane: sales by day/week/month, margin, stock
     value, best sellers and slow movers, the month's CSV for the bookkeeping, the reorder list. It should look
     professional and dedicated, not like the personal overview.
  3. The wine card / price list (online + QR) as its own page too.

  *Done (5 November 2026):* a business opens on **Inventory** (search, filters for below the minimum, sold out and
  no price, sorting; stock, minimum, cost, selling and glass price and supplier edited in the line, margin beside
  it, Bottle/Glass to sell; folded into cards on a phone), then **Cellar**, **Sales & accounts** (a period of 7, 30,
  90 days or 12 months: sold, taken with and without VAT, gross profit and margin on what was sold, average a bottle,
  a chart by day/week/month, best sellers and slow movers, the stock at cost and selling price by style, the reorder
  list, suppliers with their stock value, the month's CSV) and the **Wine card** page (print, online with QR).
  Enjoyed, Wishlist and Journal are gone for a business, and so is the journal in a wine's details. Still to come:
  a till-like quick sell, stock counts by location, purchase orders sent to a supplier.
- **Stock vs minimum.** In a wine's details the business shows "Minimum in stock" (the reorder threshold), but the
  actual stock (bottles on hand) isn't an editable field there, so it reads as if the minimum were the stock. Show
  "In stock" first and editable, the minimum beside it, clearly labelled.
- **Editing a wine is awkward** (personal and business):
  - Fields save on their own the moment one changes, which is slow and badly timed. Setting a drink window saves
    after the first year, before the second can be typed. Better: edit freely, then one Save (or save once the whole
    group is left), with a clear "saved" state.
  - Changing a wine's name doesn't seem to carry through everywhere (list, rack, card, atlas match). Check each place
    that shows or keys on the name.

## Admin test tools: test users and test wines (raised 2 November 2026)

- **Test users from Admin, no invite codes:** one click makes a test account of a chosen kind (private, restaurant,
  merchant, winemaker), marked as test, logged into in a new tab; a "Delete all test users" button cleans up. Test
  users don't count in the usage numbers.
- **Test wines:** "Add 10 / 100 / 1 000 test wines" on a test account: varied producers, regions, vintages, prices,
  drink windows (some past, some young), styles; for a business also cost and card prices, suppliers, minimums and a
  few weeks of sales, so every chart and list has something to show. Only on test accounts, never on a real cellar.
- Together: a test environment to try every feature freely, without typing wines in by hand.

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

## The business page (business.html, 5 November 2026)

A page to show a restaurant, a wine merchant or a winemaker what they get: the features for their kind, a tour through
eleven real screens of a made-up wine bar as a slideshow that rings what each shows ("Vinbaren Demo", tools/shot-demo.js writes img/business/*.webp and tour.json), the prices and the
questions they ask. In four languages (business-page-i18n-*.js). Kept out of search engines (noindex) and not linked
from the site until business accounts open (app.js BIZ_OPEN). Prices are "on request": a business writes, and gets an
offer.
