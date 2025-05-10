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
    viewMode: 'weekly', // Default view mode
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
      if (!playerObj || !Array.isArray(playerObj)) return 0; // Return 0 for consistency, will be parsed to float
      const playerStats = playerObj[1]?.player_stats?.stats;
      if (!Array.isArray(playerStats)) return 0;
      for (const stat of playerStats) {
        if (stat.stat?.stat_id === statId.toString()) {
          const rawValue = stat.stat.value;
          if (rawValue === null || rawValue === undefined || rawValue === '' || rawValue === '-') return 0; // Treat '-' as 0 for calculations
          const numVal = parseFloat(rawValue);
          return isNaN(numVal) ? 0 : numVal;
        }
      }
      return 0;
    },
    calculateTotal: (players, statId) => {
      if (CONFIG.PERCENTAGE_STATS.includes(statId)) {
        let weightedSum = 0, totalWeight = 0;
        players.forEach(player => {
          let attemptsKey, madeKey;
          if (statId === '11') { attemptsKey = '9'; madeKey = '10'; } // 3PTA for 3PT%, 3PTM
          else if (statId === '5') { attemptsKey = '3'; madeKey = '4'; } // FGA for FG%, FGM
          else if (statId === '8') { attemptsKey = '6'; madeKey = '7'; } // FTA for FT%, FTM
          else return;

          const attempts = Utils.getStatValue(player, attemptsKey);
          const made = Utils.getStatValue(player, madeKey);

          if (typeof attempts === 'number' && attempts > 0 && typeof made === 'number') {
            weightedSum += made; 
            totalWeight += attempts;
          }
        });
        return totalWeight > 0 ? (weightedSum / totalWeight) : 0;
      }
      return players.reduce((sum, p) => sum + Utils.getStatValue(p, statId), 0);
    }
  };

  const DataService = {
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
          CONFIG.COLS = categories; 
          console.log('Player Contributions: Successfully updated CONFIG.COLS from league settings.');
          return { success: true, leagueData: leagueData, categoriesFound: true };
        }
        console.warn('Player Contributions: No enabled categories found in league settings.');
        return { success: true, leagueData: leagueData, categoriesFound: false };
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
        if (!settingsResult.leagueData) {
             throw new Error("League data is missing after settings fetch.");
        }

        STATE.statCategories = CONFIG.COLS; 
        
        const leagueData = settingsResult.leagueData;
        const currentWeek = parseInt(leagueData.fantasy_content.league[0]?.current_week || "1", 10);
        STATE.currentWeek = currentWeek;
        
        console.log(`Player Contributions: Fetching player data up to week: ${currentWeek}`);
        
        const weeklyPlayerStatsPromises = [];
        let fetchesCompleted = 0;
        Utils.updateLoadingMessage('Preparing to gather player data...', 0, currentWeek);

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
        
        Utils.updateLoadingMessage('Finalizing data...', currentWeek, currentWeek);
        clearInterval(messageCycleInterval); 
        
        return populatedWeeklyStats;

      } catch (error) {
        console.error('Player Contributions: Error in fetchAllWeeksPlayerStats:', error);
        if (messageCycleInterval) clearInterval(messageCycleInterval);
        Utils.hideLoading();
        throw error;
      }
    },
    
    fetchSeasonPlayerStats: async () => {
      try {
        Utils.updateLoadingMessage('Loading season player data...');
        const response = await fetch(`/api/player_stats_season`);
        if (!response.ok) {
          throw new Error(`API returned ${response.status} for season player stats`);
        }
        const data = await response.json();
        return DataService.extractPlayers(data);
      } catch (error) {
        console.error('Player Contributions: Error fetching season player data:', error);
        return null;
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
    
    processPlayerData: (players, statId) => { // `players` are full API player objects
      if (!players || players.length === 0) return { labels: [], data: [], rawValues: [] };
      
      const overallTeamStatTotal = Utils.calculateTotal(players, statId);
      if (overallTeamStatTotal === 0 && !CONFIG.PERCENTAGE_STATS.includes(statId)) {
          return { labels: [], data: [], rawValues: [] };
      }

      const playerStats = players.map(player => {
        const rawPlayerStatValue = Utils.getStatValue(player, statId);
        let contributionPercentage = 0;
        
        if (CONFIG.PERCENTAGE_STATS.includes(statId)) {
            let attemptsKey;
            if (statId === '11') { attemptsKey = '9'; } // 3PTA for 3PT%
            else if (statId === '5') { attemptsKey = '3'; } // FGA for FG%
            else if (statId === '8') { attemptsKey = '6'; } // FTA for FT%
            
            const playerAttempts = attemptsKey ? Utils.getStatValue(player, attemptsKey) : 0;
            
            let totalAttemptsDenominator = 0;
            if (attemptsKey) {
                 totalAttemptsDenominator = players.reduce((sum, p_inner) => {
                    return sum + Utils.getStatValue(p_inner, attemptsKey);
                }, 0);
            }
            contributionPercentage = totalAttemptsDenominator > 0 ? (playerAttempts / totalAttemptsDenominator) * 100 : 0;
        } else if (overallTeamStatTotal > 0) { // Counting stat
            contributionPercentage = (rawPlayerStatValue / overallTeamStatTotal) * 100;
        }
        
        return {
          name: Utils.getPlayerName(player),
          value: rawPlayerStatValue, // Actual stat value for the player (for tooltip)
          percentage: contributionPercentage // Contribution percentage (for pie slice)
        };
      }).filter(p => p.percentage > 0 || (CONFIG.PERCENTAGE_STATS.includes(statId) && p.value !== null) ) 
        .sort((a, b) => b.percentage - a.percentage); 
      
      let chartLabels = [];
      let chartData = []; 
      let chartRawValues = [];

      if (playerStats.length > 12) {
        const topPlayersStats = playerStats.slice(0, 11);
        const otherPlayersProcessedStats = playerStats.slice(11); 

        chartLabels = topPlayersStats.map(p => p.name);
        chartData = topPlayersStats.map(p => p.percentage);
        chartRawValues = topPlayersStats.map(p => p.value);

        if (otherPlayersProcessedStats.length > 0) {
          const othersPercentageSum = otherPlayersProcessedStats.reduce((sum, p) => sum + p.percentage, 0);
          if (othersPercentageSum > 0.01) { 
            chartLabels.push('Others');
            chartData.push(othersPercentageSum);

            let othersAggregatedRawValue;
            const originalApiObjectsForOthers = players.filter(api_p => {
                const playerName = Utils.getPlayerName(api_p);
                return otherPlayersProcessedStats.some(op_stat => op_stat.name === playerName);
            });

            if (originalApiObjectsForOthers.length > 0) {
                if (CONFIG.PERCENTAGE_STATS.includes(statId)) {
                    othersAggregatedRawValue = Utils.calculateTotal(originalApiObjectsForOthers, statId);
                } else { 
                    othersAggregatedRawValue = otherPlayersProcessedStats.reduce((sum, p) => sum + (p.value || 0), 0);
                }
            } else {
                othersAggregatedRawValue = null; 
            }
            chartRawValues.push(othersAggregatedRawValue);
          }
        }
      } else { 
        chartLabels = playerStats.map(p => p.name);
        chartData = playerStats.map(p => p.percentage);
        chartRawValues = playerStats.map(p => p.value);
      }
      return { labels: chartLabels, data: chartData, rawValues: chartRawValues };
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
      
      const pointsStat = STATE.statCategories.find(cat => cat[0] === '12'); 
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
      STATE.selectedWeek = Math.min(STATE.selectedWeek, STATE.currentWeek > 0 ? STATE.currentWeek : 1);
      STATE.selectedWeek = Math.max(1, STATE.selectedWeek);
      DOM.weekSelector.value = STATE.selectedWeek; 
      
      DOM.weekSelector.addEventListener('change', () => {
        STATE.selectedWeek = parseInt(DOM.weekSelector.value, 10);
        ChartRenderer.renderChart();
      });
      
      if (DOM.viewToggle.weeklyBtn && DOM.viewToggle.seasonBtn) {
        if (STATE.viewMode === 'weekly') {
            DOM.viewToggle.weeklyBtn.classList.add('active');
            DOM.viewToggle.seasonBtn.classList.remove('active');
            if (DOM.weekSelector.parentElement) DOM.weekSelector.parentElement.style.display = 'flex';
        } else {
            DOM.viewToggle.seasonBtn.classList.add('active');
            DOM.viewToggle.weeklyBtn.classList.remove('active');
            if (DOM.weekSelector.parentElement) DOM.weekSelector.parentElement.style.display = 'none';
        }
      
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
          if (DOM.weekSelector.parentElement) DOM.weekSelector.parentElement.style.display = 'none';
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
      
      const players = STATE.viewMode === 'weekly' 
                      ? (STATE.weeklyPlayerStats[STATE.selectedWeek] || []) 
                      : (STATE.seasonPlayerStats || []);
                      
      const statInfo = STATE.statCategories.find(cat => cat[0] === STATE.selectedStat);
      const statName = statInfo ? statInfo[1] : 'Stat';
      let chartTitle = `${statName} Contributions ${STATE.viewMode === 'weekly' ? `- Week ${STATE.selectedWeek}` : '- Season Totals'}`;

      const noDataOptions = { 
        responsive: true, 
        maintainAspectRatio: false, 
        plugins: { 
          legend: { display: false }, 
          title: { display: true, text: chartTitle + '\n(No data for selection)', font: { size: 16 }, padding: { top: 10, bottom: 20 }}
        }
      };
      
      if (!players || players.length === 0) {
        DOM.chart = new Chart(ctx, { type: 'pie', data: { labels: ['No Players'], datasets: [{ data: [1], rawValues: [null], backgroundColor: ['#e0e0e0'] }]}, options: noDataOptions });
        return;
      }
      const { labels, data, rawValues } = DataService.processPlayerData(players, STATE.selectedStat);
      
      if (!labels.length || data.every(d => d === 0)) { 
        DOM.chart = new Chart(ctx, { type: 'pie', data: { labels: ['No Contributions'], datasets: [{ data: [1], rawValues: [null], backgroundColor: ['#e0e0e0'] }]}, options: noDataOptions });
        return;
      }
      
      const colors = labels.map((_, i) => CONFIG.PLAYER_COLORS[i % CONFIG.PLAYER_COLORS.length]);
      DOM.chart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{ 
            data: data,
            rawValues: rawValues, // Store rawValues here
            backgroundColor: colors, 
            borderColor: colors.map(c => {
                try {
                    return Chart.helpers.color(c).darken(0.1).rgbString();
                } catch (e) { 
                    let r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
                    r = Math.max(0, r - 25); g = Math.max(0, g - 25); b = Math.max(0, b - 25);
                    return `rgb(${r},${g},${b})`;
                }
            }), 
            borderWidth: 1 
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: chartTitle, font: { size: 16, weight: 'bold' }, padding: { top: 10, bottom: 20 }},
            tooltip: { 
              callbacks: { 
                label: function(context) {
                  const label = context.label || ''; // Player name or 'Others'
                  const percentageContribution = context.parsed; // Value from `data` array (percentage)
                  
                  let lines = [];
                  lines.push(`${label}: ${percentageContribution.toFixed(1)}%`);

                  if (context.dataset.rawValues && context.dataset.rawValues[context.dataIndex] !== undefined) {
                    const rawPlayerStat = context.dataset.rawValues[context.dataIndex];
                    let formattedRawValue = Utils.formatStatValue(STATE.selectedStat, rawPlayerStat);

                    if (formattedRawValue === null || formattedRawValue === undefined) {
                      formattedRawValue = "N/A";
                    } else {
                      if (!CONFIG.PERCENTAGE_STATS.includes(STATE.selectedStat)) {
                        const currentStatInfo = STATE.statCategories.find(cat => cat[0] === STATE.selectedStat);
                        const statDisplayName = currentStatInfo ? currentStatInfo[1] : ''; 
                        formattedRawValue = `${formattedRawValue} ${statDisplayName}`;
                      }
                    }
                    lines.push(`Stat Value: ${formattedRawValue}`);
                  }
                  return lines;
                }
              }
            },
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
    STATE.statCategories = CONFIG.COLS; 
    if (!DOM.loadButton) return console.error('Load contributions button not found');
    DOM.loadButton.addEventListener('click', loadPlayerData);
    
    const trendsTabPane = document.getElementById('tab-trends');
    if (trendsTabPane?.classList.contains('active') && DOM.loadButton?.style.display !== 'none') {
      const playerContribTabBtn = document.querySelector('[data-target="tab-trends"]'); 
      if (playerContribTabBtn?.classList.contains('active')) {
          // loadPlayerData(); // Auto-load is handled by trends.js calling button.click()
      }
    }
  };
  
  const loadPlayerData = async () => {
    if (DOM.loadButton) DOM.loadButton.style.display = 'none';
    let loadingInterval;
    try {
      loadingInterval = Utils.showLoading(); 
      STATE.weeklyPlayerStats = await DataService.fetchAllWeeksPlayerStats();
      STATE.seasonPlayerStats = await DataService.fetchSeasonPlayerStats(); 
      
      if (Object.keys(STATE.weeklyPlayerStats).length === 0 && !STATE.seasonPlayerStats) {
        throw new Error('No player data could be loaded.');
      }
      
      STATE.dataLoaded = true;
      clearInterval(loadingInterval); 
      Utils.hideLoading(); 
      if (DOM.chartContainer) DOM.chartContainer.style.display = 'block';
      
      ChartRenderer.initStatSelector(); 
      ChartRenderer.initWeekSelector(); 
      ChartRenderer.renderChart();
      
    } catch (error) {
      console.error('Player Contributions: Error during loadPlayerData:', error);
      if (loadingInterval) clearInterval(loadingInterval);
      Utils.hideLoading();
      if (DOM.loadButton) DOM.loadButton.style.display = 'block';
      const errorMsgElement = DOM.container?.querySelector('.error-message') || document.createElement('div');
      errorMsgElement.textContent = `Error loading player data: ${error.message || 'Please try again.'}`;
      errorMsgElement.className = 'error-message'; 
      if (!errorMsgElement.parentElement && DOM.container && DOM.loadButton) {
         DOM.loadButton.parentElement.insertBefore(errorMsgElement, DOM.loadButton);
      } else if (!errorMsgElement.parentElement && DOM.container) {
         DOM.container.appendChild(errorMsgElement);
      }
      setTimeout(() => errorMsgElement.remove(), 7000);
    }
  };
  
  window.initPlayerContributions = initPlayerContributions; 

  const trendsTabButton = document.querySelector('[data-target="tab-trends"]');
  if (trendsTabButton && trendsTabButton.classList.contains('active')) {
      initPlayerContributions(); 
  } else {
      initPlayerContributions(); 
  }

});