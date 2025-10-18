# Integration Brief: Ironman Rankings Page

You are extending the existing web application by adding a standalone "Ironman Rankings" page that is fully self-contained with the assets provided in this directory.

## Provided assets (same directory as this brief)
- `index.html` – HTML markup for the Ironman Rankings page.
- `styles.css` – CSS for the page layout, filters drawer, table, and responsive behavior.
- `app.js` – ES module that loads `ironmen_rankings.csv`, parses it with PapaParse, and renders the interactive table UI.
- `ironmen_rankings.csv` – Data file consumed by `app.js`.

## Implementation goals
1. Create a new route/page in the application that serves `index.html` as-is (or adapts it minimally to fit the app shell).
2. Ensure the page loads `styles.css`, `app.js`, and `ironmen_rankings.csv` from the same directory. Update build tooling or asset pipelines as needed so the CSV is served statically.
3. Confirm the PapaParse CDN script referenced in `index.html` remains available in the final build. Mirror the dependency locally if the host environment disallows remote CDN calls.
4. Integrate any existing global styles, layout wrappers, or navigation components so the new page matches the rest of the application without breaking its standalone functionality.
5. Validate that all interactive behaviors—filters, sorting, row deletion/undo, responsive layout, tooltips—work after integration.

## Deliverables
- Application code changes that register the new route/page and serve these assets.
- Any necessary configuration updates to ensure the CSV and static assets are bundled or copied during build/deploy.
- Notes on testing steps performed to confirm the page renders correctly with live data.
