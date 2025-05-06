/* ───── trade_analyzer.js - Fantasy Basketball Trade Analyzer ───── */
document.addEventListener('DOMContentLoaded', () => {
    // ============ DOM REFERENCES ============
    const DOM = {
      tradingContainer: document.getElementById('tradingPlayersContainer'),
      acquiringContainer: document.getElementById('acquiringPlayersContainer'),
      tradingSearchInput: document.getElementById('tradingPlayerSearch'),
      acquiringSearchInput: document.getElementById('acquiringPlayerSearch'),
      tradingPlayerDropdown: document.getElementById('tradingPlayerSearch')?.nextElementSibling,
      acquiringPlayerDropdown: document.getElementById('acquiringPlayerSearch')?.nextElementSibling,
      evaluateButton: document.getElementById('evaluateTradeBtn'),
      tradeResults: document.getElementById('tradeResultsContainer')
    };
  
    // ============ STATE ============
    const STATE = {
      tradingPlayers: [],
      acquiringPlayers: [],
      allNbaPlayers: [], // To store all fetch NBA players
      maxPlayers: 5, // Max players per side
      initialized: false
    };
  
    // ============ UTILITIES ============
    const Utils = {
      // Generate a unique ID for each player card in the DOM
      generatePlayerCardId: () => {
        return Math.random().toString(36).substring(2, 15);
      }
    };

    // ============ DATA SERVICE ============
    const DataService = {
        fetchNbaPlayers: async () => {
            try {
                const response = await fetch('/api/nba_players');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                STATE.allNbaPlayers = await response.json();
                console.log('NBA Players loaded:', STATE.allNbaPlayers.length);
            } catch (error) {
                console.error("Could not fetch NBA players:", error);
                STATE.allNbaPlayers = []; // Ensure it's an empty array on failure
            }
        }
    };
  
    // ============ RENDERING ============
    const Renderer = {
      // Render a player card
      renderPlayerCard: (player, side) => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.setAttribute('data-player-card-id', player.card_id); // Use card_id for DOM removal
        
        // Player object structure: { card_id, nba_id, name, imageUrl }
        // Position and team are not available from get_active_players()
        card.innerHTML = `
          <div class="player-photo">
            <img src="${player.imageUrl}" alt="${player.name}" onerror="this.src='https://via.placeholder.com/50x50?text=NBA'; this.onerror=null;">
          </div>
          <div class="player-info">
            <div class="player-name">${player.name}</div>
            <div class="player-team"></div> <!-- team/position empty or N/A -->
          </div>
          <button class="remove-player" data-player-card-id="${player.card_id}" data-side="${side}">×</button>
        `;
        
        return card;
      },
      
      // Update the UI with current players in trade boxes
      updatePlayersList: () => {
        if (!DOM.tradingContainer || !DOM.acquiringContainer) return;

        DOM.tradingContainer.innerHTML = '';
        DOM.acquiringContainer.innerHTML = '';
        
        STATE.tradingPlayers.forEach(player => {
          const card = Renderer.renderPlayerCard(player, 'trading');
          DOM.tradingContainer.appendChild(card);
        });
        
        STATE.acquiringPlayers.forEach(player => {
          const card = Renderer.renderPlayerCard(player, 'acquiring');
          DOM.acquiringContainer.appendChild(card);
        });
        
        // Add event listeners to new remove buttons
        document.querySelectorAll('.player-card .remove-player').forEach(button => {
          button.removeEventListener('click', Events.handleRemovePlayer); // Prevent duplicate listeners
          button.addEventListener('click', Events.handleRemovePlayer);
        });
      },

      // Display autocomplete suggestions
      displayAutocompleteSuggestions: (suggestions, inputElement, side) => {
        const dropdownElement = (side === 'trading') ? DOM.tradingPlayerDropdown : DOM.acquiringPlayerDropdown;
        if (!dropdownElement) return;

        dropdownElement.innerHTML = ''; // Clear previous suggestions
        if (suggestions.length === 0) {
          dropdownElement.style.display = 'none';
          return;
        }

        suggestions.slice(0, 10).forEach(player => { // Show top 10 suggestions
          const item = document.createElement('div');
          item.className = 'player-dropdown-item'; // Add a class for potential styling
          item.textContent = player.full_name;
          item.addEventListener('click', () => {
            Events.addPlayerToTrade(player, side);
            inputElement.value = ''; // Clear input
            dropdownElement.innerHTML = '';
            dropdownElement.style.display = 'none';
          });
          dropdownElement.appendChild(item);
        });
        dropdownElement.style.display = 'block';
      },
      
      // Show trade evaluation results (placeholder logic remains)
      showTradeResults: () => {
        if (!DOM.tradeResults) return;
        if (STATE.tradingPlayers.length === 0 || STATE.acquiringPlayers.length === 0) {
          DOM.tradeResults.innerHTML = `
            <div class="trade-message trade-warning">
              Please add players to both sides of the trade.
            </div>
          `;
          DOM.tradeResults.style.display = 'block';
          return;
        }
        
        DOM.tradeResults.innerHTML = `
          <div class="trade-result-header">
            <div class="success-badge">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <circle cx="12" cy="12" r="11" fill="#00C851" stroke="none"></circle>
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="white"></path>
              </svg>
              SUCCESS (Placeholder Analysis)
            </div>
          </div>
          <div class="trade-stats-container">
            <div class="trade-team-column">
              <div class="team-header">Your Team Loses</div>
              <div class="player-stat-rows">
                ${STATE.tradingPlayers.map(p => `
                  <div class="player-stat-row">
                    <div class="row-player-photo"><img src="${p.imageUrl}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/36x36?text=NBA'; this.onerror=null;"></div>
                    <div class="row-player-name">${p.name}</div>
                  </div>`).join('')}
              </div>
            </div>
            <div class="trade-team-column">
              <div class="team-header">Your Team Gains</div>
              <div class="player-stat-rows">
                ${STATE.acquiringPlayers.map(p => `
                  <div class="player-stat-row">
                    <div class="row-player-photo"><img src="${p.imageUrl}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/36x36?text=NBA'; this.onerror=null;"></div>
                    <div class="row-player-name">${p.name}</div>
                  </div>`).join('')}
              </div>
            </div>
          </div>
        `;
        DOM.tradeResults.style.display = 'block';
        DOM.tradeResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  
    // ============ EVENT HANDLERS ============
    const Events = {
      init: async () => {
        await DataService.fetchNbaPlayers(); // Load player list

        DOM.tradingSearchInput?.addEventListener('input', (e) => Events.handlePlayerSearch(e, 'trading'));
        DOM.acquiringSearchInput?.addEventListener('input', (e) => Events.handlePlayerSearch(e, 'acquiring'));
        
        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (DOM.tradingPlayerDropdown && !DOM.tradingSearchInput.contains(e.target) && !DOM.tradingPlayerDropdown.contains(e.target)) {
                DOM.tradingPlayerDropdown.style.display = 'none';
            }
            if (DOM.acquiringPlayerDropdown && !DOM.acquiringSearchInput.contains(e.target) && !DOM.acquiringPlayerDropdown.contains(e.target)) {
                DOM.acquiringPlayerDropdown.style.display = 'none';
            }
        });

        DOM.evaluateButton?.addEventListener('click', () => {
          Renderer.showTradeResults();
        });
        
        // Initial render if any players were pre-loaded (e.g. from session, though not implemented here)
        Renderer.updatePlayersList();
      },

      handlePlayerSearch: (event, side) => {
        const searchTerm = event.target.value.toLowerCase();
        const inputElement = event.target;

        if (searchTerm.length < 2) { // Minimum characters to trigger search
          const dropdown = side === 'trading' ? DOM.tradingPlayerDropdown : DOM.acquiringPlayerDropdown;
          if (dropdown) {
            dropdown.innerHTML = '';
            dropdown.style.display = 'none';
          }
          return;
        }

        const filteredPlayers = STATE.allNbaPlayers.filter(player => 
          player.full_name.toLowerCase().includes(searchTerm)
        );
        Renderer.displayAutocompleteSuggestions(filteredPlayers, inputElement, side);
      },

      addPlayerToTrade: (playerDataFromApi, side) => {
        // playerDataFromApi is like {id: NBA_PLAYER_ID, full_name: "Player Name", ...}
        const targetPlayerList = side === 'trading' ? STATE.tradingPlayers : STATE.acquiringPlayers;

        if (targetPlayerList.length >= STATE.maxPlayers) {
          alert(`Maximum ${STATE.maxPlayers} players allowed per side.`);
          return;
        }
        // Check if player already added to that side
        if (targetPlayerList.some(p => p.nba_id === playerDataFromApi.id)) {
            alert(`${playerDataFromApi.full_name} is already on the ${side} list.`);
            return;
        }

        const newPlayer = {
          card_id: Utils.generatePlayerCardId(), // Unique ID for the DOM card
          nba_id: playerDataFromApi.id,          // Actual NBA player ID
          name: playerDataFromApi.full_name,
          imageUrl: `https://cdn.nba.com/headshots/nba/latest/1040x760/${playerDataFromApi.id}.png`
        };

        targetPlayerList.push(newPlayer);
        Renderer.updatePlayersList();
      },

      handleRemovePlayer: (e) => {
        const playerCardId = e.target.getAttribute('data-player-card-id');
        const side = e.target.getAttribute('data-side');
        
        if (side === 'trading') {
          STATE.tradingPlayers = STATE.tradingPlayers.filter(p => p.card_id !== playerCardId);
        } else {
          STATE.acquiringPlayers = STATE.acquiringPlayers.filter(p => p.card_id !== playerCardId);
        }
        Renderer.updatePlayersList();
      }
    };
  
    // ============ INITIALIZATION ============
    const initTradeAnalyzer = () => {
      if (STATE.initialized) return;
      
      // Verify essential DOM elements for this tab are present
      if (!DOM.tradingContainer || !DOM.acquiringContainer || !DOM.tradingSearchInput || !DOM.acquiringSearchInput) {
        // console.warn('Trade analyzer critical DOM elements not found, tab may not be fully rendered or active.');
        return; // Don't initialize if elements are missing
      }
      
      // Update DOM references that might depend on elements being present
      DOM.tradingPlayerDropdown = DOM.tradingSearchInput.nextElementSibling;
      DOM.acquiringPlayerDropdown = DOM.acquiringSearchInput.nextElementSibling;
      
      if (!DOM.tradingPlayerDropdown || !DOM.acquiringPlayerDropdown) {
          // console.warn('Player dropdown elements not found. Autocomplete might not work.');
      }

      console.log('Initializing trade analyzer feature...');
      STATE.initialized = true;
      Events.init(); // Initialize event handlers and fetch data
    };
  
    // Initialize when tab is clicked
    // Ensure this event listener is correctly targeting your tab button
    const tradeTabButton = document.querySelector('[data-target="tab-trade"]');
    if (tradeTabButton) {
      tradeTabButton.addEventListener('click', () => {
        // Re-check DOM elements and initialize if needed, as tab might be dynamically loaded
        DOM.tradingContainer = document.getElementById('tradingPlayersContainer');
        DOM.acquiringContainer = document.getElementById('acquiringPlayersContainer');
        DOM.tradingSearchInput = document.getElementById('tradingPlayerSearch');
        DOM.acquiringSearchInput = document.getElementById('acquiringPlayerSearch');
        DOM.evaluateButton = document.getElementById('evaluateTradeBtn');
        DOM.tradeResults = document.getElementById('tradeResultsContainer');
        initTradeAnalyzer();
      });
    }
    
    // Also run initialization on page load if the tab is already active
    if (tradeTabButton && tradeTabButton.classList.contains('active')) {
      initTradeAnalyzer();
    }
  });