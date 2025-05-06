# main.py
import os, json, logging, time
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
        _ = dotenv_values()   # raises if first line malformed
    except Exception as e:
        logging.warning("[dotenv] %s – check .env formatting (KEY=VALUE).", e)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("fantasy-app")

# ─────────────────────────── Flask app ────────────────────────────────
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-key")
app.config.update(
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,         # flip to True behind HTTPS
    PERMANENT_SESSION_LIFETIME=60 * 60,  # 1 hour
)

# ─────────────────────────── Yahoo OAuth2 ─────────────────────────────
oauth = OAuth(app)
yahoo = oauth.register(
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

# ─────────────────────────── helper utils ─────────────────────────────
def _safe_iter(container: Any, key: str) -> Iterator[Any]:
    if not container:
        return
    iterable: Iterable[Any] = container.values() if isinstance(container, dict) else container
    for itm in iterable:
        if isinstance(itm, dict) and key in itm:
            yield itm[key]

def _first(container: Any, key: str) -> Any:
    for blk in _safe_iter(container, key):
        return blk

def _is_owner(managers_blob: Any, guid: str) -> bool:
    for m in _safe_iter(managers_blob, "manager"):
        if _first(m, "guid") == guid or str(_first(m, "is_current_login")) == "1":
            return True
    return False

# ---------- token refresh ----------
def _refresh_token() -> Dict[str, Any]:
    old = session.get("token", {})
    r = yahoo.refresh_token(
        yahoo.refresh_token_url,
        refresh_token=old.get("refresh_token"),
    )
    session["token"] = r
    log.info("🔑  Yahoo token refreshed at %s", time.strftime("%H:%M:%S"))
    return r

# ---------- Yahoo API wrapper ----------
def yahoo_api(rel_path: str, *, _retry: bool = True) -> Dict[str, Any]:
    token = session["token"]
    resp = requests.get(
        f"https://fantasysports.yahooapis.com/{rel_path}",
        headers={
            "Authorization": f"Bearer {token['access_token']}",
            "Accept": "application/json",
        },
        params={"format": "json"},
        timeout=20,
    )

    # token expired or otherwise invalid → refresh once and retry
    if resp.status_code == 401 and _retry:
        _refresh_token()
        return yahoo_api(rel_path, _retry=False)

    resp.raise_for_status()
    try:
        return resp.json()
    except ValueError:
        import xmltodict
        return xmltodict.parse(resp.text)

# ─────────────────────────── routes ───────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html", logged_in=("token" in session))

@app.route("/login")
def login():
    return yahoo.authorize_redirect(
        url_for("callback", _external=True, _scheme="https")
    )

@app.route("/callback")
def callback():
    session["token"] = yahoo.authorize_access_token()
    return redirect(url_for("select"))

@app.route("/select")
def select():
    if "token" not in session:
        return redirect(url_for("index"))

    raw = yahoo_api(
        "fantasy/v2/users;use_login=1/games;game_codes=nba/leagues;out=teams"
    )
    fc = raw.get("fantasy_content", raw)

    leagues: List[Dict[str, str]] = []
    for user in _safe_iter(fc.get("users", {}), "user"):
        guid = _first(user, "guid")
        for game in _safe_iter(_first(user, "games"), "game"):
            season = _first(game, "season")
            for lg in _safe_iter(_first(game, "leagues"), "league"):
                if _first(lg, "scoring_type") != "head":
                    continue
                league_season = season or _first(lg, "season")

                owner_team, fallback = None, None
                for team in _safe_iter(_first(lg, "teams"), "team"):
                    team_items = (
                        team[0]
                        if isinstance(team, list) and len(team) == 1 and isinstance(team[0], list)
                        else team
                    )
                    for entry in team_items:
                        if not isinstance(entry, dict):
                            continue
                        if "name" in entry:
                            fallback = fallback or entry["name"]
                        if "managers" in entry and _is_owner(entry["managers"], guid):
                            owner_team = entry.get("name", fallback)
                    if owner_team:
                        break

                leagues.append(
                    {
                        "season": league_season,
                        "league_key": _first(lg, "league_key"),
                        "team_name": owner_team or fallback or "(team?)",
                    }
                )

    # Sort leagues by season (descending) and then by team name
    leagues.sort(key=lambda x: (-int(x["season"]) if x["season"].isdigit() else 0, x["team_name"]))
    
    return render_template("select.html", leagues=leagues)

@app.route("/greet", methods=["POST"])
def greet():
    session["league_key"] = request.form["league_key"]
    session["team_name"] = request.form["team_name"]
    return redirect(url_for("dashboard"))

@app.route("/dashboard")
def dashboard():
    if "league_key" not in session:
        return redirect(url_for("select"))
    return render_template(
        "dashboard.html",
        team_name=session["team_name"],
        league_key=session["league_key"],
    )
#Dashboard
@app.route("/about")
def about():
    return render_template("about.html")

# ---------- WEEKLY SCOREBOARD ----------
@app.route("/api/scoreboard")
def api_scoreboard():
    if "league_key" not in session:
        return jsonify({"error": "no league chosen"}), 400
    week = request.args.get("week", type=int)
    if not week:
        return jsonify({"error": "week param required"}), 400
    rel = f"fantasy/v2/league/{session['league_key']}/scoreboard;week={week}"
    return jsonify(yahoo_api(rel))

# ---------- SEASON AVERAGES ----------
@app.route("/api/season_avg")
def api_season_avg():
    """
    League-wide season totals for every team.
    Front-end turns them into per-week averages by dividing
    by <current_week>.
    """
    if "league_key" not in session:
        return jsonify({"error": "no league chosen"}), 400

    rel = f"fantasy/v2/league/{session['league_key']}/teams;out=stats;type=season"
    data = yahoo_api(rel)

    return jsonify(data)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

# ---------- LEAGUE SETTINGS ----------
@app.route("/api/league_settings")
def api_league_settings():
    """
    Get league settings including stat categories.
    This allows the frontend to dynamically determine which stat categories
    are in use for the current league.
    """
    if "league_key" not in session:
        return jsonify({"error": "no league chosen"}), 400
    
    rel = f"fantasy/v2/league/{session['league_key']}/settings"
    try:
        data = yahoo_api(rel)
        # Log success for debugging
        log.info("Successfully fetched league settings")
        return jsonify(data)
    except Exception as e:
        log.error(f"Error fetching league settings: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/debug/league_settings")
def debug_league_settings():
    """
    Debug endpoint to view raw league settings response.
    """
    if "league_key" not in session:
        return jsonify({"error": "No league chosen. Please select a league first."}), 400
    
    try:
        rel = f"fantasy/v2/league/{session['league_key']}/settings"
        data = yahoo_api(rel)
        return f"""
        <html>
        <head>
            <title>League Settings Debug</title>
            <style>
                body {{ font-family: monospace; padding: 20px; }}
                pre {{ background: #f5f5f5; padding: 15px; overflow: auto; max-height: 80vh; }}
            </style>
        </head>
        <body>
            <h2>League Settings API Response</h2>
            <a href="/debug/scoreboard?week=1">View Scoreboard Debug</a>
            <pre>{json.dumps(data, indent=2)}</pre>
        </body>
        </html>
        """
    except Exception as e:
        return f"Error: {str(e)}"

@app.route("/debug/scoreboard")
def debug_scoreboard():
    """
    Debug endpoint to view raw scoreboard response.
    """
    if "league_key" not in session:
        return jsonify({"error": "No league chosen. Please select a league first."}), 400
    
    week = request.args.get("week", "1")
    
    try:
        rel = f"fantasy/v2/league/{session['league_key']}/scoreboard;week={week}"
        data = yahoo_api(rel)
        return f"""
        <html>
        <head>
            <title>Scoreboard Debug - Week {week}</title>
            <style>
                body {{ font-family: monospace; padding: 20px; }}
                pre {{ background: #f5f5f5; padding: 15px; overflow: auto; max-height: 80vh; }}
            </style>
        </head>
        <body>
            <h2>Scoreboard API Response - Week {week}</h2>
            <a href="/debug/league_settings">View League Settings Debug</a>
            <pre>{json.dumps(data, indent=2)}</pre>
        </body>
        </html>
        """
    except Exception as e:
        return f"Error: {str(e)}"

@app.route("/debug/week_data/<int:week>")
def debug_week_data(week):
    """
    Debug endpoint to view raw weekly data for analysis.
    """
    if "league_key" not in session:
        return jsonify({"error": "No league chosen. Please select a league first."}), 400
    
    try:
        rel = f"fantasy/v2/league/{session['league_key']}/scoreboard;week={week}"
        data = yahoo_api(rel)
        
        # Pretty print the JSON data
        formatted_json = json.dumps(data, indent=2, sort_keys=True)
        
        return f"""
        <html>
        <head>
            <title>Week {week} Data Debug</title>
            <style>
                body {{ font-family: monospace; padding: 20px; }}
                pre {{ background: #f5f5f5; padding: 15px; overflow: auto; max-height: 80vh; }}
                .analysis {{ background: #e6f7ff; padding: 15px; margin-bottom: 15px; border-left: 4px solid #1890ff; }}
            </style>
        </head>
        <body>
            <h2>Week {week} Scoreboard API Response</h2>
            <div class="analysis">
                <h3>Data Analysis</h3>
                <p>Checking for league structure...</p>
                <pre>{json.dumps(list(data.get('fantasy_content', {}).keys()), indent=2)}</pre>
                
                <p>Checking for scoreboard data...</p>
                <pre>{json.dumps(list(data.get('fantasy_content', {}).get('league', [{}])[0].keys()) if isinstance(data.get('fantasy_content', {}).get('league'), list) else "League not found or not a list", indent=2)}</pre>
                
                <p>Trying to find user's team:</p>
                {_analyze_scoreboard_for_teams(data)}
            </div>
            <h3>Full Response:</h3>
            <pre>{formatted_json}</pre>
        </body>
        </html>
        """
    except Exception as e:
        return f"Error: {str(e)}"

def _analyze_scoreboard_for_teams(data):
    """Helper function to extract team info from scoreboard data"""
    result = []
    try:
        fc = data.get('fantasy_content', {})
        league = None
        
        if isinstance(fc.get('league'), list):
            for item in fc.get('league'):
                if 'scoreboard' in item:
                    league = item
                    break
        else:
            league = fc.get('league')
        
        if not league or 'scoreboard' not in league:
            return "League or scoreboard not found in expected structure"
            
        scoreboard = league['scoreboard']
        matchups = scoreboard.get('0', {}).get('matchups', scoreboard.get('matchups', {}))
        
        for matchup_key, matchup_data in matchups.items():
            if matchup_key == 'count':
                continue
                
            result.append(f"<p><strong>Matchup {matchup_key}:</strong></p>")
            
            matchup = matchup_data.get('matchup', {})
            teams = matchup.get('0', {}).get('teams', matchup.get('teams', {}))
            
            for team_key, team_data in teams.items():
                if team_key == 'count':
                    continue
                    
                team = team_data.get('team', [])
                team_info = team[0] if isinstance(team, list) and len(team) > 0 else {}
                
                team_name = None
                is_current_user = False
                
                for item in team_info:
                    if isinstance(item, dict):
                        if 'name' in item:
                            team_name = item['name']
                        if item.get('is_owned_by_current_login') == '1' or item.get('is_current_login') == '1':
                            is_current_user = True
                        if 'managers' in item:
                            for manager in item.get('managers', []):
                                if isinstance(manager, dict) and manager.get('manager', {}).get('is_current_login') == '1':
                                    is_current_user = True
                
                result.append(f"<p>{'👤 ' if is_current_user else ''}Team: {team_name or 'Unknown'} {'(Current User)' if is_current_user else ''}</p>")
                
                # Check if team stats exist
                if len(team) > 1 and isinstance(team[1], dict) and 'team_stats' in team[1]:
                    stats = team[1]['team_stats'].get('stats', [])
                    result.append(f"<p>Stats count: {len(stats)}</p>")
                    
                    if len(stats) > 0:
                        # Show first few stats as examples
                        sample_stats = stats[:3]
                        result.append("<p>Sample stats:</p><pre>" + json.dumps(sample_stats, indent=2) + "</pre>")
                else:
                    result.append("<p>⚠️ No team stats found for this team</p>")
                
        return "".join(result)
    except Exception as e:
        return f"Error analyzing scoreboard: {str(e)}"

# ---------- PLAYER STATS BY WEEK ----------
@app.route("/api/player_stats_week/<int:week>")
def api_player_stats_week(week):
    """Get player stats for a specific week"""
    if "league_key" not in session:
        return jsonify({"error": "no league chosen"}), 400
    
    # Get the team key from the league key and team name
    try:
        # First get the team key for the current user's team
        league_key = session["league_key"]
        rel = f"fantasy/v2/league/{league_key}/teams"
        teams_data = yahoo_api(rel)
        
        team_key = None
        fc = teams_data.get("fantasy_content", {})
        league = fc.get("league", [{}])
        teams = league[1].get("teams", {}) if isinstance(league, list) and len(league) > 1 else {}
        
        for team_obj in _safe_iter(teams, "team"):
            if isinstance(team_obj, list) and len(team_obj) > 0:
                for item in team_obj[0]:
                    if isinstance(item, dict):
                        if 'name' in item and item['name'] == session["team_name"]:
                            team_key = _first(team_obj[0], "team_key")
                        elif 'is_owned_by_current_login' in item and item['is_owned_by_current_login'] == '1':
                            team_key = _first(team_obj[0], "team_key")
                            
        if not team_key:
            return jsonify({"error": "could not find team key"}), 404
        
        # Now get the player stats for that team for the specified week
        rel = f"fantasy/v2/team/{team_key}/players/stats;type=week;week={week}"
        data = yahoo_api(rel)
            
        return jsonify(data)
        
    except Exception as e:
        log.error(f"Error fetching player stats for week {week}: {e}")
        return jsonify({"error": str(e)}), 500

# ---------- PLAYER STATS SEASON TOTALS ----------
@app.route("/api/player_stats_season")
def api_player_stats_season():
    """Get player stats for the entire season"""
    if "league_key" not in session:
        return jsonify({"error": "no league chosen"}), 400
    
    try:
        # First get the team key for the current user's team
        league_key = session["league_key"]
        rel = f"fantasy/v2/league/{league_key}/teams"
        teams_data = yahoo_api(rel)
        
        team_key = None
        fc = teams_data.get("fantasy_content", {})
        league = fc.get("league", [{}])
        teams = league[1].get("teams", {}) if isinstance(league, list) and len(league) > 1 else {}
        
        for team_obj in _safe_iter(teams, "team"):
            if isinstance(team_obj, list) and len(team_obj) > 0:
                for item in team_obj[0]:
                    if isinstance(item, dict):
                        if 'name' in item and item['name'] == session["team_name"]:
                            team_key = _first(team_obj[0], "team_key")
                        elif 'is_owned_by_current_login' in item and item['is_owned_by_current_login'] == '1':
                            team_key = _first(team_obj[0], "team_key")
        
        if not team_key:
            return jsonify({"error": "could not find team key"}), 404
        
        # Now get the season stats for the team's players
        rel = f"fantasy/v2/team/{team_key}/players/stats;type=season"
        data = yahoo_api(rel)
            
        return jsonify(data)
        
    except Exception as e:
        log.error(f"Error fetching player stats for season: {e}")
        return jsonify({"error": str(e)}), 500

# ---------- DEBUG ENDPOINTS ----------
@app.route("/debug/player_stats_week/<int:week>")
def debug_player_stats_week(week):
    """Debug endpoint to view raw player stats response for a week"""
    if "league_key" not in session:
        return jsonify({"error": "No league chosen. Please select a league first."}), 400
    
    try:
        # First get the team key
        league_key = session["league_key"]
        rel = f"fantasy/v2/league/{league_key}/teams"
        teams_data = yahoo_api(rel)
        
        team_key = None
        fc = teams_data.get("fantasy_content", {})
        league = fc.get("league", [{}])
        teams = league[1].get("teams", {}) if isinstance(league, list) and len(league) > 1 else {}
        
        for team_obj in _safe_iter(teams, "team"):
            if isinstance(team_obj, list) and len(team_obj) > 0:
                for item in team_obj[0]:
                    if isinstance(item, dict):
                        if 'name' in item and item['name'] == session["team_name"]:
                            team_key = _first(team_obj[0], "team_key")
                        elif 'is_owned_by_current_login' in item and item['is_owned_by_current_login'] == '1':
                            team_key = _first(team_obj[0], "team_key")
        
        if not team_key:
            return "Could not find team key"
        
        # Now get the player stats
        rel = f"fantasy/v2/team/{team_key}/players/stats;type=week;week={week}"
        data = yahoo_api(rel)
        
        # Pretty print the JSON data
        formatted_json = json.dumps(data, indent=2, sort_keys=True)
        
        return f"""
        <html>
        <head>
            <title>Player Stats - Week {week} Debug</title>
            <style>
                body {{ font-family: monospace; padding: 20px; }}
                pre {{ background: #f5f5f5; padding: 15px; overflow: auto; max-height: 80vh; }}
                .analysis {{ background: #e6f7ff; padding: 15px; margin-bottom: 15px; border-left: 4px solid #1890ff; }}
            </style>
        </head>
        <body>
            <h2>Player Stats API Response - Week {week}</h2>
            <div class="analysis">
                <h3>Team Key</h3>
                <pre>{team_key}</pre>
                
                <h3>Data Analysis</h3>
                <p>Checking for player data structure...</p>
                <pre>{json.dumps(list(data.get('fantasy_content', {}).keys()), indent=2)}</pre>
            </div>
            <h3>Full Response:</h3>
            <pre>{formatted_json}</pre>
        </body>
        </html>
        """
    except Exception as e:
        return f"Error: {str(e)}"

@app.route("/debug/player_stats_season")
def debug_player_stats_season():
    """Debug endpoint to view raw player stats for the season"""
    if "league_key" not in session:
        return jsonify({"error": "No league chosen. Please select a league first."}), 400
    
    try:
        # First get the team key
        league_key = session["league_key"]
        rel = f"fantasy/v2/league/{league_key}/teams"
        teams_data = yahoo_api(rel)
        
        team_key = None
        fc = teams_data.get("fantasy_content", {})
        league = fc.get("league", [{}])
        teams = league[1].get("teams", {}) if isinstance(league, list) and len(league) > 1 else {}
        
        for team_obj in _safe_iter(teams, "team"):
            if isinstance(team_obj, list) and len(team_obj) > 0:
                for item in team_obj[0]:
                    if isinstance(item, dict):
                        if 'name' in item and item['name'] == session["team_name"]:
                            team_key = _first(team_obj[0], "team_key")
                        elif 'is_owned_by_current_login' in item and item['is_owned_by_current_login'] == '1':
                            team_key = _first(team_obj[0], "team_key")
        
        if not team_key:
            return "Could not find team key"
        
        # Now get the player stats
        rel = f"fantasy/v2/team/{team_key}/players/stats;type=season"
        data = yahoo_api(rel)
        
        # Pretty print the JSON data
        formatted_json = json.dumps(data, indent=2, sort_keys=True)
        
        return f"""
        <html>
        <head>
            <title>Player Stats - Season Debug</title>
            <style>
                body {{ font-family: monospace; padding: 20px; }}
                pre {{ background: #f5f5f5; padding: 15px; overflow: auto; max-height: 80vh; }}
                .analysis {{ background: #e6f7ff; padding: 15px; margin-bottom: 15px; border-left: 4px solid #1890ff; }}
            </style>
        </head>
        <body>
            <h2>Player Stats API Response - Season Totals</h2>
            <div class="analysis">
                <h3>Team Key</h3>
                <pre>{team_key}</pre>
                
                <h3>Data Analysis</h3>
                <p>Checking for player data structure...</p>
                <pre>{json.dumps(list(data.get('fantasy_content', {}).keys()), indent=2)}</pre>
            </div>
            <h3>Full Response:</h3>
            <pre>{formatted_json}</pre>
        </body>
        </html>
        """
    except Exception as e:
        return f"Error: {str(e)}"

# ─────────────────────────── main ─────────────────────────────────────
if __name__ == "__main__":
    # use `flask run` in production; this is for local dev only
    app.run(debug=True, port=5000)