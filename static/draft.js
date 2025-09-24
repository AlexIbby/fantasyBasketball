import { initKeepers } from './keeper.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initKeepers);
} else {
  initKeepers();
}
