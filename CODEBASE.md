# CODEBASE.md

## Application Overview
- Full-stack dashboard that augments Yahoo head-to-head category leagues with richer analytics, visualizations, and trade tooling.
- Backend: Flask (single `main.py`) acting as the OAuth client, Yahoo Fantasy API proxy, and JSON service layer for the dashboard.
- Frontend: server-rendered templates plus modular vanilla JS with Chart.js for data viz and Fetch API for async calls.
- External data sources: Yahoo Fantasy Sports v2 API for league/roster data and `nba_api` for real NBA player stats.
- Deployment: Gunicorn entry (`Procfile`), environment configured through `.env`/`.env.example`, optional local `venv/` for Windows development.

## Runtime Flow
1. Visitor lands on `/` (`templates/index.html`), initiates Yahoo OAuth login handled by Authlib.
2. After callback, the app uses the Yahoo access token to pull the user's leagues, lets them choose one on `/select`.
3. League selection stores `league_key`, `team_name`, and `token` in the Flask session; the dashboard view boots with that context.
4. Dashboard JS immediately begins calling JSON endpoints (week scoreboard, season averages, league settings, keepers, etc.) to hydrate tabs.
5. Trade Analyzer and Player Contributions fetch NBA stats on demand to supplement Yahoo data.
6. Logout clears the session and returns to `/`.

## Backend (`main.py`)

### Setup & Configuration
- Loads `.env` in development, configures structured logging, and defines Flask session behavior (`SameSite=Lax`, 1 hour lifetime).
- Registers a Yahoo OAuth client (Authlib) using `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET`; OAuth tokens are stored in the session.

### Yahoo Integration Helpers
- `_safe_iter`, `_first`, `_is_owner`: utilities for navigating Yahoo's deeply nested, list-heavy JSON structures.
- `_league_section`, `_league_meta_value`, `_extract_scoring_type`: pull specific league metadata regardless of whether Yahoo returned dicts or arrays.
- `_parse_teams_meta`, `_parse_keeper_players`: transform league/team/player payloads into tidy Python lists for JSON responses.
- `_refresh_token()`: refreshes expired Yahoo access tokens using the stored refresh token and replaces the session token.
- `yahoo_api(rel_path)`: unified wrapper that adds auth headers, retries once on 401, enforces JSON (falls back to XML parsing via `xmltodict`).
- `current_nba_season()`: builds the Season string (`YYYY-YY`) required by `nba_api` endpoints.
- `get_user_team_key()`: walks the league teams blob to find the logged-in user's `team_key` using both team name and manager GUID flags.

### Page Routes
- `GET /`: renders the landing/login page, showing different actions depending on session state.
- `GET /login`: kicks off Yahoo OAuth; always requests HTTPS callback for production readiness.
- `GET /callback`: retrieves the access token and stores it in the session before redirecting to league selection.
- `GET /select`: lists all user leagues (filters to head-to-head scoring) with owner team names for selection.
- `POST /greet`: persists the chosen league/team and sends the user to the dashboard.
- `GET /dashboard`: renders the main dashboard shell (no data embedded, everything fetched client-side).
- `GET /about`: static about page explaining the project.
- `GET /logout`: clears the session and returns to the landing page.

### Yahoo Data APIs
All endpoints require the Yahoo token in session; most also require `league_key`.
- `GET /api/scoreboard?week=<int>`: returns Yahoo scoreboard data for the chosen week. Used by weekly comparison tab.
- `GET /api/season_avg`: returns season-level team stats for the entire league. Used for the compare and trade analyzer tabs.
- `GET /api/league_settings`: exposes the league settings blob (categories, current week, etc.). Shared by most front-end modules.
- `GET /api/player_stats_week/<week>`: fetches the logged-in team's player stats for a single Yahoo scoring week.
- `GET /api/player_stats_season`: same as above but season totals.
- `GET /api/team_logo`: returns the current user's Yahoo team logo URL.
- `GET /api/draft/keepers`: composes metadata, teams, keepers grouped by owner, and orphan keepers for draft planning.
- `GET /api/bulk_matchups?weeks=1-5`: generic proxy to Yahoo's `teams;out=matchups` for arbitrary week ranges.

### NBA Data APIs
- `GET /api/nba_players`: pulls the active season player list via `nba_api.playerindex`; falls back to `nba_static_players.get_active_players()` on failure.
- `GET /api/nba_player_stats/<player_id>`: fetches per-game averages via `PlayerDashboardByGeneralSplits`, returning a normalized stat map (points, boards, FG%, etc.).

### Debug Utilities
- `GET /debug/league_settings`, `GET /debug/scoreboard`: plain-text dumps of raw Yahoo payloads for troubleshooting while signed in.

## Frontend

### Templates (`templates/`)
- `index.html`: styled login/landing page with conditional CTA based on session login state.
- `select.html`: league chooser that posts the selected `league_key` and `team_name`.
- `dashboard.html`: container layout for all analytics tabs and loads every JS module.
- `about.html`, `hello.html`: auxiliary static pages (the latter is mostly a stub/demo).

### Shared Configuration
- `static/dashboard.js` defines a `CONFIG` object containing stat metadata, week limits, and category directions, then attaches it to `window.CONFIG`.
- Other scripts (`trends.js`, `player_contributions.js`, `trade_analyzer.js`, `draft.js`) read from `window.CONFIG` to stay in sync with the league's active stat categories.

### JavaScript Modules (`static/`)
- `dashboard.js`: orchestrates the Compare Teams and Weekly Category tabs.
  - Fetches league settings, season averages, and weekly scoreboards.
  - Normalizes Yahoo responses into simplified team objects (`{ name, isMine, statMap }`).
  - Computes rankings and win/loss comparisons per category, renders responsive tables/cards, and generates textual analyses.
- `trends.js`: lazy-load module for the Trends tab.
  - Pulls league settings/current week first, then parallel fetches of scoreboard data for each week up to the current.
  - Builds Chart.js line charts showing stat progression with loading progress UI.
- `player_contributions.js`: analyzes contributions per rostered player.
  - Fetches league settings, then weekly team stats to aggregate player-level totals.
  - Offers weekly vs. season modes, weighting percentage categories correctly, and renders a Chart.js bar chart.
- `draft.js`: powers the Draft > Keepers panel.
  - Defers fetching until the Draft tab is visited.
  - Consumes `/api/draft/keepers`, populates season/team dropdowns, renders keeper cards grouped by team, and supports CSV export.
- `trade_analyzer.js`: evaluates potential trades.
  - Loads NBA player list and current season Yahoo team stats.
  - Allows searching for players (auto-complete), fetches NBA per-game averages on demand, converts them into Yahoo category impacts, and simulates ranking shifts for both trade sides.
- `team_logo.js`: fetches the logged-in team's Yahoo logo and swaps it into the header once loaded.
- `navbar.js`: toggles the responsive navigation and overlay.
- `trends.js`, `player_contributions.js`, `draft.js`, `trade_analyzer.js` all rely on Fetch and DOM APIs only; no frameworks.
- `select.js`: light enhancement for the legacy select flow; the inline script in `select.html` duplicates this behavior but the file remains for older templates.

### Styling Assets
- `static/style.css`: global layout, card/table styling, responsive behavior shared across tabs.
- `static/login_select.css`: shared look for login and league selection pages.
- `static/trade_analyzer.css`: dedicated styles for the trade UI columns, cards, and results panel.
- `static/trade_analyzer.js` also expects `Fantasy App Icon.png` and other imagery for branding; `team_logo.js` handles Yahoo-provided images.

### Frontend ? Backend Contracts
- Compare Teams tab: `/api/season_avg` -> `dashboard.js` -> tables/cards.
- Category Strengths tab: `/api/scoreboard` plus league settings -> `dashboard.js`.
- Trends tab: `/api/league_settings`, repeated `/api/scoreboard` calls -> `trends.js`.
- Player Contributions tab: `/api/league_settings`, `/api/player_stats_week`, `/api/player_stats_season` -> `player_contributions.js`.
- Draft tab: `/api/draft/keepers` -> `draft.js`.
- Trade Analyzer tab: `/api/nba_players`, `/api/nba_player_stats/<id>`, `/api/season_avg` -> `trade_analyzer.js`.
- Header/logo: `/api/team_logo` -> `team_logo.js`.

## Data & Environment Notes
- Yahoo API responses are highly nested; always inspect `fantasy_content` then iterate numeric keys ("0", "1", ...) to reach `team`, `matchup`, or `stats` arrays.
- Category direction is derived from Yahoo's `sort_order` ("1" means higher is better). Turnovers and fouls invert this logic.
- Percentage stats (`FG%`, `FT%`, `3PT%`) require weighted calculations (made/attempted) when aggregating; the JS modules handle this.
- Ensure the session contains both `token` and `league_key` before making Yahoo API calls—most routes guard against missing state and return a JSON error.
- `.env` (not checked in) must define Yahoo OAuth credentials and a Flask secret key; keep `.env.example` updated when adding new secrets.

## Directory Guide
- `main.py`: The entire Flask backend, OAuth handshake, and REST endpoints.
- `templates/`: HTML shells for each major view; adjust these when adding new tabs or pages.
- `static/`: All client-side logic and styling plus shared assets (`Fantasy App Icon.png`).
- `Documentation/`: Reference PDFs/text exports of Yahoo API docs supplied with the repo.
- `requirements.txt`: Locked dependencies (Flask, Authlib, requests, nba_api, etc.).
- `Procfile`: Gunicorn launch command (`web: gunicorn main:app`).
- `venv/`: Local Python environment (do not commit changes).

## Extending the App
- Add new backend routes in `main.py`; keep helper functions close to their routes or consider breaking out future modules into a package if the file grows further.
- Mirror new HTML fragments under `templates/` and include matching JS/CSS in `static/`.
- When consuming new Yahoo resources, prototype with the debug endpoints to understand the payload shape, then extend `_safe_iter` style helpers or build new extractors.
- Share stat metadata between modules by updating the `CONFIG` object in `dashboard.js`; downstream scripts read from `window.CONFIG` so changes propagate automatically.
- Register new client-side modules in `dashboard.html` (use `defer` to keep load order predictable) and gate expensive work behind user interactions to avoid blocking other tabs.
- Update `requirements.txt` and `.env.example` whenever new backend dependencies or environment variables are introduced.
- Write lightweight verification scripts or manual tests since no automated test suite exists yet; consider adding `pytest` under a future `tests/` folder.

## Last Updated
2025-09-22
