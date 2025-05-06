/* ───── trade_analyzer.js - Fantasy Basketball Trade Analyzer ───── */
document.addEventListener('DOMContentLoaded', () => {
    // ============ DOM REFERENCES ============
    const DOM = {
      tradingContainer: document.getElementById('tradingPlayersContainer'),
      acquiringContainer: document.getElementById('acquiringPlayersContainer'),
      tradingSearchInput: document.getElementById('tradingPlayerSearch'),
      acquiringSearchInput: document.getElementById('acquiringPlayerSearch'),
      evaluateButton: document.getElementById('evaluateTradeBtn'),
      tradeResults: document.getElementById('tradeResultsContainer')
    };
  
    // ============ STATE ============
    const STATE = {
      tradingPlayers: [],
      acquiringPlayers: [],
      maxPlayers: 4,
      initialized: false
    };
  
    // ============ UTILITIES ============
    const Utils = {
      // Generate a unique ID for each player
      generatePlayerId: () => {
        return Math.random().toString(36).substring(2, 15);
      },
      
      // Create a placeholder player to display
      createPlaceholderPlayer: (side) => {
        // Sample player data for placeholders
        const placeholders = [
          {
            name: "Jrue Holiday",
            position: "PG",
            team: "Milwaukee Bucks",
            imageUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/3995.png&w=350&h=254"
          },
          {
            name: "Rudy Gobert",
            position: "C",
            team: "Utah Jazz",
            imageUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/3032976.png&w=350&h=254"
          },
          {
            name: "Deandre Ayton",
            position: "C",
            team: "Phoenix Suns",
            imageUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/4278129.png&w=350&h=254"
          },
          {
            name: "LeBron James",
            position: "SF",
            team: "Los Angeles Lakers",
            imageUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/1966.png&w=350&h=254"
          }
        ];
        
        // Select different players for trading vs acquiring sides
        const idx = side === 'trading' ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2) + 2;
        
        return {
          id: Utils.generatePlayerId(),
          name: placeholders[idx].name,
          position: placeholders[idx].position,
          team: placeholders[idx].team,
          imageUrl: placeholders[idx].imageUrl
        };
      },
      
      // Simulate search results (will be replaced with actual API call later)
      simulateSearch: (query) => {
        // This is just a placeholder for now
        console.log(`Searching for: ${query}`);
        // In a real implementation, this would call an API to search for players
      }
    };
  
    // ============ RENDERING ============
    const Renderer = {
      // Render a player card
      renderPlayerCard: (player, side) => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.setAttribute('data-player-id', player.id);
        
        card.innerHTML = `
          <div class="player-photo">
            <img src="${player.imageUrl}" alt="${player.name}">
          </div>
          <div class="player-info">
            <div class="player-name">${player.name} <span class="player-position">${player.position}</span></div>
            <div class="player-team">${player.team}</div>
          </div>
          <button class="remove-player" data-player-id="${player.id}" data-side="${side}">×</button>
        `;
        
        return card;
      },
      
      // Update the UI with current players
      updatePlayersList: () => {
        // Clear containers
        DOM.tradingContainer.innerHTML = '';
        DOM.acquiringContainer.innerHTML = '';
        
        // Render trading players
        STATE.tradingPlayers.forEach(player => {
          const card = Renderer.renderPlayerCard(player, 'trading');
          DOM.tradingContainer.appendChild(card);
        });
        
        // Render acquiring players
        STATE.acquiringPlayers.forEach(player => {
          const card = Renderer.renderPlayerCard(player, 'acquiring');
          DOM.acquiringContainer.appendChild(card);
        });
        
        // Add event listeners to remove buttons
        document.querySelectorAll('.remove-player').forEach(button => {
          button.addEventListener('click', (e) => {
            const playerId = e.target.getAttribute('data-player-id');
            const side = e.target.getAttribute('data-side');
            
            if (side === 'trading') {
              STATE.tradingPlayers = STATE.tradingPlayers.filter(p => p.id !== playerId);
            } else {
              STATE.acquiringPlayers = STATE.acquiringPlayers.filter(p => p.id !== playerId);
            }
            
            Renderer.updatePlayersList();
          });
        });
      },
      
      // Show trade evaluation results (placeholder for now)
      showTradeResults: () => {
        if (STATE.tradingPlayers.length === 0 || STATE.acquiringPlayers.length === 0) {
          DOM.tradeResults.innerHTML = `
            <div class="trade-message trade-warning">
              Please add players to both sides of the trade.
            </div>
          `;
          DOM.tradeResults.style.display = 'block';
          return;
        }
        
        // Sample result UI (would be replaced with actual analysis)
        DOM.tradeResults.innerHTML = `
          <div class="trade-result-header">
            <div class="success-badge">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <circle cx="12" cy="12" r="11" fill="#00C851" stroke="none"></circle>
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="white"></path>
              </svg>
              SUCCESS
            </div>
          </div>
          <div class="trade-stats-container">
            <div class="trade-team-column">
              <div class="team-header">Your Team</div>
              <div class="stat-change">No change in projected wins</div>
              <div class="player-stat-rows">
                ${STATE.tradingPlayers.map(p => `
                  <div class="player-stat-row">
                    <div class="row-player-photo">
                      <img src="${p.imageUrl}" alt="${p.name}">
                    </div>
                    <div class="row-player-name">${p.name}</div>
                    <div class="row-player-value">$18.5M<br><span>4yrs</span></div>
                  </div>
                `).join('')}
              </div>
            </div>
            
            <div class="trade-team-column">
              <div class="team-header">Opponent's Team</div>
              <div class="stat-change positive-change">+15 increase in projected wins</div>
              <div class="player-stat-rows">
                ${STATE.acquiringPlayers.map(p => `
                  <div class="player-stat-row">
                    <div class="row-player-photo">
                      <img src="${p.imageUrl}" alt="${p.name}">
                    </div>
                    <div class="row-player-name">${p.name}</div>
                    <div class="row-player-value">$26.0M<br><span>3yrs</span></div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
        
        DOM.tradeResults.style.display = 'block';
        
        // Scroll to results
        DOM.tradeResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  
    // ============ EVENT HANDLERS ============
    const Events = {
      // Initialize event listeners
      init: () => {
        // Add placeholder players by default
        Events.addPlaceholderPlayers();
        
        // Handle search input changes
        DOM.tradingSearchInput?.addEventListener('input', (e) => {
          Utils.simulateSearch(e.target.value);
        });
        
        DOM.acquiringSearchInput?.addEventListener('input', (e) => {
          Utils.simulateSearch(e.target.value);
        });
        
        // Handle trade evaluation button click
        DOM.evaluateButton?.addEventListener('click', () => {
          Renderer.showTradeResults();
        });
        
        // Add player on Enter key in search
        DOM.tradingSearchInput?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.value.trim() !== '') {
            if (STATE.tradingPlayers.length < STATE.maxPlayers) {
              // This would be replaced with actual search results
              const player = Utils.createPlaceholderPlayer('trading');
              STATE.tradingPlayers.push(player);
              Renderer.updatePlayersList();
              e.target.value = '';
            }
          }
        });
        
        DOM.acquiringSearchInput?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.value.trim() !== '') {
            if (STATE.acquiringPlayers.length < STATE.maxPlayers) {
              // This would be replaced with actual search results
              const player = Utils.createPlaceholderPlayer('acquiring');
              STATE.acquiringPlayers.push(player);
              Renderer.updatePlayersList();
              e.target.value = '';
            }
          }
        });
      },
      
      // Add placeholder players for UI demo
      addPlaceholderPlayers: () => {
        // Add two trading players
        STATE.tradingPlayers = [
          Utils.createPlaceholderPlayer('trading'),
          Utils.createPlaceholderPlayer('trading')
        ];
        
        // Add two acquiring players
        STATE.acquiringPlayers = [
          Utils.createPlaceholderPlayer('acquiring'),
          Utils.createPlaceholderPlayer('acquiring')
        ];
        
        Renderer.updatePlayersList();
      }
    };
  
    // ============ INITIALIZATION ============
    const initTradeAnalyzer = () => {
      // Skip if already initialized
      if (STATE.initialized) return;
      
      // Check if we have the containers
      if (!DOM.tradingContainer || !DOM.acquiringContainer) {
        console.warn('Trade analyzer containers not found, tab may not be active');
        return;
      }
      
      console.log('Initializing trade analyzer');
      STATE.initialized = true;
      
      // Initialize event handlers
      Events.init();
    };
  
    // Initialize when tab is clicked
    document.querySelector('[data-target="tab-trade"]')?.addEventListener('click', () => {
      initTradeAnalyzer();
    });
    
    // Also run initialization on page load if the tab is active
    if (document.querySelector('[data-target="tab-trade"].active')) {
      initTradeAnalyzer();
    }
  });