# Feature Request: Add "Draft" Tab with "Keepers" Sub-tab

## Goal

Add a new **Draft** tab to the application's league view. Inside it,
implement the first sub-tab: **Keepers**. This sub-tab should list all
keeper players for **each team** in a selected H2H categories league
**for a chosen season**.

## Context

-   Users already authenticate and can select a **Yahoo Fantasy** league
    and season.
-   Scoring type is **Head-to-Head (categories)**, but the keeper
    retrieval mechanism should be scoring-agnostic.
-   We need a reliable, API-driven way to fetch keepers and map them to
    teams.

## User Story

> As a manager, when I log in and open my league and season, I can click
> a new **Draft** tab. In the **Keepers** sub-tab, I see a team-by-team
> list of keeper players for that league and season, with basic player
> info and positions. I can filter by team and export the list.

## UX Requirements

-   **Navigation:** League Page → **Draft** tab → **Keepers** sub-tab
    (default).
-   **Controls (top bar):**
    -   Season selector (pre-filled with currently viewed season).
    -   Team filter (All Teams by default).
    -   "Export CSV" button.
-   **Data table (grouped by Team):**
    -   Team header: team name + manager name.
    -   Rows: Player Name (full), Positions / Display Position, Player
        Key, Yahoo Player ID (if available), and a badge "Keeper".
-   **Empty states:**
    -   If no keepers yet: "No approved keepers for this league/season."
    -   If league not H2H: "Feature available, but your league scoring
        is not H2H categories" (still show keepers if present).

## Data & API (Yahoo Fantasy)

Use Yahoo's Fantasy Sports API. You must already have OAuth2 and the
**league_key** (`{game_key}.l.{league_id}`, e.g., `428.l.12345`). Fetch
keepers via the **League → Players** collection with `status=K` and
include **ownership** to map the player to its team.

### Primary call (keepers)

-   **Resource:** `league/{league_key}/players;status=K`
-   **Subresource:** `ownership` (required to get `owner_team_key`)
-   **Purpose:** Get all kept players in the league for the season, and
    the team that kept each one.

### Helpful secondary calls

-   **League settings (optional, verify H2H):**
    `league/{league_key}/settings` → `scoring_type` should be `"head"`.
-   **Teams listing (names/manager):** `league/{league_key}/teams`
-   **Draft results (optional audit):**
    `league/{league_key}/draft_results` (post-draft reconciliation)

> Note: Keepers appear only after managers select them and the
> commissioner approves or assigns them. Before that, `status=K` may
> return none.

## Data Model (frontend)

``` ts
type KeeperPlayer = {
  player_key: string;
  player_id?: string;
  name_full: string;
  display_position?: string;   // e.g., "PG,SG" or "C"
  owner_team_key: string;      // maps to a Team
};

type TeamMeta = {
  team_key: string;
  team_name: string;
  manager_name?: string;
};

type KeepersByTeam = Record<string, KeeperPlayer[]>;
```

## Minimal Implementation Steps

1.  **Routing/Tab:** Add **Draft** tab to league view; default sub-tab
    **Keepers**.
2.  **Fetch keepers:**
    -   Call `league/{league_key}/players;status=K` with
        `subresources=ownership`.
    -   Normalize each player → `KeeperPlayer`.
3.  **Fetch teams:**
    -   Call `league/{league_key}/teams` to build
        `team_key → team_name/manager`.
4.  **Group & render:**
    -   Group keepers by `owner_team_key`.
    -   Render accordion/sections per team with a table of keepers.
5.  **Filters & export:**
    -   Team filter (client-side).
    -   "Export CSV" builds a file with
        `[Team, Player, Positions, PlayerKey, PlayerID]`.

## Pseudocode (high level)

``` ts
async function loadKeepers(leagueKey: string) {
  const [keepersResp, teamsResp] = await Promise.all([
    yahoo.leaguePlayers({ leagueKey, status: 'K', include: ['ownership'] }),
    yahoo.leagueTeams({ leagueKey })
  ]);

  const teams: TeamMeta[] = mapTeams(teamsResp);
  const byTeam: KeepersByTeam = {};

  for (const p of keepersResp.players) {
    const owner = p.ownership?.owner_team_key;
    if (!owner) continue;
    const kp: KeeperPlayer = {
      player_key: p.player_key,
      player_id: p.player_id,
      name_full: p.name?.full ?? '',
      display_position: p.display_position,
      owner_team_key: owner
    };
    (byTeam[owner] ||= []).push(kp);
  }

  return { teams, byTeam };
}
```

## Edge Cases & Error Handling

-   **No keepers yet:** Show empty state with brief explanation
    (approval not done).
-   **Private league / auth expired:** Trigger re-auth; show toast
    "Please re-authenticate."
-   **Partial data (ownership missing):** Skip those rows; surface a
    non-blocking warning.
-   **Non-H2H league:** Still display keepers; show subtle note that
    scoring is not H2H categories.

## Performance

-   Cache per league/season for 5--10 minutes.
-   Lazy-load only when entering the **Keepers** sub-tab.

## Telemetry

-   Event: `draft_tab_opened`, `keepers_loaded`, `keepers_export_csv`.
-   Include league_key (hashed), season, count of teams/players.

## Acceptance Criteria

-   Given a valid OAuth session and a league with approved keepers, the
    **Keepers** sub-tab:
    1)  Fetches and displays all keepers grouped by team.
    2)  Shows team names and manager names.
    3)  Supports filtering by team.
    4)  Exports a CSV with at least
        `[Team, Player, Positions, PlayerKey, PlayerID]`.
    5)  Handles empty/no-keepers gracefully.
    6)  Works for H2H categories leagues (and doesn't break for other
        scoring types).

## Deliverables

-   UI: New **Draft** tab + **Keepers** sub-tab components.
-   API client additions:
    -   `leaguePlayers({ leagueKey, status: 'K', include: ['ownership'] })`
    -   `leagueTeams({ leagueKey })`
-   Tests:
    -   Unit tests for grouping/normalization.
    -   Integration test with mocked Yahoo responses (keepers present /
        none / missing ownership).
-   Docs: Short README section "Draft → Keepers" with screenshots.

------------------------------------------------------------------------

### Notes on the Yahoo endpoint usage (include this in implementation comments)

-   Use **League → Players** with `status=K` and `ownership` subresource
    to identify which team kept each player.
-   Timing matters: keepers exist after selection + commish
    approval/assignment.
-   `league.draft_results` can be used post-draft for audit, but
    `status=K` is the source of truth for the keepers list pre-draft.
