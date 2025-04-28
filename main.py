# main.py
import os
import logging
import time
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

    # token expired → refresh once and retry
    if resp.status_code == 401 and _retry and "expired_token" in resp.text:
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

    seasons = sorted({l["season"] for l in leagues if l.get("season")}, reverse=True)
    return render_template("select.html", seasons=seasons, leagues=leagues)

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

@app.route("/api/scoreboard")
def api_scoreboard():
    if "league_key" not in session:
        return jsonify({"error": "no league chosen"}), 400
    week = request.args.get("week", type=int)
    if not week:
        return jsonify({"error": "week param required"}), 400
    rel = f"fantasy/v2/league/{session['league_key']}/scoreboard;week={week}"
    return jsonify(yahoo_api(rel))

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

# ─────────────────────────── main ─────────────────────────────────────
if __name__ == "__main__":
    # use `flask run` in production; this is for local dev
    app.run(debug=True, port=5000)
