/* ───── Refactored dashboard.js with Team Selection ───── */
document.addEventListener('DOMContentLoaded', () => {
  // ============ CONFIG ============
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

  // Make CONFIG globally available for other scripts
  window.CONFIG = CONFIG;
  
  // ============ DOM REFERENCES ============
  const DOM = {
    // Weekly view elements
    weekly: {
      weekSel: document.getElementById('weekSel'),
      teamSel: document.getElementById('weeklyTeamSel'),
      scoreTable: document.getElementById('scoreTable'),
      cardsContainer: document.getElementById('cardsContainer'),
      cardsViewBtn: document.getElementById('cardsView'),
      tableViewBtn: document.getElementById('tableView'),
      tableWrapper: document.querySelector('#tab-cat .table-container'),
      showRanksChk: document.querySelector('#tab-cat .checkbox-container input[type="checkbox"]'),
      analysisSummary: document.getElementById('weeklyAnalysisSummary')
    },
    // Compare view elements
    compare: {
      teamSel: document.getElementById('compareTeamSel'),
      compareTable: document.getElementById('compareTable'),
      cardsContainer: document.getElementById('compareCardsContainer'),
      cardsViewBtn: document.getElementById('compareCardsView'),
      tableViewBtn: document.getElementById('compareTableView'),
      tableWrapper: document.querySelector('#tab-compare .table-container'),
      viewSel: document.getElementById('viewSel'),
      showRanksChk: document.querySelector('#tab-compare .checkbox-container input[type="checkbox"]'),
      analysisSummary: document.getElementById('seasonAnalysisSummary')
    }
  };

  // ============ STATE ============
  const STATE = {
    weekly: {
      loadedTeams: [],
      selectedTeamIndex: 0,
      userTeamIndex: 0
    },
    compare: {
      seasonPayload: null,
      seasonMode: 'tot',
      selectedTeamIndex: 0,
      userTeamIndex: 0
    }
  };

  // ============ UTILITIES ============
  const Utils = {
    // Convert boolean-ish values that Yahoo API uses
    yes: v => v === 1 || v === '1',
    
    // Format number as ordinal (1st, 2nd, 3rd, etc.)
    ordinal: n => {
      const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },
    
    // Compute ranks for teams based on their stats
    computeRanks: teams => {
      const ranks = Array.from({ length: teams.length }, () => ({}));
      
      CONFIG.COLS.forEach(([id, , dir]) => {
        const vals = teams.map((t, i) => ({ num: parseFloat(t.statMap[id]), i }));
        vals.sort((a, b) => {
          if (isNaN(a.num)) return 1;
          if (isNaN(b.num)) return -1;
          return dir === 'high' ? b.num - a.num : a.num - b.num;
        });
        
        let curr = 0, prev = null;
        vals.forEach(({ num, i }, idx) => {
          if (isNaN(num)) { 
            ranks[i][id] = '-'; 
            return;
          }
          if (prev === null || num !== prev) { 
            curr = idx + 1; 
            prev = num; 
          }
          ranks[i][id] = curr;
        });
      });
      
      return ranks;
    },
    
    // Calculate win-loss record between two teams
    recordVsUser: (baseTeam, oppTeam) => {
      let w = 0, l = 0;
      CONFIG.COLS.forEach(([id, , dir]) => {
        const u = parseFloat(baseTeam[id]);
        const o = parseFloat(oppTeam[id]);
        if (isNaN(u) || isNaN(o) || u === o) return;
        (dir === 'high' ? u > o : u < o) ? w++ : l++;
      });
      return `${w} - ${l}`;
    },
    
    // Switch between table and card views
    switchView: (mode, elements) => {
      const { cardsViewBtn, tableViewBtn, cardsContainer, tableWrapper } = elements;
      
      if (mode === 'cards') {
        cardsViewBtn.classList.add('active');
        tableViewBtn.classList.remove('active');
        cardsContainer.style.display = 'flex';
        tableWrapper.style.display = 'none';
      } else {
        tableViewBtn.classList.add('active');
        cardsViewBtn.classList.remove('active');
        cardsContainer.style.display = 'none';
        tableWrapper.style.display = 'block';
      }
    },
    
    // Responsive view based on window width
    initResponsiveView: () => {
      let currentBreakpointIsMobile = window.innerWidth <= 768;

      const setInitialViews = () => {
        Utils.switchView(currentBreakpointIsMobile ? 'cards' : 'table', DOM.weekly);
        Utils.switchView(currentBreakpointIsMobile ? 'cards' : 'table', DOM.compare);
      };
      
      const handleResize = () => {
        const newBreakpointIsMobile = window.innerWidth <= 768;
        if (newBreakpointIsMobile !== currentBreakpointIsMobile) {
          Utils.switchView(newBreakpointIsMobile ? 'cards' : 'table', DOM.weekly);
          Utils.switchView(newBreakpointIsMobile ? 'cards' : 'table', DOM.compare);
          currentBreakpointIsMobile = newBreakpointIsMobile;
        }
      };
      
      setInitialViews();
      window.addEventListener('resize', handleResize);
    },
    
    // Format stat value based on type
    formatStatValue: (id, value) => {
      if (value === null || value === undefined || value === '') return '–';
      
      if (CONFIG.PERCENTAGE_STATS.includes(id)) {
        const num = parseFloat(value);
        if (isNaN(num)) return value;
        return num.toFixed(3).replace(/^0\./, '.');
      }
      
      return value;
    },

    // Generate category strength analysis
    generateCategoryAnalysis: (teams, ranks, selectedTeamIndex = 0) => {
      if (!teams.length || !ranks.length || selectedTeamIndex >= teams.length) return null;

      const totalTeams = teams.length;
      const weakCategories = [];
      const strongCategories = [];
      const myRanks = ranks[selectedTeamIndex];

      CONFIG.COLS.forEach(([id, name, sortDir]) => {
        const rank = myRanks[id];
        if (rank && rank !== '-' && typeof rank === 'number') {
          const weakThreshold = Math.ceil(totalTeams * 0.7);
          const strongThreshold = Math.ceil(totalTeams * 0.3);
          
          if (rank >= weakThreshold) {
            weakCategories.push({ name, rank, id });
          } else if (rank <= strongThreshold) {
            strongCategories.push({ name, rank, id });
          }
        }
      });

      weakCategories.sort((a, b) => b.rank - a.rank);
      strongCategories.sort((a, b) => a.rank - b.rank);

      return {
        weakCategories,
        strongCategories,
        totalTeams,
        teamName: teams[selectedTeamIndex].name
      };
    },

    // Format category analysis as HTML
    formatAnalysisSummary: (analysis, mode = 'weekly') => {
      if (!analysis) return '';

      const { weakCategories, strongCategories, teamName } = analysis;
      let summary = `<div class="analysis-content">`;

      // Add team name indicator
      summary += `<div class="analysis-team-name">Analysis for: <strong>${teamName}</strong></div>`;

      if (strongCategories.length > 0) {
        const strongList = strongCategories.slice(0, 3).map(cat => 
          `<strong>${cat.name}</strong> (${Utils.ordinal(cat.rank)})`
        ).join(', ');
        summary += `<div class="strength-summary">
          <span class="highlight positive">Strongest categories:</span> ${strongList}
        </div>`;
      }

      if (weakCategories.length > 0) {
        const weakList = weakCategories.slice(0, 3).map(cat => 
          `<strong>${cat.name}</strong> (${Utils.ordinal(cat.rank)})`
        ).join(', ');
        summary += `<div class="weakness-summary">
          <span class="highlight negative">Areas to improve:</span> ${weakList}
        </div>`;
      }

      summary += `</div>`;
      return summary;
    },

    // Populate team selector dropdown
    populateTeamSelector: (teams, selectElement, selectedIndex = 0, userTeamIndex = 0) => {
      selectElement.innerHTML = '';
      teams.forEach((team, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = team.isMine ? `${team.name} (Your Team)` : team.name;
        if (index === selectedIndex) option.selected = true;
        selectElement.appendChild(option);
      });
    }
  };
  
  // ============ DATA HANDLING ============
  const DataService = {
    // Try to fetch and parse the league settings
    tryGetLeagueSettings: async () => {
      try {
        const r = await fetch('/api/league_settings');
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        
        const data = await r.json();
        
        const settings = data.fantasy_content.league[1]?.settings?.[0];
        if (!settings || !settings.stat_categories || !settings.stat_categories.stats) {
          console.warn('No stat_categories found in expected structure');
          return false;
        }
        
        const statCats = settings.stat_categories.stats;
        console.log('Found stat categories:', statCats.length);
        
        const categories = [];
        
        statCats.forEach(catObj => {
          const stat = catObj.stat;
          if (!stat || stat.enabled !== '1') return;
          
          const id = stat.stat_id.toString();
          
          // Skip 3PTA (3-point attempts) as it's rarely a scoring category
          if (id === '9') return;
          
          const meta = CONFIG.STAT_METADATA[id] || {
            name: stat.name,
            display_name: stat.display_name,
            sort_order: stat.sort_order
          };
          
          categories.push([
            id, 
            stat.display_name || stat.abbr || meta.name,
            meta.sort_order === '1' ? 'high' : 'low'
          ]);
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

    // Extract team data from weekly scoreboard API response
    extractWeekTeams: (data) => {
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
      
      teams.sort((a, b) => Number(b.isMine) - Number(a.isMine));
      return teams;
    },

    // Transform season data from API response
    transformSeasonData: (data) => {
      const blocks = data.fantasy_content.league || [];
      const meta = blocks.find(b => b.current_week) || {};
      const teamsO = (blocks.find(b => b.teams) || {}).teams || {};

      const currentWeek = parseInt(meta.current_week ?? CONFIG.MAX_WEEKS, 10) || CONFIG.MAX_WEEKS;
      const teams = [];
      
      Object.values(teamsO).forEach(tw => {
        if (!tw?.team) return;
        const t = tw.team;
        
        let name = '—', isMine = false;
        (t[0] || []).forEach(it => {
          if (it?.name) name = it.name;
          if (Utils.yes(it?.is_owned_by_current_login) || Utils.yes(it?.is_current_login)) isMine = true;
          if (it?.managers) {
            it.managers.forEach(mw => {
              if (Utils.yes(mw.manager?.is_current_login)) isMine = true;
            });
          }
        });
        
        const statMap = {};
        (t[1]?.team_stats?.stats || []).forEach(s => {
          statMap[s.stat.stat_id] = s.stat.value;
        });
        
        teams.push({ name, isMine, statMap });
      });
      
      teams.sort((a, b) => Number(b.isMine) - Number(a.isMine));
      return { teams, currentWeek };
    },
    
    // Process season data based on mode (totals/averages)
    processSeasonData: (payload, mode) => {
      const { teams, currentWeek } = payload;
      
      return teams.map(t => {
        const sm = {};
        CONFIG.COLS.forEach(([id, ,]) => {
          let v = t.statMap[id];
          if (v === null || v === undefined || v === '') { 
            sm[id] = '–'; 
            return; 
          }
          
          const numVal = parseFloat(v);
          if (isNaN(numVal)) {
            sm[id] = v;
            return;
          }
          
          if (mode === 'avg') {
            if (CONFIG.PERCENTAGE_STATS.includes(id)) {
              sm[id] = Utils.formatStatValue(id, numVal);
            } else {
              sm[id] = (numVal / currentWeek).toFixed(0);
            }
          } else {
            sm[id] = Utils.formatStatValue(id, numVal);
          }
        });
        
        return { ...t, statMap: sm };
      });
    }
  };

  // ============ RENDERING ============
  const Renderer = {
    // Initialize week selector options
    initWeekSelector: () => {
      for (let w = 1; w <= CONFIG.MAX_WEEKS; w++) {
        DOM.weekly.weekSel.insertAdjacentHTML('beforeend', `<option value="${w}">${w}</option>`);
      }
    },
    
    // Render weekly table
    renderWeekTable: (teams, selectedTeamIndex = 0) => {
      const { scoreTable, showRanksChk, analysisSummary } = DOM.weekly;
      
      scoreTable.innerHTML = '';
      if (!teams.length) return;

      // Generate and display analysis summary
      const ranks = Utils.computeRanks(teams);
      const analysis = Utils.generateCategoryAnalysis(teams, ranks, selectedTeamIndex);
      if (analysisSummary) {
        analysisSummary.innerHTML = Utils.formatAnalysisSummary(analysis, 'weekly');
      }

      // Create table header
      scoreTable.insertAdjacentHTML('afterbegin',
        `<thead><tr><th>Team</th>${CONFIG.COLS.map(c => `<th>${c[1]}</th>`).join('')}<th>Score</th></tr></thead><tbody></tbody>`
      );
      
      const tbody = scoreTable.querySelector('tbody');
      const showRanks = showRanksChk.checked;
      const baseTeam = teams[selectedTeamIndex];

      // First, create row for the selected team
      const selectedTeamTr = document.createElement('tr');
      selectedTeamTr.className = 'selected-team-row';
      if (baseTeam.isMine) selectedTeamTr.classList.add('user-team-row');
      selectedTeamTr.insertAdjacentHTML('beforeend', `<td>${baseTeam.name}</td>`);

      // Add stat cells for selected team
      CONFIG.COLS.forEach(([id]) => {
        const raw = Utils.formatStatValue(id, baseTeam.statMap[id]);
        const rk = ranks[selectedTeamIndex][id];
        const sup = (showRanks && rk !== '-') ? `<sup class="rank">${Utils.ordinal(rk)}</sup>` : '';
        selectedTeamTr.insertAdjacentHTML('beforeend', `<td>${raw}${sup}</td>`);
      });

      // Add empty score cell for selected team
      selectedTeamTr.insertAdjacentHTML('beforeend', `<td class="score-cell"></td>`);
      tbody.appendChild(selectedTeamTr);

      // Then create rows for all other teams
      teams.forEach((t, idx) => {
        if (idx === selectedTeamIndex) return; // Skip selected team as it's already shown

        const tr = document.createElement('tr');
        if (t.isMine) tr.classList.add('user-team-row');
        tr.insertAdjacentHTML('beforeend', `<td>${t.name}</td>`);

        // Add stat cells
        CONFIG.COLS.forEach(([id, , dir]) => {
          const raw = Utils.formatStatValue(id, t.statMap[id]);
          let cls = '';
          
          if (raw !== '–' && baseTeam.statMap[id] !== '–') {
            const a = parseFloat(raw), b = parseFloat(baseTeam.statMap[id]);
            if (!isNaN(a) && !isNaN(b) && a !== b) {
              cls = (dir === 'high' ? b > a : b < a) ? 'better' : 'worse';
            }
          }
          
          const rk = ranks[idx][id];
          const sup = (showRanks && rk !== '-') ? `<sup class="rank">${Utils.ordinal(rk)}</sup>` : '';
          tr.insertAdjacentHTML('beforeend', `<td class="${cls}">${raw}${sup}</td>`);
        });
        
        // Add score cell
        const rec = Utils.recordVsUser(baseTeam.statMap, t.statMap);
        tr.insertAdjacentHTML('beforeend', `<td class="score-cell">${rec}</td>`);
        tbody.appendChild(tr);
      });
    },
    
    // Render weekly cards
    renderWeekCards: (teams, selectedTeamIndex = 0) => {
      const { cardsContainer, showRanksChk } = DOM.weekly;
      
      cardsContainer.innerHTML = '';
      if (!teams.length) return;

      const baseTeam = teams[selectedTeamIndex];
      const ranks = Utils.computeRanks(teams);
      const showRanks = showRanksChk.checked;

      // Add reference team header
      cardsContainer.insertAdjacentHTML('beforeend',
        `<div class="reference-team"><strong>Comparing with:</strong> ${baseTeam.name}</div>`
      );

      // Create cards for each team (except the selected one)
      teams.forEach((t, idx) => {
        if (idx === selectedTeamIndex) return; // Skip the selected team

        const rec = Utils.recordVsUser(baseTeam.statMap, t.statMap);
        const card = document.createElement('div');
        card.className = 'card';
        if (t.isMine) card.classList.add('user-team-card');
        
        // Create card header
        card.innerHTML = `
          <div class="card-header">
            <span>${t.name}</span>
            <span class="card-record">${rec}</span>
          </div>
          <div class="card-content"><div class="stats-grid"></div></div>`;
        
        const grid = card.querySelector('.stats-grid');

        // Add stat items
        CONFIG.COLS.forEach(([id, label, dir]) => {
          const raw = Utils.formatStatValue(id, t.statMap[id]);
          const ur = Utils.formatStatValue(id, baseTeam.statMap[id]);
          let cls = '', diff = '';
          
          if (raw !== '–' && ur !== '–') {
            const a = parseFloat(raw), b = parseFloat(ur);
            if (!isNaN(a) && !isNaN(b) && a !== b) {
              cls = (dir === 'high' ? b > a : b < a) ? 'better' : 'worse';
              let d = a - b; 
              diff = CONFIG.PERCENTAGE_STATS.includes(id) ? d.toFixed(3).replace(/^-?0\./, '.') : d.toFixed(0);
              if (d > 0) diff = '+' + diff;
            }
          }
          
          const rk = ranks[idx][id];
          const sup = (showRanks && rk !== '-') ? `<span class="stat-rank">${Utils.ordinal(rk)}</span>` : '';
          
          grid.insertAdjacentHTML('beforeend',
            `<div class="stat-item ${cls}">
               <div class="stat-label">${label}</div>
               <div class="stat-value">${raw}${sup}</div>
               <div class="comparison-indicator">${diff}</div>
             </div>`);
        });
        
        cardsContainer.appendChild(card);
      });
    },
      // Render compare table (season data)
    renderCompareTable: (teams, selectedTeamIndex = 0) => {
      const { compareTable, showRanksChk } = DOM.compare;
      
      compareTable.innerHTML = '';
      if (!teams.length) return;

      // Create table header with Score column
      compareTable.insertAdjacentHTML('afterbegin',
        `<thead><tr><th>Team</th>${CONFIG.COLS.map(c => `<th>${c[1]}</th>`).join('')}<th>Score</th></tr></thead><tbody></tbody>`
      );
      
      const tbody = compareTable.querySelector('tbody');
      const ranks = Utils.computeRanks(teams);
      const showRanks = showRanksChk.checked;
      const baseTeam = teams[selectedTeamIndex];

      // First, create row for the selected team
      const selectedTeamTr = document.createElement('tr');
      selectedTeamTr.className = 'selected-team-row';
      if (baseTeam.isMine) selectedTeamTr.classList.add('user-team-row');
      selectedTeamTr.insertAdjacentHTML('beforeend', `<td>${baseTeam.name}</td>`);

      // Add stat cells for selected team
      CONFIG.COLS.forEach(([id]) => {
        const raw = baseTeam.statMap[id];
        const rk = ranks[selectedTeamIndex][id];
        const sup = (showRanks && rk !== '-') ? `<sup class="rank">${Utils.ordinal(rk)}</sup>` : '';
        selectedTeamTr.insertAdjacentHTML('beforeend', `<td>${raw}${sup}</td>`);
      });

      // Add empty score cell for selected team
      selectedTeamTr.insertAdjacentHTML('beforeend', `<td class="score-cell"></td>`);
      tbody.appendChild(selectedTeamTr);

      // Then create rows for all other teams
      teams.forEach((t, idx) => {
        if (idx === selectedTeamIndex) return; // Skip selected team as it's already shown

        const tr = document.createElement('tr');
        if (t.isMine) tr.classList.add('user-team-row');
        tr.insertAdjacentHTML('beforeend', `<td>${t.name}</td>`);

        // Add stat cells
        CONFIG.COLS.forEach(([id, , dir]) => {
          const raw = t.statMap[id];
          let cls = '';
          
          if (raw !== '–' && baseTeam.statMap[id] !== '–') {
            const a = parseFloat(raw), b = parseFloat(baseTeam.statMap[id]);
            if (!isNaN(a) && !isNaN(b) && a !== b) {
              cls = (dir === 'high' ? b > a : b < a) ? 'better' : 'worse';
            }
          }
          
          const rk = ranks[idx][id];
          const sup = (showRanks && rk !== '-') ? `<sup class="rank">${Utils.ordinal(rk)}</sup>` : '';
          tr.insertAdjacentHTML('beforeend', `<td class="${cls}">${raw}${sup}</td>`);
        });
        
        // Add score cell
        const rec = Utils.recordVsUser(baseTeam.statMap, t.statMap);
        tr.insertAdjacentHTML('beforeend', `<td class="score-cell">${rec}</td>`);
        tbody.appendChild(tr);
      });
    },
    
    // Render compare cards (season data)
    renderCompareCards: (teams, selectedTeamIndex = 0) => {
      const { cardsContainer, showRanksChk } = DOM.compare;
      
      cardsContainer.innerHTML = '';
      if (!teams.length) return;

      const baseTeam = teams[selectedTeamIndex];
      const ranks = Utils.computeRanks(teams);
      const showRanks = showRanksChk.checked;

      // Add reference team header
      cardsContainer.insertAdjacentHTML('beforeend',
        `<div class="reference-team"><strong>Comparing with:</strong> ${baseTeam.name}</div>`
      );

      // Create cards for each team (except the selected one)
      teams.forEach((t, idx) => {
        if (idx === selectedTeamIndex) return; // Skip the selected team

        const rec = Utils.recordVsUser(baseTeam.statMap, t.statMap);
        const card = document.createElement('div');
        card.className = 'card';
        if (t.isMine) card.classList.add('user-team-card');
        
        // Create card header
        card.innerHTML = `
          <div class="card-header">
            <span>${t.name}</span>
            <span class="card-record">${rec}</span>
          </div>
          <div class="card-content"><div class="stats-grid"></div></div>`;
        
        const grid = card.querySelector('.stats-grid');

        // Add stat items
        CONFIG.COLS.forEach(([id, label, dir]) => {
          const raw = t.statMap[id];
          const ur = baseTeam.statMap[id];
          let cls = '', diff = '';
          
          if (raw !== '–' && ur !== '–') {
            const a = parseFloat(raw), b = parseFloat(ur);
            if (!isNaN(a) && !isNaN(b) && a !== b) {
              cls = (dir === 'high' ? b > a : b < a) ? 'better' : 'worse';
              let d = a - b;
              diff = CONFIG.PERCENTAGE_STATS.includes(id) ? d.toFixed(3).replace(/^-?0\./, '.') : d.toFixed(0);
              if (d > 0) diff = '+' + diff;
            }
          }
          
          const rk = ranks[idx][id];
          const sup = (showRanks && rk !== '-') ? `<span class="stat-rank">${Utils.ordinal(rk)}</span>` : '';
          
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
  };

  // ============ API SERVICES ============
  const API = {      // Load weekly scoreboard data
    loadWeek: async (week) => {
      const { scoreTable } = DOM.weekly;
      
      scoreTable.innerHTML = `
        <caption>
          <div class="trends-loading-wrapper">
            <div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
            <div class="trends-loading-text">Loading weekly data...</div>
          </div>
        </caption>
      `;
      try {
        const r = await fetch(`/api/scoreboard?week=${week}`);
        const raw = await r.json();
        
        const teams = DataService.extractWeekTeams(raw);
        
        // Find user team index
        const userTeamIndex = teams.findIndex(t => t.isMine);
        
        STATE.weekly.loadedTeams = teams;
        STATE.weekly.userTeamIndex = userTeamIndex >= 0 ? userTeamIndex : 0;
        STATE.weekly.selectedTeamIndex = userTeamIndex >= 0 ? userTeamIndex : 0;
        
        // Populate team selector
        Utils.populateTeamSelector(teams, DOM.weekly.teamSel, STATE.weekly.selectedTeamIndex, STATE.weekly.userTeamIndex);
        
        // Render with selected team
        Renderer.renderWeekTable(teams, STATE.weekly.selectedTeamIndex);
        Renderer.renderWeekCards(teams, STATE.weekly.selectedTeamIndex);
      } catch (e) {
        console.error(e);
        scoreTable.innerHTML = "<caption>Couldn't load data</caption>";
      }
    },
      // Load season stats
    loadSeasonStats: async () => {
      const { compareTable } = DOM.compare;
      const { seasonMode } = STATE.compare;
      
      compareTable.innerHTML = `
        <caption>
          <div class="trends-loading-wrapper">
            <div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
            <div class="trends-loading-text">Loading season data...</div>
          </div>
        </caption>
      `;
      try {
        const r = await fetch('/api/season_avg');
        const raw = await r.json();
        const payload = DataService.transformSeasonData(raw);
        
        // Find user team index
        const userTeamIndex = payload.teams.findIndex(t => t.isMine);
        
        STATE.compare.seasonPayload = payload;
        STATE.compare.userTeamIndex = userTeamIndex >= 0 ? userTeamIndex : 0;
        STATE.compare.selectedTeamIndex = userTeamIndex >= 0 ? userTeamIndex : 0;
        
        // Populate team selector
        Utils.populateTeamSelector(payload.teams, DOM.compare.teamSel, STATE.compare.selectedTeamIndex, STATE.compare.userTeamIndex);
        
        API.renderCompare(payload, seasonMode, STATE.compare.selectedTeamIndex);
      } catch (e) {
        console.error(e);
        compareTable.innerHTML = "<caption>Couldn't load data</caption>";
      }
    },
    
    // Render compare view with season data
    renderCompare: (payload, mode, selectedTeamIndex = 0) => {
      if (!payload) return;
      
      const processedData = DataService.processSeasonData(payload, mode);

      // Generate and display analysis summary
      const ranks = Utils.computeRanks(processedData);
      const analysis = Utils.generateCategoryAnalysis(processedData, ranks, selectedTeamIndex);
      if (DOM.compare.analysisSummary) {
        DOM.compare.analysisSummary.innerHTML = Utils.formatAnalysisSummary(analysis, 'season');
      }

      Renderer.renderCompareTable(processedData, selectedTeamIndex);
      Renderer.renderCompareCards(processedData, selectedTeamIndex);
    }
  };

  // ============ Initialize UI ============
  const initUI = async () => {
    // Try to load league settings first
    try {
      await DataService.tryGetLeagueSettings();
      console.log('Final CONFIG.COLS after initialization:', CONFIG.COLS);
    } catch (e) {
      console.error('Failed to load league settings:', e);
    }
    
    // Initialize tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
      });  
    });
    
    // Initialize week selector
    Renderer.initWeekSelector();
    
    // Set up toggle buttons for views
    DOM.weekly.cardsViewBtn?.addEventListener('click', () => Utils.switchView('cards', DOM.weekly));
    DOM.weekly.tableViewBtn?.addEventListener('click', () => Utils.switchView('table', DOM.weekly));
    DOM.compare.cardsViewBtn?.addEventListener('click', () => Utils.switchView('cards', DOM.compare));
    DOM.compare.tableViewBtn?.addEventListener('click', () => Utils.switchView('table', DOM.compare));
    
    // Set up responsive views
    Utils.initResponsiveView();
    
    // Set up event listeners
    DOM.weekly.weekSel.addEventListener('change', () => API.loadWeek(+DOM.weekly.weekSel.value));
    
    // Team selection event listeners
    DOM.weekly.teamSel?.addEventListener('change', () => {
      const selectedIndex = parseInt(DOM.weekly.teamSel.value);
      STATE.weekly.selectedTeamIndex = selectedIndex;
      
      if (STATE.weekly.loadedTeams.length) {
        Renderer.renderWeekTable(STATE.weekly.loadedTeams, selectedIndex);
        Renderer.renderWeekCards(STATE.weekly.loadedTeams, selectedIndex);
      }
    });

    DOM.compare.teamSel?.addEventListener('change', () => {
      const selectedIndex = parseInt(DOM.compare.teamSel.value);
      STATE.compare.selectedTeamIndex = selectedIndex;
      
      if (STATE.compare.seasonPayload) {
        API.renderCompare(STATE.compare.seasonPayload, STATE.compare.seasonMode, selectedIndex);
      }
    });
    
    // Add event listener for the weekly showRanks checkbox 
    DOM.weekly.showRanksChk?.addEventListener('change', () => {
      if (STATE.weekly.loadedTeams.length) {
        Renderer.renderWeekTable(STATE.weekly.loadedTeams, STATE.weekly.selectedTeamIndex);
        Renderer.renderWeekCards(STATE.weekly.loadedTeams, STATE.weekly.selectedTeamIndex);
      }
    });
    
    // Add event listener for the compare showRanks checkbox
    DOM.compare.showRanksChk?.addEventListener('change', () => {
      if (STATE.compare.seasonPayload) {
        API.renderCompare(STATE.compare.seasonPayload, STATE.compare.seasonMode, STATE.compare.selectedTeamIndex);
      }
    });

    // Trigger change events on checkboxes to ensure rankings are shown initially
    DOM.weekly.showRanksChk?.dispatchEvent(new Event('change'));
    DOM.compare.showRanksChk?.dispatchEvent(new Event('change'));
    
    // Load compare tab data when selected
    document.querySelector('[data-target="tab-compare"]')?.addEventListener('click', () => {
      if (!STATE.compare.seasonPayload) {
        API.loadSeasonStats();
      }
    });   
    
    // Set up view selector for season data
    DOM.compare.viewSel?.addEventListener('change', () => {
      STATE.compare.seasonMode = DOM.compare.viewSel.value;
      if (STATE.compare.seasonPayload) {
        API.renderCompare(STATE.compare.seasonPayload, STATE.compare.seasonMode, STATE.compare.selectedTeamIndex);
      }
    });
    
    // Load initial data
    API.loadWeek(1);
    // Also load season stats for the compare tab
    if (document.querySelector('[data-target="tab-compare"]')?.classList.contains('active')) {
      API.loadSeasonStats();
    }
  };

  // Initialize application
  initUI();
});