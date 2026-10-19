# CC Brand Board

Static site on GitHub Pages (branch `main`, root). No build step, no server.

- `index.html` — markup; `style.css` — styles (light/dark via CSS vars on `:root[data-theme]`); `app.js` — all logic
- Data: `data/board.json` (`{period, skus:[{id,name,brand,format,segment,price,company,som(%),change(pp),image,active,order,notes}]}`; Excel import/export uses SKU_Master columns (SoM_YTD as fraction)), photos in `images/`
- Companies: BAT, JTI, KT&G, PMI, OTHERS. Segments: PREMIUM, MEDIUM, LOW
- Login is a client-side SHA-256 check of `login:password` (`AUTH_HASH` in app.js) — UI gate only
- UI text is in Russian
- Work only on `main`

## Checking changes
Serve with `python3 -m http.server`, open in Playwright, log in, check the board renders without console errors.
PNG and print share one renderer (`buildSheet` + `sheetPng`): the board is fitted to a landscape page ratio, print = that PNG on one A4/A3 page.
After push, Pages redeploys in ~1–2 min at https://ekzotik-inc.github.io/SKU_test/
