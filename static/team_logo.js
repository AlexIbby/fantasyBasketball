document.addEventListener('DOMContentLoaded', () => {
    const teamLogo = document.getElementById('teamLogo');
    const placeholder = document.querySelector('.team-logo-placeholder');
    
    // Fetch the team logo URL
    fetch('/api/team_logo')
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        if (data.logo_url) {
          // Set the logo URL and show the image
          teamLogo.src = data.logo_url;
          teamLogo.onload = () => {
            // Hide placeholder and show logo once loaded
            placeholder.style.display = 'none';
            teamLogo.style.display = 'block';
          };
          teamLogo.onerror = () => {
            // Keep placeholder visible if image fails to load
            console.error('Failed to load team logo');
          };
        } else {
          console.warn('No logo URL found');
        }
      })
      .catch(error => {
        console.error('Error fetching team logo:', error);
      });
  });