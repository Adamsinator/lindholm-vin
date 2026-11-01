# Ideas for later

Things agreed as worth doing, not yet started. Newest first. When one is picked up, move it into a PR and delete it here.

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
