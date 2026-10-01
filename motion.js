/*
 * Solids storefront — motion & interaction layer.
 *
 * Adds scroll-reveal animations, word-by-word heading reveals and a few
 * interface touches (reading-progress bar, sticky-header state, back-to-top).
 *
 * Dependency-free (IntersectionObserver + CSS transitions) and progressive:
 * if scripting is unavailable, or the visitor prefers reduced motion, every
 * element stays fully visible and interactive.
 */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --------------------------------------------------------------------- *
   * Configuration
   * --------------------------------------------------------------------- */

  // Blocks that fade / slide into view as they are scrolled to.
  //   variant: up | fade | left | right | scale
  //   stagger: per-item delay (ms) inside the group
  const revealGroups = [
    { selector: '.breadcrumbs', variant: 'up' },
    { selector: '.section-heading', variant: 'fade' },
    { selector: '.all-heading', variant: 'fade' },
    { selector: '.catalog-sidebar', variant: 'left' },
    { selector: '.collection-card', variant: 'up', stagger: 90 },
    { selector: '.catalog-collection-card', variant: 'up', stagger: 90 },
    { selector: '.manifesto > *', variant: 'up', stagger: 110 },
    { selector: '.all-banner', variant: 'fade' },
    { selector: '.product-detail-image', variant: 'left' },
    { selector: '.product-copy', variant: 'right' },
    { selector: '.site-footer .footer-links > *', variant: 'up', stagger: 90 },
    { selector: '.product-card', variant: 'up', stagger: 65 },
    {
      selector: '.hero-copy > .eyebrow, .hero-copy > p:not(.eyebrow), .hero-copy > .button, .hero-index',
      variant: 'up',
      stagger: 130
    }
  ];

  // Headings whose words rise into view one after another.
  const wordHeadings = ['.hero h1', '.section-heading h2', '.all-banner strong', '.all-heading h2'];

  /* --------------------------------------------------------------------- *
   * Reveal engine
   * --------------------------------------------------------------------- */

  let observer = null;
  const observed = new WeakSet();

  function getObserver() {
    if (observer) return observer;
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    return observer;
  }

  function observe(element) {
    if (observed.has(element)) return;
    observed.add(element);
    getObserver().observe(element);
  }

  function splitHeading(heading) {
    if (heading.dataset.motionSplit === 'true') return;
    heading.dataset.motionSplit = 'true';
    if (heading.querySelector('br')) return;              // keep intentional line breaks

    const label = heading.textContent.replace(/\s+/g, ' ').trim();
    if (!label) return;

    heading.setAttribute('aria-label', label);
    heading.classList.add('reveal-words');

    const fragment = doc.createDocumentFragment();
    const words = label.split(' ');
    words.forEach((word, index) => {
      const mask = doc.createElement('span');
      mask.className = 'motion-word';
      const inner = doc.createElement('span');
      inner.className = 'motion-word-inner';
      inner.textContent = word;
      inner.style.transitionDelay = (index * 65) + 'ms';
      mask.appendChild(inner);
      fragment.appendChild(mask);
      if (index < words.length - 1) fragment.appendChild(doc.createTextNode(' '));
    });
    heading.replaceChildren(fragment);
  }

  function scan(scope) {
    const container = scope || doc;

    // Word-by-word headings
    wordHeadings.forEach((selector) => {
      container.querySelectorAll(selector).forEach((heading) => {
        splitHeading(heading);
        observe(heading);
      });
    });

    // Block reveals (skips anything that already carries a reveal state)
    revealGroups.forEach((group) => {
      container.querySelectorAll(group.selector).forEach((element, index) => {
        if (element.hasAttribute('data-reveal')) return;
        element.setAttribute('data-reveal', group.variant);
        if (group.stagger) element.style.setProperty('--reveal-delay', ((index % 8) * group.stagger) + 'ms');
        observe(element);
      });
    });
  }

  /* --------------------------------------------------------------------- *
   * Interface chrome: progress bar, sticky header, back-to-top
   * --------------------------------------------------------------------- */

  function initChrome() {
    const progress = doc.createElement('div');
    progress.className = 'motion-progress';
    const fill = doc.createElement('i');
    progress.appendChild(fill);
    doc.body.appendChild(progress);

    const toTop = doc.createElement('button');
    toTop.type = 'button';
    toTop.className = 'motion-top';
    toTop.setAttribute('aria-label', 'Back to top');
    toTop.innerHTML = '<span aria-hidden="true">\u2191</span>';
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    doc.body.appendChild(toTop);

    const header = doc.querySelector('.site-header');
    let ticking = false;

    function update() {
      ticking = false;
      const scrollTop = window.scrollY || root.scrollTop || 0;
      const scrollable = root.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? Math.min(scrollTop / scrollable, 1) : 0;
      fill.style.transform = 'scaleX(' + ratio + ')';
      if (header) header.classList.toggle('is-scrolled', scrollTop > 8);
      toTop.classList.toggle('is-visible', scrollTop > 600);
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  /* --------------------------------------------------------------------- *
   * Boot
   * --------------------------------------------------------------------- */

  function start() {
    // Without IntersectionObserver, leave the page exactly as it is.
    if (!('IntersectionObserver' in window)) return;

    initChrome();
    if (reduceMotion) return;

    root.classList.add('motion-ready');
    scan(doc);

    // Re-scan when app.js re-renders product grids (filters, admin edits).
    let timer;
    const mutationObserver = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => scan(doc), 60);
    });
    mutationObserver.observe(doc.body, { childList: true, subtree: true });
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

})();
