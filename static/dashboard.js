/*  /static/dashboard.js  – full file  */

document.addEventListener("DOMContentLoaded", () => {
  /* ──────────────────── DOM handles ──────────────────── */
  const weekSel      = document.getElementById("weekSel");
  const tbl          = document.getElementById("scoreTable");
  const tabs         = document.querySelectorAll(".nav-tab");
  const panes        = document.querySelectorAll(".tab-pane");
  const showRanksChk = document.getElementById("showRanks");

  /* ───────────── simple tab switcher ───────────── */
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.target).classList.add("active");
    });
  });

  /* ─────────────────── league specifics ─────────────────── */
  const MAX_WEEKS = 26;
  const COLS = [
    ["10", "3PTM",  "high"],
    ["11", "3PT%",  "high"],
    ["12", "PTS",   "high"],
    ["15", "REB",   "high"],
    ["16", "AST",   "high"],
    ["17", "ST",    "high"],
    ["18", "BLK",   "high"],
    ["19", "TO",    "low" ],   // lower is better
    ["27", "DD",    "high"],
  ];

  /* ───────────────── populate week selector ───────────────── */
  for (let w = 1; w <= MAX_WEEKS; w++) {
    weekSel.insertAdjacentHTML("beforeend", `<option value="${w}">${w}</option>`);
  }

  /* ───────────────────────── state ───────────────────────── */
  let loadedTeams = [];

  /* ─────────────────────── listeners ─────────────────────── */
  weekSel.addEventListener("change", () => loadWeek(+weekSel.value));
  showRanksChk.addEventListener("change", () => renderTable(loadedTeams));

  /* ═════════════ WEEKLY CATEGORY-STRENGTHS VIEW ═════════════ */

  async function loadWeek(week) {
    tbl.innerHTML = "<caption>Loading …</caption>";
    try {
      const r   = await fetch(`/api/scoreboard?week=${week}`);
      const raw = await r.json();
      loadedTeams = extractTeams(raw);
      renderTable(loadedTeams);
    } catch (e) {
      console.error(e);
      tbl.innerHTML = "<caption>Couldn’t load data</caption>";
    }
  }

  function extractTeams(data) {
    const league = (data.fantasy_content.league || []).find(l => l.scoreboard);
    if (!league) return [];
    const sb       = league.scoreboard;
    const matchups = sb["0"]?.matchups || sb.matchups || {};
    const teams    = [];

    const yes = v => v === 1 || v === "1";

    Object.values(matchups).forEach(mWrap => {
      const matchup = mWrap.matchup; if (!matchup) return;
      const tObj = matchup["0"]?.teams || matchup.teams || {};
      Object.values(tObj).forEach(tWrap => {
        const arr = tWrap.team;
        if (!Array.isArray(arr) || arr.length < 2) return;

        /* meta */
        let name = "—", isMine = false;
        arr[0].forEach(it => {
          if (it?.name) name = it.name;
          if (yes(it?.is_owned_by_current_login) || yes(it?.is_current_login))
            isMine = true;
          if (it?.managers) {
            it.managers.forEach(mw => {
              const m = mw.manager;
              if (yes(m?.is_current_login)) isMine = true;
            });
          }
        });

        /* stats */
        const statMap = {};
        (arr[1].team_stats.stats || []).forEach(s => {
          statMap[s.stat.stat_id] = s.stat.value;
        });

        teams.push({ name, isMine, statMap });
      });
    });

    teams.sort((a, b) => Number(b.isMine) - Number(a.isMine)); // user first
    return teams;
  }

  const ordinal = n => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  function computeRanks(teams) {
    const ranks = Array.from({ length: teams.length }, () => ({}));
    COLS.forEach(([id, , dir]) => {
      const vals = teams.map((t, i) => {
        const num = parseFloat(t.statMap[id]);
        return { num, i };
      });

      vals.sort((a, b) => {
        if (isNaN(a.num)) return 1;
        if (isNaN(b.num)) return -1;
        return dir === "high" ? b.num - a.num : a.num - b.num;
      });

      let currRank = 0, prevVal = null;
      vals.forEach(({ num, i }, idx) => {
        if (isNaN(num)) {
          ranks[i][id] = "-";
          return;
        }
        if (prevVal === null || num !== prevVal) {
          currRank = idx + 1;
          prevVal  = num;
        }
        ranks[i][id] = currRank;
      });
    });
    return ranks;
  }

  function recordVsUser(userStats, oppStats) {
    let w = 0, l = 0;
    COLS.forEach(([id, , dir]) => {
      const u = parseFloat(userStats[id]);
      const o = parseFloat(oppStats[id]);
      if (isNaN(u) || isNaN(o) || u === o) return; // ignore ties / missing
      const userBetter = dir === "high" ? u > o : u < o;
      userBetter ? w++ : l++;
    });
    return `${w} - ${l}`;
  }

  function renderTable(teams) {
    tbl.innerHTML = "";
    if (!teams.length) return;

    tbl.insertAdjacentHTML(
      "afterbegin",
      `<thead><tr><th>Team</th>${COLS.map(c => `<th>${c[1]}</th>`).join("")}<th>Score</th></tr></thead><tbody></tbody>`
    );

    const tbody     = tbl.querySelector("tbody");
    const ranks     = computeRanks(teams);
    const showRanks = showRanksChk.checked;
    const base      = teams[0];                 // user's stats

    teams.forEach((t, idx) => {
      const tr = document.createElement("tr");
      if (idx === 0) tr.className = "user-row";
      tr.insertAdjacentHTML("beforeend", `<td>${t.name}</td>`);

      COLS.forEach(([id, , dir]) => {
        const raw = t.statMap[id] ?? "–";
        let cls   = "";
        if (idx !== 0 && raw !== "–" && base.statMap[id] !== "–") {
          const a = parseFloat(raw), b = parseFloat(base.statMap[id]);
          if (!isNaN(a) && !isNaN(b) && a !== b) {
            const youBetter = dir === "high" ? b > a : b < a;
            cls = youBetter ? "better" : "worse";
          }
        }

        const rankStr  = ranks[idx][id];
        const rankMark = (showRanks && rankStr !== "-")
          ? `<sup class="rank">${ordinal(rankStr)}</sup>` : "";

        tr.insertAdjacentHTML(
          "beforeend",
          `<td class="${cls}">${raw}${rankMark}</td>`
        );
      });

      const rec = idx === 0 ? "" : recordVsUser(base.statMap, t.statMap);
      tr.insertAdjacentHTML("beforeend", `<td class="score-cell">${rec}</td>`);
      tbody.appendChild(tr);
    });
  }

  loadWeek(1);   // initial weekly load

  /* ═════════════ COMPARE-TEAMS (season averages) ═════════════ */

  const avgTbl    = document.getElementById("avgTable");
  let   avgLoaded = false;

  document
    .querySelector('[data-target="tab-compare"]')
    .addEventListener("click", () => {
      if (!avgLoaded) loadAverages();
    });

  async function loadAverages() {
    avgTbl.innerHTML = "<caption>Loading …</caption>";
    try {
      const r   = await fetch("/api/season_avg");
      const raw = await r.json();
      const { teams, leagueAvg } = extractSeasonTeams(raw);
      renderAvgTable(teams, leagueAvg);
      avgLoaded = true;
    } catch (e) {
      console.error(e);
      avgTbl.innerHTML = "<caption>Couldn’t load data</caption>";
    }
  }

  /* ---------- flatten Yahoo JSON & compute per-week averages ---------- */
  function extractSeasonTeams(data) {
    const fc       = data.fantasy_content || {};
    const lgBlocks = Array.isArray(fc.league) ? fc.league : [fc.league];

    // first block with meta (current_week), second with teams
    const metaBlock  = lgBlocks.find(b => b.current_week) || lgBlocks[0];
    const teamsBlock = lgBlocks.find(b => b.teams)        || {};

    const weeksCompleted = parseInt(metaBlock.current_week, 10) || 1;
    const teams = [];
    const yes   = v => v === 1 || v === "1";

    Object.entries(teamsBlock.teams || {}).forEach(([key, tWrap]) => {
      if (key === "count") return;                    // skip the count node
      const arr = tWrap.team;
      if (!Array.isArray(arr) || arr.length < 2) return;

      /* meta */
      let name = "—", isMine = false;
      arr[0].forEach(it => {
        if (it?.name) name = it.name;
        if (yes(it?.is_owned_by_current_login) || yes(it?.is_current_login))
          isMine = true;
        if (it?.managers) {
          it.managers.forEach(mw => {
            const m = mw.manager;
            if (yes(m?.is_current_login)) isMine = true;
          });
        }
      });

      /* stats → average per completed week */
      const statMap = {};
      (arr[1].team_stats.stats || []).forEach(s => {
        const id  = s.stat.stat_id;
        let  val  = parseFloat(s.stat.value);
        if (isNaN(val)) return;

        if (id !== "11") {             // 3PT% is already a percentage
          val = val / weeksCompleted;
          val = id === "10" ? val.toFixed(0) : val.toFixed(1);
        } else {
          val = val.toFixed(3);
        }
        statMap[id] = val;
      });

      teams.push({ name, isMine, statMap });
    });

    /* league-wide average row */
    const leagueAvg = {};
    COLS.forEach(([id]) => {
      const vals = teams
        .map(t => parseFloat(t.statMap[id]))
        .filter(v => !isNaN(v));
      const avg  = vals.reduce((a, b) => a + b, 0) / vals.length;
      leagueAvg[id] = id === "11" ? avg.toFixed(3) : avg.toFixed(1);
    });

    teams.sort((a, b) => Number(b.isMine) - Number(a.isMine));
    return { teams, leagueAvg };
  }

  /* ---------- render season-average table ---------- */
  function renderAvgTable(teams, leagueAvg) {
    avgTbl.innerHTML = "";
    if (!teams.length) return;

    avgTbl.insertAdjacentHTML(
      "afterbegin",
      `<thead><tr><th>Team</th>${COLS.map(c => `<th>${c[1]}</th>`).join("")}</tr></thead><tbody></tbody>`
    );

    const tbody = avgTbl.querySelector("tbody");

    const addRow = (statMap, label, isUser = false) => {
      const tr = document.createElement("tr");
      if (isUser) tr.classList.add("user-row");
      tr.insertAdjacentHTML("beforeend", `<td>${label}</td>`);

      COLS.forEach(([id, , dir]) => {
        const raw = statMap[id] ?? "–";
        let cls   = "";

        if (label !== "League Avg." && raw !== "–") {
          const base = parseFloat(leagueAvg[id]);
          const val  = parseFloat(raw);
          if (!isNaN(base) && !isNaN(val) && val !== base) {
            const better = dir === "high" ? val > base : val < base;
            cls = better ? "better" : "worse";
          }
        }
        tr.insertAdjacentHTML("beforeend", `<td class="${cls}">${raw}</td>`);
      });

      tbody.appendChild(tr);
    };

    addRow(leagueAvg, "League Avg.");      // top row
    teams.forEach(t => addRow(t.statMap, t.name, t.isMine));
  }
});
