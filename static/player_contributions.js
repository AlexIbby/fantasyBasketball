/* ───── player_contributions.js - Fantasy Basketball Player Stat Contributions ───── */
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
        '#FFB6C1', // Light Pink
        '#B0E0E6', // Powder Blue
        '#FFEFD5', // Papaya Whip
        '#CCCCFF', // Periwinkle
        '#FFE4B5', // Moccasin
        '#E6FFE0', // Mint Cream
        '#FFD1DC', // Pastel Pink
        '#F0FFF0', // Honeydew
        '#FFDAB9', // Peach Puff
        '#E0FFFF', // Light Cyan
        '#FFE4E1', // Misty Rose
        '#D8BFD8', // Thistle
        '#FFFACD', // Lemon Chiffon
        '#F0E68C'  // Khaki (extra color just in case)
      ]
    };
  
    // Try to access the global CONFIG from dashboard.js
    if (window.CONFIG) {
      // If dashboard.js has loaded its CONFIG to the window, use it
      Object.assign(CONFIG, window.CONFIG);
      console.log('Using global CONFIG from dashboard.js');
    } else {
      console.log('Using local CONFIG defaults in player_contributions.js');
    }
  
    // ============ DOM REFERENCES ============
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
      chart: null // Will hold the Chart.js instance
    };
  
    // ============ STATE ============
    const STATE = {
      currentWeek: 0,
      weeklyPlayerStats: {},
      seasonPlayerStats: null,
      statCategories: [], // Will be populated from CONFIG.COLS
      selectedStat: null, // Currently selected stat ID
      viewMode: 'weekly', // 'weekly' or 'season'
      selectedWeek: 1,    // Currently selected week
      loadingMessages: [
        "Initializing player contributions system...",
        "Getting league settings...",
        "Connecting to Yahoo API...",
        "Analyzing player statistics...",
        "Synchronizing data...",
        "Reading performance metrics...",
        "Preparing visualization...",
        "Almost there!"
      ]
    };
  
    // ============ UTILITIES ============
    const Utils = {
      // Convert boolean-ish values that Yahoo API uses
      yes: v => v === 1 || v === '1',
      
      // Format percentage values for display
      formatStatValue: (id, value) => {
        if (value === null || value === undefined || value === '') return null;
        
        // Parse the value
        const numVal = parseFloat(value);
        if (isNaN(numVal)) return null;
        
        // Handle percentage stats specially
        if (CONFIG.PERCENTAGE_STATS.includes(id)) {
          return numVal.toFixed(3).replace(/^0\./, '.');
        }
        
        return numVal;
      },
      
      // Update loading message and progress
      updateLoadingMessage: (message, weekNum = null, totalWeeks = null) => {
        if (DOM.loadingText) {
          DOM.loadingText.textContent = message;
        }
        
        if (weekNum !== null && totalWeeks !== null && DOM.loadingProgress && DOM.loadingCurrentWeek) {
          const progressPercent = Math.round((weekNum / totalWeeks) * 100);
          DOM.loadingProgress.style.width = `${progressPercent}%`;
          DOM.loadingCurrentWeek.textContent = `Week ${weekNum} of ${totalWeeks}`;
          
          // Show the progress UI elements
          if (DOM.loadingProgressBar) DOM.loadingProgressBar.style.display = 'block';
          if (DOM.loadingCurrentWeek) DOM.loadingCurrentWeek.style.display = 'block';
        }
      },
      
      // Cycle through loading messages
      cycleLoadingMessages: () => {
        let index = 0;
        return setInterval(() => {
          if (!DOM.loadingText) return;
          
          // Don't change if we've started displaying week-specific messages
          if (DOM.loadingText.textContent.includes('Week ')) return;
          
          DOM.loadingText.textContent = STATE.loadingMessages[index];
          index = (index + 1) % STATE.loadingMessages.length;
        }, 2000); // Change message every 2 seconds
      },
      
      // Show loading indicator
      showLoading: () => {
        if (DOM.loadingWrapper) {
          DOM.loadingWrapper.style.display = 'flex';
        }
        
        // Initialize with first message
        if (DOM.loadingText) {
          DOM.loadingText.textContent = STATE.loadingMessages[0];
        }
        
        // Hide progress indicators initially
        if (DOM.loadingProgressBar) DOM.loadingProgressBar.style.display = 'none';
        if (DOM.loadingCurrentWeek) DOM.loadingCurrentWeek.style.display = 'none';
        
        // Start cycling through messages
        return Utils.cycleLoadingMessages();
      },
      
      // Hide loading indicator
      hideLoading: () => {
        if (DOM.loadingWrapper) {
          DOM.loadingWrapper.style.display = 'none';
        }
      },
  
      // Extract player name from the player object
      getPlayerName: (playerObj) => {
        if (!playerObj) return 'Unknown Player';
        
        // Try to extract from the first element which usually contains metadata
        if (Array.isArray(playerObj) && playerObj.length > 0) {
          const metadata = playerObj[0];
          
          // Check various possible structures
          if (Array.isArray(metadata)) {
            for (const item of metadata) {
              if (item && typeof item === 'object' && item.name) {
                return item.name.full || item.name;
              }
            }
          } else if (metadata && typeof metadata === 'object') {
            if (metadata.name) {
              return metadata.name.full || metadata.name;
            }
          }
        }
        
        return 'Unknown Player';
      },
      
      // Extract stat value for a specific stat ID from the player's stats
      getStatValue: (playerObj, statId) => {
        if (!playerObj || !Array.isArray(playerObj)) return 0;
        
        // Player stats are usually in the second element of the player array
        const playerStats = playerObj[1];
        if (!playerStats || !playerStats.player_stats) return 0;
        
        const stats = playerStats.player_stats.stats;
        if (!Array.isArray(stats)) return 0;
        
        // Find the stat with the matching ID
        for (const stat of stats) {
          if (stat.stat && stat.stat.stat_id === statId.toString()) {
            return Utils.formatStatValue(statId, stat.stat.value) || 0;
          }
        }
        
        return 0;
      },
      
      // Calculate the total stat value across all players
      calculateTotal: (players, statId) => {
        let total = 0;
        
        // Handle percentage stats differently
        if (CONFIG.PERCENTAGE_STATS.includes(statId)) {
          // For percentage stats, we need a weighted average
          let weightedSum = 0;
          let totalWeight = 0;
          
          players.forEach(player => {
            // For 3PT%, use 3PTA as weight
            if (statId === '11') {
              const attempts = Utils.getStatValue(player, '9');
              const percentage = Utils.getStatValue(player, statId);
              if (attempts > 0) {
                weightedSum += percentage * attempts;
                totalWeight += attempts;
              }
            }
            // For FG%, use FGA as weight
            else if (statId === '5') {
              const attempts = Utils.getStatValue(player, '3');
              const percentage = Utils.getStatValue(player, statId);
              if (attempts > 0) {
                weightedSum += percentage * attempts;
                totalWeight += attempts;
              }
            }
            // For FT%, use FTA as weight
            else if (statId === '8') {
              const attempts = Utils.getStatValue(player, '6');
              const percentage = Utils.getStatValue(player, statId);
              if (attempts > 0) {
                weightedSum += percentage * attempts;
                totalWeight += attempts;
              }
            }
          });
          
          return totalWeight > 0 ? weightedSum / totalWeight : 0;
        } else {
          // For counting stats, just sum the values
          players.forEach(player => {
            total += Utils.getStatValue(player, statId);
          });
        }
        
        return total;
      }
    };
  
    // ============ DATA HANDLING ============
    const DataService = {
      // Try to fetch and parse the league settings directly
      tryGetLeagueSettings: async () => {
        try {
          const r = await fetch('/api/league_settings');
          if (!r.ok) throw new Error(`API returned ${r.status}`);
          
          const data = await r.json();
          
          // Access the stat_categories directly
          const settings = data.fantasy_content.league[1]?.settings?.[0];
          if (!settings || !settings.stat_categories || !settings.stat_categories.stats) {
            console.warn('No stat_categories found in expected structure');
            return false;
          }
          
          const statCats = settings.stat_categories.stats;
          console.log('Found stat categories:', statCats.length);
          
          const categories = [];
          
          // Process each stat category
          statCats.forEach(catObj => {
            const stat = catObj.stat;
            if (!stat || stat.enabled !== '1') return;
            
            const id = stat.stat_id.toString();
            const meta = CONFIG.STAT_METADATA[id] || {
              name: stat.name,
              display_name: stat.display_name,
              sort_order: stat.sort_order
            };
            
            // Use the abbreviation (display_name from API) instead of the full name
            categories.push([
              id, 
              stat.display_name || stat.abbr || meta.name, 
              meta.sort_order === '1' ? 'high' : 'low'
            ]);
            
            // Update percentage stats if needed
            if (stat.display_name && stat.display_name.includes('%') && !CONFIG.PERCENTAGE_STATS.includes(id)) {
              CONFIG.PERCENTAGE_STATS.push(id);
            }
          });
          
          if (categories.length > 0) {
            console.log('Successfully loaded league categories:', categories);
            CONFIG.COLS = categories;
            return true;
          } else {
            console.warn('No enabled categories found in league settings');
            return false;
          }
        } catch (e) {
          console.error('Error loading league settings:', e);
          return false;
        }
      },
      
      // Fetch player stats for all weeks
      fetchAllWeeksPlayerStats: async () => {
        try {
          // Start the loading message cycle
          const messageCycleInterval = Utils.showLoading();
          
          // First try to load league settings to get the proper categories
          Utils.updateLoadingMessage('Loading league settings...');
          await DataService.tryGetLeagueSettings();
          
          // Ensure state has the latest categories
          STATE.statCategories = CONFIG.COLS;
          
          // Get the current week from the league
          Utils.updateLoadingMessage('Determining current week...');
          const leagueResponse = await fetch('/api/league_settings');
          if (!leagueResponse.ok) throw new Error(`API returned ${leagueResponse.status}`);
          
          const leagueData = await leagueResponse.json();
          const currentWeek = parseInt(leagueData.fantasy_content.league[0]?.current_week || "1", 10);
          STATE.currentWeek = currentWeek;
          
          console.log(`Current week is: ${currentWeek}`);
          
          // Initialize object to hold weekly player stats
          const weeklyPlayerStats = {};
          
          // Add progress bar to loading UI
          Utils.updateLoadingMessage('Preparing to gather player data...', 0, currentWeek);
          
          // Fetch data for each week sequentially
          for (let week = 1; week <= currentWeek; week++) {
            // Update loading message to show which week is being processed
            Utils.updateLoadingMessage(`Loading Week ${week} player data...`, week, currentWeek);
            
            try {
              const weekResponse = await fetch(`/api/player_stats_week/${week}`);
              if (!weekResponse.ok) {
                console.warn(`Could not load player data for week ${week}`);
                weeklyPlayerStats[week] = null;
                continue;
              }
              
              const weekData = await weekResponse.json();
              
              // Extract players from the data
              const players = DataService.extractPlayers(weekData);
              
              weeklyPlayerStats[week] = players;
              
            } catch (weekError) {
              console.error(`Error loading week ${week} player data:`, weekError);
              weeklyPlayerStats[week] = null;
            }
          }
          
          // Final loading message
          Utils.updateLoadingMessage('Preparing player visualization...', currentWeek, currentWeek);
          
          // Clear the message cycle interval
          clearInterval(messageCycleInterval);
          
          return weeklyPlayerStats;
        } catch (error) {
          console.error('Error fetching weekly player data:', error);
          Utils.hideLoading();
          return {};
        }
      },
      
      // Fetch season total player stats
      fetchSeasonPlayerStats: async () => {
        try {
          Utils.updateLoadingMessage('Loading season player data...');
          
          const response = await fetch(`/api/player_stats_season`);
          if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
          }
          
          const data = await response.json();
          
          // Extract players from the data
          const players = DataService.extractPlayers(data);
          
          return players;
        } catch (error) {
          console.error('Error fetching season player data:', error);
          return null;
        }
      },
      
      // Extract players from API response
      extractPlayers: (data) => {
        const players = [];
        
        try {
          const fc = data.fantasy_content;
          if (!fc || !fc.team) return players;
          
          // Navigate to the players array
          const teamRoster = fc.team[1]?.players;
          if (!teamRoster) return players;
          
          // Loop through players
          Object.keys(teamRoster).forEach(key => {
            if (key === 'count') return;
            
            const playerObj = teamRoster[key]?.player;
            if (!playerObj) return;
            
            players.push(playerObj);
          });
          
          return players;
        } catch (error) {
          console.error('Error extracting players:', error);
          return [];
        }
      },
      
      // Process player data for chart visualization
      processPlayerData: (players, statId) => {
        if (!players || players.length === 0) return { labels: [], data: [] };
        
        // Calculate total for the selected stat
        const total = Utils.calculateTotal(players, statId);
        
        // If total is 0, return empty data to avoid division by zero
        if (total === 0) return { labels: [], data: [] };
        
        // Prepare data for chart
        const playerStats = [];
        
        players.forEach(player => {
          const name = Utils.getPlayerName(player);
          const statValue = Utils.getStatValue(player, statId);
          
          // Only include players with non-zero contributions
          if (statValue > 0) {
            playerStats.push({
              name: name,
              value: statValue,
              percentage: (statValue / total) * 100
            });
          }
        });
        
        // Sort by contribution (descending)
        playerStats.sort((a, b) => b.value - a.value);
        
        // Limit to top 12 players and group the rest as "Others"
        let chartData = [];
        let chartLabels = [];
        
        if (playerStats.length > 12) {
          // Take top 11 players
          const topPlayers = playerStats.slice(0, 11);
          
          // Group remaining players as "Others"
          const otherPlayers = playerStats.slice(11);
          let othersValue = 0;
          let othersPercentage = 0;
          
          otherPlayers.forEach(player => {
            othersValue += player.value;
            othersPercentage += player.percentage;
          });
          
          // Add top players to chart data
          topPlayers.forEach(player => {
            chartLabels.push(player.name);
            chartData.push(player.percentage);
          });
          
          // Add "Others" to chart data
          if (othersValue > 0) {
            chartLabels.push('Others');
            chartData.push(othersPercentage);
          }
        } else {
          // All players fit in the chart
          playerStats.forEach(player => {
            chartLabels.push(player.name);
            chartData.push(player.percentage);
          });
        }
        
        return { labels: chartLabels, data: chartData };
      }
    };
  
    // ============ CHART RENDERING ============
    const ChartRenderer = {
      // Initialize the stat selector dropdown
      initStatSelector: () => {
        DOM.statSelector.innerHTML = '';
        
        // Add options for each stat category
        STATE.statCategories.forEach(([id, name, dir]) => {
          // Only show categories that make sense for player contributions
          // Skip percentage stats that are derived (not direct contributions)
          if (CONFIG.PERCENTAGE_STATS.includes(id)) return;
          
          const option = document.createElement('option');
          option.value = id;
          option.textContent = name;
          DOM.statSelector.appendChild(option);
        });
        
        // Set default selection to Points if available, otherwise first stat
        const pointsStatId = STATE.statCategories.find(cat => cat[1] === 'PTS' || cat[1] === 'Points' || cat[0] === '12');
        if (pointsStatId) {
          STATE.selectedStat = pointsStatId[0];
        } else if (STATE.statCategories.length > 0) {
          STATE.selectedStat = STATE.statCategories[0][0];
        }
        
        DOM.statSelector.value = STATE.selectedStat;
        
        // Add change event listener
        DOM.statSelector.addEventListener('change', () => {
          STATE.selectedStat = DOM.statSelector.value;
          ChartRenderer.renderChart();
        });
      },
      
      // Initialize the week selector dropdown
      initWeekSelector: () => {
        DOM.weekSelector.innerHTML = '';
        
        // Add options for each week
        for (let week = 1; week <= STATE.currentWeek; week++) {
          const option = document.createElement('option');
          option.value = week;
          option.textContent = `Week ${week}`;
          DOM.weekSelector.appendChild(option);
        }
        
        // Set default selection to current week
        DOM.weekSelector.value = STATE.selectedWeek;
        
        // Add change event listener
        DOM.weekSelector.addEventListener('change', () => {
          STATE.selectedWeek = parseInt(DOM.weekSelector.value, 10);
          ChartRenderer.renderChart();
        });
        
        // Initialize view toggle buttons
        DOM.viewToggle.weeklyBtn.classList.add('active');
        DOM.viewToggle.seasonBtn.classList.remove('active');
        
        // Add event listeners for view toggle
        DOM.viewToggle.weeklyBtn.addEventListener('click', () => {
          if (STATE.viewMode !== 'weekly') {
            STATE.viewMode = 'weekly';
            DOM.viewToggle.weeklyBtn.classList.add('active');
            DOM.viewToggle.seasonBtn.classList.remove('active');
            // Show week selector when in weekly mode
            DOM.weekSelector.parentElement.style.display = 'flex';
            ChartRenderer.renderChart();
          }
        });
        
        DOM.viewToggle.seasonBtn.addEventListener('click', () => {
          if (STATE.viewMode !== 'season') {
            STATE.viewMode = 'season';
            DOM.viewToggle.seasonBtn.classList.add('active');
            DOM.viewToggle.weeklyBtn.classList.remove('active');
            // Hide week selector when in season mode
            DOM.weekSelector.parentElement.style.display = 'none';
            ChartRenderer.renderChart();
          }
        });
      },
      
      // Render the Chart.js pie chart
      renderChart: () => {
        // Get the canvas element
        const ctx = document.getElementById('contributionsChart').getContext('2d');
        
        // If a chart already exists, destroy it
        if (DOM.chart) {
          DOM.chart.destroy();
        }
        
        if (!STATE.selectedStat) {
          console.warn('No stat selected');
          return;
        }
        
        let players;
        
        // Get player data based on view mode
        if (STATE.viewMode === 'weekly') {
          players = STATE.weeklyPlayerStats[STATE.selectedWeek] || [];
        } else {
          players = STATE.seasonPlayerStats || [];
        }
        
        if (!players || players.length === 0) {
          console.warn('No player data available');
          return;
        }
        
        // Process data for chart
        const { labels, data } = DataService.processPlayerData(players, STATE.selectedStat);
        
        if (labels.length === 0) {
          console.warn('No data to display');
          
          // Show a message on the chart area
          DOM.chart = new Chart(ctx, {
            type: 'pie',
            data: {
              labels: ['No Data'],
              datasets: [{
                data: [1],
                backgroundColor: ['#e0e0e0'],
                borderWidth: 0
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                },
                title: {
                  display: true,
                  text: 'No data available for this selection',
                  font: {
                    size: 16,
                    weight: 'bold'
                  },
                  padding: {
                    top: 10,
                    bottom: 20
                  }
                }
              }
            }
          });
          
          return;
        }
        
        // Find the stat name
        const statInfo = STATE.statCategories.find(cat => cat[0] === STATE.selectedStat);
        const statName = statInfo ? statInfo[1] : 'Stat';
        
        // Generate colors for the chart (use CONFIG.PLAYER_COLORS)
        const colors = [];
        for (let i = 0; i < labels.length; i++) {
          colors.push(CONFIG.PLAYER_COLORS[i % CONFIG.PLAYER_COLORS.length]);
        }
        
        // Create the chart
        DOM.chart = new Chart(ctx, {
          type: 'pie',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: colors,
              borderColor: colors.map(color => Chart.helpers.color(color).darken(0.1).rgbString()),
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: `${statName} Contributions by Player` + (STATE.viewMode === 'weekly' ? ` - Week ${STATE.selectedWeek}` : ' - Season Totals'),
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
                  label: (context) => {
                    const value = context.parsed;
                    return `${context.label}: ${value.toFixed(1)}%`;
                  }
                }
              },
              legend: {
                position: 'right',
                labels: {
                  boxWidth: 15,
                  padding: 10,
                  font: {
                    size: 12
                  }
                }
              }
            }
          }
        });
      }
    };
    
    // ============ INITIALIZATION ============
    const initPlayerContributions = async () => {
      // Check if we have the container
      if (!DOM.container) {
        console.error('Player contributions container not found');
        return;
      }
      
      // Save stat categories from CONFIG
      STATE.statCategories = CONFIG.COLS;
      console.log('Using stat categories:', STATE.statCategories);
      
      // Make sure we have the load button
      if (!DOM.loadButton) {
        console.error('Load button not found');
        return;
      }
      
      // Setup load button click handler
      DOM.loadButton.addEventListener('click', async () => {
        // Hide the button and show loading
        DOM.loadButton.style.display = 'none';
        
        try {
          // Fetch weekly player data
          STATE.weeklyPlayerStats = await DataService.fetchAllWeeksPlayerStats();
          
          // Fetch season player data
          STATE.seasonPlayerStats = await DataService.fetchSeasonPlayerStats();
          
          if (Object.keys(STATE.weeklyPlayerStats).length === 0 && !STATE.seasonPlayerStats) {
            throw new Error('No data loaded');
          }
          
          // Hide loading and show chart container
          Utils.hideLoading();
          DOM.chartContainer.style.display = 'block';
          
          // Initialize selectors
          ChartRenderer.initStatSelector();
          ChartRenderer.initWeekSelector();
          
          // Render the initial chart
          ChartRenderer.renderChart();
          
        } catch (error) {
          console.error('Error initializing player contributions:', error);
          Utils.hideLoading();
          
          // Show error and reset button
          DOM.loadButton.style.display = 'block';
          
          // Show error message
          const errorMsg = document.createElement('div');
          errorMsg.textContent = 'Error loading player data. Please try again.';
          errorMsg.className = 'error-message';
          DOM.container.appendChild(errorMsg);
          
          setTimeout(() => {
            errorMsg.remove();
          }, 5000);
        }
      });
    };
    
    // Initialize when player contributions tab is activated
// Make initPlayerContributions globally available so it can be called from trends.js
window.initPlayerContributions = initPlayerContributions;
  });