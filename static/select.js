document.addEventListener('DOMContentLoaded', () => {
    const yearSel = document.getElementById('year');
    const leagueSel = document.getElementById('league');
    const teamField = document.getElementById('teamField');
  
    yearSel.addEventListener('change', () => {
      const yr = yearSel.value;
      [...leagueSel.options].forEach(o => {
        if (!o.value) return;               // skip placeholder
        o.hidden = o.dataset.season !== yr;
      });
      leagueSel.selectedIndex = 0;
      teamField.value = "";
    });
  
    leagueSel.addEventListener('change', () => {
      const opt = leagueSel.options[leagueSel.selectedIndex];
      teamField.value = opt.dataset.team;
    });
  });
  