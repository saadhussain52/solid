export default async function run(page, ui) {
  const out = {};
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:5173/product.html?product=7', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.querySelectorAll('link[href*=responsive]').forEach(l => { l.href = l.href.split('?')[0] + '?v=' + Date.now(); }));
  await page.waitForSelector('#detail-gallery button');
  await page.waitForTimeout(900);

  out.info = await page.evaluate(() => {
    const img = document.querySelector('.product-detail-image');
    const main = document.querySelector('#detail-image');
    const gallery = document.querySelector('#detail-gallery');
    const cell = document.querySelector('#detail-gallery button');
    const extra = document.querySelector('.detail-extra');
    const reviews = document.querySelector('#detail-reviews');
    const cs = el => { const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return { display: c.display, position: c.position, w: Math.round(r.width), h: Math.round(r.height), cols: c.gridTemplateColumns, gtc: c.gridTemplateColumns, overflow: c.overflow }; };
    return {
      detailImageBox: cs(img),
      mainImg: cs(main),
      gallery: cs(gallery),
      cell: cs(cell),
      extra: cs(extra),
      reviews: reviews ? cs(reviews) : null,
      gridCols: getComputedStyle(document.querySelector('.product-detail-grid')).gridTemplateColumns,
      // is the gallery cell overlapping the reviews section?
      overlap: (() => {
        if (!cell || !extra) return null;
        const a = cell.getBoundingClientRect(), b = extra.getBoundingClientRect();
        return !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
      })()
    };
  });

  // which stylesheet rules are actually winning?
  out.winning = await page.evaluate(() => {
    const cell = document.querySelector('#detail-gallery button');
    const gallery = document.querySelector('#detail-gallery');
    const img = document.querySelector('.product-detail-image');
    const hits = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      const walk = list => {
        for (const rule of list) {
          if (rule.cssRules) { walk(rule.cssRules); continue; }
          if (!rule.selectorText) continue;
          try {
            if (cell.matches(rule.selectorText) && /width|height|aspect|grid-template-columns|display/.test(rule.cssText)) {
              hits.push({ sheet: (sheet.href || 'inline').split('/').pop(), sel: rule.selectorText, css: rule.style.cssText.slice(0, 120) });
            }
          } catch (e) { }
        }
      };
      walk(rules);
    }
    return hits.slice(-14);
  });
  return out;
}
