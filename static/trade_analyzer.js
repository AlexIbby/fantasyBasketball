/* ───── trade_analyzer.js - Fantasy Basketball Trade Analyzer ───── */
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
    }
  };

  const DataService = {
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
                  return null; // Return null to indicate failure for this player
              }
              const data = await response.json();
              if (data.error) { // Check for application-level error from Python
                  console.error(`Error from API for player ${playerId}: ${data.error}`);
                  return null;
              }
              data.PLAYER_ID = playerId; // Ensure PLAYER_ID is part of the object for later checks
              return data;
          } catch (error) {
              console.error(`Network or parsing error fetching stats for player ${playerId}:`, error);
              return null;
          }
      }
  };

  const Renderer = {
    renderPlayerCard: (player, side) => {
      const card = document.createElement('div');
      card.className = 'player-card';
      card.setAttribute('data-player-card-id', player.card_id);
      
      // Show loading state for MPG initially
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
      // Update all MPG elements for this player
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
        button.removeEventListener('click', Events.handleRemovePlayer); // Prevent duplicates
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
          Events.addPlayerToTrade(player, side); // This is now async
          inputElement.value = '';
          dropdownElement.innerHTML = ''; dropdownElement.style.display = 'none';
        });
        dropdownElement.appendChild(item);
      });
      dropdownElement.style.display = 'block';
    },
    renderTradeAnalysisTable: (aggregatedStats, categoryConfigs, summary) => {
      if (!DOM.tradeResultsContainer) return;
      let tableHTML = `<table class="trade-analysis-results"><thead><tr><th>Category</th><th>Trading Away</th><th>Acquiring</th><th>Impact</th></tr></thead><tbody>`;
      categoryConfigs.forEach(([statId, statName, sortDir]) => {
          const statMapInfo = STATE.NBA_STAT_MAP[statId];
          if (!statMapInfo) return;
          const isPercentage = statMapInfo.type === 'percentage';
          const precision = statMapInfo.precision;
          const isLowGood = sortDir === 'low';
          const tradingVal = aggregatedStats.tradingAway.totals[statId] || 0;
          const acquiringVal = aggregatedStats.acquiring.totals[statId] || 0;
          const impactVal = aggregatedStats.impact[statId] || 0;
          let impactClass = '';
          // For DD2 (statId '27'), it's an average, treat like other counting stats for positive/negative impact determination
          // For percentages, diff threshold is smaller. For DD2 avg, use similar threshold as other counting stats.
          const diffThreshold = isPercentage ? 0.0001 : 0.01; 
          if (Math.abs(impactVal) > diffThreshold) { 
              if ((isLowGood && impactVal < 0) || (!isLowGood && impactVal > 0)) impactClass = 'team-improves';
              else impactClass = 'team-declines';
          }
          const lowGoodAttr = isLowGood ? 'data-low-is-good="true"' : '';
          tableHTML += `<tr><td>${statName}</td><td>${Utils.formatStatDisplay(tradingVal, precision, isPercentage)}</td><td>${Utils.formatStatDisplay(acquiringVal, precision, isPercentage)}</td><td class="${impactClass}" ${lowGoodAttr}>${Utils.formatImpactDisplay(impactVal, precision, isPercentage)}</td></tr>`;
      });
      tableHTML += `
          <tr class="status-row">
              <td colspan="4" class="status-cell">
                  <div class="status-content-wrapper">
                      <span class="status-text">Trade improves ${summary.improvedCount} of ${categoryConfigs.filter(c => STATE.NBA_STAT_MAP[c[0]]).length} categories</span>
                      <button id="showTradeSummaryBtn" class="summary-toggle">View Impact Details</button>
                  </div>
              </td>
          </tr>
          <tr class="summary-section" style="display:none;"><td colspan="4" class="summary-header">Impact Summary</td></tr>
          <tr class="summary-row gains" style="display:none;"><td colspan="2" class="category-list">Improving: ${summary.gainingCategories.join(', ') || 'None'}</td><td colspan="2" class="impact-value">+${summary.improvedCount} categories</td></tr>
          <tr class="summary-row losses" style="display:none;"><td colspan="2" class="category-list">Declining: ${summary.losingCategories.join(', ') || 'None'}</td><td colspan="2" class="impact-value">-${summary.declinedCount} categories</td></tr>
      </tbody><tfoot><tr><td colspan="4">Based on player per-game averages</td></tr></tfoot></table>`;
      DOM.tradeResultsContainer.innerHTML = tableHTML;
      DOM.tradeResultsContainer.style.display = 'block';
      DOM.tradeResultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const summaryToggleBtn = document.getElementById('showTradeSummaryBtn');
      if (summaryToggleBtn) {
          summaryToggleBtn.addEventListener('click', () => {
              const summaryRows = DOM.tradeResultsContainer.querySelectorAll('.summary-section, .summary-row');
              const isVisible = summaryRows[0].style.display !== 'none';
              summaryRows.forEach(row => row.style.display = isVisible ? 'none' : 'table-row');
              summaryToggleBtn.textContent = isVisible ? 'View Impact Details' : 'Hide Impact Details';
              summaryToggleBtn.classList.toggle('active', !isVisible);
          });
      }
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

      // Create player object without MPG first
      const newPlayer = {
        card_id: Utils.generatePlayerCardId(), 
        nba_id: playerDataFromApi.id, 
        name: playerDataFromApi.full_name,
        imageUrl: `https://cdn.nba.com/headshots/nba/latest/260x190/${playerDataFromApi.id}.png`,
        team_id: playerDataFromApi.team_id, 
        team: playerDataFromApi.team_abbreviation || 'N/A', 
        position: playerDataFromApi.position || 'N/A',
        mpg: null // Start with null MPG
      };

      // Add player to list and render immediately
      targetPlayerList.push(newPlayer);
      Renderer.updatePlayersList();

      // Fetch MPG asynchronously after the card is displayed
      DataService.fetchNbaPlayerStats(playerDataFromApi.id).then(playerStats => {
        if (playerStats && playerStats.MIN !== undefined) {
          // Update the player object's MPG
          newPlayer.mpg = playerStats.MIN;
          
          // Update the MPG display in the already-rendered card
          Renderer.updatePlayerMPG(playerDataFromApi.id, playerStats.MIN);
        } else {
          // If fetch failed, update display to show N/A
          Renderer.updatePlayerMPG(playerDataFromApi.id, null);
        }
      }).catch(error => {
        console.error(`Error fetching MPG for player ${playerDataFromApi.id}:`, error);
        // Update display to show N/A on error
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
          // Player stats (including MPG as 'MIN') are already fetched when players were added if we want to reuse.
          // However, the current logic re-fetches here. We can optimize later if needed by storing full stats on add.
          // For now, let's stick to the existing evaluate trade flow which re-fetches.
          // Note: The player objects in STATE.tradingPlayers/acquiringPlayers now have an 'mpg' field
          // from the addPlayerToTrade fetch, but this evaluate function fetches fresh full stats.
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
                          // DD2 total will be calculated from components later
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
          
          Renderer.renderTradeAnalysisTable(aggregatedStats, categoryConfigs, { improvedCount, declinedCount, gainingCategories, losingCategories });

      } catch (error) {
          console.error("Error evaluating trade:", error);
          DOM.tradeResultsContainer.innerHTML = `<div class="trade-message trade-warning">An error occurred: ${error.message}</div>`;
      }
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