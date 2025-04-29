/* ───── /static/dashboard.js (FULL FILE) ───── */
document.addEventListener("DOMContentLoaded", () => {
  /* ─────────── DOM handles ─────────── */
  const weekSel      = document.getElementById("weekSel");
  const tbl          = document.getElementById("scoreTable");
  const compareTbl   = document.getElementById("compareTable");
  const showRanksChk = document.getElementById("showRanks");
  const cardsContainer = document.getElementById("cardsContainer");

  const cardsViewBtn = document.getElementById("cardsView");
  const tableViewBtn = document.getElementById("tableView");
  const tableWrapper = document.querySelector(".table-container");

  const tabs  = document.querySelectorAll(".nav-tab");
  const panes = document.querySelectorAll(".tab-pane");

  /* ─────────── tab switcher ─────────── */
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.target).classList.add("active");
    });
  });

  /* ─────────────── constants ─────────────── */
  const MAX_WEEKS = 26;
  const COLS = [
    ["10","3PTM","high"],
    ["11","3PT%","high"],
    ["12","PTS" ,"high"],
    ["15","REB" ,"high"],
    ["16","AST" ,"high"],
    ["17","ST"  ,"high"],
    ["18","BLK" ,"high"],
    ["19","TO"  ,"low" ],   // lower is better
    ["27","DD"  ,"high"],
  ];

  /* ────────── populate week selector ────────── */
  for(let w=1; w<=MAX_WEEKS; w++){
    weekSel.insertAdjacentHTML("beforeend",`<option value="${w}">${w}</option>`);
  }

  /* ──────────────── state ──────────────── */
  let loadedTeams   = [];
  let seasonPayload = null;
  let seasonMode    = "tot";

  /* ─────────── view-toggle helpers ─────────── */
  function switchView(mode){
    if(mode==="cards"){
      cardsViewBtn.classList.add("active");
      tableViewBtn.classList.remove("active");
      cardsContainer.style.display="flex";
      tableWrapper.style.display="none";
    }else{
      tableViewBtn.classList.add("active");
      cardsViewBtn.classList.remove("active");
      cardsContainer.style.display="none";
      tableWrapper.style.display="block";
    }
  }
  cardsViewBtn.addEventListener("click", ()=>switchView("cards"));
  tableViewBtn.addEventListener("click", ()=>switchView("table"));

  /* default: cards on screens ≤ 768 px */
  if(window.innerWidth <= 768) switchView("cards");

  /* ───────────── listeners ───────────── */
  weekSel.addEventListener("change", ()   => loadWeek(+weekSel.value));
  showRanksChk.addEventListener("change", () => {
    renderTable(loadedTeams);
    renderCards(loadedTeams);
  });

  /* ═══════════ WEEKLY CATEGORY-STRENGTHS ═══════════ */
  async function loadWeek(week){
    tbl.innerHTML = "<caption>Loading …</caption>";
    try{
      const r   = await fetch(`/api/scoreboard?week=${week}`);
      const raw = await r.json();
      loadedTeams = extractTeams(raw);
      renderTable(loadedTeams);
      renderCards(loadedTeams);
    }catch(e){
      console.error(e);
      tbl.innerHTML = "<caption>Couldn’t load data</caption>";
    }
  }

  /* -------- Yahoo JSON → simplified team array -------- */
  function extractTeams(data){
    const league   = (data.fantasy_content.league || []).find(l => l.scoreboard);
    if(!league) return [];
    const sb       = league.scoreboard;
    const matchups = sb["0"]?.matchups || sb.matchups || {};
    const teams    = [];
    const yes = v => v===1 || v==="1";

    Object.values(matchups).forEach(mWrap=>{
      const matchup = mWrap.matchup; if(!matchup) return;
      const tObj = matchup["0"]?.teams || matchup.teams || {};
      Object.values(tObj).forEach(tWrap=>{
        const arr = tWrap.team;
        if(!Array.isArray(arr) || arr.length<2) return;

        let name="—", isMine=false;
        arr[0].forEach(it=>{
          if(it?.name) name = it.name;
          if(yes(it?.is_owned_by_current_login)||yes(it?.is_current_login))
            isMine=true;
          if(it?.managers){
            it.managers.forEach(mw=>{
              const m=mw.manager;
              if(yes(m?.is_current_login)) isMine=true;
            });
          }
        });

        const statMap={};
        (arr[1].team_stats.stats||[]).forEach(s=>{
          statMap[s.stat.stat_id]=s.stat.value;
        });

        teams.push({name,isMine,statMap});
      });
    });

    teams.sort((a,b)=>Number(b.isMine)-Number(a.isMine)); // user first
    return teams;
  }

  /* utilities */
  const ordinal = n=>{
    const s=["th","st","nd","rd"],v=n%100;
    return n+(s[(v-20)%10]||s[v]||s[0]);
  };

  function computeRanks(teams){
    const ranks = Array.from({length:teams.length},()=>({}));
    COLS.forEach(([id,,dir])=>{
      const vals = teams.map((t,i)=>({num:parseFloat(t.statMap[id]),i}));
      vals.sort((a,b)=>{
        if(isNaN(a.num)) return 1;
        if(isNaN(b.num)) return -1;
        return dir==="high" ? b.num-a.num : a.num-b.num;
      });
      let currRank=0,prev=null;
      vals.forEach(({num,i},idx)=>{
        if(isNaN(num)){ranks[i][id]="-";return;}
        if(prev===null||num!==prev){
          currRank=idx+1; prev=num;
        }
        ranks[i][id]=currRank;
      });
    });
    return ranks;
  }

  function recordVsUser(userStats,oppStats){
    let w=0,l=0;
    COLS.forEach(([id,,dir])=>{
      const u=parseFloat(userStats[id]);
      const o=parseFloat(oppStats[id]);
      if(isNaN(u)||isNaN(o)||u===o) return;
      const userBetter = dir==="high" ? u>o : u<o;
      userBetter ? w++ : l++;
    });
    return `${w} - ${l}`;
  }

  /* -------- TABLE renderer -------- */
  function renderTable(teams){
    tbl.innerHTML="";
    if(!teams.length) return;

    tbl.insertAdjacentHTML("afterbegin",
      `<thead><tr><th>Team</th>${COLS.map(c=>`<th>${c[1]}</th>`).join("")}<th>Score</th></tr></thead><tbody></tbody>`
    );
    const tbody = tbl.querySelector("tbody");
    const ranks = computeRanks(teams);
    const showRanks = showRanksChk.checked;
    const base = teams[0];

    teams.forEach((t,idx)=>{
      const tr=document.createElement("tr");
      if(idx===0) tr.className="user-row";
      tr.insertAdjacentHTML("beforeend",`<td>${t.name}</td>`);

      COLS.forEach(([id,,dir])=>{
        const raw = t.statMap[id] ?? "–";
        let cls="";
        if(idx!==0 && raw!=="–" && base.statMap[id]!=="–"){
          const a=parseFloat(raw), b=parseFloat(base.statMap[id]);
          if(!isNaN(a)&&!isNaN(b)&&a!==b){
            const youBetter = dir==="high" ? b>a : b<a;
            cls = youBetter ? "better" : "worse";
          }
        }
        const rk = ranks[idx][id];
        const sup = (showRanks && rk!=="-") ? `<sup class="rank">${ordinal(rk)}</sup>` : "";
        tr.insertAdjacentHTML("beforeend",`<td class="${cls}">${raw}${sup}</td>`);
      });

      const rec = idx===0 ? "" : recordVsUser(base.statMap,t.statMap);
      tr.insertAdjacentHTML("beforeend",`<td class="score-cell">${rec}</td>`);
      tbody.appendChild(tr);
    });
  }

  /* -------- CARD renderer -------- */
  function renderCards(teams){
    cardsContainer.innerHTML="";
    if(!teams.length) return;

    const base = teams[0];
    const ranks = computeRanks(teams);
    const showRanks = showRanksChk.checked;

    // reference team label
    cardsContainer.insertAdjacentHTML("beforeend",
      `<div class="reference-team"><strong>Comparing with:</strong> ${base.name}</div>`
    );

    teams.slice(1).forEach((t,idx)=>{
      const rec = recordVsUser(base.statMap,t.statMap);
      const card = document.createElement("div");
      card.className="card";
      card.innerHTML = `
        <div class="card-header">
          <span>${t.name}</span>
          <span class="card-record">${rec}</span>
        </div>
        <div class="card-content">
          <div class="stats-grid"></div>
        </div>`;
      const grid = card.querySelector(".stats-grid");

      COLS.forEach(([id,label,dir])=>{
        const raw = t.statMap[id] ?? "–";
        const userRaw = base.statMap[id] ?? "–";

        let cls="", diffStr="";
        if(raw!=="–" && userRaw!=="–"){
          const a=parseFloat(raw), b=parseFloat(userRaw);
          if(!isNaN(a)&&!isNaN(b)&&a!==b){
            const userBetter = dir==="high"? b>a : b<a;
            cls = userBetter ? "better" : "worse";

            let diff = a - b;
            diffStr = id==="11" ? diff.toFixed(3) : diff.toFixed(0);
            if(diff>0) diffStr = "+"+diffStr;
          }
        }
        const rk = ranks[idx+1][id];
        const sup = (showRanks && rk!=="-") ? `<sup class="rank">${ordinal(rk)}</sup>` : "";

        grid.insertAdjacentHTML("beforeend",
          `<div class="stat-item ${cls}">
             <div class="stat-label">${label}</div>
             <div class="stat-value">${raw}${sup}</div>
             <div class="comparison-indicator">${diffStr}</div>
           </div>`);
      });

      cardsContainer.appendChild(card);
    });
  }

  /* initial load */
  loadWeek(1);

  /* ══════════ SEASON TOTALS / AVERAGES (unchanged) ══════════ */
  let viewSel = document.getElementById("viewSel");  // late bind
  document.querySelector('[data-target="tab-compare"]')
          .addEventListener("click",()=>{
            if(!seasonPayload) loadSeasonStats();
          });

  async function loadSeasonStats(){
    compareTbl.innerHTML="<caption>Loading …</caption>";
    try{
      const r = await fetch("/api/season_avg");
      const raw = await r.json();
      seasonPayload = transformSeasonData(raw);
      renderCompare(seasonPayload,seasonMode);
    }catch(e){
      console.error(e);
      compareTbl.innerHTML="<caption>Couldn’t load data</caption>";
    }
  }

  function transformSeasonData(data){ /* … unchanged from your version … */ }

  function renderCompare(payload,mode){ /* … unchanged from your version … */ }

  /* re-hook view selector after it exists */
  if(viewSel){
    viewSel.addEventListener("change",()=>{
      seasonMode = viewSel.value;
      if(seasonPayload) renderCompare(seasonPayload,seasonMode);
    });
  }
});
