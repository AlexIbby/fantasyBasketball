import os
import json
import time
import requests
import logging
from itertools import chain
from flask import (
    Flask, redirect, url_for, session,
    request, render_template
)
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv

# ────────────────────────────────────────────────────────────────
# 1.  Secrets / Flask config
# ────────────────────────────────────────────────────────────────
if os.getenv("FLASK_ENV", "development") == "development":
    from dotenv import load_dotenv
    load_dotenv()   # loads your local .env

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-key")
app.config.update(
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=True,  # cookie travels via HTTPS (ngrok / Railway)
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fantasyapp")

# ────────────────────────────────────────────────────────────────
# 2.  OAuth client (Yahoo Fantasy Sports)
# ────────────────────────────────────────────────────────────────
oauth = OAuth(app)
yahoo = oauth.register(
    name="yahoo",
    client_id=os.environ["YAHOO_CLIENT_ID"],
    client_secret=os.environ["YAHOO_CLIENT_SECRET"],
    authorize_url="https://api.login.yahoo.com/oauth2/request_auth",
    access_token_url="https://api.login.yahoo.com/oauth2/get_token",
    api_base_url="https://fantasysports.yahooapis.com/",
    client_kwargs={
        "scope": "fspt-r",  # read‑only Fantasy Sports access
        "token_endpoint_auth_method": "client_secret_basic",
    },
)

# ────────────────────────────────────────────────────────────────
# 3.  Helpers (taming Yahoo’s nested lists-within-dicts)
# ────────────────────────────────────────────────────────────────

def dump_payload(rel_path: str, payload_text: str, ext: str) -> None:
    fname = (
        "payload_"
        + rel_path.replace("/", "_").replace(";", "_")
        + f"_{int(time.time())}.{ext}"
    )
    with open(fname, "w", encoding="utf-8") as fh:
        fh.write(payload_text)
    logger.info("dumped %s", fname)


def yahoo_api(rel_path: str) -> dict:
    token = session["token"]["access_token"]
    url = f"https://fantasysports.yahooapis.com/{rel_path}"
    r = requests.get(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
        params={"format": "json"},
        timeout=20,
    )
    r.raise_for_status()

    try:
        payload = r.json()
        dump_payload(rel_path, r.text, "json")
        return payload
    except ValueError:
        dump_payload(rel_path, r.text, "xml")
        try:
            import xmltodict
        except ModuleNotFoundError:
            raise RuntimeError("Yahoo returned XML – install xmltodict or force JSON")
        return xmltodict.parse(r.text)


def safe_iter(container, wanted_key):
    if not container:
        return
    iterable = container.values() if isinstance(container, dict) else container
    for item in iterable:
        if isinstance(item, dict) and wanted_key in item:
            yield item[wanted_key]


def first_of(container, field):
    for blk in safe_iter(container, field):
        return blk
    return None


def is_owner(managers_blob, user_guid: str) -> bool:
    for m in safe_iter(managers_blob, "manager"):
        if first_of(m, "guid") == user_guid:
            return True
        if str(first_of(m, "is_current_login")) == "1":
            return True
    return False

# ────────────────────────────────────────────────────────────────
# 4.  Routes
# ────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html", logged_in=("token" in session))


@app.route("/login")
def login():
    redirect_uri = url_for("callback", _external=True, _scheme="https")
    return yahoo.authorize_redirect(redirect_uri)


@app.route("/callback")
def callback():
    session["token"] = yahoo.authorize_access_token()
    return redirect(url_for("select"))


@app.route("/select")
def select():
    if "token" not in session:
        return redirect(url_for("index"))

    raw = yahoo_api(
        "fantasy/v2/users;use_login=1/"
        "games;game_codes=nba/leagues;out=teams"
    )

    if "fantasy_content" not in raw:
        raw = {"fantasy_content": raw.get("fantasy_content", raw)}

    leagues = []
    users_blob = raw.get("fantasy_content", {}).get("users")
    if not users_blob:
        return render_template("select.html", seasons=[], leagues=[])

    for user in safe_iter(users_blob, "user"):
        user_guid = first_of(user, "guid")
        games_blob = first_of(user, "games")
        for game in safe_iter(games_blob, "game"):
            # season may live either on this object OR on its sibling metadata
            season = first_of(game, "season")
            leagues_blob = first_of(game, "leagues")
            if not leagues_blob:
                continue

            for league in safe_iter(leagues_blob, "league"):
                if first_of(league, "scoring_type") != "head":
                    continue

                # Use league‑level season as fallback if game‑level missing
                league_season = season or first_of(league, "season")

                teams_blob = first_of(league, "teams")
                if not teams_blob:
                    continue

                owner_team_name = None
                fallback_team_name = None

                for team in safe_iter(teams_blob, "team"):
                    # Many Yahoo payloads wrap the actual team dicts in an extra list
                    if isinstance(team, list) and len(team) == 1 and isinstance(team[0], list):
                        team_items = team[0]  # unwrap
                    else:
                        team_items = team

                    # iterate over *dict* entries inside team_items
                    for entry in team_items:
                        if not isinstance(entry, dict):
                            continue
                        if "name" in entry:
                            fallback_team_name = fallback_team_name or entry["name"]
                        if "managers" in entry:
                            if is_owner(entry["managers"], user_guid):
                                owner_team_name = fallback_team_name or entry.get("name")
                    if owner_team_name:
                        break

                leagues.append(
                    {
                        "season": league_season,
                        "league_key": first_of(league, "league_key"),
                        "team_name": owner_team_name or fallback_team_name or "(team missing)",
                    }
                )

    seasons = sorted({l["season"] for l in leagues if l.get("season")}, reverse=True)
    return render_template("select.html", seasons=seasons, leagues=leagues)


@app.route("/greet", methods=["POST"])
def greet():
    return render_template("hello.html", team_name=request.form["team_name"])


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


# ────────────────────────────────────────────────────────────────
# 5.  Dev entry‑point
# ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True)
