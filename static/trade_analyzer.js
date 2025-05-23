/* ───── Enhanced trade_analyzer.js - Fantasy Basketball Trade Analyzer with Ranking Context ───── */
document.addEventListener('DOMContentLoaded', () => {
  const DOM = {
    tradingContainer: null, acquiringContainer: null,
    tradingSearchInput: null, acquiringSearchInput: null,
    tradingPlayerDropdown: null, acquiringPlayerDropdown: null,
    evaluateButton: null, tradeResultsContainer: null
  };

  const STATE = {
    tradingPlayers: [], acquiringPlayers: [],
    allNbaPlayers: [], maxPlayers: 5, initialized: false,
    currentSeasonData: null, // Store current season data for ranking analysis
    NBA_STAT_MAP: { // Ensure nbaKey matches keys from Python's `required_stats`
      '12': { nbaKey: 'PTS', type: 'counting', precision: 1 },    // Points
      '15': { nbaKey: 'REB', type: 'counting', precision: 1 },    // Rebounds
      '16': { nbaKey: 'AST', type: 'counting', precision: 1 },    // Assists
      '17': { nbaKey: 'STL', type: 'counting', precision: 1 },    // Steals
      '18': { nbaKey: 'BLK', type: 'counting', precision: 1 },    // Blocks
      '10': { nbaKey: 'FG3M', type: 'counting', precision: 1 },   // 3-Pointers Made
      '19': { nbaKey: 'TOV', type: 'counting', precision: 1 },    // Turnovers
      '5':  { type: 'percentage', components: { made: 'FGM', attempted: 'FGA' }, nbaKey: 'FG_PCT', precision: 3 }, // FG%
      '8':  { type: 'percentage', components: { made: 'FTM', attempted: 'FTA' }, nbaKey: 'FT_PCT', precision: 3 }, // FT%
      '11': { type: 'percentage', components: { made: 'FG3M', attempted: 'FG3A'}, nbaKey: 'FG3_PCT',precision: 3 }, // 3PT%
      '27': { nbaKey: 'DD2', type: 'counting', precision: 1 },    // Double-Doubles (will be calculated as average)
      '28': { nbaKey: 'TD3', type: 'counting', precision: 1 },    // Triple-Doubles
      // GP is used internally but not usually a displayed cat for trade impact
    }
  };

  const Utils = {
    generatePlayerCardId: () => Math.random().toString(36).substring(2, 15),
    formatStatDisplay: (value, precision, isPercentage = false) => {
      if (typeof value !== 'number' || isNaN(value)) return 'N/A';
      const num = Number(value);
      if (isPercentage) return num.toFixed(precision).replace(/^0\./, '.');
      return num.toFixed(precision);
    },
    formatImpactDisplay: (value, precision, isPercentage = false) => {
      if (typeof value !== 'number' || isNaN(value)) return 'N/A';
      const num = Number(value);
      let sign = num > 0 ? '+' : '';
      if (num === 0 && isPercentage && precision > 0) sign = '';
      const fixedStr = num.toFixed(precision);
      if (isPercentage && num > -1 && num < 1 && num !== 0) {
          return sign + fixedStr.replace(/^0\./, '.').replace(/^-0\./, '-.');
      }
      return sign + fixedStr;
    },
    // Helper to get ordinal rankings (1st, 2nd, 3rd, etc.)
    ordinal: n => {
      const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },
    // Compute team rankings (borrowed from dashboard.js logic)
    computeRanks: teams => {
      if (!window.CONFIG?.COLS) return [];
      const ranks = Array.from({ length: teams.length }, () => ({}));
      
      window.CONFIG.COLS.forEach(([id, , dir]) => {
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
    }
  };

  const DataService = {
      // Existing methods...
      fetchNbaPlayers: async () => {
          try {
              const response = await fetch('/api/nba_players');
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              STATE.allNbaPlayers = await response.json();
          } catch (error) {
              console.error("Could not fetch NBA players for trade analyzer:", error);
              STATE.allNbaPlayers = [];
          }
      },
      fetchNbaPlayerStats: async (playerId) => {
          try {
              const response = await fetch(`/api/nba_player_stats/${playerId}`);
              if (!response.ok) {
                  console.error(`Failed to fetch stats for player ${playerId}: ${response.status} ${await response.text()}`);
                  return null;
              }
              const data = await response.json();
              if (data.error) {
                  console.error(`Error from API for player ${playerId}: ${data.error}`);
                  return null;
              }
              data.PLAYER_ID = playerId;
              return data;
          } catch (error) {
              console.error(`Network or parsing error fetching stats for player ${playerId}:`, error);
              return null;
          }
      },
      
      // NEW: Fetch current season team data for ranking analysis
      fetchCurrentSeasonData: async () => {
          try {
              const response = await fetch('/api/season_avg');
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              const rawData = await response.json();
              
              // Transform the data similar to dashboard.js logic
              const blocks = rawData.fantasy_content.league || [];
              const teamsO = (blocks.find(b => b.teams) || {}).teams || {};
              const teams = [];
              
              Object.values(teamsO).forEach(tw => {
                if (!tw?.team) return;
                const t = tw.team;
                
                let name = '—', isMine = false;
                (t[0] || []).forEach(it => {
                  if (it?.name) name = it.name;
                  if ((it?.is_owned_by_current_login == 1) || (it?.is_current_login == 1)) isMine = true;
                  if (it?.managers) {
                    it.managers.forEach(mw => {
                      if (mw.manager?.is_current_login == 1) isMine = true;
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
              STATE.currentSeasonData = teams;
              return teams;
          } catch (error) {
              console.error("Error fetching current season data for ranking analysis:", error);
              return null;
          }
      }
  };

  const Renderer = {
    renderPlayerCard: (player, side) => {
      const card = document.createElement('div');
      card.className = 'player-card';
      card.setAttribute('data-player-card-id', player.card_id);
      
      const mpgText = player.mpg !== null && player.mpg !== undefined ? Utils.formatStatDisplay(player.mpg, 1) : 'Loading...';
      
      card.innerHTML = `
        <div class="player-photo"><img src="${player.imageUrl}" alt="${player.name}" onerror="this.src='https://via.placeholder.com/50x50?text=NBA'; this.onerror=null;"></div>
        <div class="player-info">
          <div class="player-name">${player.name}</div>
          <div class="player-team-details">
            ${player.team_id ? `<img src="https://cdn.nba.com/logos/nba/${player.team_id}/primary/L/logo.svg" class="player-card-team-logo" alt="${player.team}" onerror="this.style.display='none';">` : '<div class="player-card-team-logo-placeholder"></div>'}
            <div class="player-team-position-text">${player.team} - ${player.position}</div>
            <div class="player-mpg" data-player-id="${player.nba_id}">Minutes Per Game: ${mpgText}</div>
          </div>
        </div>
        <button class="remove-player" data-player-card-id="${player.card_id}" data-side="${side}">×</button>`;
      return card;
    },
    updatePlayerMPG: (playerId, mpg) => {
      const mpgElements = document.querySelectorAll(`.player-mpg[data-player-id="${playerId}"]`);
      mpgElements.forEach(element => {
        const mpgText = mpg !== null && mpg !== undefined ? Utils.formatStatDisplay(mpg, 1) : 'N/A';
        element.textContent = `Minutes Per Game: ${mpgText}`;
      });
    },
    updatePlayersList: () => {
      if (!DOM.tradingContainer || !DOM.acquiringContainer) return;
      DOM.tradingContainer.innerHTML = '';
      DOM.acquiringContainer.innerHTML = '';
      STATE.tradingPlayers.forEach(p => DOM.tradingContainer.appendChild(Renderer.renderPlayerCard(p, 'trading')));
      STATE.acquiringPlayers.forEach(p => DOM.acquiringContainer.appendChild(Renderer.renderPlayerCard(p, 'acquiring')));
      document.querySelectorAll('.player-card .remove-player').forEach(button => {
        button.removeEventListener('click', Events.handleRemovePlayer);
        button.addEventListener('click', Events.handleRemovePlayer);
      });
    },
    displayAutocompleteSuggestions: (suggestions, inputElement, side) => {
      const dropdownElement = (side === 'trading') ? DOM.tradingPlayerDropdown : DOM.acquiringPlayerDropdown;
      if (!dropdownElement) return;
      dropdownElement.innerHTML = '';
      if (suggestions.length === 0) { dropdownElement.style.display = 'none'; return; }
      suggestions.slice(0, 10).forEach(player => {
        const item = document.createElement('div');
        item.className = 'player-dropdown-item';
        item.textContent = `${player.full_name} (${player.team_abbreviation} - ${player.position})`;
        item.addEventListener('click', () => {
          Events.addPlayerToTrade(player, side);
          inputElement.value = '';
          dropdownElement.innerHTML = ''; dropdownElement.style.display = 'none';
        });
        dropdownElement.appendChild(item);
      });
      dropdownElement.style.display = 'block';
    },
    
    // ENHANCED: Render trade analysis table with ranking context
    renderTradeAnalysisTable: (aggregatedStats, categoryConfigs, summary, rankingAnalysis) => {
      if (!DOM.tradeResultsContainer) return;
      
      // Create the main analysis table
      let tableHTML = `<table class="trade-analysis-results"><thead><tr><th>Category</th><th>Current Rank</th><th>Trading Away</th><th>Acquiring</th><th>Impact</th></tr></thead><tbody>`;
      
      categoryConfigs.forEach(([statId, statName, sortDir]) => {
          const statMapInfo = STATE.NBA_STAT_MAP[statId];
          if (!statMapInfo) return;
          const isPercentage = statMapInfo.type === 'percentage';
          const precision = statMapInfo.precision;
          const isLowGood = sortDir === 'low';
          const tradingVal = aggregatedStats.tradingAway.totals[statId] || 0;
          const acquiringVal = aggregatedStats.acquiring.totals[statId] || 0;
          const impactVal = aggregatedStats.impact[statId] || 0;
          
          // Get current ranking for this category
          const currentRank = rankingAnalysis.currentRanks[statId];
          const rankDisplay = currentRank && currentRank !== '-' ? Utils.ordinal(currentRank) : 'N/A';
          
          let impactClass = '';
          const diffThreshold = isPercentage ? 0.0001 : 0.01; 
          if (Math.abs(impactVal) > diffThreshold) { 
              if ((isLowGood && impactVal < 0) || (!isLowGood && impactVal > 0)) impactClass = 'team-improves';
              else impactClass = 'team-declines';
          }
          const lowGoodAttr = isLowGood ? 'data-low-is-good="true"' : '';
          
          tableHTML += `<tr>
            <td>${statName}</td>
            <td style="text-align: center; font-weight: 600;">${rankDisplay}</td>
            <td>${Utils.formatStatDisplay(tradingVal, precision, isPercentage)}</td>
            <td>${Utils.formatStatDisplay(acquiringVal, precision, isPercentage)}</td>
            <td class="${impactClass}" ${lowGoodAttr}>${Utils.formatImpactDisplay(impactVal, precision, isPercentage)}</td>
          </tr>`;
      });
      
      // Enhanced summary with ranking context
      const contextualSummary = Renderer.generateContextualSummary(summary, rankingAnalysis);
      
      tableHTML += `
          <tr class="status-row">
              <td colspan="5" class="status-cell">
                  <div class="status-content-wrapper">
                      <span class="status-text">${contextualSummary.mainMessage}</span>
                      <button id="showTradeSummaryBtn" class="summary-toggle">View Detailed Analysis</button>
                  </div>
              </td>
          </tr>
          <tr class="summary-section" style="display:none;"><td colspan="5" class="summary-header">Trade Impact Analysis</td></tr>
          <tr class="summary-row gains" style="display:none;">
            <td colspan="3" class="category-list"><strong>Improving Categories:</strong><br>${contextualSummary.improvingDetails}</td>
            <td colspan="2" class="impact-value">+${summary.improvedCount} categories</td>
          </tr>
          <tr class="summary-row losses" style="display:none;">
            <td colspan="3" class="category-list"><strong>Declining Categories:</strong><br>${contextualSummary.decliningDetails}</td>
            <td colspan="2" class="impact-value">-${summary.declinedCount} categories</td>
          </tr>
          <tr class="summary-section" style="display:none;"><td colspan="5" class="summary-header">Strategic Insights</td></tr>
          <tr class="summary-row" style="display:none; background-color: #f0f9ff !important;">
            <td colspan="5" class="category-list">${contextualSummary.strategicInsights}</td>
          </tr>
      </tbody><tfoot><tr><td colspan="5">Analysis based on current season totals and player per-game averages</td></tr></tfoot></table>`;
      
      DOM.tradeResultsContainer.innerHTML = tableHTML;
      DOM.tradeResultsContainer.style.display = 'block';
      DOM.tradeResultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
      // Set up summary toggle
      const summaryToggleBtn = document.getElementById('showTradeSummaryBtn');
      if (summaryToggleBtn) {
          summaryToggleBtn.addEventListener('click', () => {
              const summaryRows = DOM.tradeResultsContainer.querySelectorAll('.summary-section, .summary-row');
              const isVisible = summaryRows[0].style.display !== 'none';
              summaryRows.forEach(row => row.style.display = isVisible ? 'none' : 'table-row');
              summaryToggleBtn.textContent = isVisible ? 'View Detailed Analysis' : 'Hide Detailed Analysis';
              summaryToggleBtn.classList.toggle('active', !isVisible);
          });
      }
    },
    
    // NEW: Generate contextual summary based on rankings
    generateContextualSummary: (summary, rankingAnalysis) => {
      const { weakCategories, strongCategories, currentRanks } = rankingAnalysis;
      const { gainingCategories, losingCategories, improvedCount, declinedCount } = summary;
      
      // Analyze which improvements help with weak areas
      const helpingWeakAreas = gainingCategories.filter(cat => 
        weakCategories.some(weak => weak.name === cat)
      );
      
      // Analyze which declines hurt strong areas
      const hurtingStrongAreas = losingCategories.filter(cat => 
        strongCategories.some(strong => strong.name === cat)
      );
      
      // Generate main message
      let mainMessage;
      if (helpingWeakAreas.length > 0) {
        mainMessage = `Trade improves ${improvedCount} categories, including ${helpingWeakAreas.length} weak area${helpingWeakAreas.length > 1 ? 's' : ''}`;
      } else if (improvedCount > declinedCount) {
        mainMessage = `Trade improves ${improvedCount} categories but doesn't target your weakest areas`;
      } else {
        mainMessage = `Trade improves ${improvedCount} categories but may not be optimal for your team needs`;
      }
      
      // Generate detailed breakdowns
      const improvingDetails = gainingCategories.map(cat => {
        const rank = currentRanks[Object.keys(currentRanks).find(id => 
          window.CONFIG?.COLS?.find(([, name]) => name === cat)?.[0] === id
        )];
        const isWeak = weakCategories.some(weak => weak.name === cat);
        const rankStr = rank && rank !== '-' ? ` (currently ${Utils.ordinal(rank)})` : '';
        return `${cat}${rankStr}${isWeak ? ' 🎯' : ''}`;
      }).join(', ') || 'None';
      
      const decliningDetails = losingCategories.map(cat => {
        const rank = currentRanks[Object.keys(currentRanks).find(id => 
          window.CONFIG?.COLS?.find(([, name]) => name === cat)?.[0] === id
        )];
        const isStrong = strongCategories.some(strong => strong.name === cat);
        const rankStr = rank && rank !== '-' ? ` (currently ${Utils.ordinal(rank)})` : '';
        return `${cat}${rankStr}${isStrong ? ' ⚠️' : ''}`;
      }).join(', ') || 'None';
      
      // Generate strategic insights
      let strategicInsights = [];
      
      if (helpingWeakAreas.length > 0) {
        strategicInsights.push(`✅ <strong>Addresses Weaknesses:</strong> This trade helps improve ${helpingWeakAreas.join(', ')}, which ${helpingWeakAreas.length > 1 ? 'are' : 'is'} currently among your worst categories.`);
      }
      
      if (hurtingStrongAreas.length > 0) {
        strategicInsights.push(`⚠️ <strong>Weakens Strengths:</strong> Be cautious - this trade hurts ${hurtingStrongAreas.join(', ')}, which ${hurtingStrongAreas.length > 1 ? 'are' : 'is'} currently among your best categories.`);
      }
      
      const unaddressedWeakCategories = weakCategories.filter(weak => 
        !gainingCategories.includes(weak.name)
      );
      if (unaddressedWeakCategories.length > 0 && unaddressedWeakCategories.length === weakCategories.length) {
        strategicInsights.push(`💡 <strong>Consider:</strong> This trade doesn't address your weakest categories: ${unaddressedWeakCategories.map(w => `${w.name} (${Utils.ordinal(w.rank)})`).join(', ')}. You might want to target players who excel in these areas.`);
      }
      
      if (strategicInsights.length === 0) {
        strategicInsights.push("📊 This trade provides a balanced statistical adjustment without significantly impacting your strongest or weakest categories.");
      }
      
      return {
        mainMessage,
        improvingDetails,
        decliningDetails,
        strategicInsights: strategicInsights.join('<br><br>')
      };
    }
  };

  const Events = {
    initTradeAnalyzerLogic: async () => {
      if (!STATE.allNbaPlayers || STATE.allNbaPlayers.length === 0) {
          await DataService.fetchNbaPlayers();
      }
      DOM.tradingSearchInput?.addEventListener('input', (e) => Events.handlePlayerSearch(e, 'trading'));
      DOM.acquiringSearchInput?.addEventListener('input', (e) => Events.handlePlayerSearch(e, 'acquiring'));
      document.addEventListener('click', (e) => {
          if (DOM.tradingPlayerDropdown && DOM.tradingSearchInput && !DOM.tradingSearchInput.contains(e.target) && !DOM.tradingPlayerDropdown.contains(e.target)) DOM.tradingPlayerDropdown.style.display = 'none';
          if (DOM.acquiringPlayerDropdown && DOM.acquiringSearchInput && !DOM.acquiringSearchInput.contains(e.target) && !DOM.acquiringPlayerDropdown.contains(e.target)) DOM.acquiringPlayerDropdown.style.display = 'none';
      });
      DOM.evaluateButton?.addEventListener('click', Events.handleEvaluateTrade);
      Renderer.updatePlayersList();
    },
    handlePlayerSearch: (event, side) => {
      const searchTerm = event.target.value.toLowerCase();
      if (searchTerm.length < 2) {
        const dropdown = side === 'trading' ? DOM.tradingPlayerDropdown : DOM.acquiringPlayerDropdown;
        if (dropdown) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; }
        return;
      }
      const filteredPlayers = STATE.allNbaPlayers.filter(p => p.full_name.toLowerCase().includes(searchTerm));
      Renderer.displayAutocompleteSuggestions(filteredPlayers, event.target, side);
    },
    addPlayerToTrade: async (playerDataFromApi, side) => {
      const targetPlayerList = side === 'trading' ? STATE.tradingPlayers : STATE.acquiringPlayers;
      if (targetPlayerList.length >= STATE.maxPlayers) { alert(`Maximum ${STATE.maxPlayers} players per side.`); return; }
      if (STATE.tradingPlayers.some(p => p.nba_id === playerDataFromApi.id) || STATE.acquiringPlayers.some(p => p.nba_id === playerDataFromApi.id)) {
          alert(`${playerDataFromApi.full_name} is already in the trade.`); return;
      }

      const newPlayer = {
        card_id: Utils.generatePlayerCardId(), 
        nba_id: playerDataFromApi.id, 
        name: playerDataFromApi.full_name,
        imageUrl: `https://cdn.nba.com/headshots/nba/latest/260x190/${playerDataFromApi.id}.png`,
        team_id: playerDataFromApi.team_id, 
        team: playerDataFromApi.team_abbreviation || 'N/A', 
        position: playerDataFromApi.position || 'N/A',
        mpg: null
      };

      targetPlayerList.push(newPlayer);
      Renderer.updatePlayersList();

      DataService.fetchNbaPlayerStats(playerDataFromApi.id).then(playerStats => {
        if (playerStats && playerStats.MIN !== undefined) {
          newPlayer.mpg = playerStats.MIN;
          Renderer.updatePlayerMPG(playerDataFromApi.id, playerStats.MIN);
        } else {
          Renderer.updatePlayerMPG(playerDataFromApi.id, null);
        }
      }).catch(error => {
        console.error(`Error fetching MPG for player ${playerDataFromApi.id}:`, error);
        Renderer.updatePlayerMPG(playerDataFromApi.id, null);
      });
    },
    handleRemovePlayer: (e) => {
      const playerCardId = e.target.getAttribute('data-player-card-id');
      const side = e.target.getAttribute('data-side');
      if (side === 'trading') STATE.tradingPlayers = STATE.tradingPlayers.filter(p => p.card_id !== playerCardId);
      else STATE.acquiringPlayers = STATE.acquiringPlayers.filter(p => p.card_id !== playerCardId);
      Renderer.updatePlayersList();
    },
    
    // ENHANCED: Handle trade evaluation with ranking context
    handleEvaluateTrade: async () => {
      if (!DOM.tradeResultsContainer) return;
      const tradingPlayerIds = STATE.tradingPlayers.map(p => p.nba_id);
      const acquiringPlayerIds = STATE.acquiringPlayers.map(p => p.nba_id);

      if (tradingPlayerIds.length === 0 || acquiringPlayerIds.length === 0) {
           DOM.tradeResultsContainer.innerHTML = `<div class="trade-message trade-warning">Please add players to both sides.</div>`;
           DOM.tradeResultsContainer.style.display = 'block'; return;
      }
      
      DOM.tradeResultsContainer.innerHTML = `<div style="text-align:center; padding: 20px;">Loading analysis... <div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div></div>`;
      DOM.tradeResultsContainer.style.display = 'block';

      try {
          // Fetch current season data for ranking analysis if not already loaded
          if (!STATE.currentSeasonData) {
              await DataService.fetchCurrentSeasonData();
          }
          
          // Fetch player stats
          const tradingStatsRaw = (await Promise.all(tradingPlayerIds.map(id => DataService.fetchNbaPlayerStats(id)))).filter(s => s !== null);
          const acquiringStatsRaw = (await Promise.all(acquiringPlayerIds.map(id => DataService.fetchNbaPlayerStats(id)))).filter(s => s !== null);

          let missingPlayersMessage = "";
          if (tradingStatsRaw.length !== tradingPlayerIds.length) {
              const missing = STATE.tradingPlayers.filter(p => !tradingStatsRaw.find(s => s.PLAYER_ID === p.nba_id)).map(p=>p.name);
              if(missing.length > 0) missingPlayersMessage += `Could not fetch stats for trading players: ${missing.join(', ')}. `;
          }
          if (acquiringStatsRaw.length !== acquiringPlayerIds.length) {
              const missing = STATE.acquiringPlayers.filter(p => !acquiringStatsRaw.find(s => s.PLAYER_ID === p.nba_id)).map(p=>p.name);
               if(missing.length > 0) missingPlayersMessage += `Could not fetch stats for acquiring players: ${missing.join(', ')}. `;
          }
          if(missingPlayersMessage) {
               DOM.tradeResultsContainer.innerHTML = `<div class="trade-message trade-warning">${missingPlayersMessage}Analysis may be incomplete.</div>`;
               if (tradingStatsRaw.length === 0 && acquiringStatsRaw.length === 0) return; 
          }
          
          const categoryConfigs = window.CONFIG?.COLS || [];
          if (categoryConfigs.length === 0 || !window.CONFIG) {
               DOM.tradeResultsContainer.innerHTML = `<div class="trade-message trade-warning">League categories not loaded.</div>`; return;
          }

          // Calculate aggregated stats (existing logic)
          const aggregatedStats = {
              tradingAway: { totals: {}, components: { FGM: 0, FGA: 0, FTM: 0, FTA: 0, FG3M: 0, FG3A: 0, DD2_total: 0, GP_for_DD2: 0 } },
              acquiring: { totals: {}, components: { FGM: 0, FGA: 0, FTM: 0, FTA: 0, FG3M: 0, FG3A: 0, DD2_total: 0, GP_for_DD2: 0 } },
              impact: {}
          };

          const processGroup = (playersStatsArray, groupAgg) => {
              playersStatsArray.forEach(playerData => {
                  if (!playerData || playerData.GP === 0) return; 
                  
                  if (playerData.DD2 !== undefined) { 
                      groupAgg.components.GP_for_DD2 += parseFloat(playerData.GP || 0);
                      groupAgg.components.DD2_total += parseFloat(playerData.DD2 || 0);
                  }

                  categoryConfigs.forEach(([statId, , ]) => {
                      const statMapInfo = STATE.NBA_STAT_MAP[statId];
                      if (!statMapInfo) return;
                      
                      if (statId === '27') { 
                          // DD2 calculated from components
                      } else if (statMapInfo.type === 'counting') {
                          const value = parseFloat(playerData[statMapInfo.nbaKey] || 0);
                          groupAgg.totals[statId] = (groupAgg.totals[statId] || 0) + value;
                      } else if (statMapInfo.type === 'percentage' && statMapInfo.components) {
                          groupAgg.components[statMapInfo.components.made] += parseFloat(playerData[statMapInfo.components.made] || 0);
                          groupAgg.components[statMapInfo.components.attempted] += parseFloat(playerData[statMapInfo.components.attempted] || 0);
                      }
                  });
              });

              categoryConfigs.forEach(([statId, , ]) => {
                  const statMapInfo = STATE.NBA_STAT_MAP[statId];
                  if (!statMapInfo) return;

                  if (statId === '27') { 
                      groupAgg.totals[statId] = groupAgg.components.GP_for_DD2 > 0 ?
                          (groupAgg.components.DD2_total / groupAgg.components.GP_for_DD2) : 0;
                  } else if (statMapInfo.type === 'percentage' && statMapInfo.components) {
                      const made = groupAgg.components[statMapInfo.components.made];
                      const attempted = groupAgg.components[statMapInfo.components.attempted];
                      groupAgg.totals[statId] = attempted > 0 ? (made / attempted) : 0;
                  }
              });
          };
          
          processGroup(tradingStatsRaw, aggregatedStats.tradingAway);
          processGroup(acquiringStatsRaw, aggregatedStats.acquiring);

          let improvedCount = 0, declinedCount = 0;
          const gainingCategories = [], losingCategories = [];

          categoryConfigs.forEach(([statId, statName, sortDir]) => {
              const statMapInfo = STATE.NBA_STAT_MAP[statId];
              if (!statMapInfo) { aggregatedStats.impact[statId] = 0; return; }

              const tradingVal = aggregatedStats.tradingAway.totals[statId] || 0;
              const acquiringVal = aggregatedStats.acquiring.totals[statId] || 0;
              const diff = acquiringVal - tradingVal;
              aggregatedStats.impact[statId] = diff;

              const isLowGood = sortDir === 'low';
              const diffThreshold = (statMapInfo.type === 'percentage') ? 0.0001 : 0.01;
              if (Math.abs(diff) > diffThreshold) {
                  if ((isLowGood && diff < 0) || (!isLowGood && diff > 0)) {
                      improvedCount++; gainingCategories.push(statName);
                  } else {
                      declinedCount++; losingCategories.push(statName);
                  }
              }
          });
          
          // NEW: Calculate ranking analysis
          const rankingAnalysis = Events.calculateRankingAnalysis(categoryConfigs);
          
          const summary = { improvedCount, declinedCount, gainingCategories, losingCategories };
          Renderer.renderTradeAnalysisTable(aggregatedStats, categoryConfigs, summary, rankingAnalysis);

      } catch (error) {
          console.error("Error evaluating trade:", error);
          DOM.tradeResultsContainer.innerHTML = `<div class="trade-message trade-warning">An error occurred: ${error.message}</div>`;
      }
    },
    
    // NEW: Calculate ranking analysis for contextual insights
    calculateRankingAnalysis: (categoryConfigs) => {
      if (!STATE.currentSeasonData || STATE.currentSeasonData.length === 0) {
        return {
          currentRanks: {},
          weakCategories: [],
          strongCategories: []
        };
      }
      
      // Compute current rankings
      const allRanks = Utils.computeRanks(STATE.currentSeasonData);
      const myTeamIndex = STATE.currentSeasonData.findIndex(team => team.isMine);
      const currentRanks = myTeamIndex >= 0 ? allRanks[myTeamIndex] : {};
      
      // Identify weak and strong categories
      const totalTeams = STATE.currentSeasonData.length;
      const weakCategories = [];
      const strongCategories = [];
      
      categoryConfigs.forEach(([statId, statName, sortDir]) => {
        const rank = currentRanks[statId];
        if (rank && rank !== '-' && typeof rank === 'number') {
          // Consider bottom 30% as weak, top 30% as strong
          const weakThreshold = Math.ceil(totalTeams * 0.7);
          const strongThreshold = Math.ceil(totalTeams * 0.3);
          
          if (rank >= weakThreshold) {
            weakCategories.push({ name: statName, rank, statId });
          } else if (rank <= strongThreshold) {
            strongCategories.push({ name: statName, rank, statId });
          }
        }
      });
      
      // Sort by rank (worst first for weak, best first for strong)
      weakCategories.sort((a, b) => b.rank - a.rank);
      strongCategories.sort((a, b) => a.rank - b.rank);
      
      return {
        currentRanks,
        weakCategories,
        strongCategories,
        totalTeams
      };
    }
  };

  const initTradeAnalyzer = () => {
    if (STATE.initialized) return;
    DOM.tradingContainer = document.getElementById('tradingPlayersContainer');
    DOM.acquiringContainer = document.getElementById('acquiringPlayersContainer');
    DOM.tradingSearchInput = document.getElementById('tradingPlayerSearch');
    DOM.acquiringSearchInput = document.getElementById('acquiringPlayerSearch');
    DOM.evaluateButton = document.getElementById('evaluateTradeBtn');
    DOM.tradeResultsContainer = document.getElementById('tradeResultsContainer');

    if (!DOM.tradingContainer || !DOM.acquiringContainer || !DOM.tradingSearchInput || !DOM.acquiringSearchInput || !DOM.evaluateButton || !DOM.tradeResultsContainer) {
      return; 
    }
    
    DOM.tradingPlayerDropdown = DOM.tradingSearchInput.nextElementSibling;
    DOM.acquiringPlayerDropdown = DOM.acquiringSearchInput.nextElementSibling;
    
    if (!DOM.tradingPlayerDropdown || !DOM.tradingPlayerDropdown.classList.contains('player-dropdown') || 
        !DOM.acquiringPlayerDropdown || !DOM.acquiringPlayerDropdown.classList.contains('player-dropdown')) {
       console.warn('Player dropdown elements not found/incorrect for trade_analyzer. Autocomplete might fail.');
    }
    STATE.initialized = true;
    Events.initTradeAnalyzerLogic();
  };

  const tradeTabButton = document.querySelector('[data-target="tab-trade"]');
  if (tradeTabButton) {
    tradeTabButton.addEventListener('click', () => setTimeout(initTradeAnalyzer, 50));
    if (tradeTabButton.classList.contains('active')) initTradeAnalyzer();
  }
});