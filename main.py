# main.py
import os, json, logging, time
from nba_api.stats.static import players as nba_static_players
from nba_api.stats.endpoints import playerindex, PlayerDashboardByGeneralSplits
from datetime import datetime
import traceback # For detailed error logging

from typing import Any, Dict, Iterable, Iterator, List

import requests
from authlib.integrations.flask_client import OAuth
from flask import (
    Flask, redirect, render_template, request,
    session, url_for, jsonify
)

# ─────────────────────────── ENV & logging ────────────────────────────
if os.getenv("FLASK_ENV", "development") == "development":
    try:
        from dotenv import load_dotenv, dotenv_values
        load_dotenv()
        _ = dotenv_values()
    except Exception as e:
        logging.warning("[dotenv] %s – check .env formatting (KEY=VALUE).", e)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log = logging.getLogger("fantasy-app")

# ─────────────────────────── Flask app ────────────────────────────────
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-key") # Matches original
app.config.update( # Matches original
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,
    PERMANENT_SESSION_LIFETIME=60 * 60,
)

# ─────────────────────────── Yahoo OAuth2 ─────────────────────────────
oauth = OAuth(app) # Matches original
yahoo = oauth.register( # Matches original
    name="yahoo",
    client_id=os.environ["YAHOO_CLIENT_ID"],
    client_secret=os.environ["YAHOO_CLIENT_SECRET"],
    authorize_url="https://api.login.yahoo.com/oauth2/request_auth",
    access_token_url="https://api.login.yahoo.com/oauth2/get_token",
    refresh_token_url="https://api.login.yahoo.com/oauth2/get_token",
    api_base_url="https://fantasysports.yahooapis.com/",
    client_kwargs={
        "scope": "fspt-r",
        "token_endpoint_auth_method": "client_secret_basic",
    },
)

# ─────────────────────────── helper utils (original from prompt) ─────────────────────────────
def _safe_iter(container: Any, key: str) -> Iterator[Any]:
    if not container: return
    iterable: Iterable[Any] = container.values() if isinstance(container, dict) else container
    for itm in iterable:
        if isinstance(itm, dict) and key in itm:
            yield itm[key]

def _first(container: Any, key: str) -> Any:
    for blk in _safe_iter(container, key): return blk
    return None

def _is_owner(managers_blob: Any, guid: str) -> bool:
    for m in _safe_iter(managers_blob, "manager"):
        if _first(m, "guid") == guid or str(_first(m, "is_current_login")) == "1":
            return True
    return False

def _refresh_token() -> Dict[str, Any]: # Matches original
    old = session.get("token", {})
    r = yahoo.refresh_token(yahoo.refresh_token_url, refresh_token=old.get("refresh_token"))
    session["token"] = r
    log.info("🔑  Yahoo token refreshed at %s", time.strftime("%H:%M:%S"))
    return r

def yahoo_api(rel_path: str, *, _retry: bool = True) -> Dict[str, Any]: # Matches original
    token = session["token"]
    resp = requests.get(
        f"https://fantasysports.yahooapis.com/{rel_path}",
        headers={"Authorization": f"Bearer {token['access_token']}", "Accept": "application/json"},
        params={"format": "json"},
        timeout=20,
    )
    if resp.status_code == 401 and _retry:
        _refresh_token()
        return yahoo_api(rel_path, _retry=False)
    resp.raise_for_status()
    try: return resp.json()
    except ValueError: # Original fallback to xmltodict
        import xmltodict
        return xmltodict.parse(resp.text)

# NBA Season Helper (user-provided, kept from previous correct version)
def current_nba_season():
    """Return 'YYYY-YY' for the season that is happening right now."""
    today = datetime.today()
    if today.month >= 10:
        start = today.year
        end   = (today.year + 1) % 100
    else:
        start = today.year - 1
        end   =  today.year % 100
    return f"{start}-{end:02d}"

# ─────────────────────────── routes (original from prompt) ───────────────────────────────────
@app.route("/") # Matches original
def index():
    return render_template("index.html", logged_in=("token" in session))

@app.route("/login") # Reverted to your original _scheme hardcoding
def login():
    return yahoo.authorize_redirect(
        url_for("callback", _external=True, _scheme="https") # Reverted to original hardcoded "https"
    )

@app.route("/callback") # Matches original
def callback():
    session["token"] = yahoo.authorize_access_token()
    return redirect(url_for("select"))

@app.route("/select") # Matches original parsing logic
def select():
    if "token" not in session: return redirect(url_for("index"))
    raw = yahoo_api("fantasy/v2/users;use_login=1/games;game_codes=nba/leagues;out=teams")
    fc = raw.get("fantasy_content", raw)
    leagues: List[Dict[str, str]] = []
    for user in _safe_iter(fc.get("users", {}), "user"):
        guid = _first(user, "guid")
        for game in _safe_iter(_first(user, "games"), "game"):
            season = _first(game, "season")
            for lg in _safe_iter(_first(game, "leagues"), "league"):
                if _first(lg, "scoring_type") != "head": continue
                league_season = season or _first(lg, "season")
                owner_team, fallback = None, None
                # Original parsing for teams within a league
                for team_container in _safe_iter(_first(lg, "teams"), "team"):
                    # team_container is expected to be a list where the first element is the actual list of team attributes
                    team_data_list = team_container[0] if isinstance(team_container, list) and team_container else []
                    for entry in team_data_list:
                        if not isinstance(entry, dict): continue
                        if "name" in entry: fallback = fallback or entry["name"]
                        if "managers" in entry and _is_owner(entry["managers"], guid):
                            owner_team = entry.get("name", fallback) # Use found name or fallback
                            # Found the owner's team, no need to check further in this team_data_list
                            break 
                    if owner_team: # If owner_team found in this team_container, break from teams loop
                        break
                
                leagues.append({
                    "season": str(league_season) if league_season else "N/A", 
                    "league_key": str(_first(lg, "league_key")) if _first(lg, "league_key") else "N/A",
                    "team_name": owner_team or fallback or "(team?)",
                })
    leagues.sort(key=lambda x: (-int(x["season"]) if x["season"].isdigit() else 0, x["team_name"]))
    return render_template("select.html", leagues=leagues)


@app.route("/greet", methods=["POST"]) # Matches original
def greet():
    session["league_key"] = request.form["league_key"]
    session["team_name"] = request.form["team_name"]
    return redirect(url_for("dashboard"))

@app.route("/dashboard") # Matches original
def dashboard():
    if "league_key" not in session: return redirect(url_for("select"))
    return render_template("dashboard.html", team_name=session["team_name"], league_key=session["league_key"])

@app.route("/about") # Matches original
def about():
    return render_template("about.html")

# --- Yahoo API routes for dashboard data (original from prompt) ---
@app.route("/api/scoreboard") # Matches original
def api_scoreboard():
    if "league_key" not in session: return jsonify({"error": "no league chosen"}), 400
    week = request.args.get("week", type=int)
    if not week: return jsonify({"error": "week param required"}), 400
    return jsonify(yahoo_api(f"fantasy/v2/league/{session['league_key']}/scoreboard;week={week}"))

@app.route("/api/season_avg") # Matches original
def api_season_avg():
    if "league_key" not in session: return jsonify({"error": "no league chosen"}), 400
    return jsonify(yahoo_api(f"fantasy/v2/league/{session['league_key']}/teams;out=stats;type=season"))

@app.route("/logout") # Matches original
def logout():
    session.clear()
    return redirect(url_for("index"))

@app.route("/api/league_settings") # Matches original
def api_league_settings():
    if "league_key" not in session: return jsonify({"error": "no league chosen"}), 400
    try:
        data = yahoo_api(f"fantasy/v2/league/{session['league_key']}/settings")
        log.info("Successfully fetched league settings")
        return jsonify(data)
    except Exception as e:
        log.error(f"Error fetching league settings: {e}")
        return jsonify({"error": str(e)}), 500

# Helper to get user's fantasy team_key from Yahoo data (original from prompt)
def get_user_team_key(league_key, user_team_name_from_session):
    teams_data_raw = yahoo_api(f"fantasy/v2/league/{league_key}/teams")
    fc_teams = teams_data_raw.get("fantasy_content", {})
    league_teams_data_container = fc_teams.get("league") # This can be a list or dict

    teams_list_blob = None
    if isinstance(league_teams_data_container, list): # settings and teams might be separate items
        for item in league_teams_data_container:
            if "teams" in item:
                teams_list_blob = item["teams"]
                break
    elif isinstance(league_teams_data_container, dict) and "teams" in league_teams_data_container: # Only teams fetched
        teams_list_blob = league_teams_data_container["teams"]
    
    if not teams_list_blob:
        log.error(f"Could not find 'teams' structure in league data for league {league_key}")
        return None

    # teams_list_blob is like: {"count": N, "0": {"team": [...]}, "1": {"team": [...]}}
    for team_idx_str in teams_list_blob:
        if team_idx_str == 'count': continue # Skip the count key

        team_entry = teams_list_blob[team_idx_str] # This should be a dict like {"team": [actual_team_data_list]}
        team_data_list_outer = team_entry.get("team") # This is a list: [team_data_list]

        if not team_data_list_outer or not isinstance(team_data_list_outer, list): continue
        
        actual_team_data_list = team_data_list_outer[0] # This is the list of dicts for team attributes

        current_team_key = None
        is_this_the_users_team = False

        for attr_dict in actual_team_data_list:
            if not isinstance(attr_dict, dict): continue
            if "team_key" in attr_dict:
                current_team_key = attr_dict["team_key"]
            if attr_dict.get('name') == user_team_name_from_session:
                is_this_the_users_team = True
            # More reliable check for current user's team
            if 'managers' in attr_dict:
                for manager_container in _safe_iter(attr_dict['managers'], 'manager'):
                    if str(_first(manager_container, 'is_current_login')) == '1':
                        is_this_the_users_team = True
                        break # Found current login manager
                if is_this_the_users_team: break # Found within managers
        
        if is_this_the_users_team and current_team_key:
            return current_team_key
            
    log.warning(f"Could not find team key for team name '{user_team_name_from_session}' in league '{league_key}'")
    return None


@app.route("/api/player_stats_week/<int:week>") # Logic using get_user_team_key (original from prompt)
def api_player_stats_week(week):
    if "league_key" not in session: return jsonify({"error": "no league chosen"}), 400
    try:
        team_key = get_user_team_key(session["league_key"], session["team_name"])
        if not team_key: return jsonify({"error": "could not find team key for your team"}), 404
        data = yahoo_api(f"fantasy/v2/team/{team_key}/players/stats;type=week;week={week}")
        return jsonify(data)
    except Exception as e:
        log.error(f"Error fetching player stats for week {week}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/player_stats_season") # Logic using get_user_team_key (original from prompt)
def api_player_stats_season():
    if "league_key" not in session: return jsonify({"error": "no league chosen"}), 400
    try:
        team_key = get_user_team_key(session["league_key"], session["team_name"])
        if not team_key: return jsonify({"error": "could not find team key for your team"}), 404
        data = yahoo_api(f"fantasy/v2/team/{team_key}/players/stats;type=season")
        return jsonify(data)
    except Exception as e:
        log.error(f"Error fetching player stats for season: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/team_logo") # Logic using Yahoo data structure (original from prompt)
def api_team_logo():
    if "league_key" not in session: return jsonify({"error": "no league chosen"}), 400
    try:
        teams_data_raw = yahoo_api(f"fantasy/v2/league/{session['league_key']}/teams")
        team_logo_url_to_return = None
        
        fc = teams_data_raw.get("fantasy_content", {})
        league_data_container = fc.get("league") # This can be a list or dict

        teams_list_blob = None
        if isinstance(league_data_container, list):
            for item in league_data_container:
                if "teams" in item: teams_list_blob = item["teams"]; break
        elif isinstance(league_data_container, dict) and "teams" in league_data_container:
            teams_list_blob = league_data_container["teams"]
        
        if not teams_list_blob: return jsonify({"error": "could not find teams structure in league data"}), 500

        for team_idx_str in teams_list_blob:
            if team_idx_str == 'count': continue

            team_entry = teams_list_blob[team_idx_str]
            team_data_list_outer = team_entry.get("team")
            if not team_data_list_outer or not isinstance(team_data_list_outer, list): continue
            
            actual_team_data_list = team_data_list_outer[0]
            
            is_current_user_team_flag = False
            current_iter_team_logo_url = None

            for attr_dict in actual_team_data_list:
                if not isinstance(attr_dict, dict): continue
                if attr_dict.get('name') == session.get("team_name"): is_current_user_team_flag = True
                
                # Check via manager guid/is_current_login
                if 'managers' in attr_dict:
                    for manager_container in _safe_iter(attr_dict['managers'], 'manager'):
                        if str(_first(manager_container, 'is_current_login')) == '1':
                            is_current_user_team_flag = True; break 
                    if is_current_user_team_flag: break # Found current login manager for this team

                if 'team_logos' in attr_dict: # team_logos is a list of dict
                    team_logos_list = attr_dict['team_logos']
                    if team_logos_list and isinstance(team_logos_list, list):
                        logo_dict_container = team_logos_list[0] # get first item, e.g. {"team_logo": {"size":"large", "url":"..."}}
                        if logo_dict_container and "team_logo" in logo_dict_container:
                            current_iter_team_logo_url = logo_dict_container["team_logo"].get("url")
            
            if is_current_user_team_flag and current_iter_team_logo_url:
                team_logo_url_to_return = current_iter_team_logo_url; break
                
        return jsonify({"logo_url": team_logo_url_to_return})
    except Exception as e:
        log.error(f"Error fetching team logo: {e}")
        return jsonify({"error": str(e)}), 500

# --- NBA API routes (original from prompt, with fix and logging) ---
@app.route("/api/nba_players")
def api_nba_players():
    if "token" not in session: return jsonify({"error": "authentication required"}), 401
    try:
        season_str = current_nba_season()
        log.info(f"Fetching NBA players for season: {season_str} using PlayerIndex.")
        player_data_df = playerindex.PlayerIndex(season=season_str, league_id="00").get_data_frames()[0]
        players_list = [{
            'id': int(row['PERSON_ID']),
            'full_name': f"{row['PLAYER_FIRST_NAME']} {row['PLAYER_LAST_NAME']}",
            'team_id': int(row['TEAM_ID']) if row['TEAM_ID'] else None,
            'team_abbreviation': row['TEAM_ABBREVIATION'],
            'position': row['POSITION']
        } for _, row in player_data_df.iterrows()]
        # ADDED LOGGING
        log.info(f"--- NBA PLAYERS API RESPONSE (SUMMARY) ---")
        log.info(f"Total players fetched: {len(players_list)}")
        if players_list:
            log.info(f"Sample players: {json.dumps(players_list[:3], indent=2)}")
        log.info(f"--- END NBA PLAYERS API RESPONSE ---")
        return jsonify(players_list)
    except Exception as e:
        log.error(f"Error fetching NBA players list from PlayerIndex: {e}\n{traceback.format_exc()}")
        log.info("Attempting fallback to nba_static_players.get_active_players() for NBA players list.")
        try:
            active_players_basic = nba_static_players.get_active_players()
            players_list_fallback = [{'id': p['id'], 'full_name': p['full_name'], 'team_id': None, 
                                      'team_abbreviation': 'N/A', 'position': 'N/A'} for p in active_players_basic]
            # ADDED LOGGING FOR FALLBACK
            log.info(f"--- NBA PLAYERS API FALLBACK RESPONSE (SUMMARY) ---")
            log.info(f"Total players fetched (fallback): {len(players_list_fallback)}")
            if players_list_fallback:
                log.info(f"Sample players (fallback): {json.dumps(players_list_fallback[:3], indent=2)}")
            log.info(f"--- END NBA PLAYERS API FALLBACK RESPONSE ---")
            return jsonify(players_list_fallback)
        except Exception as fallback_e:
            log.error(f"Error in fallback NBA players list method: {fallback_e}\n{traceback.format_exc()}")
            return jsonify({"error": "Failed to fetch NBA players list"}), 500

@app.route("/api/nba_player_stats/<int:player_id>")
def api_nba_player_stats(player_id):
    if "token" not in session: return jsonify({"error": "authentication required"}), 401
    try:
        season = current_nba_season()
        log.info(f"Fetching NBA stats for player_id: {player_id}, season: {season}.")
        
        dashboard = PlayerDashboardByGeneralSplits(
            player_id=player_id,
            season=season,
            per_mode_detailed="PerGame"
        )
        
        data_frames = dashboard.get_data_frames()
        if not data_frames:
            log.warning(f"No dataframes returned from NBA API for player {player_id}, season {season}.")
            return jsonify({"error": f"No stats dataframes available for player {player_id} in season {season}. NBA API might have no data."}), 404

        player_stats_df = data_frames[0] 
        if player_stats_df.empty:
            log.warning(f"Stats DataFrame from NBA API is empty for player {player_id}, season {season}.")
            return jsonify({"error": f"No stats found for player {player_id} in season {season} (DataFrame was empty). Player might be inactive or have no stats for this season type."}), 404

        stats_series = player_stats_df.iloc[0]
        
        # Added 'MIN' to fetch Minutes Per Game
        stat_keys_float = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'FG3M',
                           'FGM', 'FGA', 'FTM', 'FTA', 'FG3A', 'FG_PCT', 'FT_PCT', 
                           'FG3_PCT', 'DD2', 'TD3', 'MIN'] 
        
        required_stats = {'GP': int(stats_series.get('GP', 0) or 0)}
        for key in stat_keys_float:
            required_stats[key] = float(stats_series.get(key, 0.0) or 0.0)
        
        log.info(f"--- NBA PLAYER STATS API RESPONSE FOR PLAYER ID: {player_id} ---")
        log.info(json.dumps(required_stats, indent=2))
        log.info(f"--- END NBA PLAYER STATS API RESPONSE ---")
        
        return jsonify(required_stats)

    except Exception as e:
        tb_str = traceback.format_exc()
        log.error(f"Exception in /api/nba_player_stats for player {player_id}, season {current_nba_season()}: {type(e).__name__} - {e}\nTraceback:\n{tb_str}")
        if isinstance(e, (requests.exceptions.Timeout, requests.exceptions.ConnectionError)):
            return jsonify({"error": "A timeout or connection error occurred while contacting the NBA API."}), 504
        return jsonify({"error": f"Could not fetch stats for player {player_id}: {type(e).__name__} - {str(e)}"}), 500

# Debug routes (original from prompt)
@app.route("/debug/league_settings")
def debug_league_settings():
    if "league_key" not in session: return jsonify({"error": "No league chosen."}), 400
    data = yahoo_api(f"fantasy/v2/league/{session['league_key']}/settings")
    return f"<pre>{json.dumps(data, indent=2)}</pre>"

@app.route("/debug/scoreboard")
def debug_scoreboard():
    if "league_key" not in session: return jsonify({"error": "No league chosen."}), 400
    week = request.args.get("week", "1")
    data = yahoo_api(f"fantasy/v2/league/{session['league_key']}/scoreboard;week={week}")
    return f"<pre>{json.dumps(data, indent=2)}</pre>"

@app.route("/api/bulk_matchups")
def api_bulk_matchups():
    if "token" not in session:
        return jsonify({"error": "User not authenticated or session expired."}), 401

    league_key = session.get("league_key")
    if not league_key:
        return jsonify({"error": "No league selected. Please select a league first."}), 400

    # Get 'weeks' from query param, default to "1-5" if not provided
    weeks = request.args.get("weeks", "1-5") 

    try:
        # Construct the path for the Yahoo API call
        # Example: /fantasy/v2/league/{leagueKey}/teams;out=matchups;weeks=1-5
        # Example: /fantasy/v2/league/{leagueKey}/teams;out=matchups;weeks=13,14,15
        yahoo_path = f"fantasy/v2/league/{league_key}/teams;out=matchups;weeks={weeks}"
        
        log.info(f"Proxying to Yahoo API: {yahoo_path} using session league_key: {league_key} and weeks: {weeks}")
        data = yahoo_api(yahoo_path)
        return jsonify(data)
    except requests.exceptions   .HTTPError as e:
        log.error(f"HTTPError fetching bulk matchups for league {league_key}, weeks {weeks}: {e.response.status_code} - {e.response.text}")
        error_detail = "Failed to fetch data from Yahoo API."
        try:
            # Try to parse Yahoo's error message if it's JSON
            yahoo_error = e.response.json()
            if isinstance(yahoo_error, dict) and 'error' in yahoo_error and 'description' in yahoo_error['error']:
                error_detail = yahoo_error['error']['description']
        except json.JSONDecodeError:
            pass # Keep generic error if Yahoo's response isn't JSON
        return jsonify({"error": error_detail, "yahoo_status_code": e.response.status_code}), e.response.status_code
    except Exception as e:
        log.error(f"Error fetching bulk matchups for league {league_key}, weeks {weeks}: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000, host='0.0.0.0')