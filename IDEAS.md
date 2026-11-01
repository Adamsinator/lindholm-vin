# Ideas for later

Things agreed as worth doing, not yet started. Newest first. When one is picked up, move it into a PR and delete it here.

## Four kinds of account: private, restaurant, wine merchant, winemaker (raised 1 November 2026)

One engine, one sign-up that asks "what are you?", and each kind of account gets the words, overviews and tools it
needs; nothing it doesn't. A member can change kind later; the data stays the same.

- **Private** (today's AllWine): the cellar, drink windows, Enjoyed, the journal, wishlist, the atlas, share a list.
- **Restaurant / wine bar:** the wine card and by-the-glass, stock per location, par levels and reorder, allocations,
  margins, Danish VAT and duty, staff roles, sales and depletion (details in the section below).
- **Wine merchant / shop:** stock and purchase prices across suppliers, price lists and a shareable catalogue,
  allocations offered to customers, reserved and en primeur stock, customer lists (with their consent), what's
  arriving and what's selling; exports for the accountant.
- **Winemaker / domaine:** their own vineyards on the atlas (the "send your parcels" idea: holdings, plantings, age of
  vines), vintages and how much was made, the back vintages in their own cellar, a public page per wine with tasting
  notes and drink windows, and allocations to importers and merchants.
- Shared underneath: import and export, the atlas, the sommelier, sharing, the encrypted store; the business kinds add
  several people on one account (see the encryption question below) and an audit trail.
- Pricing and plans per kind, if it's ever sold: decide before building, so a private member never pays for business
  features and a business gets support.

## A business version: restaurants, wine bars, shops (raised 1 November 2026)

The same engine (encrypted cellar, import, atlas, drink windows) for a business that needs other overviews and words.

- **Wine card:** the wines on the list, with menu prices, by-the-glass, a public read-only page (as shared lists do
  today, `share.html`) that a guest can open from a QR code on the table; hide sold-out wines automatically.
- **Stock and allocations:** stock per location (cellar, fridge, bar), par levels and reorder alerts, allocation notes
  per producer and importer (what was offered, accepted, when it arrives), en primeur and pending deliveries.
- **Money:** cost price, menu price, margin and mark-up per wine, stock value at cost and at menu price; Danish VAT
  (moms 25 %) on sales, excise (afgift) where relevant; exports for the accountant (e-conomic, Dinero, Excel).
- **Sales and depletion:** bottles sold per week, best sellers, slow movers, what's past its window and should be pushed
  by the glass; a simple "sold" button for the floor staff.
- **Several people:** staff accounts with roles (owner, sommelier, floor) on one cellar, an audit trail of who changed what.
- **Filters and sorts that fit:** by supplier, by margin, by price band on the card, by location, by allocation status.
- Questions to settle first: one cellar shared by several people breaks today's one-person encryption model (each
  member's key would need to wrap one shared key), and money and VAT features need care to be right, not only nice.
