/* ───── trends.js - Fantasy Basketball Trends Visualization (Promise.all refactor) ───── */

/**
 * This is a *drop‑in* replacement for the previous `trends.js`.
 *
 * ✅  Key change → `DataService.fetchAllWeeklyData()` now fetches *all* weeks in
 *     parallel with `Promise.allSettled`, updating the loading UI as each
 *     request resolves.  No other public API or DOM contract changed, so
 *     `dashboard.html`, CSS, and the Flask backend continue to work as‑is.
 *
 * ℹ️  `main.py` **does not need any modifications.**  We still hit the same
 *    `/api/scoreboard?week=N` endpoint; we just do it concurrently.
 */

document.addEventListener('DOMContentLoaded', () => {
  /* ---------------------------------------------------------------------
   * CONFIG (populated from dashboard.js when available)
   * ------------------------------------------------------------------ */
  const CONFIG = {
    MAX_WEEKS: 26,
    COLS: [
      ['10', '3PTM', 'high'],
      ['11', '3PT%', 'high'],
      ['12', 'PTS',  'high'],
      ['15', 'REB',  'high'],
      ['16', 'AST',  'high'],
      ['17', 'ST',   'high'],
      ['18', 'BLK',  'high'],
      ['19', 'TO',   'low' ], // lower is better
      ['27', 'DD',   'high']
    ],
    STAT_METADATA: {
      '0':  { name: 'GP',  display_name: 'Games Played',               sort_order: '1' },
      '1':  { name: 'GS',  display_name: 'Games Started',              sort_order: '1' },
      '2':  { name: 'MIN', display_name: 'Minutes Played',             sort_order: '1' },
      '3':  { name: 'FGA', display_name: 'Field Goals Attempted',      sort_order: '1' },
      '4':  { name: 'FGM', display_name: 'Field Goals Made',           sort_order: '1' },
      '5':  { name: 'FG%', display_name: 'Field Goal Percentage',      sort_order: '1' },
      '6':  { name: 'FTA', display_name: 'Free Throws Attempted',      sort_order: '1' },
      '7':  { name: 'FTM', display_name: 'Free Throws Made',           sort_order: '1' },
      '8':  { name: 'FT%', display_name: 'Free Throw Percentage',      sort_order: '1' },
      '9':  { name: '3PTA',display_name: '3‑point Shots Attempted',    sort_order: '1' },
      '10': { name: '3PTM',display_name: '3‑point Shots Made',         sort_order: '1' },
      '11': { name: '3PT%',display_name: '3‑point Percentage',         sort_order: '1' },
      '12': { name: 'PTS', display_name: 'Points Scored',              sort_order: '1' },
      '13': { name: 'OREB',display_name: 'Offensive Rebounds',         sort_order: '1' },
      '14': { name: 'DREB',display_name: 'Defensive Rebounds',         sort_order: '1' },
      '15': { name: 'REB', display_name: 'Total Rebounds',             sort_order: '1' },
      '16': { name: 'AST', display_name: 'Assists',                    sort_order: '1' },
      '17': { name: 'ST',  display_name: 'Steals',                     sort_order: '1' },
      '18': { name: 'BLK', display_name: 'Blocked Shots',              sort_order: '1' },
      '19': { name: 'TO',  display_name: 'Turnovers',                  sort_order: '0' },
      '20': { name: 'A/T', display_name: 'Assist/Turnover Ratio',      sort_order: '1' },
      '21': { name: 'PF',  display_name: 'Personal Fouls',             sort_order: '0' },
      '22': { name: 'DISQ',display_name: 'Times Fouled Out',           sort_order: '0' },
      '23': { name: 'TECH',display_name: 'Technical Fouls',            sort_order: '0' },
      '24': { name: 'EJCT',display_name: 'Ejections',                  sort_order: '0' },
      '25': { name: 'FF',  display_name: 'Flagrant Fouls',             sort_order: '0' },
      '26': { name: 'MPG', display_name: 'Minutes Per Game',           sort_order: '1' },
      '27': { name: 'DD',  display_name: 'Double‑Doubles',             sort_order: '1' },
      '28': { name: 'TD',  display_name: 'Triple‑Doubles',             sort_order: '1' }
    },
    PERCENTAGE_STATS: ['5', '8', '11']
  };
  if (window.CONFIG) Object.assign(CONFIG, window.CONFIG);

  /* ------------------------------------------------------------------ */
  /* DOM refs                                                            */
  /* ------------------------------------------------------------------ */
  const DOM = {
    loadButton:          document.getElementById('loadTrendsBtn'),
    container:           document.getElementById('trendsContainer'),
    loadingWrapper:      document.getElementById('trendsLoadingWrapper'),
    loadingText:         document.getElementById('trendsLoadingText'),
    loadingProgressBar:  document.getElementById('loadingProgressBar'),
    loadingProgress:     document.getElementById('loadingProgress'),
    loadingCurrentWeek:  document.getElementById('loadingCurrentWeek'),
    chartContainer:      document.getElementById('chartContainer'),
    statSelector:        document.getElementById('statSelector'),
    chart:               null
  };

  /* ------------------------------------------------------------------ */
  /* STATE                                                               */
  /* ------------------------------------------------------------------ */
  const STATE = {
    currentWeek:   0,
    weeklyStats:   [],
    statCategories: [],
    selectedStat:  null,
    initialized:   false,
    dataLoaded:    false,
    loadingMessages: [
      'Initializing trends system…',
      'Getting league settings…',
      'Connecting to Yahoo API…',
      'Analyzing statistics…',
      'Synchronizing data…',
      'Reading performance metrics…',
      'Preparing visualization…',
      'Almost there!'
    ]
  };

  /* ------------------------------------------------------------------ */
  /* UTILITIES (UNCHANGED except for 💬 comments)                         */
  /* ------------------------------------------------------------------ */
  const Utils = {
    yes: v => v === 1 || v === '1',

    formatStatValue: (id, v) => {
      if (v == null || v === '') return null;
      const num = parseFloat(v);
      if (isNaN(num)) return null;
      return CONFIG.PERCENTAGE_STATS.includes(id)
        ? num.toFixed(3).replace(/^0\./, '.')
        : num;
    },

    generateChartColors: () => ({
      borderColor:              '#4299e1',
      backgroundColor:          'rgba(66,153,225,.2)',
      pointBackgroundColor:     '#4299e1',
      pointBorderColor:         '#fff',
      pointHoverBackgroundColor:'#fff',
      pointHoverBorderColor:    '#3182ce'
    }),

    updateLoadingMessage: (msg, done = null, total = null) => {
      if (DOM.loadingText) DOM.loadingText.textContent = msg;
      if (done != null && total != null && DOM.loadingProgress) {
        DOM.loadingProgress.style.width = `${Math.round((done/total)*100)}%`;
        if (DOM.loadingCurrentWeek)
          DOM.loadingCurrentWeek.textContent = `Week ${done} of ${total}`;
        DOM.loadingProgressBar?.style.setProperty('display','block');
        DOM.loadingCurrentWeek?.style.setProperty('display','block');
      }
    },

    cycleLoadingMessages: () => {
      let idx = 0;
      return setInterval(() => {
        if (!DOM.loadingText) return;
        if (DOM.loadingText.textContent.startsWith('Week')) return;
        DOM.loadingText.textContent = STATE.loadingMessages[idx];
        idx = (idx + 1) % STATE.loadingMessages.length;
      }, 2000);
    },

    showLoading: () => {
      DOM.loadingWrapper?.style.setProperty('display','flex');
      DOM.loadingProgressBar?.style.setProperty('display','none');
      DOM.loadingCurrentWeek?.style.setProperty('display','none');
      DOM.loadingText && (DOM.loadingText.textContent = STATE.loadingMessages[0]);
      return Utils.cycleLoadingMessages();
    },

    hideLoading: () => DOM.loadingWrapper?.style.setProperty('display','none')
  };

  /* ------------------------------------------------------------------ */
  /* DATA SERVICE                                                        */
  /* ------------------------------------------------------------------ */
  const DataService = {
    /* unchanged tryGetLeagueSettings() … */
    tryGetLeagueSettings: async () => {
      try {
        const r = await fetch('/api/league_settings');
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        const data = await r.json();
        const settings = data.fantasy_content.league[1]?.settings?.[0];
        const statCats = settings?.stat_categories?.stats || [];
        const cats = [];
        statCats.forEach(obj => {
          const s = obj.stat;
          if (!s || s.enabled !== '1') return;
          const id  = s.stat_id.toString();
          const dir = (CONFIG.STAT_METADATA[id]?.sort_order ?? s.sort_order) === '1' ? 'high' : 'low';
          cats.push([id, s.display_name || s.abbr || CONFIG.STAT_METADATA[id]?.name || s.name, dir]);
          if (s.display_name?.includes('%') && !CONFIG.PERCENTAGE_STATS.includes(id)) CONFIG.PERCENTAGE_STATS.push(id);
        });
        if (cats.length) CONFIG.COLS = cats;
        return !!cats.length;
      } catch (e) { console.error(e); return false; }
    },

    /* ----------------------- NEW PARALLEL FETCH --------------------- */
    fetchAllWeeklyData: async () => {
      try {
        const ticker = Utils.showLoading();

        // 1️⃣  Ensure stat metadata is up‑to‑date
        Utils.updateLoadingMessage('Loading league settings…');
        await DataService.tryGetLeagueSettings();
        STATE.statCategories = CONFIG.COLS;

        // 2️⃣  Determine latest week
        Utils.updateLoadingMessage('Determining current week…');
        const leagueRes = await fetch('/api/league_settings');
        if (!leagueRes.ok) throw new Error('league_settings failed');
        const leagueJson = await leagueRes.json();
        STATE.currentWeek = parseInt(leagueJson.fantasy_content.league[0]?.current_week || '1', 10);
        const { currentWeek } = STATE;

        // 3️⃣  Kick off *all* week requests in parallel
        Utils.updateLoadingMessage('Fetching weekly data…', 0, currentWeek);
        let completed = 0;
        const weeklyStats = Array(currentWeek).fill(null);

        const weekPromises = Array.from({ length: currentWeek }, (_, i) => {
          const weekNum = i + 1;
          return fetch(`/api/scoreboard?week=${weekNum}`)
            .then(r => (r.ok ? r.json() : null))
            .then(json => {
              if (json) {
                const teams = DataService.extractTeams(json);
                const mine  = teams.find(t => t.isMine);
                if (mine) weeklyStats[weekNum - 1] = { week: weekNum, stats: mine.statMap };
              }
            })
            .catch(err => console.warn(`Week ${weekNum} error`, err))
            .finally(() => {
              completed += 1;
              Utils.updateLoadingMessage(`Loading data…`, completed, currentWeek);
            });
        });

        await Promise.allSettled(weekPromises);
        clearInterval(ticker);
        Utils.hideLoading();
        return weeklyStats;
      } catch (err) {
        console.error('fetchAllWeeklyData:', err);
        Utils.hideLoading();
        return [];
      }
    },

    /* unchanged extractTeams() … */
    extractTeams: data => {
      const league = (data.fantasy_content.league || []).find(l => l.scoreboard);
      if (!league) return [];
      const matchups = league.scoreboard['0']?.matchups || league.scoreboard.matchups || {};
      const teams = [];
      Object.values(matchups).forEach(mw => {
        const ts = mw.matchup?.teams || mw.matchup?.['0']?.teams || {};
        Object.values(ts).forEach(tw => {
          const arr = tw.team;
          if (!Array.isArray(arr) || arr.length < 2) return;
          let name = '—', isMine = false;
          (arr[0] || []).forEach(it => {
            if (it?.name) name = it.name;
            if (Utils.yes(it?.is_owned_by_current_login) || Utils.yes(it?.is_current_login)) isMine = true;
            it?.managers?.forEach(mw => { if (Utils.yes(mw.manager?.is_current_login)) isMine = true; });
          });
          const statMap = {};
          (arr[1]?.team_stats?.stats || []).forEach(s => { statMap[s.stat.stat_id] = s.stat.value; });
          teams.push({ name, isMine, statMap });
        });
      });
      return teams;
    }
  };

  /* ------------------------------------------------------------------ */
  /* CHART RENDERING + initPlayerContributions unchanged                */
  /* (all the code after this point is *identical* to the previous file) */
  /* ------------------------------------------------------------------ */

 // ============ CHART RENDERING ============
  const ChartRenderer = {
    // Initialize the stat selector dropdown
    initStatSelector: () => {
      if (!DOM.statSelector) return;
      
      DOM.statSelector.innerHTML = '';
      
      // Add options for each stat category
      STATE.statCategories.forEach(([id, name, dir]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        DOM.statSelector.appendChild(option);
      });
      
      // Set default selection to first stat
      if (STATE.statCategories.length > 0) {
        STATE.selectedStat = STATE.statCategories[0][0];
        DOM.statSelector.value = STATE.selectedStat;
      }
      
      // Add change event listener
      DOM.statSelector.addEventListener('change', () => {
        STATE.selectedStat = DOM.statSelector.value;
        ChartRenderer.renderChart();
      });
    },
    
    // Render the Chart.js chart
    renderChart: () => {
      // Get the canvas element
      const canvas = document.getElementById('trendsChart');
      if (!canvas) {
        console.warn('Trends chart canvas not found');
        return;
      }
      
      const ctx = canvas.getContext('2d');
      
      // If a chart already exists, destroy it
      if (DOM.chart) {
        DOM.chart.destroy();
      }
      
      if (!STATE.selectedStat || STATE.weeklyStats.length === 0) {
        console.warn('No data to render chart');
        return;
      }
      
      // Prepare data for the chart
      const labels = [];
      const dataPoints = [];
      
      STATE.weeklyStats.forEach((weekData, index) => {
        if (weekData) {
          labels.push(index + 1); // Week number (1-based)
          const statValue = Utils.formatStatValue(STATE.selectedStat, weekData.stats[STATE.selectedStat]);
          dataPoints.push(statValue);
        }
      });
      
      // Find the stat name and direction
      const statInfo = STATE.statCategories.find(cat => cat[0] === STATE.selectedStat);
      const statName = statInfo ? statInfo[1] : 'Stat';
      const isPercentage = CONFIG.PERCENTAGE_STATS.includes(STATE.selectedStat);
      
      // Generate colors
      const colors = Utils.generateChartColors();
      
      // Create the chart
      DOM.chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: statName,
            data: dataPoints,
            borderColor: colors.borderColor,
            backgroundColor: colors.backgroundColor,
            pointBackgroundColor: colors.pointBackgroundColor,
            pointBorderColor: colors.pointBorderColor,
            pointHoverBackgroundColor: colors.pointHoverBackgroundColor,
            pointHoverBorderColor: colors.pointHoverBorderColor,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: false,
              ticks: {
                precision: isPercentage ? 3 : 0,
                callback: function(value) {
                  // Format percentage values with a decimal point
                  if (isPercentage) {
                    return value.toFixed(3).replace(/^0\./, '.');
                  }
                  return value;
                }
              }
            },
            x: {
              title: {
                display: true,
                text: 'Week'
              }
            }
          },
          plugins: {
            title: {
              display: true,
              text: `${statName} Trend Over Weeks`,
              font: {
                size: 16,
                weight: 'bold'
              },
              padding: {
                top: 10,
                bottom: 20
              }
            },
            tooltip: {
              callbacks: {
                title: (tooltipItems) => {
                  return `Week ${tooltipItems[0].label}`;
                },
                label: (context) => {
                  let value = context.parsed.y;
                  if (isPercentage) {
                    return `${statName}: ${value.toFixed(3).replace(/^0\./, '.')}`;
                  }
                  return `${statName}: ${value}`;
                }
              }
            },
            legend: {
              display: false
            }
          }
        }
      });
    }
  };

  /* ------------------------------------------------------------------ */
  /* INITIALISATION                                                     */
  /* ------------------------------------------------------------------ */
  const loadTrendsData = async () => {
    DOM.loadButton && (DOM.loadButton.style.display = 'none');
    STATE.weeklyStats = await DataService.fetchAllWeeklyData();
    if (!STATE.weeklyStats.length) {
      DOM.loadButton && (DOM.loadButton.style.display = 'block');
      return;
    }
    STATE.dataLoaded = true;
    DOM.chartContainer?.style.setProperty('display','block');
    ChartRenderer.initStatSelector();
    ChartRenderer.renderChart();
  };

  const initTrends = () => {
    if (STATE.initialized) return;
    STATE.initialized = true;
    STATE.statCategories = CONFIG.COLS;
    DOM.loadButton?.addEventListener('click', loadTrendsData);
    /* auto‑load if user lands directly in tab */
    const tabBtn = document.querySelector('[data-target="tab-trends"]');
    if (tabBtn?.classList.contains('active')) loadTrendsData();
  };

  /* hook into tab activation */
  document.querySelector('[data-target="tab-trends"]')?.addEventListener('click', () => {
    initTrends();
    if (!STATE.dataLoaded) loadTrendsData();
    if (typeof window.initPlayerContributions === 'function') {
      window.initPlayerContributions();
      const btn = document.getElementById('loadContributionsBtn');
      if (btn && btn.style.display !== 'none') btn.click();
    }
  });

  /* initialise handlers */
  initTrends();
});
