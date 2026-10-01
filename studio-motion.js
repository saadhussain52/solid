(() => {
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motionPreference.matches) return;

  const headingSelector = '.admin-topbar h1, .dashboard-toolbar h2, .page-heading h2, .admin-main .panel h3, .all-orders-heading h3';
  const copySelector = '.admin-topbar .eyebrow, .dashboard-toolbar p.muted, .page-heading p.muted, .panel-head p.muted, .tool-head p.muted, .all-orders-heading p:not(.eyebrow)';
  const rowSelector = '.stat-card, .order-row, .table-row, .admin-product-row, .admin-category-row, .admin-order-line, .customer-line, .advanced-row, .banner-row, .page-product-row, .page-order-row, .all-order-item';
  const targetSelector = `${headingSelector}, ${copySelector}, ${rowSelector}`;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  function findTargets(root, selector) {
    const targets = [];
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(selector)) targets.push(root);
    targets.push(...root.querySelectorAll(selector));
    return targets;
  }

  function isRendered(element) {
    return getComputedStyle(element).display !== 'none' && element.getClientRects().length > 0;
  }

  function revealHeading(heading) {
    if (heading.dataset.motionWords === 'true') return;

    const label = heading.textContent.trim().replace(/\s+/g, ' ');
    if (!label) return;

    heading.dataset.motionWords = 'true';
    heading.setAttribute('aria-label', label);

    const fragment = document.createDocumentFragment();
    const words = [];
    label.split(' ').forEach((word, index, allWords) => {
      const mask = document.createElement('span');
      const animatedWord = document.createElement('span');
      mask.className = 'studio-motion-word-mask';
      animatedWord.className = 'studio-motion-word';
      animatedWord.textContent = word;
      mask.appendChild(animatedWord);
      fragment.appendChild(mask);
      words.push(animatedWord);
      if (index < allWords.length - 1) fragment.appendChild(document.createTextNode(' '));
    });

    heading.replaceChildren(fragment);
    gsap.fromTo(words, { yPercent: 112, autoAlpha: 0 }, {
      yPercent: 0,
      autoAlpha: 1,
      duration: 0.58,
      stagger: 0.075,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: heading,
        start: 'top 91%',
        toggleActions: 'play none none reverse'
      }
    });
  }

  function revealCopy(copy) {
    if (copy.dataset.motionCopy === 'true') return;
    copy.dataset.motionCopy = 'true';
    gsap.fromTo(copy, { autoAlpha: 0, y: 15 }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.62,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: copy,
        start: 'top 92%',
        toggleActions: 'play none none reverse'
      }
    });
  }

  function revealRows(root) {
    const rows = findTargets(root, rowSelector).filter((row) => row.dataset.motionRow !== 'true' && isRendered(row));
    if (!rows.length) return;

    rows.forEach((row) => { row.dataset.motionRow = 'true'; });
    gsap.set(rows, { autoAlpha: 0, y: 18 });
    ScrollTrigger.batch(rows, {
      start: 'top 90%',
      interval: 0.08,
      batchMax: 4,
      onEnter: (items) => gsap.to(items, {
        autoAlpha: 1,
        y: 0,
        duration: 0.58,
        stagger: 0.075,
        ease: 'power2.out',
        overwrite: true
      }),
      onEnterBack: (items) => gsap.to(items, {
        autoAlpha: 1,
        y: 0,
        duration: 0.48,
        stagger: 0.06,
        ease: 'power2.out',
        overwrite: true
      }),
      onLeaveBack: (items) => gsap.set(items, { autoAlpha: 0, y: 18, overwrite: true })
    });
  }

  function init(root = document) {
    findTargets(root, headingSelector).filter(isRendered).forEach(revealHeading);
    findTargets(root, copySelector).filter((copy) => isRendered(copy) && copy.dataset.motionCopy !== 'true').forEach(revealCopy);
    revealRows(root);
    ScrollTrigger.refresh();
  }

  function start() {
    loadScript('https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js')
      .then(() => loadScript('https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js'))
      .then(() => {
        gsap.registerPlugin(ScrollTrigger);
        init();

        let updateTimer;
        const observer = new MutationObserver((records) => {
        const hasNewMotionTargets = records.some((record) => {
            if (record.type === 'attributes') {
              const target = record.target;
              return target.matches(targetSelector) || target.querySelector(targetSelector) !== null;
            }
            return Array.from(record.addedNodes).some((node) => {
              if (node.nodeType !== Node.ELEMENT_NODE) return false;
              return node.matches(targetSelector) || node.querySelector(targetSelector) !== null;
            });
          });
          if (!hasNewMotionTargets) return;

          window.clearTimeout(updateTimer);
          updateTimer = window.setTimeout(() => init(), 80);
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      })
      .catch(() => {
        // Keep the Studio usable if the optional motion library is unavailable.
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
