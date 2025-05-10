/* ───── trends.js - Fantasy Basketball Trends Visualization (Optimized Initial Data Load) ───── */

/**
 * This version optimizes the initial data loading for trends by:
 * - Combining the fetch for league settings (stat categories) and current week into a single API call.
 * - This reduces serial network requests before fetching weekly scoreboard data.
 *
 * It maintains the existing parallel fetching of all weekly scoreboard data using `Promise.allSettled`.
 * No other public API or DOM contract changed, so `dashboard.html`, CSS,
 * and the Flask backend continue to work as‑is.
 * `main.py` does not need any modifications.
 */

document.addEventListener('DOMContentLoaded', () => {
  /* ---------------------------------------------------------------------
   * CONFIG (populated from dashboard.js when available)
   * ------------------------------------------------------------------ */
  const CONFIG = {
    MAX_WEEKS: 26,
    // Default categories - will be used as fallback or if dashboard.js doesn't provide
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
    // Default stat metadata - will be used as fallback or if dashboard.js doesn't provide
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
    // Default percentage stats - will be used/augmented if dashboard.js doesn't provide
    PERCENTAGE_STATS: ['5', '8', '11']
  };
  // If dashboard.js has loaded and set window.CONFIG, merge its properties.
  // This allows dashboard.js to be the source of truth for these shared constants.
  if (window.CONFIG) {
    Object.assign(CONFIG, window.CONFIG);
  }

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
    currentWeek:   0,  // Will be fetched from API
    weeklyStats:   [],
    statCategories: [], // Will be populated from CONFIG.COLS, then API
    selectedStat:  null,
    initialized:   false,
    dataLoaded:    false,
    loadingMessages: [ // Original loading messages
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
  /* UTILITIES (UNCHANGED from provided trends.js)                       */
  /* ------------------------------------------------------------------ */
  const Utils = {
    yes: v => v === 1 || v === '1',

    formatStatValue: (id, v) => {
      if (v == null || v === '') return null;
      const num = parseFloat(v);
      if (isNaN(num)) return null;
      // Uses CONFIG.PERCENTAGE_STATS which might be augmented by API data
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
        // Prevent cycling if a specific progress message (like "Week X of Y") is shown
        if (DOM.loadingText.textContent.includes('Week ') && DOM.loadingText.textContent.includes(' of ')) return;
        DOM.loadingText.textContent = STATE.loadingMessages[idx];
        idx = (idx + 1) % STATE.loadingMessages.length;
      }, 2000); // Interval from original code
    },

    showLoading: () => {
      DOM.loadingWrapper?.style.setProperty('display','flex');
      DOM.loadingProgressBar?.style.setProperty('display','none'); // Hide progress bar initially
      DOM.loadingCurrentWeek?.style.setProperty('display','none'); // Hide current week initially
      DOM.loadingText && (DOM.loadingText.textContent = STATE.loadingMessages[0]);
      return Utils.cycleLoadingMessages();
    },

    hideLoading: () => DOM.loadingWrapper?.style.setProperty('display','none')
  };

  /* ------------------------------------------------------------------ */
  /* DATA SERVICE (MODIFIED)                                            */
  /* ------------------------------------------------------------------ */
  const DataService = {
    /**
     * Fetches league settings (stat categories) and the current week from the API.
     * Updates CONFIG.COLS, STATE.statCategories, and STATE.currentWeek.
     * Also dynamically updates CONFIG.PERCENTAGE_STATS based on API data.
     */
    tryGetLeagueSettingsAndCurrentWeek: async () => {
      try {
        const r = await fetch('/api/league_settings');
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        const data = await r.json();

        // Extract stat categories (expected in league[1])
        // Note: fantasy_content.league can be an array or object based on Yahoo's response.
        // The original trends.js assumed league[1] for settings and league[0] for current_week.
        const leagueArray = data.fantasy_content?.league;
        let settingsData = null;
        let currentWeekData = null;

        if (Array.isArray(leagueArray)) {
            currentWeekData = leagueArray[0];
            settingsData = leagueArray[1];
        } else if (typeof leagueArray === 'object' && leagueArray !== null) {
            // If it's an object, assume settings and current_week might be direct properties
            // This is a defensive measure; original code implies array structure from Yahoo.
            currentWeekData = leagueArray;
            settingsData = leagueArray;
        }

        const settings = settingsData?.settings?.[0];
        const statCatsData = settings?.stat_categories?.stats || [];
        const cats = [];

        statCatsData.forEach(obj => {
          const s = obj.stat;
          if (!s || s.enabled !== '1') return;
          const id  = s.stat_id.toString();
          // Use STAT_METADATA from trends.js's own CONFIG as primary fallback for sort_order, then API's sort_order
          const meta = CONFIG.STAT_METADATA[id] || {};
          const dir = (meta.sort_order ?? s.sort_order) === '1' ? 'high' : 'low';
          // Use display_name from API, then abbr, then name from local STAT_METADATA, then name from API
          cats.push([id, s.display_name || s.abbr || meta.name || s.name, dir]);
          
          // Dynamically add to CONFIG.PERCENTAGE_STATS if a stat name includes '%'
          // and it's not already listed. This matches original trends.js behavior.
          if (s.display_name?.includes('%') && !CONFIG.PERCENTAGE_STATS.includes(id)) {
            CONFIG.PERCENTAGE_STATS.push(id);
          }
        });

        if (cats.length) {
          CONFIG.COLS = cats;         // Update trends.js's CONFIG.COLS with API data
          STATE.statCategories = cats; // Update STATE.statCategories for chart selector
        } else {
          // If no categories fetched from API, retain defaults already in STATE.statCategories (set during initTrends)
          console.warn('No stat categories found in league settings API response. Trends will use defaults.');
        }
        
        // Extract current week (expected in league[0] or the main league object)
        const currentWeek = parseInt(currentWeekData?.current_week || '1', 10);
        STATE.currentWeek = currentWeek; // Update STATE.currentWeek

        // Success is true if we got API categories or already have default/dashboard categories.
        // And if currentWeek is a positive number.
        return { success: (cats.length > 0 || STATE.statCategories.length > 0) && STATE.currentWeek > 0, currentWeek: STATE.currentWeek };
      } catch (e) {
        console.error('Error in tryGetLeagueSettingsAndCurrentWeek:', e);
        // Fallback: use defaults already in STATE if any, and currentWeek to 1
        STATE.currentWeek = 1; // Default fallback for current week
        // If STATE.statCategories is empty here, it would have been set by initTrends from defaults.
        return { success: STATE.statCategories.length > 0 && STATE.currentWeek > 0, currentWeek: STATE.currentWeek };
      }
    },

    /**
     * Fetches all weekly scoreboard data for the user's team up to the current week.
     * Data fetching for each week occurs in parallel.
     */
    fetchAllWeeklyData: async () => {
      let loadingTickerIntervalId = null;
      try {
        loadingTickerIntervalId = Utils.showLoading();

        // 1️⃣ Fetch league settings (stat categories) and current week in one combined call
        Utils.updateLoadingMessage('Loading league settings & current week…');
        const settingsResult = await DataService.tryGetLeagueSettingsAndCurrentWeek();
        // STATE.statCategories and STATE.currentWeek are now set by the above call.
        // CONFIG.COLS and CONFIG.PERCENTAGE_STATS in trends.js's scope are also updated.

        if (!settingsResult.success) {
            console.warn("Failed to load critical league settings or current week from API; trends may be incomplete or use defaults.");
             // If currentWeek is invalid (e.g. 0 or less), we can't proceed.
            if (STATE.currentWeek <= 0) {
                console.error("Invalid current week:", STATE.currentWeek, "Cannot fetch weekly data.");
                clearInterval(loadingTickerIntervalId);
                Utils.hideLoading();
                if (DOM.container) {
                  DOM.container.innerHTML = '<p class="error-message">Error: Could not determine current season week. Trends cannot be loaded.</p>';
                }
                return [];
            }
        }

        const numWeeksToFetch = STATE.currentWeek;
        
        // 2️⃣ Kick off *all* week requests in parallel
        Utils.updateLoadingMessage('Fetching weekly data…', 0, numWeeksToFetch);
        let completedFetches = 0;
        const weeklyStatsData = Array(numWeeksToFetch).fill(null);

        const weekFetchPromises = Array.from({ length: numWeeksToFetch }, (_, i) => {
          const weekNum = i + 1;
          return fetch(`/api/scoreboard?week=${weekNum}`)
            .then(response => (response.ok ? response.json() : null))
            .then(jsonData => {
              if (jsonData) {
                const teams = DataService.extractTeams(jsonData); // extractTeams is unchanged
                const myTeamData  = teams.find(team => team.isMine);
                if (myTeamData) {
                  weeklyStatsData[weekNum - 1] = { week: weekNum, stats: myTeamData.statMap };
                }
              }
            })
            .catch(error => console.warn(`Error fetching data for week ${weekNum}:`, error))
            .finally(() => {
              completedFetches += 1;
              // Update loading message with progress for fetching weekly data
              Utils.updateLoadingMessage(`Fetching weekly data…`, completedFetches, numWeeksToFetch);
            });
        });

        await Promise.allSettled(weekFetchPromises);
        
        clearInterval(loadingTickerIntervalId);
        Utils.hideLoading();
        return weeklyStatsData;

      } catch (err) {
        console.error('Critical error in fetchAllWeeklyData:', err);
        if (loadingTickerIntervalId) clearInterval(loadingTickerIntervalId);
        Utils.hideLoading();
        if (DOM.container) {
            DOM.container.innerHTML = '<p class="error-message">An unexpected error occurred while loading trends data. Please try again.</p>';
        }
        return []; // Return empty array on critical failure
      }
    },

    /* extractTeams() is UNCHANGED from provided trends.js */
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
            it?.managers?.forEach(mngrWrapper => { if (Utils.yes(mngrWrapper.manager?.is_current_login)) isMine = true; });
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
  /* CHART RENDERING (UNCHANGED from provided trends.js)               */
  /* ------------------------------------------------------------------ */
  const ChartRenderer = {
    initStatSelector: () => {
      if (!DOM.statSelector) return;
      DOM.statSelector.innerHTML = '';
      STATE.statCategories.forEach(([id, name, dir]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        DOM.statSelector.appendChild(option);
      });
      if (STATE.statCategories.length > 0) {
        STATE.selectedStat = STATE.statCategories[0][0];
        DOM.statSelector.value = STATE.selectedStat;
      }
      DOM.statSelector.addEventListener('change', () => {
        STATE.selectedStat = DOM.statSelector.value;
        ChartRenderer.renderChart();
      });
    },
    renderChart: () => {
      const canvas = document.getElementById('trendsChart');
      if (!canvas) {
        console.warn('Trends chart canvas not found');
        return;
      }
      const ctx = canvas.getContext('2d');
      if (DOM.chart) {
        DOM.chart.destroy();
      }
      if (!STATE.selectedStat || STATE.weeklyStats.length === 0 || STATE.weeklyStats.every(s => s === null) ) {
        // Display a message if no data or stat selected
        if (ctx && DOM.chartContainer && DOM.chartContainer.style.display !== 'none') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.font = '16px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
            ctx.fillText('No data available to display chart.', canvas.width / 2, canvas.height / 2);
        }
        console.warn('No data to render chart (no stat selected, or no weekly data, or all weekly data is null)');
        return;
      }
      const labels = [];
      const dataPoints = [];
      STATE.weeklyStats.forEach((weekData, index) => {
        if (weekData) {
          labels.push(index + 1);
          const statValue = Utils.formatStatValue(STATE.selectedStat, weekData.stats[STATE.selectedStat]);
          dataPoints.push(statValue);
        } else {
          // Handle weeks with no data by pushing null
          labels.push(index + 1);
          dataPoints.push(null); 
        }
      });
      const statInfo = STATE.statCategories.find(cat => cat[0] === STATE.selectedStat);
      const statName = statInfo ? statInfo[1] : 'Stat';
      const isPercentage = CONFIG.PERCENTAGE_STATS.includes(STATE.selectedStat);
      const colors = Utils.generateChartColors();
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
            tension: 0.1,
            spanGaps: true, // Connect lines over null data points
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
                  if (value === null) return 'N/A';
                  if (isPercentage) {
                    return parseFloat(value).toFixed(3).replace(/^0\./, '.');
                  }
                  // For non-percentage, show 2 decimal places if not integer
                  return Number.isInteger(value) ? value : parseFloat(value).toFixed(2); 
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
              font: { size: 16, weight: 'bold' },
              padding: { top: 10, bottom: 20 }
            },
            tooltip: {
              callbacks: {
                title: (tooltipItems) => `Week ${tooltipItems[0].label}`,
                label: (context) => {
                  let value = context.parsed.y;
                  if (value === null) return `${statName}: N/A`; 
                  if (isPercentage) {
                    return `${statName}: ${parseFloat(value).toFixed(3).replace(/^0\./, '.')}`;
                  }
                  return `${statName}: ${Number.isInteger(value) ? value : parseFloat(value).toFixed(2)}`;
                }
              }
            },
            legend: { display: false }
          }
        }
      });
    }
  };

  /* ------------------------------------------------------------------ */
  /* INITIALISATION (UNCHANGED LOGIC from provided trends.js)          */
  /* ------------------------------------------------------------------ */
  const loadTrendsData = async () => {
    if (STATE.dataLoaded && STATE.weeklyStats.length > 0 && !STATE.weeklyStats.every(s => s === null) ) { 
        // If data is loaded and valid, re-render chart if needed (e.g. tab switch)
        if (DOM.chartContainer?.style.display === 'block' && DOM.statSelector && STATE.selectedStat) {
            ChartRenderer.renderChart();
        }
        return;
    }
    DOM.loadButton && (DOM.loadButton.style.display = 'none');
    STATE.weeklyStats = await DataService.fetchAllWeeklyData();
    
    if (!STATE.weeklyStats || STATE.weeklyStats.every(s => s === null)) { 
      console.warn('No weekly stats data could be loaded for trends.');
      DOM.loadButton && (DOM.loadButton.style.display = 'block'); 
      if (DOM.container) {
        DOM.loadingWrapper?.style.setProperty('display', 'none');
        const existingError = DOM.container.querySelector('.error-message');
        if (!existingError) {
            DOM.container.insertAdjacentHTML('beforeend', '<p class="error-message" style="text-align: center; margin-top: 20px;">Could not load trends data. Please try again.</p>');
        }
      }
      STATE.dataLoaded = false; 
      return;
    }

    const existingError = DOM.container?.querySelector('.error-message');
    if (existingError) existingError.remove();

    STATE.dataLoaded = true;
    DOM.chartContainer?.style.setProperty('display','block');
    ChartRenderer.initStatSelector(); 
    ChartRenderer.renderChart();
  };

  const initTrends = () => {
    if (STATE.initialized) return;
    STATE.initialized = true;
    // Initialize STATE.statCategories with defaults from CONFIG.COLS.
    // This will be updated from API when loadTrendsData() is called.
    STATE.statCategories = [...CONFIG.COLS]; 
    
    DOM.loadButton?.addEventListener('click', loadTrendsData);
    
    const trendsTabButton = document.querySelector('[data-target="tab-trends"]');
    if (trendsTabButton?.classList.contains('active') && !STATE.dataLoaded) {
      loadTrendsData();
    }
  };

  // Hook into tab activation
  document.querySelector('[data-target="tab-trends"]')?.addEventListener('click', () => {
    initTrends(); 
    if (!STATE.dataLoaded || STATE.weeklyStats.every(s => s === null) ) { // Also try loading if data is "loaded" but empty
      loadTrendsData(); 
    } else if (DOM.chart && STATE.selectedStat) {
      DOM.chartContainer?.style.setProperty('display','block');
      ChartRenderer.renderChart();
    }

    // Player contributions logic from original file
    if (typeof window.initPlayerContributions === 'function') {
      window.initPlayerContributions(); 
      const contribBtn = document.getElementById('loadContributionsBtn');
      if (contribBtn && contribBtn.style.display !== 'none') { 
        setTimeout(() => contribBtn.click(), 100);
      }
    }
  });

  // Initialise handlers for the trends tab
  initTrends();
});