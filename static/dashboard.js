/* ───── /static/dashboard.js ───── */
document.addEventListener('DOMContentLoaded', () => {

  /* util for bool-ish ints that Yahoo loves */
  const yes = v => v === 1 || v === '1';

  /* ============ DOM refs ============ */
  const weekSel        = document.getElementById('weekSel');
  const scoreTbl       = document.getElementById('scoreTable');
  const showRanksChk   = document.getElementById('showRanks');
  const cardsContainer = document.getElementById('cardsContainer');
  const cardsViewBtn   = document.getElementById('cardsView');
  const tableViewBtn   = document.getElementById('tableView');
  const tableWrapper   = document.querySelector('#tab-cat .table-container');

  const compareTbl            = document.getElementById('compareTable');
  const compareCardsContainer = document.getElementById('compareCardsContainer');
  const cmpCardsViewBtn       = document.getElementById('compareCardsView');
  const cmpTableViewBtn       = document.getElementById('compareTableView');
  const compareTableWrapper   = document.querySelector('#tab-compare .table-container');
  const viewSel               = document.getElementById('viewSel');

  /* nav-tabs */
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });

  /* ============ constants ============ */
  const MAX_WEEKS = 26;
  const COLS = [
    ['10','3PTM','high'],
    ['11','3PT%','high'],
    ['12','PTS' ,'high'],
    ['15','REB' ,'high'],
    ['16','AST' ,'high'],
    ['17','ST'  ,'high'],
    ['18','BLK' ,'high'],
    ['19','TO'  ,'low' ], // lower is better
    ['27','DD'  ,'high'],
  ];

  /* fill week selector */
  for (let w = 1; w <= MAX_WEEKS; w++) {
    weekSel.insertAdjacentHTML('beforeend', `<option value="${w}">${w}</option>`);
  }

  /* ============ helpers ============ */
  const ordinal = n => {
    const s=['th','st','nd','rd'], v=n%100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
  };

  const computeRanks = teams => {
    const ranks = Array.from({length:teams.length},()=>({}));
    COLS.forEach(([id,,dir])=>{
      const vals = teams.map((t,i)=>({num:parseFloat(t.statMap[id]),i}));
      vals.sort((a,b)=>{
        if(isNaN(a.num)) return  1;
        if(isNaN(b.num)) return -1;
        return dir==='high' ? b.num-a.num : a.num-b.num;
      });
      let curr=0,prev=null;
      vals.forEach(({num,i},idx)=>{
        if(isNaN(num)){ ranks[i][id]='-'; return;}
        if(prev===null || num!==prev){ curr=idx+1; prev=num; }
        ranks[i][id]=curr;
      });
    });
    return ranks;
  };

  const recordVsUser = (user,opp)=>{
    let w=0,l=0;
    COLS.forEach(([id,,dir])=>{
      const u=parseFloat(user[id]);
      const o=parseFloat(opp[id]);
      if(isNaN(u)||isNaN(o)||u===o) return;
      (dir==='high'?u>o:u<o) ? w++ : l++;
    });
    return `${w} - ${l}`;
  };

  /* ============ CATEGORY STRENGTHS (weekly) ============ */
  let loadedTeams=[];

  /* weekly data fetch */
  async function loadWeek(week){
    scoreTbl.innerHTML='<caption>Loading …</caption>';
    try{
      const r=await fetch(`/api/scoreboard?week=${week}`);
      const raw=await r.json();
      loadedTeams = extractWeekTeams(raw);
      renderWeekTable(loadedTeams);
      renderWeekCards(loadedTeams);
    }catch(e){
      console.error(e);
      scoreTbl.innerHTML="<caption>Couldn't load data</caption>";
    }
  }

  function extractWeekTeams(data){
    const league = (data.fantasy_content.league||[]).find(l=>l.scoreboard);
    if(!league) return [];
    const matchups=(league.scoreboard['0']?.matchups)||league.scoreboard.matchups||{};
    const teams = [];
    Object.values(matchups).forEach(mw=>{
      const ts= mw.matchup?.teams || mw.matchup?.['0']?.teams || {};
      Object.values(ts).forEach(tw=>{
        const arr = tw.team;
        if(!Array.isArray(arr)||arr.length<2) return;

        let name='—', isMine=false;
        (arr[0]||[]).forEach(it=>{
          if(it?.name) name=it.name;
          if(yes(it?.is_owned_by_current_login)||yes(it?.is_current_login)) isMine=true;
          if(it?.managers){
            it.managers.forEach(mw=>{
              if(yes(mw.manager?.is_current_login)) isMine=true;
            });
          }
        });

        const statMap={};
        (arr[1]?.team_stats?.stats||[]).forEach(s=>{
          statMap[s.stat.stat_id]=s.stat.value;
        });
        teams.push({name,isMine,statMap});
      });
    });
    teams.sort((a,b)=>Number(b.isMine)-Number(a.isMine));
    return teams;
  }

  function renderWeekTable(teams){
    scoreTbl.innerHTML='';
    if(!teams.length) return;

    scoreTbl.insertAdjacentHTML('afterbegin',
      `<thead><tr><th>Team</th>${COLS.map(c=>`<th>${c[1]}</th>`).join('')}<th>Score</th></tr></thead><tbody></tbody>`
    );
    const tbody = scoreTbl.querySelector('tbody');
    const ranks = computeRanks(teams);
    const showRanks = showRanksChk.checked;
    const base = teams[0];

    teams.forEach((t,idx)=>{
      const tr=document.createElement('tr');
      if(idx===0) tr.className='user-row';
      tr.insertAdjacentHTML('beforeend',`<td>${t.name}</td>`);

      COLS.forEach(([id,,dir])=>{
        const raw=t.statMap[id]??'–';
        let cls='';
        if(idx && raw!=='–' && base.statMap[id]!=='–'){
          const a=parseFloat(raw), b=parseFloat(base.statMap[id]);
          if(!isNaN(a)&&!isNaN(b)&&a!==b){
            cls = (dir==='high'?b>a:b<a)?'better':'worse';
          }
        }
        const rk=ranks[idx][id];
        const sup=(showRanks&&rk!=='-')?`<sup class="rank">${ordinal(rk)}</sup>`:'';
        tr.insertAdjacentHTML('beforeend',`<td class="${cls}">${raw}${sup}</td>`);
      });
      const rec = idx?recordVsUser(base.statMap,t.statMap):'';
      tr.insertAdjacentHTML('beforeend',`<td class="score-cell">${rec}</td>`);
      tbody.appendChild(tr);
    });
  }

  function renderWeekCards(teams){
    cardsContainer.innerHTML='';
    if(!teams.length) return;

    const base=teams[0];
    const ranks=computeRanks(teams);
    const showRanks=showRanksChk.checked;

    cardsContainer.insertAdjacentHTML('beforeend',
      `<div class="reference-team"><strong>Comparing with:</strong> ${base.name}</div>`
    );

    teams.slice(1).forEach((t,idx)=>{
      const rec=recordVsUser(base.statMap,t.statMap);
      const card=document.createElement('div');
      card.className='card';
      card.innerHTML=`
        <div class="card-header">
          <span>${t.name}</span>
          <span class="card-record">${rec}</span>
        </div>
        <div class="card-content"><div class="stats-grid"></div></div>`;
      const grid=card.querySelector('.stats-grid');

      COLS.forEach(([id,label,dir])=>{
        const raw=t.statMap[id]??'–';
        const ur=base.statMap[id]??'–';
        let cls='',diff='';
        if(raw!=='–'&&ur!=='–'){
          const a=parseFloat(raw), b=parseFloat(ur);
          if(!isNaN(a)&&!isNaN(b)&&a!==b){
            cls=(dir==='high'?b>a:b<a)?'better':'worse';
            let d=a-b; diff=id==='11'?d.toFixed(3):d.toFixed(0);
            if(d>0) diff='+'+diff;
          }
        }
        const rk=ranks[idx+1][id];
        // Fix: Adding a small superscript span for the rank in the mobile cards
        const sup=(showRanks&&rk!=='-')?`<span class="stat-rank">${ordinal(rk)}</span>`:'';
        grid.insertAdjacentHTML('beforeend',
          `<div class="stat-item ${cls}">
             <div class="stat-label">${label}</div>
             <div class="stat-value">${raw}${sup}</div>
             <div class="comparison-indicator">${diff}</div>
           </div>`);
      });
      cardsContainer.appendChild(card);
    });
  }

  /* table ↔ card toggles (weekly) */
  function switchWeekView(m){
    if(m==='cards'){
      cardsViewBtn.classList.add('active'); tableViewBtn.classList.remove('active');
      cardsContainer.style.display='flex';  tableWrapper.style.display='none';
    }else{
      tableViewBtn.classList.add('active'); cardsViewBtn.classList.remove('active');
      cardsContainer.style.display='none'; tableWrapper.style.display='block';
    }
  }
  cardsViewBtn.addEventListener('click',()=>switchWeekView('cards'));
  tableViewBtn.addEventListener('click',()=>switchWeekView('table'));
  if(innerWidth<=768) switchWeekView('cards');

  /* listeners */
  weekSel.addEventListener('change', ()=>loadWeek(+weekSel.value));
  showRanksChk.addEventListener('change', ()=>{
    renderWeekTable(loadedTeams); renderWeekCards(loadedTeams);
    if(seasonPayload) renderCompare(seasonPayload,seasonMode); // re-superscript ranks
  });

  /* load week-1 initially */
  loadWeek(1);

  /* ============ COMPARE TEAMS (season) ============ */
  let seasonPayload=null, seasonMode='tot';

  document.querySelector('[data-target="tab-compare"]')
          .addEventListener('click', () => { if(!seasonPayload) loadSeasonStats(); });

  async function loadSeasonStats(){
    compareTbl.innerHTML='<caption>Loading …</caption>';
    try{
      const r=await fetch('/api/season_avg');
      const raw=await r.json();
      seasonPayload=transformSeasonData(raw);
      renderCompare(seasonPayload,seasonMode);
    }catch(e){
      console.error(e);
      compareTbl.innerHTML="<caption>Couldn't load data</caption>";
    }
  }

  /* robust array-aware parser (fixed) */
  function transformSeasonData(data){
    const blocks = data.fantasy_content.league || [];
    const meta   = blocks.find(b=>b.current_week) || {};
    const teamsO = (blocks.find(b=>b.teams)||{}).teams || {};

    const currentWeek = parseInt(meta.current_week ?? MAX_WEEKS,10) || MAX_WEEKS;
    const teams=[];
    Object.values(teamsO).forEach(tw=>{
      if(!tw?.team) return;  // skip "count"
      const t=tw.team;
      let name='—', isMine=false;
      (t[0]||[]).forEach(it=>{
        if(it?.name) name=it.name;
        if(yes(it?.is_owned_by_current_login)||yes(it?.is_current_login)) isMine=true;
        if(it?.managers){
          it.managers.forEach(mw=>{
            if(yes(mw.manager?.is_current_login)) isMine=true;
          });
        }
      });
      const statMap={};
      (t[1]?.team_stats?.stats||[]).forEach(s=>{
        statMap[s.stat.stat_id]=s.stat.value;
      });
      teams.push({name,isMine,statMap});
    });
    teams.sort((a,b)=>Number(b.isMine)-Number(a.isMine));
    return {teams,currentWeek};
  }

  /* ===== renderCompare (table + cards) ===== */
  function renderCompare(payload,mode){
    const {teams,currentWeek}=payload;
    if(!teams.length) return;

    /* convert to totals / per-week averages */
    const processed = teams.map(t=>{
      const sm={};
      COLS.forEach(([id,,])=>{
        let v=parseFloat(t.statMap[id]);
        if(isNaN(v)){ sm[id]='–'; return; }
        if(mode==='avg') v = id==='11' ? (v/currentWeek).toFixed(3)
                                       : (v/currentWeek).toFixed(0);
        else if(id==='11') v = v.toFixed(3);
        sm[id]=v;
      });
      return {...t,statMap:sm};
    });

    renderCompareTable(processed);
    renderCompareCards(processed);
  }

  function renderCompareTable(teams){
    compareTbl.innerHTML='';
    if(!teams.length) return;

    compareTbl.insertAdjacentHTML('afterbegin',
      `<thead><tr><th>Team</th>${COLS.map(c=>`<th>${c[1]}</th>`).join('')}</tr></thead><tbody></tbody>`
    );
    const tbody=compareTbl.querySelector('tbody');
    const ranks=computeRanks(teams);
    const showRanks=showRanksChk.checked;
    const base=teams[0];

    teams.forEach((t,idx)=>{
      const tr=document.createElement('tr');
      if(idx===0) tr.className='user-row';
      tr.insertAdjacentHTML('beforeend',`<td>${t.name}</td>`);

      COLS.forEach(([id,,dir])=>{
        const raw=t.statMap[id];
        let cls='';
        if(idx && raw!=='–' && base.statMap[id]!=='–'){
          const a=parseFloat(raw), b=parseFloat(base.statMap[id]);
          if(!isNaN(a)&&!isNaN(b)&&a!==b){
            cls=(dir==='high'?b>a:b<a)?'better':'worse';
          }
        }
        const rk=ranks[idx][id];
        const sup=(showRanks&&rk!=='-')?`<sup class="rank">${ordinal(rk)}</sup>`:'';
        tr.insertAdjacentHTML('beforeend',`<td class="${cls}">${raw}${sup}</td>`);
      });
      tbody.appendChild(tr);
    });
  }

  function renderCompareCards(teams){
    compareCardsContainer.innerHTML='';
    if(!teams.length) return;

    const base=teams[0];
    const ranks=computeRanks(teams);
    const showRanks=showRanksChk.checked;

    compareCardsContainer.insertAdjacentHTML('beforeend',
      `<div class="reference-team"><strong>Comparing with:</strong> ${base.name}</div>`
    );

    teams.slice(1).forEach((t,idx)=>{
      const rec=recordVsUser(base.statMap,t.statMap);
      const card=document.createElement('div');
      card.className='card';
      card.innerHTML=`
        <div class="card-header">
          <span>${t.name}</span>
          <span class="card-record">${rec}</span>
        </div>
        <div class="card-content"><div class="stats-grid"></div></div>`;
      const grid=card.querySelector('.stats-grid');

      COLS.forEach(([id,label,dir])=>{
        const raw=t.statMap[id];
        const ur = base.statMap[id];
        let cls='',diff='';
        if(raw!=='–'&&ur!=='–'){
          const a=parseFloat(raw), b=parseFloat(ur);
          if(!isNaN(a)&&!isNaN(b)&&a!==b){
            cls=(dir==='high'?b>a:b<a)?'better':'worse';
            let d=a-b; diff=id==='11'?d.toFixed(3):d.toFixed(0);
            if(d>0) diff='+'+diff;
          }
        }
        const rk=ranks[idx+1][id];
        // Fix: Adding a small superscript span for the rank in the mobile cards
        const sup=(showRanks&&rk!=='-')?`<span class="stat-rank">${ordinal(rk)}</span>`:'';
        grid.insertAdjacentHTML('beforeend',
          `<div class="stat-item ${cls}">
             <div class="stat-label">${label}</div>
             <div class="stat-value">${raw}${sup}</div>
             <div class="comparison-indicator">${diff}</div>
           </div>`);
      });
      compareCardsContainer.appendChild(card);
    });
  }

  /* table ↔ card toggle (compare) */
  function switchCompareView(m){
    if(m==='cards'){
      cmpCardsViewBtn.classList.add('active'); cmpTableViewBtn.classList.remove('active');
      compareCardsContainer.style.display='flex'; compareTableWrapper.style.display='none';
    }else{
      cmpTableViewBtn.classList.add('active'); cmpCardsViewBtn.classList.remove('active');
      compareCardsContainer.style.display='none'; compareTableWrapper.style.display='block';
    }
  }
  cmpCardsViewBtn.addEventListener('click',()=>switchCompareView('cards'));
  cmpTableViewBtn.addEventListener('click',()=>switchCompareView('table'));
  if(innerWidth<=768) switchCompareView('cards'); else switchCompareView('table');

  /* totals / averages selector */
  viewSel.addEventListener('change',()=>{
    seasonMode=viewSel.value;
    if(seasonPayload) renderCompare(seasonPayload,seasonMode);
  });
});