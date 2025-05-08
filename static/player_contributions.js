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
      if (!playerObj || !Array.isArray(playerObj)) return 0;
      const playerStats = playerObj[1]?.player_stats?.stats;
      if (!Array.isArray(playerStats)) return 0;
      for (const stat of playerStats) {
        if (stat.stat?.stat_id === statId.toString()) {
          // Use parseFloat for all values, formatStatValue is more for display string
          const rawValue = stat.stat.value;
          if (rawValue === null || rawValue === undefined || rawValue === '') return 0;
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
            weightedSum += made; // sum of made shots
            totalWeight += attempts; // sum of attempted shots
          }
        });
        return totalWeight > 0 ? (weightedSum / totalWeight) : 0;
      }
      // For counting stats, sum them up directly
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
    
    processPlayerData: (players, statId) => {
      if (!players || players.length === 0) return { labels: [], data: [] };
      
      const totalStatValue = Utils.calculateTotal(players, statId);
      if (totalStatValue === 0 && !CONFIG.PERCENTAGE_STATS.includes(statId)) {
          return { labels: [], data: [] };
      }
      // For percentage stats, totalStatValue is the calculated team percentage.
      // We still want to show individual player contributions if they have attempts,
      // even if the team total is 0 (e.g. 0/5 FT makes FT% 0, but player still contributed 5 attempts)

      const playerStats = players.map(player => {
        const value = Utils.getStatValue(player, statId);
        let percentage = 0;
        if (CONFIG.PERCENTAGE_STATS.includes(statId)) {
            // For percentages, "contribution" is more about volume of attempts if we're summing to 100%
            // Or, we show their actual percentage and the pie chart represents something else (e.g. share of attempts)
            // For this implementation, let's assume the pie chart shows share of the *counting* stat component
            // (e.g., for FT%, it's share of FTM if total is FTM, or share of FTA if total is FTA)
            // The current Utils.calculateTotal for percentages returns the team's aggregate percentage.
            // The pie chart needs to sum to 100%. So, each slice should be player_value / sum_of_all_player_values.
            // For counting stats, this is fine: player_stat / team_total_stat
            // For percentages, this interpretation is tricky. What does it mean to contribute X% to team's FT%?
            // A common approach is to show contribution to the *components* of the percentage.
            // E.g. for FG%, players contribute FGM and FGA. The pie could show distribution of FGM.
            // Given the current structure, it uses the statId directly.
            // Let's keep it simple: if it's a counting stat, it's player_value / total.
            // If it's a percentage stat, the 'value' is their individual percentage.
            // The pie chart will then show these individual percentages directly. This means the pie won't sum to 100% of team total necessarily.
            // This might need further clarification, but for now, we'll use the direct value for percentages.
            // To make the pie chart sum to 100% and represent contribution to the category:
            // For counting stats: (player_value / totalStatValue) * 100
            // For percentage stats: this is more complex. If totalStatValue is the team average,
            // then (player_individual_percentage / sum_of_all_player_individual_percentages) * 100 is not meaningful.
            // A better approach for percentages in a pie chart is to show distribution of a *related counting stat*.
            // E.g. for 3PT%, show distribution of 3PTM.
            // However, the current code uses `statId` for both getting value and total.

            // Sticking to player_value / total for now, knowing it's imperfect for percentages in a pie.
            // The current Utils.calculateTotal for percentages gives an *average*, not a sum.
            // So, for percentages, we'll calculate contribution based on attempts, similar to how the total is weighted.
            
            let contributionValue = 0;
            if (CONFIG.PERCENTAGE_STATS.includes(statId)) {
                 let attemptsKey;
                 if (statId === '11') attemptsKey = '9';      // 3PTA for 3PT%
                 else if (statId === '5') attemptsKey = '3'; // FGA for FG%
                 else if (statId === '8') attemptsKey = '6'; // FTA for FT%
                 contributionValue = Utils.getStatValue(player, attemptsKey); // Use attempts as the basis for contribution weight
            } else {
                contributionValue = value;
            }
            // Calculate overall total attempts for percentage stats if that's the denominator
            let denominatorTotal = totalStatValue;
            if (CONFIG.PERCENTAGE_STATS.includes(statId)) {
                denominatorTotal = players.reduce((sum, p) => {
                    let attemptsKey;
                    if (statId === '11') attemptsKey = '9';
                    else if (statId === '5') attemptsKey = '3';
                    else if (statId === '8') attemptsKey = '6';
                    else return sum;
                    return sum + Utils.getStatValue(p, attemptsKey);
                }, 0);
            }
            percentage = denominatorTotal > 0 ? (contributionValue / denominatorTotal) * 100 : 0;

        } else if (totalStatValue > 0) {
            percentage = (value / totalStatValue) * 100;
        }
        
        return {
          name: Utils.getPlayerName(player),
          value: value, // Store raw value for display or sorting if needed
          percentage: percentage
        };
      }).filter(p => p.percentage > 0 || (CONFIG.PERCENTAGE_STATS.includes(statId) && p.value !== null) ) // For percentages, show if they have a value even if percentage contribution (via attempts) is 0.
        .sort((a, b) => b.percentage - a.percentage); // Sort by percentage contribution
      
      let chartLabels = [], chartData = [];
      if (playerStats.length > 12) {
        const topPlayers = playerStats.slice(0, 11);
        const othersPercentage = playerStats.slice(11).reduce((sum, p) => sum + p.percentage, 0);
        chartLabels = topPlayers.map(p => p.name);
        chartData = topPlayers.map(p => p.percentage);
        if (othersPercentage > 0.01) { // Only add "Others" if it's significant
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
      // Set default selected week, ensure it's valid if currentWeek is 0 initially
      STATE.selectedWeek = Math.min(STATE.selectedWeek, STATE.currentWeek > 0 ? STATE.currentWeek : 1);
      STATE.selectedWeek = Math.max(1, STATE.selectedWeek);
      DOM.weekSelector.value = STATE.selectedWeek; 
      
      DOM.weekSelector.addEventListener('change', () => {
        STATE.selectedWeek = parseInt(DOM.weekSelector.value, 10);
        ChartRenderer.renderChart();
      });
      
      if (DOM.viewToggle.weeklyBtn && DOM.viewToggle.seasonBtn) {
        // Initial state based on STATE.viewMode
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
        DOM.chart = new Chart(ctx, { type: 'pie', data: { labels: ['No Players'], datasets: [{ data: [1], backgroundColor: ['#e0e0e0'] }]}, options: noDataOptions });
        return;
      }
      const { labels, data } = DataService.processPlayerData(players, STATE.selectedStat);
      
      if (!labels.length || data.every(d => d === 0)) { // Check if all data points are zero
        DOM.chart = new Chart(ctx, { type: 'pie', data: { labels: ['No Contributions'], datasets: [{ data: [1], backgroundColor: ['#e0e0e0'] }]}, options: noDataOptions });
        return;
      }
      
      const colors = labels.map((_, i) => CONFIG.PLAYER_COLORS[i % CONFIG.PLAYER_COLORS.length]);
      DOM.chart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{ 
            data: data, 
            backgroundColor: colors, 
            borderColor: colors.map(c => {
                // Chart.js v4+ uses `Chart.helpers.color(c).darken(0.1).rgbString()`
                // For v3 or if Chart.helpers is not available as expected:
                try {
                    return Chart.helpers.color(c).darken(0.1).rgbString();
                } catch (e) { // Fallback for older Chart.js or if helpers structure changed
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
    STATE.statCategories = CONFIG.COLS; 
    if (!DOM.loadButton) return console.error('Load contributions button not found');
    DOM.loadButton.addEventListener('click', loadPlayerData);
    
    const trendsTabPane = document.getElementById('tab-trends');
    if (trendsTabPane?.classList.contains('active') && DOM.loadButton?.style.display !== 'none') {
      // If the tab is already active (e.g. page load directly to it or after refresh)
      // and data hasn't been loaded (button is visible), then load data.
      // This logic is mainly from trends.js to auto-load.
      // If we want to ensure player contributions also auto-loads if its tab is active:
      const playerContribTabBtn = document.querySelector('[data-target="tab-trends"]'); // Assuming it's on trends tab
      if (playerContribTabBtn?.classList.contains('active')) {
          loadPlayerData();
      }
    }
  };
  
  const loadPlayerData = async () => {
    if (DOM.loadButton) DOM.loadButton.style.display = 'none';
    let loadingInterval;
    try {
      loadingInterval = Utils.showLoading(); // Start cycling messages
      STATE.weeklyPlayerStats = await DataService.fetchAllWeeksPlayerStats();
      // fetchSeasonPlayerStats will show its own message briefly if fetchAllWeeksPlayerStats was quick
      STATE.seasonPlayerStats = await DataService.fetchSeasonPlayerStats(); 
      
      if (Object.keys(STATE.weeklyPlayerStats).length === 0 && !STATE.seasonPlayerStats) {
        throw new Error('No player data could be loaded.');
      }
      
      STATE.dataLoaded = true;
      clearInterval(loadingInterval); // Stop cycling generic messages
      Utils.hideLoading(); 
      if (DOM.chartContainer) DOM.chartContainer.style.display = 'block';
      
      ChartRenderer.initStatSelector(); // Depends on STATE.statCategories, potentially updated by fetchAllWeeks
      ChartRenderer.initWeekSelector(); // Depends on STATE.currentWeek, updated by fetchAllWeeks
      ChartRenderer.renderChart();
      
    } catch (error) {
      console.error('Player Contributions: Error during loadPlayerData:', error);
      if (loadingInterval) clearInterval(loadingInterval);
      Utils.hideLoading();
      if (DOM.loadButton) DOM.loadButton.style.display = 'block';
      const errorMsgElement = DOM.container?.querySelector('.error-message') || document.createElement('div');
      errorMsgElement.textContent = `Error loading player data: ${error.message || 'Please try again.'}`;
      errorMsgElement.className = 'error-message'; // Ensure it has class for styling
      if (!errorMsgElement.parentElement && DOM.container && DOM.loadButton) {
        // Insert error message before the load button if it exists
         DOM.loadButton.parentElement.insertBefore(errorMsgElement, DOM.loadButton);
      } else if (!errorMsgElement.parentElement && DOM.container) {
         DOM.container.appendChild(errorMsgElement);
      }
      setTimeout(() => errorMsgElement.remove(), 7000);
    }
  };
  
  // Expose init function to be called from trends.js or if tab is directly activated
  window.initPlayerContributions = initPlayerContributions; 

  // Initialize if this script is loaded standalone or if its tab is active early
  // Check if the parent tab 'tab-trends' is active to decide if to auto-init/load.
  // This is usually handled by the main dashboard.js tab click logic,
  // but trends.js also has a specific call to window.initPlayerContributions.
  const trendsTabButton = document.querySelector('[data-target="tab-trends"]');
  if (trendsTabButton && trendsTabButton.classList.contains('active')) {
      initPlayerContributions(); // Initialize event listeners
      // If the button is still visible, means data hasn't been loaded yet.
      if (DOM.loadButton && DOM.loadButton.style.display !== 'none') {
          // loadPlayerData(); // Auto-load if tab is active and button visible
          // Deferred to trends.js which calls loadPlayerData via button click or directly
      }
  } else {
      initPlayerContributions(); // Still initialize for event listeners even if tab not active
  }

});