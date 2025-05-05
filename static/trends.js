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
      chartContainer: document.getElementById('chartContainer'),
      statSelector: document.getElementById('statSelector'),
      chart: null // Will hold the Chart.js instance
    };
  
    // ============ STATE ============
    const STATE = {
      currentWeek: 0,
      weeklyStats: [],
      statCategories: [], // Will be populated from CONFIG.COLS
      selectedStat: null
    };
  
    // ============ UTILITIES ============
    const Utils = {
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
      
      // Show loading indicator
      showLoading: () => {
        if (DOM.loadingWrapper) {
          DOM.loadingWrapper.style.display = 'flex';
        }
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
      // Fetch all weekly data, week by week
      fetchAllWeeklyData: async () => {
        try {
          // First get the current week from the league
          const leagueResponse = await fetch('/api/league_settings');
          if (!leagueResponse.ok) throw new Error(`API returned ${leagueResponse.status}`);
          
          const leagueData = await leagueResponse.json();
          const currentWeek = parseInt(leagueData.fantasy_content.league[0]?.current_week || "1", 10);
          STATE.currentWeek = currentWeek;
          
          console.log(`Current week is: ${currentWeek}`);
          
          // Initialize array to hold weekly stats
          const weeklyStats = [];
          
          // Fetch data for each week sequentially
          for (let week = 1; week <= currentWeek; week++) {
            Utils.showLoading();
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
          }
          
          Utils.hideLoading();
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
              if (it?.is_owned_by_current_login === 1 || it?.is_current_login === 1) isMine = true;
              if (it?.managers) {
                it.managers.forEach(mw => {
                  if (mw.manager?.is_current_login === "1") isMine = true;
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
                  precision: CONFIG.PERCENTAGE_STATS.includes(STATE.selectedStat) ? 3 : 0
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
        Utils.showLoading();
        
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