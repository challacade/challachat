/**
 * Page navigation — tab switching.
 */
import { navButtons, pages } from './dom.js';

function switchPage(pageName) {
  for (const [name, el] of Object.entries(pages)) {
    el.classList.toggle('active', name === pageName);
  }
  navButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageName);
  });
}

export function bindNavigationListeners() {
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });
}
