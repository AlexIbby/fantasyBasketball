/* ───── trends.js - Fantasy Basketball Trends Visualization ───── */
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
    PERCENTAGE_STATS: ['5', '8', '11']
  };

  // Try to access the global CONFIG from dashboard.js
  if (window.CONFIG) {
    // If dashboard.js has loaded its CONFIG to the window, use it
    Object.assign(CONFIG, window.CONFIG);
    console.log('Using global CONFIG from dashboard.js');
  } else {
    console.log('Using local CONFIG defaults in trends.js');
  }

  // ============ DOM REFERENCES ============
  const DOM = {
    loadButton: document.getElementById('loadTrendsBtn'),
    container: document.getElementById('trendsContainer'),
    loadingWrapper: document.getElementById('trendsLoadingWrapper'),
    loadingText: document.getElementById('trendsLoadingText'),
    loadingProgressBar: document.getElementById('loadingProgressBar'),
    loadingProgress: document.getElementById('loadingProgress'),
    loadingCurrentWeek: document.getElementById('loadingCurrentWeek'),
    chartContainer: document.getElementById('chartContainer'),
    statSelector: document.getElementById('statSelector'),
    chart: null // Will hold the Chart.js instance
  };

  // ============ STATE ============
  const STATE = {
    currentWeek: 0,
    weeklyStats: [],
    statCategories: [], // Will be populated from CONFIG.COLS
    selectedStat: null,
    loadingMessages: [
      "Initializing trends system...",
      "Getting league settings...",
      "Connecting to Yahoo API...",
      "Analyzing statistics...",
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
    
    // Generate chart colors with proper contrast
    generateChartColors: () => {
      return {
        borderColor: '#4299e1',
        backgroundColor: 'rgba(66, 153, 225, 0.2)',
        pointBackgroundColor: '#4299e1',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#3182ce'
      };
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
    
    // Fetch all weekly data, week by week
    fetchAllWeeklyData: async () => {
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
        
        // Initialize array to hold weekly stats
        const weeklyStats = [];
        
        // Add progress bar to loading UI
        Utils.updateLoadingMessage('Preparing to gather weekly data...', 0, currentWeek);
        
        // Fetch data for each week sequentially
        for (let week = 1; week <= currentWeek; week++) {
          // Update loading message to show which week is being processed
          Utils.updateLoadingMessage(`Loading Week ${week} data...`, week, currentWeek);
          
          try {
            const weekResponse = await fetch(`/api/scoreboard?week=${week}`);
            if (!weekResponse.ok) {
              console.warn(`Could not load data for week ${week}`);
              weeklyStats.push(null); // Add null for weeks we couldn't load
              continue;
            }
            
            const weekData = await weekResponse.json();
            const teams = DataService.extractTeams(weekData);
            
            // Find the user's team (the one where isMine is true)
            const userTeam = teams.find(team => team.isMine);
            if (userTeam) {
              weeklyStats.push({
                week: week,
                stats: userTeam.statMap
              });
            } else {
              console.warn(`Could not find user's team in week ${week}`);
              weeklyStats.push(null);
            }
            
          } catch (weekError) {
            console.error(`Error loading week ${week}:`, weekError);
            weeklyStats.push(null);
          }
        }
        
        // Final loading message
        Utils.updateLoadingMessage('Preparing visualization...', currentWeek, currentWeek);
        
        // Clear the message cycle interval
        clearInterval(messageCycleInterval);
        
        return weeklyStats;
      } catch (error) {
        console.error('Error fetching weekly data:', error);
        Utils.hideLoading();
        return [];
      }
    },
    
    // Extract teams from scoreboard API response (similar to weekly dashboard)
    extractTeams: (data) => {
      const league = (data.fantasy_content.league || []).find(l => l.scoreboard);
      if (!league) return [];
      
      const matchups = (league.scoreboard['0']?.matchups) || league.scoreboard.matchups || {};
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
            if (it?.managers) {
              it.managers.forEach(mw => {
                if (Utils.yes(mw.manager?.is_current_login)) isMine = true;
              });
            }
          });

          const statMap = {};
          (arr[1]?.team_stats?.stats || []).forEach(s => {
            statMap[s.stat.stat_id] = s.stat.value;
          });
          
          teams.push({ name, isMine, statMap });
        });
      });
      
      return teams;
    }
  };

  // ============ CHART RENDERING ============
  const ChartRenderer = {
    // Initialize the stat selector dropdown
    initStatSelector: () => {
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
      const ctx = document.getElementById('trendsChart').getContext('2d');
      
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
  
  // ============ INITIALIZATION ============
  const initTrends = async () => {
    // Check if we have the container
    if (!DOM.container) {
      console.error('Trends container not found');
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
        // Fetch all weekly data
        STATE.weeklyStats = await DataService.fetchAllWeeklyData();
        
        if (STATE.weeklyStats.length === 0) {
          throw new Error('No data loaded');
        }
        
        // Hide loading and show chart container
        Utils.hideLoading();
        DOM.chartContainer.style.display = 'block';
        
        // Initialize stat selector
        ChartRenderer.initStatSelector();
        
        // Render the initial chart
        ChartRenderer.renderChart();
        
      } catch (error) {
        console.error('Error initializing trends:', error);
        Utils.hideLoading();
        
        // Show error and reset button
        DOM.loadButton.style.display = 'block';
        
        // Show error message
        const errorMsg = document.createElement('div');
        errorMsg.textContent = 'Error loading trend data. Please try again.';
        errorMsg.className = 'error-message';
        DOM.container.appendChild(errorMsg);
        
        setTimeout(() => {
          errorMsg.remove();
        }, 5000);
      }
    });
  };
  
  // Initialize when tab is activated
  document.querySelector('[data-target="tab-trends"]')?.addEventListener('click', () => {
    if (!STATE.weeklyStats.length) {
      // Only initialize once when tab is clicked
      initTrends();
    }
  });
});