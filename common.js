// Shared by every page: scenario names, rail links and the rail highlight.
window.OceanSite = (function () {
  'use strict';
  const PRESETS = {
    low: { label: 'Low emissions', anchors: { 2050: 444, 2075: 442, 2100: 432 } },
    intermediate: { label: 'Intermediate', anchors: { 2050: 485, 2075: 535, 2100: 600 } },
    high: { label: 'High', anchors: { 2050: 510, 2075: 650, 2100: 850 } },
    very_high: { label: 'Very high', anchors: { 2050: 545, 2075: 760, 2100: 1100 } },
  };

  // A rail link to a section on this page stays on this page instead of reloading it.
  document.querySelectorAll('a[href*="#"]').forEach((a) => { if (a.hash && document.getElementById(a.hash.slice(1))) a.setAttribute('href', a.hash); });

  /* highlight the rail icon for the section in view */
  const links = [...document.querySelectorAll('#nav a')];
  const spy = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.dataset.sec === e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main > section').forEach((sec) => spy.observe(sec));

  /* every canvas chart gets a button that saves it as a PNG */
  function chartPng(canvas, title) {
    // The canvas itself is transparent, so the card colour and the title are painted onto a copy.
    const d = canvas.width / canvas.getBoundingClientRect().width, head = Math.round(34 * d);
    const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height + head;
    const x = out.getContext('2d'), cs = getComputedStyle(document.documentElement);
    x.fillStyle = getComputedStyle(canvas).backgroundColor; x.fillRect(0, 0, out.width, out.height);
    x.fillStyle = cs.getPropertyValue('--ink').trim() || '#111'; x.font = `600 ${15 * d}px Fraunces, Inter, sans-serif`; x.textBaseline = 'middle';
    x.fillText(title, 14 * d, head / 2 + 2 * d);
    x.drawImage(canvas, 0, head);
    return out.toDataURL('image/png');
  }
  document.querySelectorAll('canvas.chart').forEach((canvas) => {
    const head = canvas.parentElement.querySelector('.chart-title'); if (!head) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn soft small png-btn no-print'; btn.textContent = 'PNG';
    btn.addEventListener('click', () => {
      if (!canvas.width) return;
      const title = head.querySelector('h3').textContent.trim(), a = document.createElement('a');
      a.href = chartPng(canvas, title);
      a.download = 'sour-seas-' + title.toLowerCase().replace(/ω/g, 'omega').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
      a.click();
    });
    const setLabel = () => { const t = head.querySelector('h3').textContent.trim(); btn.setAttribute('aria-label', `Download the ${t} chart as a PNG image`); btn.title = 'Download this chart as a PNG image'; };
    setLabel(); new MutationObserver(setLabel).observe(head.querySelector('h3'), { childList: true, characterData: true, subtree: true });
    (head.querySelector('.legend') || head).appendChild(btn);
  });

  return { PRESETS, YEAR0: 1850, YEAR1: 2100 };
})();
