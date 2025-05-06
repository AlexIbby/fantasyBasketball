document.addEventListener('DOMContentLoaded', () => {
  const teamSelector = document.getElementById('team');
  const teamField = document.getElementById('teamField');

  teamSelector.addEventListener('change', () => {
    const selectedOption = teamSelector.options[teamSelector.selectedIndex];
    teamField.value = selectedOption.dataset.team;
  });
});
  