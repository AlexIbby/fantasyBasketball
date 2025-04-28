/*  static/dashboard.js  – entire file  */
document.addEventListener("DOMContentLoaded", () => {
  /* ───── DOM handles ───── */
  const weekSel   = document.getElementById("weekSel");
  const tbl       = document.getElementById("scoreTable");
  const tabs      = document.querySelectorAll(".nav-tab");
  const panes     = document.querySelectorAll(".tab-pane");

  /* ───── simple tab switcher ───── */
  tabs.forEach(tab=>{
    tab.addEventListener("click",()=>{
      tabs.forEach(t=>t.classList.remove("active"));
      panes.forEach(p=>p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.target).classList.add("active");
    });
  });

  /* ───── league specifics (unchanged) ───── */
  const MAX_WEEKS = 26;
  const COLS = [
    ["10","3PTM","high"],["11","3PT%","high"],["12","PTS","high"],
    ["15","REB","high"],["16","AST","high"],["17","ST","high"],
    ["18","BLK","high"],["19","TO","low"], ["27","DD","high"],
  ];

  /* ───── populate week selector ───── */
  for(let w=1;w<=MAX_WEEKS;w++)
    weekSel.insertAdjacentHTML("beforeend",`<option value="${w}">${w}</option>`);
  weekSel.addEventListener("change",()=>loadWeek(+weekSel.value));

  /* ───── main loader ───── */
  async function loadWeek(week){
    tbl.innerHTML="<caption>Loading …</caption>";
    try{
      const r   = await fetch(`/api/scoreboard?week=${week}`);
      const raw = await r.json();
      const teams = extractTeams(raw);
      buildTable(teams);
    }catch(e){
      console.error(e);
      tbl.innerHTML="<caption>Couldn’t load data</caption>";
    }
  }

  /* ───── flatten Yahoo JSON (unchanged) ───── */
  function extractTeams(data){
    const league = (data.fantasy_content.league||[]).find(l=>l.scoreboard);
    if(!league) return [];
    const sb   = league.scoreboard;
    const matchups = (sb["0"]?.matchups)||sb.matchups||{};
    const teams = [];

    const yes = v=>v===1||v==="1";

    Object.values(matchups).forEach(mWrap=>{
      const matchup = mWrap.matchup; if(!matchup) return;
      const tObj = matchup["0"]?.teams||matchup.teams||{};
      Object.values(tObj).forEach(tWrap=>{
        const arr = tWrap.team;
        if(!Array.isArray(arr)||arr.length<2) return;

        /* meta */
        let name="—",isMine=false;
        arr[0].forEach(it=>{
          if(it?.name) name=it.name;
          if(yes(it?.is_owned_by_current_login)||yes(it?.is_current_login)) isMine=true;
          if(it?.managers){
            it.managers.forEach(mw=>{
              const m=mw.manager;
              if(yes(m?.is_current_login)) isMine=true;
            });
          }
        });

        /* stats */
        const statMap={};
        (arr[1].team_stats.stats||[]).forEach(s=>{
          statMap[s.stat.stat_id]=s.stat.value;
        });
        const score=arr[1].team_points?.total??"-";
        teams.push({name,isMine,statMap,score});
      });
    });

    teams.sort((a,b)=>Number(b.isMine)-Number(a.isMine));
    return teams;
  }

  /* ───── build coloured table (unchanged) ───── */
  function buildTable(teams){
    tbl.innerHTML="";
    tbl.insertAdjacentHTML("afterbegin",
      `<thead><tr><th>Team</th>${
        COLS.map(c=>`<th>${c[1]}</th>`).join("")}<th>Score</th></tr></thead><tbody></tbody>`);
    const base=teams[0];
    const tbody=tbl.querySelector("tbody");

    teams.forEach((t,i)=>{
      const tr=document.createElement("tr");
      if(i===0) tr.className="user-row";
      tr.insertAdjacentHTML("beforeend",`<td>${t.name}</td>`);

      COLS.forEach(([id,_,dir])=>{
        const val=t.statMap[id]??"–";
        let cls="";
        if(i!==0 && val!=="–" && base.statMap[id]!=="–"){
          const a=parseFloat(val),b=parseFloat(base.statMap[id]);
          if(!isNaN(a)&&!isNaN(b)&&a!==b){
            const youBetter = dir==="high" ? b>a : b<a;
            cls = youBetter ? "better" : "worse";
          }
        }
        tr.insertAdjacentHTML("beforeend",`<td class="${cls}">${val}</td>`);
      });
      tr.insertAdjacentHTML("beforeend",`<td class="score-cell">${t.score}</td>`);
      tbody.appendChild(tr);
    });
  }
});
