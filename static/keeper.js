/* keeper.js - handles the Draft > Keepers experience */
export function initKeepers() {
  const DOM = {
    tabButton: document.querySelector('.nav-tab[data-target="tab-draft"]'),
    subTabs: document.querySelectorAll('.draft-subtab'),
    panel: document.getElementById('keepers-panel'),
    scoringNote: document.getElementById('keepersScoringNote'),
    seasonSelect: document.getElementById('keepersSeasonSelect'),
    teamSelect: document.getElementById('keepersTeamSelect'),
    exportBtn: document.getElementById('keepersExportBtn'),
    loading: document.getElementById('keepersLoading'),
    error: document.getElementById('keepersError'),
    empty: document.getElementById('keepersEmpty'),
    container: document.getElementById('keepersContainer'),
    fallbackNotice: document.getElementById('keepersFallbackNotice'),
    previousWrapper: document.getElementById('keepersPreviousWrapper'),
    previousContainer: document.getElementById('keepersPreviousContainer'),
    previousEmpty: document.getElementById('keepersPreviousEmpty'),
    previousMeta: document.getElementById('keepersPreviousMeta'),
    orphanNotice: document.getElementById('keepersOrphanNotice')
  };

  if (!DOM.tabButton || !DOM.panel) {
    return;
  }

  const state = {
    loading: false,
    loaded: false,
    selectedTeam: 'ALL',
    data: null,
    previous: null,
    metadata: null,
    teamMap: {},
    previousTeamMap: {},
    userTeamKeys: new Set(),
    userTeamIds: new Set(),
    userTeamNames: new Set(),
    userManagerGuids: new Set()
  };

  DOM.subTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      DOM.subTabs.forEach((other) => other.classList.remove('active'));
      document.querySelectorAll('.draft-panel').forEach((panel) => panel.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.dataset.draftTarget;
      if (targetId) {
        const target = document.getElementById(targetId);
        if (target) {
          target.classList.add('active');
        }
        if (targetId === 'keepers-panel') {
          ensureLoaded();
        }
      }
    });
  });

  DOM.tabButton.addEventListener('click', ensureLoaded);
  if (DOM.tabButton.classList.contains('active')) {
    ensureLoaded();
  }

  if (DOM.teamSelect) {
    DOM.teamSelect.addEventListener('change', () => {
      state.selectedTeam = DOM.teamSelect.value || 'ALL';
      renderKeepers();
    });
  }

  if (DOM.exportBtn) {
    DOM.exportBtn.addEventListener('click', handleExport);
  }

  if (DOM.seasonSelect) {
    DOM.seasonSelect.addEventListener('change', () => {
      // Reserved for future multi-season support.
    });
  }

  async function ensureLoaded() {
    if (state.loaded || state.loading) {
      return;
    }
    await loadKeepers();
  }

  async function loadKeepers() {
    state.loading = true;
    toggleLoading(true);
    showError('');
    try {
      const response = await fetch('/api/draft/keepers');
      const payload = await response.json();
      if (!response.ok) {
        throw new Error((payload && payload.error) || 'Unable to load keeper data.');
      }

      const normalized = normalizePayload(payload);
      state.data = normalized.current;
      state.previous = normalized.previous;
      state.metadata = normalized.metadata;
      state.userTeamKeys = new Set(Array.isArray(state.metadata && state.metadata.user_team_keys)
        ? state.metadata.user_team_keys
            .map((value) => (value == null ? '' : String(value).trim()))
            .filter(Boolean)
        : []);
      state.userTeamIds = new Set(Array.isArray(state.metadata && state.metadata.user_team_ids)
        ? state.metadata.user_team_ids
            .map((value) => (value == null ? '' : String(value).trim().toLowerCase()))
            .filter(Boolean)
        : []);
      state.userTeamNames = new Set(Array.isArray(state.metadata && state.metadata.user_team_names)
        ? state.metadata.user_team_names
            .map((value) => (value == null ? '' : String(value).trim().toLowerCase()))
            .filter(Boolean)
        : []);
      state.userManagerGuids = new Set(Array.isArray(state.metadata && state.metadata.user_manager_guids)
        ? state.metadata.user_manager_guids
            .map((value) => (value == null ? '' : String(value).trim().toLowerCase()))
            .filter(Boolean)
        : []);
      state.loaded = true;
      populateSeasonSelect(state.metadata);
      populateTeamSelect();
      updateScoringNote(state.metadata);
      renderKeepers();
      updateFallbackNotice();
    } catch (error) {
      showError(error.message || 'Unable to load keeper data.');
    } finally {
      state.loading = false;
      toggleLoading(false);
    }
  }

  function normalizePayload(payload) {
    const metadata = normalizeMetadata(payload && payload.metadata);
    const currentBlock = {
      teams: payload && payload.teams,
      keepers_by_team: payload && payload.keepers_by_team,
      orphans: payload && payload.orphans,
      season: metadata.season,
      league_key: metadata.league_key
    };
    const previousBlock = payload && typeof payload.previous_season === 'object' ? payload.previous_season : null;

    return {
      current: normalizeSeasonBlock(currentBlock),
      previous: previousBlock ? normalizeSeasonBlock(previousBlock) : null,
      metadata
    };
  }

  function normalizeMetadata(raw) {
    if (!raw || typeof raw !== 'object') {
      return {};
    }
    const meta = {};
    if (raw.league_key) meta.league_key = String(raw.league_key);
    if (raw.league_name) meta.league_name = String(raw.league_name);
    if (raw.season) meta.season = String(raw.season);
    if (raw.scoring_type) meta.scoring_type = String(raw.scoring_type);
    if (raw.generated_at) meta.generated_at = String(raw.generated_at);
    if (raw.previous_league_key) meta.previous_league_key = String(raw.previous_league_key);
    if (raw.previous_season) meta.previous_season = String(raw.previous_season);
    if (Array.isArray(raw.available_seasons)) {
      meta.available_seasons = raw.available_seasons.map((season) => String(season));
    }
    if (Array.isArray(raw.user_team_keys)) {
      meta.user_team_keys = raw.user_team_keys.map((key) => String(key));
    }
    if (Array.isArray(raw.user_team_ids)) {
      meta.user_team_ids = raw.user_team_ids.map((value) => String(value));
    }
    if (Array.isArray(raw.user_team_names)) {
      meta.user_team_names = raw.user_team_names.map((value) => String(value));
    }
    if (Array.isArray(raw.user_manager_guids)) {
      meta.user_manager_guids = raw.user_manager_guids.map((value) => String(value));
    }
    const currentCount = Number(raw.current_keeper_count);
    meta.current_keeper_count = Number.isFinite(currentCount) ? currentCount : 0;
    const previousCount = Number(raw.previous_keeper_count);
    meta.previous_keeper_count = Number.isFinite(previousCount) ? previousCount : 0;
    meta.fallback_to_previous = Boolean(raw.fallback_to_previous);
    return meta;
  }

  function normalizeSeasonBlock(block) {
    if (!block || typeof block !== 'object') {
      return {
        leagueKey: '',
        season: '',
        teams: [],
        keepersByTeam: {},
        orphans: []
      };
    }

    const teams = Array.isArray(block.teams) ? block.teams.slice() : [];
    const sanitizedTeams = teams
      .map((team) => {
        if (!team || typeof team !== 'object') {
          return null;
        }
        const teamKey = team.team_key ? String(team.team_key).trim() : '';
        if (!teamKey) {
          return null;
        }
        const teamId = team.team_id ? String(team.team_id).trim() : '';
        return {
          team_key: teamKey,
          team_id: teamId,
          team_name: team.team_name ? String(team.team_name).trim() : 'Team',
          manager_name: team.manager_name ? String(team.manager_name).trim() : '',
          manager_guid: team.manager_guid ? String(team.manager_guid).trim() : '',
          is_current_login: Boolean(team.is_current_login)
        };
      })
      .filter(Boolean);
    sanitizedTeams.sort((a, b) => (a.team_name || '').localeCompare(b.team_name || ''));

    const keepersByTeam = {};
    if (block.keepers_by_team && typeof block.keepers_by_team === 'object') {
      Object.entries(block.keepers_by_team).forEach(([teamKey, players]) => {
        if (!Array.isArray(players)) {
          return;
        }
        keepersByTeam[String(teamKey)] = players.map(formatKeeper);
      });
    }

    const orphans = Array.isArray(block.orphans) ? block.orphans.map(formatKeeper) : [];

    return {
      leagueKey: block.league_key ? String(block.league_key) : '',
      season: block.season ? String(block.season) : '',
      teams: sanitizedTeams,
      keepersByTeam,
      orphans
    };
  }

  function formatKeeper(raw) {
    return {
      player_key: raw && raw.player_key ? String(raw.player_key) : '',
      player_id: raw && raw.player_id ? String(raw.player_id) : '',
      name_full: raw && raw.name_full ? String(raw.name_full) : '',
      display_position: raw && raw.display_position ? String(raw.display_position) : '',
      owner_team_key: raw && raw.owner_team_key ? String(raw.owner_team_key) : '',
      badge: raw && raw.badge ? String(raw.badge) : 'Keeper'
    };
  }

  function getAugmentedTeamList(source) {
    if (!source) return [];
    const list = Array.isArray(source.teams) ? source.teams.slice() : [];
    const knownKeys = new Set(list.map((team) => team.team_key));
    Object.keys(source.keepersByTeam || {}).forEach((teamKey) => {
      if (!knownKeys.has(teamKey)) {
        list.push({
          team_key: teamKey,
          team_name: teamKey,
          manager_name: '',
          team_id: '',
          manager_guid: '',
          is_current_login: false
        });
      }
    });
    list.sort((a, b) => (a && a.team_name ? a.team_name : '').localeCompare(b && b.team_name ? b.team_name : ''));
    return list;
  }

  function getTeamId(team) {
    if (!team) return '';
    if (team.team_id) return String(team.team_id).trim().toLowerCase();
    if (team.team_key && typeof team.team_key === 'string' && team.team_key.includes('.t.')) {
      return (team.team_key.split('.t.')[1] || '').trim().toLowerCase();
    }
    return '';
  }

  function isUserTeam(team) {
    if (!team) return false;
    if (team.is_current_login) return true;
    if (team.team_key) {
      const key = String(team.team_key).trim();
      if (key && state.userTeamKeys.has(key)) return true;
    }
    const teamId = getTeamId(team);
    if (teamId && state.userTeamIds.has(teamId)) return true;
    if (team.manager_guid) {
      const guid = String(team.manager_guid).trim().toLowerCase();
      if (guid && state.userManagerGuids.has(guid)) return true;
    }
    if (team.team_name) {
      const name = String(team.team_name).trim().toLowerCase();
      if (name && state.userTeamNames.has(name)) return true;
    }
    return false;
  }

  function populateSeasonSelect(metadata) {
    if (!DOM.seasonSelect) return;
    const select = DOM.seasonSelect;
    select.innerHTML = '';
    const currentSeason = metadata && metadata.season ? String(metadata.season) : '';
    const previousSeason = metadata && metadata.previous_season ? String(metadata.previous_season) : '';

    const options = [];
    if (currentSeason) {
      options.push({ value: currentSeason, label: `Current: ${currentSeason}` });
    } else {
      options.push({ value: '', label: 'Current Season' });
    }
    if (previousSeason) {
      options.push({ value: previousSeason, label: `Last: ${previousSeason}` });
    }

    options.forEach((entry, index) => {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      if (index === 0) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.disabled = true;
  }

  function populateTeamSelect() {
    if (!DOM.teamSelect || !state.data) return;
    const select = DOM.teamSelect;
    select.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = 'ALL';
    defaultOption.textContent = 'All Teams';
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    state.teamMap = {};
    const augmented = getAugmentedTeamList(state.data);
    augmented.forEach((team) => {
      if (!team || !team.team_key) return;
      state.teamMap[team.team_key] = team;
      const option = document.createElement('option');
      option.value = team.team_key;
      const baseText = team.manager_name ? `${team.team_name} -- ${team.manager_name}` : team.team_name;
      option.textContent = isUserTeam(team) ? `${baseText} (You)` : baseText;
      select.appendChild(option);
    });

    state.selectedTeam = 'ALL';
    select.value = 'ALL';
  }

  function renderKeepers() {
    if (!DOM.container || !state.data) return;

    showError('');
    renderOrphanNotice(state.data.orphans);

    const container = DOM.container;
    container.innerHTML = '';

    const selectedKey = state.selectedTeam || 'ALL';

    const userTeams = getUserTeamsForRender(state.data, selectedKey);
    const userSection = buildUserSection(userTeams, selectedKey);

    const leagueTeams = getLeagueTeamsForRender(selectedKey, userTeams.map((team) => team.team_key));
    const leagueSection = buildLeagueAccordion(leagueTeams, selectedKey);

    const totalKeepers = (userSection ? userSection.keeperCount : 0)
      + (leagueSection ? leagueSection.keeperCount : 0);

    if (userSection && userSection.element) {
      container.appendChild(userSection.element);
    }
    if (leagueSection && leagueSection.element) {
      container.appendChild(leagueSection.element);
    }

    if (!userSection && (!leagueSection || leagueSection.teamCount === 0)) {
      const noTeamsMessage = selectedKey === 'ALL'
        ? 'No teams available.'
        : 'Unable to find the selected team.';
      showEmpty(true, noTeamsMessage);
      container.hidden = true;
      if (DOM.exportBtn) {
        DOM.exportBtn.disabled = true;
      }
      updateFallbackNotice();
      renderPreviousKeepers();
      return;
    }

    if (selectedKey === 'ALL' && totalKeepers === 0) {
      showEmpty(true, 'No approved keepers for this league/season.');
      container.hidden = true;
      if (DOM.exportBtn) {
        DOM.exportBtn.disabled = true;
      }
      updateFallbackNotice();
      renderPreviousKeepers();
      return;
    }

    showEmpty(false);
    container.hidden = false;
    if (DOM.exportBtn) {
      if (selectedKey === 'ALL') {
        DOM.exportBtn.disabled = totalKeepers === 0;
      } else {
        const selectedKeepers = userSection && userSection.matchesSelected
          ? userSection.keeperCount
          : leagueSection
            ? leagueSection.selectedKeepers
            : 0;
        DOM.exportBtn.disabled = selectedKeepers === 0;
      }
    }
    updateFallbackNotice();
    renderPreviousKeepers();
  }

  function getUserTeamsForRender(source, selectedKey) {
    if (!source || !Array.isArray(source.teams)) return [];
    const allUserTeams = source.teams.filter((team) => isUserTeam(team));
    if (!allUserTeams.length) {
      return [];
    }
    if (!selectedKey || selectedKey === 'ALL') {
      return allUserTeams;
    }
    return allUserTeams.filter((team) => team.team_key === selectedKey);
  }

  function getLeagueTeamsForRender(selectedKey, userTeamKeys) {
    const set = new Set(userTeamKeys || []);
    const augmented = getAugmentedTeamList(state.data);
    const filtered = augmented.filter((team) => team && !set.has(team.team_key));
    if (selectedKey === 'ALL') {
      return filtered;
    }
    return filtered.filter((team) => team.team_key === selectedKey);
  }

  function renderPreviousKeepers() {
    if (!DOM.previousWrapper) return;

    const previous = state.previous;
    const hasPreviousData = Boolean(
      previous && (
        previous.season ||
        previous.leagueKey ||
        Object.keys(previous.keepersByTeam || {}).length ||
        (previous.orphans || []).length
      )
    );

    if (!hasPreviousData) {
      DOM.previousWrapper.hidden = true;
      if (DOM.previousContainer) {
        DOM.previousContainer.innerHTML = '';
        DOM.previousContainer.hidden = true;
      }
      if (DOM.previousMeta) {
        DOM.previousMeta.textContent = '';
      }
      if (DOM.previousEmpty) {
        DOM.previousEmpty.hidden = true;
      }
      state.previousTeamMap = {};
      return;
    }

    const container = DOM.previousContainer;
    if (!container) {
      return;
    }

    DOM.previousWrapper.hidden = false;
    container.innerHTML = '';
    toggleLoading(false);

    let teams = getAugmentedTeamList(previous);
    if ((state.selectedTeam || 'ALL') === 'ALL') {
      teams = teams.filter((team) => !isUserTeam(team));
    }
    state.previousTeamMap = {};
    teams.forEach((team) => {
      if (team && team.team_key) {
        state.previousTeamMap[team.team_key] = team;
      }
    });

    const selectedKey = state.selectedTeam || 'ALL';
    let teamsToRender = teams;
    let filterMatched = true;
    if (selectedKey !== 'ALL') {
      const currentTeam = state.teamMap[selectedKey];
      if (currentTeam) {
        const matches = teams.filter((team) => {
          if (!team) return false;
          if (team.team_key === selectedKey) return true;
          const sameName = currentTeam.team_name && team.team_name && currentTeam.team_name === team.team_name;
          const sameManager = currentTeam.manager_name && team.manager_name && currentTeam.manager_name === team.manager_name;
          return sameName || sameManager;
        });
        teamsToRender = matches;
        filterMatched = matches.length > 0;
      } else {
        teamsToRender = [];
        filterMatched = false;
      }
    }

    let totalPreviousKeepers = 0;
    const badgeLabel = formatPreviousBadge(previous.season);

    const sections = [];
    teamsToRender.forEach((team) => {
      if (!team) return;
      const keepers = previous.keepersByTeam[team.team_key] || [];
      totalPreviousKeepers += keepers.length;
      const highlight = selectedKey !== 'ALL' && team.team_key === selectedKey;
      sections.push(buildTeamSection(team, keepers, {
        badgeLabel,
        wrapperClass: 'keepers-team-previous',
        highlight
      }));
    });

    container.innerHTML = '';

    if (sections.length) {
      const accordion = document.createElement('div');
      accordion.className = 'keepers-accordion keepers-accordion--previous';

      const item = document.createElement('div');
      item.className = 'keepers-accordion-item keepers-accordion-item--previous';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'keepers-accordion-header';
      const expandByDefault = selectedKey !== 'ALL' && sections.length === 1;
      button.setAttribute('aria-expanded', String(expandByDefault));

      const label = document.createElement('div');
      label.className = 'keepers-accordion-label';
      const name = document.createElement('span');
      name.className = 'keepers-accordion-name';
      if (selectedKey === 'ALL') {
        name.textContent = 'All Teams';
      } else {
        const currentTeam = state.teamMap[selectedKey];
        name.textContent = currentTeam && currentTeam.team_name ? currentTeam.team_name : 'Selected Team';
      }
      label.appendChild(name);

      const count = document.createElement('span');
      count.className = 'keepers-accordion-count';
      count.textContent = `${totalPreviousKeepers} keeper${totalPreviousKeepers === 1 ? '' : 's'}`;

      button.appendChild(label);
      button.appendChild(count);

      const panel = document.createElement('div');
      panel.className = 'keepers-accordion-panel';
      panel.hidden = !expandByDefault;
      sections.forEach((section) => {
        panel.appendChild(section);
      });

      button.addEventListener('click', () => {
        const isOpen = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!isOpen));
        panel.hidden = isOpen;
      });

      item.appendChild(button);
      item.appendChild(panel);
      accordion.appendChild(item);
      container.appendChild(accordion);
    }

    if (DOM.previousMeta) {
      const parts = [];
      if (previous.season) {
        parts.push(`Season ${previous.season}`);
      }
      if (state.metadata && typeof state.metadata.previous_keeper_count === 'number') {
        const count = state.metadata.previous_keeper_count;
        parts.push(`${count} keeper${count === 1 ? '' : 's'} recorded`);
      }
      if (selectedKey !== 'ALL' && filterMatched) {
        const currentTeam = state.teamMap[selectedKey];
        const label = currentTeam && currentTeam.team_name ? currentTeam.team_name : 'Selected team';
        parts.push(`Matching ${label}`);
      }
      DOM.previousMeta.textContent = parts.join(' | ');
    }

    if (!totalPreviousKeepers) {
      if (DOM.previousEmpty) {
        const filterApplied = selectedKey !== 'ALL';
        DOM.previousEmpty.hidden = false;
        if (!filterApplied && (state.metadata && state.metadata.previous_keeper_count > 0)) {
          DOM.previousEmpty.textContent = 'Only your team has recorded keepers for last season.';
        } else {
          DOM.previousEmpty.textContent = filterApplied && !filterMatched
            ? 'No last season keepers matched the selected team.'
            : 'No keepers recorded for last season.';
        }
      }
      container.hidden = true;
      toggleLoading(false);
    } else {
      if (DOM.previousEmpty) {
        DOM.previousEmpty.hidden = true;
      }
      container.hidden = false;
    }
    toggleLoading(false);
  }

  function formatPreviousBadge(season) {
    if (season) {
      return `${season} Keeper`;
    }
    return 'Previous Keeper';
  }

  function updateFallbackNotice() {
    if (!DOM.fallbackNotice) return;
    if (!state.metadata || !state.metadata.fallback_to_previous) {
      DOM.fallbackNotice.hidden = true;
      DOM.fallbackNotice.textContent = '';
      return;
    }
    const currentSeason = state.metadata && state.metadata.season ? state.metadata.season : 'the current season';
    const previousSeason = state.metadata && state.metadata.previous_season ? state.metadata.previous_season : 'last season';
    DOM.fallbackNotice.hidden = false;
    DOM.fallbackNotice.textContent = `No approved keepers yet for season ${currentSeason}. Showing ${previousSeason} keepers below.`;
  }

  function buildTeamSection(team, keepers, options = {}) {
    const wrapper = document.createElement('section');
    wrapper.className = 'keepers-team';
    if (options.wrapperClass) {
      wrapper.classList.add(options.wrapperClass);
    }
    if (options.highlight) {
      wrapper.classList.add('keepers-team-highlight');
    }

    if (options.leadLabel) {
      const lead = document.createElement('div');
      lead.className = 'keepers-team-lead';
      lead.textContent = options.leadLabel;
      wrapper.appendChild(lead);
    }

    const keeperCount = keepers.length;

    if (!options.hideHeader) {
      const header = document.createElement('div');
      header.className = 'keepers-team-header';

      const title = document.createElement('div');
      const nameHeading = document.createElement('h3');
      nameHeading.className = 'keepers-team-name';
      nameHeading.textContent = team && team.team_name ? team.team_name : 'Team';
      title.appendChild(nameHeading);

      if (options.headerSubtitle) {
        const note = document.createElement('p');
        note.className = 'keepers-header-note';
        note.textContent = options.headerSubtitle;
        title.appendChild(note);
      }

      const countBadge = document.createElement('span');
      countBadge.className = 'keepers-count';
      countBadge.textContent = `${keeperCount} keeper${keeperCount === 1 ? '' : 's'}`;

      header.appendChild(title);
      header.appendChild(countBadge);
      wrapper.appendChild(header);
    }

    if (!keeperCount) {
      const empty = document.createElement('div');
      empty.className = 'keepers-empty-team';
      empty.textContent = options.emptyMessage || 'No keepers assigned to this team yet.';
      wrapper.appendChild(empty);
      return wrapper;
    }

    const tableContainer = document.createElement('div');
    tableContainer.className = 'keepers-table-container';

    const table = document.createElement('table');
    table.className = 'keepers-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Player', 'Positions'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const sortedKeepers = keepers.slice().sort((a, b) => (a.name_full || '').localeCompare(b.name_full || ''));
    sortedKeepers.forEach((player) => {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.className = 'keeper-name';
      const badge = document.createElement('span');
      badge.className = 'keeper-badge';
      badge.textContent = options.badgeLabel || player.badge || 'Keeper';
      nameCell.appendChild(badge);
      const nameLabel = document.createElement('span');
      nameLabel.textContent = player.name_full || 'Unnamed Player';
      nameCell.appendChild(nameLabel);
      row.appendChild(nameCell);

      const posCell = document.createElement('td');
      posCell.textContent = player.display_position || '--';
      row.appendChild(posCell);

      const tooltipParts = [];
      if (player.player_key) {
        tooltipParts.push(`Key: ${player.player_key}`);
      }
      if (player.player_id) {
        tooltipParts.push(`ID: ${player.player_id}`);
      }
      if (tooltipParts.length) {
        row.title = tooltipParts.join(' • ');
      }

      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    wrapper.appendChild(tableContainer);

    return wrapper;
  }

  function buildUserSection(userTeams, selectedKey) {
    if (!Array.isArray(userTeams) || !userTeams.length) {
      return null;
    }

    const wrapper = document.createElement('section');
    wrapper.className = 'keepers-user-section';

    const header = document.createElement('div');
    header.className = 'keepers-user-header';
    const heading = document.createElement('h2');
    heading.textContent = 'Your Keepers';
    header.appendChild(heading);

    const sub = document.createElement('p');
    sub.className = 'keepers-user-subtitle';
    if (selectedKey === 'ALL') {
      sub.textContent = 'Focused view of your roster across approved keeper seasons.';
    } else {
      sub.textContent = 'Showing your selected team.';
    }
    header.appendChild(sub);
    wrapper.appendChild(header);

    const cardGrid = document.createElement('div');
    cardGrid.className = 'keepers-user-grid';

    const entries = [];
    const currentSeason = state.metadata && state.metadata.season;

    userTeams.forEach((team) => {
      const keepers = state.data.keepersByTeam[team.team_key] || [];
      entries.push({
        team,
        keepers,
        seasonLabel: currentSeason ? `Season ${currentSeason}` : 'Current Season',
        leadLabel: selectedKey !== 'ALL' ? null : 'Current Season',
        highlight: true
      });
    });

    const previousEntries = [];
    if (state.previous && state.previous.teams) {
      const previousUserTeams = state.previous.teams.filter((team) => isUserTeam(team));
      const filteredPrevious = selectedKey === 'ALL'
        ? previousUserTeams
        : previousUserTeams.filter((team) => team.team_key === selectedKey || state.userTeamIds.has(getTeamId(team)));
      const badgeLabel = formatPreviousBadge(state.previous.season || state.metadata && state.metadata.previous_season);
      filteredPrevious.forEach((team) => {
        const keepers = state.previous.keepersByTeam[team.team_key] || [];
        previousEntries.push({
          team,
          keepers,
          seasonLabel: state.previous.season ? `Season ${state.previous.season}` : 'Previous Season',
          leadLabel: selectedKey !== 'ALL' ? null : 'Previous Season',
          badgeOverride: badgeLabel
        });
      });
    }

    const keeperCount = entries.reduce((sum, entry) => sum + entry.keepers.length, 0)
      + previousEntries.reduce((sum, entry) => sum + entry.keepers.length, 0);

    if (!keeperCount) {
      const notice = document.createElement('div');
      notice.className = 'keepers-user-empty';
      notice.textContent = 'No keepers assigned to your team yet.';
      cardGrid.appendChild(notice);
      wrapper.appendChild(cardGrid);
      return {
        element: wrapper,
        keeperCount: 0,
        matchesSelected: true
      };
    }

    const renderEntry = (entry) => {
      const cardWrapper = document.createElement('div');
      cardWrapper.className = 'keepers-user-card';
      if (entry.leadLabel) {
        const chip = document.createElement('span');
        chip.className = 'keepers-user-chip';
        chip.textContent = entry.leadLabel;
        cardWrapper.appendChild(chip);
      }
      const section = buildTeamSection(entry.team, entry.keepers, {
        wrapperClass: 'keepers-team-user',
        highlight: true,
        headerSubtitle: entry.seasonLabel,
        badgeLabel: entry.badgeOverride || undefined
      });
      cardWrapper.appendChild(section);
      cardGrid.appendChild(cardWrapper);
    };

    entries.forEach(renderEntry);
    previousEntries.forEach(renderEntry);

    wrapper.appendChild(cardGrid);

    return {
      element: wrapper,
      keeperCount,
      matchesSelected: Boolean(selectedKey === 'ALL' || (userTeams.length === 1 && userTeams[0].team_key === selectedKey))
    };
  }

  function buildLeagueAccordion(teams, selectedKey) {
    if (!Array.isArray(teams) || !teams.length) {
      return null;
    }

    const wrapper = document.createElement('section');
    wrapper.className = 'keepers-league-section';

    const header = document.createElement('div');
    header.className = 'keepers-league-header';
    const heading = document.createElement('h2');
    heading.textContent = selectedKey === 'ALL' ? 'League Keepers' : 'Team Keepers';
    header.appendChild(heading);
    const intro = document.createElement('p');
    intro.className = 'keepers-league-subtitle';
    intro.textContent = selectedKey === 'ALL'
      ? 'Collapse or expand the league to review each roster.'
      : 'Collapse or expand to review keepers for this selection.';
    header.appendChild(intro);
    wrapper.appendChild(header);

    const accordion = document.createElement('div');
    accordion.className = 'keepers-accordion keepers-accordion--league';

    const item = document.createElement('div');
    item.className = 'keepers-accordion-item keepers-accordion-item--league';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'keepers-accordion-header';

    const isAllTeams = selectedKey === 'ALL';
    const defaultExpanded = !isAllTeams && teams.length === 1;
    button.setAttribute('aria-expanded', String(defaultExpanded));

    const label = document.createElement('div');
    label.className = 'keepers-accordion-label';
    const name = document.createElement('span');
    name.className = 'keepers-accordion-name';
    const selectedTeam = !isAllTeams && state.teamMap ? state.teamMap[selectedKey] : null;
    name.textContent = isAllTeams
      ? 'All Teams'
      : selectedTeam && selectedTeam.team_name
        ? selectedTeam.team_name
        : 'Selected Team';
    label.appendChild(name);

    const count = document.createElement('span');
    count.className = 'keepers-accordion-count';

    let keeperCount = 0;
    let selectedKeepers = 0;

    teams.forEach((team) => {
      const keepers = state.data.keepersByTeam[team.team_key] || [];
      keeperCount += keepers.length;
      if (!isAllTeams && team.team_key === selectedKey) {
        selectedKeepers = keepers.length;
      }
    });

    const totalLabel = `${keeperCount} keeper${keeperCount === 1 ? '' : 's'}`;
    count.textContent = totalLabel;

    button.appendChild(label);
    button.appendChild(count);

    const panel = document.createElement('div');
    panel.className = 'keepers-accordion-panel';
    panel.hidden = !defaultExpanded;

    teams.forEach((team) => {
      const keepers = state.data.keepersByTeam[team.team_key] || [];
      const highlight = !isAllTeams && team.team_key === selectedKey;
      const section = buildTeamSection(team, keepers, {
        wrapperClass: 'keepers-team-league',
        emptyMessage: 'No keepers assigned to this team yet.',
        highlight
      });
      panel.appendChild(section);
    });

    button.addEventListener('click', () => {
      const isOpen = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!isOpen));
      panel.hidden = isOpen;
    });

    item.appendChild(button);
    item.appendChild(panel);
    accordion.appendChild(item);
    wrapper.appendChild(accordion);

    return {
      element: wrapper,
      keeperCount,
      teamCount: teams.length,
      selectedKeepers: isAllTeams ? keeperCount : selectedKeepers
    };
  }

  function renderOrphanNotice(orphans) {
    if (!DOM.orphanNotice) return;
    if (!Array.isArray(orphans) || !orphans.length) {
      DOM.orphanNotice.hidden = true;
      DOM.orphanNotice.textContent = '';
      return;
    }
    const count = orphans.length;
    DOM.orphanNotice.hidden = false;
    DOM.orphanNotice.textContent = `${count} keeper ${count === 1 ? 'entry was' : 'entries were'} missing a team assignment and are not shown.`;
  }

  function toggleLoading(isLoading) {
    if (!DOM.loading) return;
    DOM.loading.hidden = !isLoading;
  }

  function showError(message) {
    if (!DOM.error) return;
    if (!message) {
      DOM.error.hidden = true;
      DOM.error.textContent = '';
      return;
    }
    DOM.error.hidden = false;
    DOM.error.textContent = message;
    DOM.container.hidden = true;
    if (DOM.previousWrapper) {
      DOM.previousWrapper.hidden = true;
    }
    if (DOM.fallbackNotice) {
      DOM.fallbackNotice.hidden = true;
      DOM.fallbackNotice.textContent = '';
    }
    showEmpty(false);
    if (DOM.exportBtn) {
      DOM.exportBtn.disabled = true;
    }
  }

  function showEmpty(isEmpty, message) {
    if (!DOM.empty) return;
    if (!isEmpty) {
      DOM.empty.hidden = true;
      DOM.empty.textContent = 'No approved keepers for this league/season.';
      return;
    }
    DOM.empty.hidden = false;
    DOM.empty.textContent = message || 'No approved keepers for this league/season.';
  }

  function updateScoringNote(metadata) {
    if (!DOM.scoringNote) return;
    DOM.scoringNote.textContent = '';
    if (!metadata) return;

    const hasSeason = Boolean(metadata.season);
    const scoringLabel = metadata.scoring_type ? formatScoringLabel(metadata.scoring_type) : '';
    const isHeadToHead = metadata.scoring_type && String(metadata.scoring_type).toLowerCase() === 'head';

    if (hasSeason) {
      const seasonNote = document.createElement('span');
      seasonNote.textContent = `Showing keepers for season ${metadata.season}.`;
      DOM.scoringNote.appendChild(seasonNote);
    }

    if (metadata.scoring_type) {
      if (!isHeadToHead) {
        if (hasSeason) {
          DOM.scoringNote.appendChild(document.createElement('br'));
        }
        const strong = document.createElement('strong');
        strong.textContent = 'Note: ';
        DOM.scoringNote.appendChild(strong);
        const span = document.createElement('span');
        span.textContent = `Feature available, but your league scoring is ${scoringLabel}.`;
        DOM.scoringNote.appendChild(span);
      } else if (!hasSeason) {
        DOM.scoringNote.textContent = `Scoring format: ${scoringLabel}.`;
      }
    }
  }

  function formatScoringLabel(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'head') return 'Head-to-Head (categories)';
    if (normalized === 'points') return 'Points';
    if (normalized === 'rot') return 'Rotisserie';
    return value || 'Unknown';
  }

  function handleExport() {
    if (!state.data || !DOM.exportBtn || DOM.exportBtn.disabled) return;
    const rows = collectExportRows();
    if (!rows.length) return;

    const header = ['Team', 'Manager', 'Player', 'Positions', 'Player Key', 'Player ID'];
    const csvLines = [header, ...rows].map((line) => line.map(formatCsvCell).join(','));
    const csvContent = csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const seasonSuffix = state.data.metadata && state.data.metadata.season ? `_${state.data.metadata.season}` : '';
    link.href = window.URL.createObjectURL(blob);
    link.download = `keepers${seasonSuffix}`.replace(/\s+/g, '_') + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
  }

  function collectExportRows() {
    if (!state.data) return [];
    const rows = [];
    const selectedKey = state.selectedTeam || 'ALL';
    const teams = selectedKey === 'ALL' ? getAugmentedTeamList(state.data) : [state.teamMap[selectedKey]].filter(Boolean);

    teams.forEach((team) => {
      const keepers = state.data.keepersByTeam[team.team_key] || [];
      keepers.forEach((player) => {
        rows.push([
          team.team_name || '',
          team.manager_name || '',
          player.name_full || '',
          player.display_position || '',
          player.player_key || '',
          player.player_id || ''
        ]);
      });
    });

    return rows;
  }

  function formatCsvCell(value) {
    const text = value == null ? '' : String(value);
    if (/[",\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }
}
