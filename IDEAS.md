# Ideas for later

Things agreed as worth doing, not yet started. Newest first. When one is picked up, move it into a PR and delete it here.

## The atlas, round 3: what to learn from burgundyatlas.com (raised 1 November 2026)

Inspiration, not a copy: from screenshots of their phone site, the things that make it feel like a map app, done in
AllWine's own look (wine red, the serif, our classification colours) and with our own open data (INAO, IGN, BRGM).

- **The map is the whole screen,** with the controls floating on it: a round cluster on the right (compass, map style,
  settings, where am I), search and the region switcher at the bottom where the thumb is. Today our atlas has a header,
  a select and a side panel around the map.
- **One drill-down with a breadcrumb:** Europe › Burgundy › Côte de Nuits › Vosne-Romanée, as a chip at the top with a
  count ("151 villages"); each level colours its children (regions, then villages, then climats by classification).
- **Region chips at the bottom:** a sideways-scrolling row, a colour dot and a count each; tapping one flies there.
- **Map style with thumbnails:** our surveyed map, relief, and aerial photos (IGN's orthophotos are open data for
  France; to check for Germany), plus a dark map that matches the cellar's rack.
- **Settings as a sheet:** language, metric/imperial, open in perspective (the 3D tilt), show cadastral sections and
  lieux-dits.
- **A quiet scale bar** at the top, and village names in small caps with a halo, vineyards as see-through fills with a
  bright edge.
- **Later:** "for domaines: send your parcels", a way for a domaine to correct its holdings (we have the holdings
  checker; this would be the public side of it).

## The wine rack for big cellars (raised 1 November 2026)

Most cellars that matter hold 250–5,000 bottles. Today's rack (app.js, `renderRack`) draws one bottle per bottle and
shows a few rows with "+ N more": fine for a private cellar of 20–150, meaningless at 2,000 ("+ 1,960 more").

- **Scale the unit:** above ~150 bottles one drawn bottle stands for a case (6), above ~1,000 for 12, and the rack says
  so ("each bottle = 6"). The colours and amber capsules still show proportions at a glance.
- **Or group it:** one short shelf per region (or per drink-by year), its length the share of bottles, the label and
  count at its end; tap a shelf to filter the list.
- **The figures under it become the overview:** bottles by readiness, by drink-by year (a strip of the next 15 years),
  value; the list does the detail.
- Keep the one-bottle-per-bottle rack for small cellars: it's the charm of the thing.

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
