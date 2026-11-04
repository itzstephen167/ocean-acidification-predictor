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

  return { PRESETS, YEAR0: 1850, YEAR1: 2100 };
})();
