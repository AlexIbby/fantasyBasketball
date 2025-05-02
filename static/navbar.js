document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.navbar-links');
    const overlay = document.querySelector('.overlay');
    
    // Toggle mobile menu
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      overlay.classList.toggle('active');
      document.body.classList.toggle('no-scroll');
    });
    
    // Close menu when clicking on the overlay
    overlay.addEventListener('click', () => {
      navLinks.classList.remove('active');
      overlay.classList.remove('active');
      document.body.classList.remove('no-scroll');
    });
    
    // Close menu when clicking on a link
    document.querySelectorAll('.navbar-links a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        overlay.classList.remove('active');
        document.body.classList.remove('no-scroll');
      });
    });
  });