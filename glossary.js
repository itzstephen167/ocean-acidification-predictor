// Glossary page: filter the terms as you type, and highlight the one a link pointed at.
(function () {
  'use strict';
  const find = document.getElementById('glossFind');
  const count = document.getElementById('glossCount');
  const items = [...document.querySelectorAll('.gloss-item')];

  function filter() {
    const q = find.value.trim().toLowerCase();
    let shown = 0;
    items.forEach((el) => {
      const hit = !q || el.textContent.toLowerCase().includes(q);
      el.hidden = !hit;
      if (hit) shown++;
    });
    count.textContent = q ? (shown ? shown + ' of ' + items.length + ' terms match.' : 'No terms match "' + find.value.trim() + '".') : '';
  }
  find.addEventListener('input', filter);

  // Arriving from a term link (glossary.html#omega) marks that entry.
  function mark() {
    const id = location.hash.slice(1);
    items.forEach((el) => el.classList.toggle('target', el.id === id));
  }
  window.addEventListener('hashchange', mark);
  mark();
})();
