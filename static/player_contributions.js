/* ───── player_contributions.js - Fantasy Basketball Player Stat Contributions (Optimized Initial Load) ───── */
document.addEventListener('DOMContentLoaded', () => {
  // ============ CONFIG ============
  // Local config that will be populated from dashboard.js if possible
  // or will use these defaults if not
  const CONFIG = {
    MAX_WEEKS: 26,
    // Default categories - will be used as fallback
    COLS: [
      ['10', '3PTM', 'high'],
      ['11', '3PT%', 'high'],
      ['12', 'PTS', 'high'],
      ['15', 'REB', 'high'],
      ['16', 'AST', 'high'],
      ['17', 'ST', 'high'],
      ['18', 'BLK', 'high'],
      ['19', 'TO', 'low'], // lower is better
      ['27', 'DD', 'high'],
    ],
    // Mapping of stat IDs to their metadata
    STAT_METADATA: {
      '0': { name: 'GP', display_name: 'Games Played', sort_order: '1' },
      '1': { name: 'GS', display_name: 'Games Started', sort_order: '1' },
      '2': { name: 'MIN', display_name: 'Minutes Played', sort_order: '1' },
      '3': { name: 'FGA', display_name: 'Field Goals Attempted', sort_order: '1' },
      '4': { name: 'FGM', display_name: 'Field Goals Made', sort_order: '1' },
      '5': { name: 'FG%', display_name: 'Field Goal Percentage', sort_order: '1' },
      '6': { name: 'FTA', display_name: 'Free Throws Attempted', sort_order: '1' },
      '7': { name: 'FTM', display_name: 'Free Throws Made', sort_order: '1' },
      '8': { name: 'FT%', display_name: 'Free Throw Percentage', sort_order: '1' },
      '9': { name: '3PTA', display_name: '3-point Shots Attempted', sort_order: '1' },
      '10': { name: '3PTM', display_name: '3-point Shots Made', sort_order: '1' },
      '11': { name: '3PT%', display_name: '3-point Percentage', sort_order: '1' },
      '12': { name: 'PTS', display_name: 'Points Scored', sort_order: '1' },
      '13': { name: 'OREB', display_name: 'Offensive Rebounds', sort_order: '1' },
      '14': { name: 'DREB', display_name: 'Defensive Rebounds', sort_order: '1' },
      '15': { name: 'REB', display_name: 'Total Rebounds', sort_order: '1' },
      '16': { name: 'AST', display_name: 'Assists', sort_order: '1' },
      '17': { name: 'ST', display_name: 'Steals', sort_order: '1' },
      '18': { name: 'BLK', display_name: 'Blocked Shots', sort_order: '1' },
      '19': { name: 'TO', display_name: 'Turnovers', sort_order: '0' },
      '20': { name: 'A/T', display_name: 'Assist/Turnover Ratio', sort_order: '1' },
      '21': { name: 'PF', display_name: 'Personal Fouls', sort_order: '0' },
      '22': { name: 'DISQ', display_name: 'Times Fouled Out', sort_order: '0' },
      '23': { name: 'TECH', display_name: 'Technical Fouls', sort_order: '0' },
      '24': { name: 'EJCT', display_name: 'Ejections', sort_order: '0' },
      '25': { name: 'FF', display_name: 'Flagrant Fouls', sort_order: '0' },
      '26': { name: 'MPG', display_name: 'Minutes Per Game', sort_order: '1' },
      '27': { name: 'DD', display_name: 'Double-Doubles', sort_order: '1' },
      '28': { name: 'TD', display_name: 'Triple-Doubles', sort_order: '1' }
    },
    // Percentage stat IDs for special formatting
    PERCENTAGE_STATS: ['5', '8', '11'],
    // Chart colors for player contributions
    PLAYER_COLORS: [
      '#FFB6C1', '#B0E0E6', '#FFEFD5', '#CCCCFF', '#FFE4B5', '#E6FFE0',
      '#FFD1DC', '#F0FFF0', '#FFDAB9', '#E0FFFF', '#FFE4E1', '#D8BFD8',
      '#FFFACD', '#F0E68C'
    ]
  };

  if (window.CONFIG) {
    Object.assign(CONFIG, window.CONFIG);
    console.log('Player Contributions: Using global CONFIG from dashboard.js');
  } else {
    console.log('Player Contributions: Using local CONFIG defaults.');
  }

  const DOM = {
    loadButton: document.getElementById('loadContributionsBtn'),
    container: document.getElementById('contributionsContainer'),
    loadingWrapper: document.getElementById('contributionsLoadingWrapper'),
    loadingText: document.getElementById('contributionsLoadingText'),
    loadingProgressBar: document.getElementById('contributionsLoadingProgress'),
    loadingProgress: document.getElementById('contributionsProgressBar'),
    loadingCurrentWeek: document.getElementById('contributionsCurrentWeek'),
    chartContainer: document.getElementById('contributionsChartContainer'),
    statSelector: document.getElementById('contributionStatSelector'),
    weekSelector: document.getElementById('contributionWeekSelector'),
    viewToggle: {
      weeklyBtn: document.getElementById('contributionWeeklyView'),
      seasonBtn: document.getElementById('contributionSeasonView')
    },
    chart: null
  };

  const STATE = {
    currentWeek: 0,
    weeklyPlayerStats: {},
    seasonPlayerStats: null,
    statCategories: [],
    selectedStat: null,
    viewMode: 'weekly',
    selectedWeek: 1,
    initialized: false,
    dataLoaded: false,
    loadingMessages: [
      "Initializing player contributions...", "Fetching league settings...", "Connecting to Yahoo API...",
      "Analyzing player statistics...", "Synchronizing data...", "Reading performance metrics...",
      "Preparing visualization...", "Almost there!"
    ]
  };

  const Utils = {
    yes: v => v === 1 || v === '1',
    formatStatValue: (id, value) => {
      if (value === null || value === undefined || value === '') return null;
      const numVal = parseFloat(value);
      if (isNaN(numVal)) return null;
      return CONFIG.PERCENTAGE_STATS.includes(id) ? numVal.toFixed(3).replace(/^0\./, '.') : numVal;
    },
    updateLoadingMessage: (message, weekNum = null, totalWeeks = null) => {
      if (DOM.loadingText) DOM.loadingText.textContent = message;
      if (weekNum !== null && totalWeeks !== null && DOM.loadingProgress && DOM.loadingCurrentWeek) {
        const progressPercent = Math.round((weekNum / totalWeeks) * 100);
        DOM.loadingProgress.style.width = `${progressPercent}%`;
        DOM.loadingCurrentWeek.textContent = `Fetching: Week ${weekNum} of ${totalWeeks}`;
        if (DOM.loadingProgressBar) DOM.loadingProgressBar.style.display = 'block';
        if (DOM.loadingCurrentWeek) DOM.loadingCurrentWeek.style.display = 'block';
      }
    },
    cycleLoadingMessages: () => {
      let index = 0;
      return setInterval(() => {
        if (!DOM.loadingText || DOM.loadingText.textContent.includes('Fetching: Week')) return;
        DOM.loadingText.textContent = STATE.loadingMessages[index];
        index = (index + 1) % STATE.loadingMessages.length;
      }, 2000);
    },
    showLoading: () => {
      if (DOM.loadingWrapper) DOM.loadingWrapper.style.display = 'flex';
      if (DOM.loadingText) DOM.loadingText.textContent = STATE.loadingMessages[0];
      if (DOM.loadingProgressBar) DOM.loadingProgressBar.style.display = 'none';
      if (DOM.loadingCurrentWeek) DOM.loadingCurrentWeek.style.display = 'none';
      return Utils.cycleLoadingMessages();
    },
    hideLoading: () => {
      if (DOM.loadingWrapper) DOM.loadingWrapper.style.display = 'none';
    },
    getPlayerName: playerObj => {
      if (!playerObj) return 'Unknown Player';
      if (Array.isArray(playerObj) && playerObj.length > 0) {
        const metadata = playerObj[0];
        if (Array.isArray(metadata)) {
          for (const item of metadata) if (item?.name) return item.name.full || item.name;
        } else if (metadata?.name) return metadata.name.full || metadata.name;
      }
      return 'Unknown Player';
    },
    getStatValue: (playerObj, statId) => {
      if (!playerObj || !Array.isArray(playerObj)) return 0;
      const playerStats = playerObj[1]?.player_stats?.stats;
      if (!Array.isArray(playerStats)) return 0;
      for (const stat of playerStats) {
        if (stat.stat?.stat_id === statId.toString()) {
          return Utils.formatStatValue(statId, stat.stat.value) || 0;
        }
      }
      return 0;
    },
    calculateTotal: (players, statId) => {
      if (CONFIG.PERCENTAGE_STATS.includes(statId)) {
        let weightedSum = 0, totalWeight = 0;
        players.forEach(player => {
          let attemptsKey;
          if (statId === '11') attemptsKey = '9';      // 3PTA for 3PT%
          else if (statId === '5') attemptsKey = '3'; // FGA for FG%
          else if (statId === '8') attemptsKey = '6'; // FTA for FT%
          else return;
          const attempts = Utils.getStatValue(player, attemptsKey);
          const percentage = Utils.getStatValue(player, statId);
          if (attempts > 0 && typeof percentage === 'number') {
            weightedSum += percentage * attempts;
            totalWeight += attempts;
          }
        });
        return totalWeight > 0 ? weightedSum / totalWeight : 0;
      }
      return players.reduce((sum, p) => sum + Utils.getStatValue(p, statId), 0);
    }
  };

  const DataService = {
    // Modified to fetch once and return data for currentWeek extraction
    tryGetLeagueSettings: async () => {
      try {
        const r = await fetch('/api/league_settings');
        if (!r.ok) throw new Error(`API returned ${r.status} for league settings`);
        const leagueData = await r.json();
        
        const settings = leagueData.fantasy_content.league[1]?.settings?.[0];
        if (!settings?.stat_categories?.stats) {
          console.warn('No stat_categories found in league settings');
          return { success: false, leagueData: leagueData, categoriesFound: false };
        }
        
        const statCats = settings.stat_categories.stats;
        const categories = [];
        statCats.forEach(catObj => {
          const stat = catObj.stat;
          if (!stat || stat.enabled !== '1') return;
          const id = stat.stat_id.toString();
          const meta = CONFIG.STAT_METADATA[id] || { name: stat.name, display_name: stat.display_name, sort_order: stat.sort_order };
          categories.push([id, stat.display_name || stat.abbr || meta.name, meta.sort_order === '1' ? 'high' : 'low']);
          if (stat.display_name?.includes('%') && !CONFIG.PERCENTAGE_STATS.includes(id)) CONFIG.PERCENTAGE_STATS.push(id);
        });
        
        if (categories.length > 0) {
          CONFIG.COLS = categories; // Update global CONFIG
          console.log('Player Contributions: Successfully updated CONFIG.COLS from league settings.');
          return { success: true, leagueData: leagueData, categoriesFound: true };
        }
        console.warn('Player Contributions: No enabled categories found in league settings.');
        return { success: true, leagueData: leagueData, categoriesFound: false }; // Success in fetching, but no cats
      } catch (e) {
        console.error('Player Contributions: Error loading league settings:', e);
        return { success: false, leagueData: null, categoriesFound: false };
      }
    },
    
    fetchAllWeeksPlayerStats: async () => {
      let messageCycleInterval;
      try {
        messageCycleInterval = Utils.showLoading();
        
        Utils.updateLoadingMessage('Fetching league settings...');
        const settingsResult = await DataService.tryGetLeagueSettings();

        if (!settingsResult.success) {
            throw new Error("Failed to fetch initial league settings.");
        }
        // Even if categories weren't found/updated, we might still have leagueData to get currentWeek
        if (!settingsResult.leagueData) {
             throw new Error("League data is missing after settings fetch.");
        }

        STATE.statCategories = CONFIG.COLS; // Ensure STATE uses the (potentially updated) CONFIG.COLS
        
        const leagueData = settingsResult.leagueData;
        const currentWeek = parseInt(leagueData.fantasy_content.league[0]?.current_week || "1", 10);
        STATE.currentWeek = currentWeek;
        
        console.log(`Player Contributions: Fetching player data up to week: ${currentWeek}`);
        
        const weeklyPlayerStatsPromises = [];
        let fetchesCompleted = 0;
        Utils.updateLoadingMessage('Preparing to gather player data...', 0, currentWeek); // Show progress bar at 0%

        for (let week = 1; week <= currentWeek; week++) {
          const promise = fetch(`/api/player_stats_week/${week}`)
            .then(response => {
              if (!response.ok) {
                console.warn(`Could not load player data for week ${week}. Status: ${response.status}`);
                return null; 
              }
              return response.json();
            })
            .then(weekData => ({ week, players: weekData ? DataService.extractPlayers(weekData) : null }))
            .catch(error => {
              console.error(`Error processing week ${week} player data:`, error);
              return { week, players: null, error: true };
            })
            .finally(() => {
              fetchesCompleted++;
              Utils.updateLoadingMessage(`Fetching player data...`, fetchesCompleted, currentWeek);
            });
          weeklyPlayerStatsPromises.push(promise);
        }
        
        const settledResults = await Promise.allSettled(weeklyPlayerStatsPromises);
        const populatedWeeklyStats = {};
        settledResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            const { week, players, error } = result.value;
            populatedWeeklyStats[week] = error ? null : players;
          } else if (result.status === 'rejected') {
            console.error('A weekly player stats promise was rejected:', result.reason);
          }
        });
        
        // This message will be very brief if season data loads fast
        Utils.updateLoadingMessage('Finalizing data...', currentWeek, currentWeek);
        clearInterval(messageCycleInterval); 
        
        return populatedWeeklyStats;

      } catch (error) {
        console.error('Player Contributions: Error in fetchAllWeeksPlayerStats:', error);
        if (messageCycleInterval) clearInterval(messageCycleInterval);
        Utils.hideLoading();
        throw error; // Re-throw to be caught by loadPlayerData
      }
    },
    
    fetchSeasonPlayerStats: async () => {
      try {
        // This is part of the overall loading, so a specific message here is good.
        Utils.updateLoadingMessage('Loading season player data...');
        const response = await fetch(`/api/player_stats_season`);
        if (!response.ok) {
          throw new Error(`API returned ${response.status} for season player stats`);
        }
        const data = await response.json();
        return DataService.extractPlayers(data);
      } catch (error) {
        console.error('Player Contributions: Error fetching season player data:', error);
        return null; // Or re-throw if preferred
      }
    },
    
    extractPlayers: (data) => {
      const players = [];
      try {
        const teamRoster = data.fantasy_content?.team?.[1]?.players;
        if (!teamRoster) return players;
        Object.keys(teamRoster).forEach(key => {
          if (key === 'count') return;
          if (teamRoster[key]?.player) players.push(teamRoster[key].player);
        });
      } catch (error) {
        console.error('Player Contributions: Error extracting players:', error);
      }
      return players;
    },
    
    processPlayerData: (players, statId) => {
      if (!players || players.length === 0) return { labels: [], data: [] };
      const total = Utils.calculateTotal(players, statId);
      if (total === 0) return { labels: [], data: [] };
      
      const playerStats = players.map(player => ({
        name: Utils.getPlayerName(player),
        value: Utils.getStatValue(player, statId),
        percentage: (Utils.getStatValue(player, statId) / total) * 100
      })).filter(p => p.value > 0).sort((a, b) => b.value - a.value);
      
      let chartLabels = [], chartData = [];
      if (playerStats.length > 12) {
        const topPlayers = playerStats.slice(0, 11);
        const othersPercentage = playerStats.slice(11).reduce((sum, p) => sum + p.percentage, 0);
        chartLabels = topPlayers.map(p => p.name);
        chartData = topPlayers.map(p => p.percentage);
        if (othersPercentage > 0) {
          chartLabels.push('Others');
          chartData.push(othersPercentage);
        }
      } else {
        chartLabels = playerStats.map(p => p.name);
        chartData = playerStats.map(p => p.percentage);
      }
      return { labels: chartLabels, data: chartData };
    }
  };

  const ChartRenderer = {
    initStatSelector: () => {
      if (!DOM.statSelector) return;
      DOM.statSelector.innerHTML = '';
      STATE.statCategories.forEach(([id, name]) => {
        const option = document.createElement('option');
        option.value = id; option.textContent = name;
        DOM.statSelector.appendChild(option);
      });
      
      const pointsStat = STATE.statCategories.find(cat => cat[0] === '12'); // PTS ID
      STATE.selectedStat = pointsStat ? pointsStat[0] : (DOM.statSelector.options.length > 0 ? DOM.statSelector.options[0].value : null);
      if (STATE.selectedStat) DOM.statSelector.value = STATE.selectedStat;
      
      DOM.statSelector.addEventListener('change', () => {
        STATE.selectedStat = DOM.statSelector.value;
        ChartRenderer.renderChart();
      });
    },
    initWeekSelector: () => {
      if (!DOM.weekSelector) return;
      DOM.weekSelector.innerHTML = '';
      for (let week = 1; week <= STATE.currentWeek; week++) {
        const option = document.createElement('option');
        option.value = week; option.textContent = `Week ${week}`;
        DOM.weekSelector.appendChild(option);
      }
      DOM.weekSelector.value = STATE.selectedWeek; 
      
      DOM.weekSelector.addEventListener('change', () => {
        STATE.selectedWeek = parseInt(DOM.weekSelector.value, 10);
        ChartRenderer.renderChart();
      });
      
      if (DOM.viewToggle.weeklyBtn && DOM.viewToggle.seasonBtn) {
        DOM.viewToggle.weeklyBtn.classList.add('active');
        DOM.viewToggle.seasonBtn.classList.remove('active');
        if (DOM.weekSelector.parentElement) DOM.weekSelector.parentElement.style.display = 'flex';
      
        DOM.viewToggle.weeklyBtn.addEventListener('click', () => {
          if (STATE.viewMode === 'weekly') return;
          STATE.viewMode = 'weekly';
          DOM.viewToggle.weeklyBtn.classList.add('active');
          DOM.viewToggle.seasonBtn.classList.remove('active');
          if (DOM.weekSelector.parentElement) DOM.weekSelector.parentElement.style.display = 'flex';
          ChartRenderer.renderChart();
        });
        DOM.viewToggle.seasonBtn.addEventListener('click', () => {
          if (STATE.viewMode === 'season') return;
          STATE.viewMode = 'season';
          DOM.viewToggle.seasonBtn.classList.add('active');
          DOM.viewToggle.weeklyBtn.classList.remove('active');
          if (DOM.weekSelector.parentElement) DOM.viewToggle.parentElement.style.display = 'none';
          ChartRenderer.renderChart();
        });
      }
    },
    renderChart: () => {
      const canvas = document.getElementById('contributionsChart');
      if (!canvas) return console.warn('Contributions chart canvas not found');
      const ctx = canvas.getContext('2d');
      if (DOM.chart) DOM.chart.destroy();
      if (!STATE.selectedStat) return console.warn('No stat selected for chart');
      
      const players = STATE.viewMode === 'weekly' ? (STATE.weeklyPlayerStats[STATE.selectedWeek] || []) : (STATE.seasonPlayerStats || []);
      const statInfo = STATE.statCategories.find(cat => cat[0] === STATE.selectedStat);
      const statName = statInfo ? statInfo[1] : 'Stat';
      let chartTitle = `${statName} Contributions ${STATE.viewMode === 'weekly' ? `- Week ${STATE.selectedWeek}` : '- Season Totals'}`;

      const noDataOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'No data for selection', font: { size: 16 }, padding: { top: 10, bottom: 20 }}}};
      
      if (!players.length) {
        DOM.chart = new Chart(ctx, { type: 'pie', data: { labels: ['No Players'], datasets: [{ data: [1], backgroundColor: ['#e0e0e0'] }]}, options: noDataOptions });
        return;
      }
      const { labels, data } = DataService.processPlayerData(players, STATE.selectedStat);
      if (!labels.length) {
        DOM.chart = new Chart(ctx, { type: 'pie', data: { labels: ['No Contributions'], datasets: [{ data: [1], backgroundColor: ['#e0e0e0'] }]}, options: noDataOptions });
        return;
      }
      
      const colors = labels.map((_, i) => CONFIG.PLAYER_COLORS[i % CONFIG.PLAYER_COLORS.length]);
      DOM.chart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{ data: data, backgroundColor: colors, borderColor: colors.map(c => Chart.helpers.color(c).darken(0.1).rgbString()), borderWidth: 1 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: chartTitle, font: { size: 16, weight: 'bold' }, padding: { top: 10, bottom: 20 }},
            tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed.toFixed(1)}%` }},
            legend: { position: 'right', labels: { boxWidth: 15, padding: 10, font: { size: 12 }}}
          }
        }
      });
    }
  };
  
  const initPlayerContributions = async () => {
    if (!DOM.container) return console.error('Player contributions container not found');
    if (STATE.initialized) {
      if (DOM.loadButton?.style.display === 'none' && !STATE.dataLoaded) DOM.loadButton.style.display = 'block';
      return;
    }
    STATE.initialized = true;
    STATE.statCategories = CONFIG.COLS; // Initial set from defaults or dashboard.js
    if (!DOM.loadButton) return console.error('Load contributions button not found');
    DOM.loadButton.addEventListener('click', loadPlayerData);
    
    const trendsTabPane = document.getElementById('tab-trends');
    if (trendsTabPane?.classList.contains('active') && DOM.loadButton?.style.display !== 'none') {
      loadPlayerData();
    }
  };
  
  const loadPlayerData = async () => {
    if (DOM.loadButton) DOM.loadButton.style.display = 'none';
    try {
      STATE.weeklyPlayerStats = await DataService.fetchAllWeeksPlayerStats();
      STATE.seasonPlayerStats = await DataService.fetchSeasonPlayerStats(); // Fetches after weekly
      
      if (Object.keys(STATE.weeklyPlayerStats).length === 0 && !STATE.seasonPlayerStats) {
        throw new Error('No player data could be loaded.');
      }
      
      STATE.dataLoaded = true;
      Utils.hideLoading(); 
      if (DOM.chartContainer) DOM.chartContainer.style.display = 'block';
      
      ChartRenderer.initStatSelector();
      ChartRenderer.initWeekSelector();
      ChartRenderer.renderChart();
      
    } catch (error) {
      console.error('Player Contributions: Error during loadPlayerData:', error);
      Utils.hideLoading();
      if (DOM.loadButton) DOM.loadButton.style.display = 'block';
      const errorMsgElement = DOM.container?.querySelector('.error-message') || document.createElement('div');
      errorMsgElement.textContent = `Error loading player data: ${error.message || 'Please try again.'}`;
      errorMsgElement.className = 'error-message';
      if (!errorMsgElement.parentElement && DOM.container) DOM.container.appendChild(errorMsgElement);
      setTimeout(() => errorMsgElement.remove(), 7000);
    }
  };
  
  window.initPlayerContributions = initPlayerContributions;
  initPlayerContributions();
});