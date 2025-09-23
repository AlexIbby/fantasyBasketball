/* draft.js - handles the Draft > Keepers experience */
document.addEventListener('DOMContentLoaded', () => {
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
    previousTeamMap: {}
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
        const teamKey = team.team_key ? String(team.team_key) : '';
        if (!teamKey) {
          return null;
        }
        return {
          team_key: teamKey,
          team_name: team.team_name ? String(team.team_name) : 'Team',
          manager_name: team.manager_name ? String(team.manager_name) : ''
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
          manager_name: ''
        });
      }
    });
    list.sort((a, b) => (a && a.team_name ? a.team_name : '').localeCompare(b && b.team_name ? b.team_name : ''));
    return list;
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
      option.textContent = team.manager_name ? `${team.team_name} -- ${team.manager_name}` : team.team_name;
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
    const teamsToRender = selectedKey === 'ALL'
      ? getAugmentedTeamList(state.data)
      : [state.teamMap[selectedKey]].filter(Boolean);

    if (!teamsToRender.length) {
      showEmpty(true, 'No teams available.');
      container.hidden = true;
      if (DOM.exportBtn) {
        DOM.exportBtn.disabled = true;
      }
      updateFallbackNotice();
      renderPreviousKeepers();
      return;
    }

    let totalKeepers = 0;

    teamsToRender.forEach((team) => {
      const keepers = state.data.keepersByTeam[team.team_key] || [];
      totalKeepers += keepers.length;
      container.appendChild(buildTeamSection(team, keepers));
    });

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
      DOM.exportBtn.disabled = totalKeepers === 0;
    }
    updateFallbackNotice();
    renderPreviousKeepers();
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

    const teams = getAugmentedTeamList(previous);
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
    teamsToRender.forEach((team) => {
      if (!team) return;
      const keepers = previous.keepersByTeam[team.team_key] || [];
      totalPreviousKeepers += keepers.length;
      container.appendChild(buildTeamSection(team, keepers, {
        badgeLabel,
        wrapperClass: 'keepers-team-previous'
      }));
    });

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
        DOM.previousEmpty.textContent = filterApplied && !filterMatched
          ? 'No last season keepers matched the selected team.'
          : 'No keepers recorded for last season.';
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

    const header = document.createElement('div');
    header.className = 'keepers-team-header';

    const title = document.createElement('div');
    const nameHeading = document.createElement('h3');
    nameHeading.className = 'keepers-team-name';
    nameHeading.textContent = team && team.team_name ? team.team_name : 'Team';
    title.appendChild(nameHeading);

    if (team && team.manager_name) {
      const manager = document.createElement('p');
      manager.className = 'keepers-manager';
      manager.textContent = `Manager: ${team.manager_name}`;
      title.appendChild(manager);
    }

    const keeperCount = keepers.length;
    const countBadge = document.createElement('span');
    countBadge.className = 'keepers-count';
    countBadge.textContent = `${keeperCount} keeper${keeperCount === 1 ? '' : 's'}`;

    header.appendChild(title);
    header.appendChild(countBadge);
    wrapper.appendChild(header);

    if (!keeperCount) {
      const empty = document.createElement('div');
      empty.className = 'keepers-empty-team';
      empty.textContent = 'No keepers assigned to this team yet.';
      wrapper.appendChild(empty);
      return wrapper;
    }

    const tableContainer = document.createElement('div');
    tableContainer.className = 'keepers-table-container';

    const table = document.createElement('table');
    table.className = 'keepers-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Player', 'Positions', 'Player Key', 'Player ID'].forEach((label) => {
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

      const keyCell = document.createElement('td');
      keyCell.textContent = player.player_key || '--';
      row.appendChild(keyCell);

      const idCell = document.createElement('td');
      idCell.textContent = player.player_id || '--';
      row.appendChild(idCell);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    wrapper.appendChild(tableContainer);

    return wrapper;
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
});
