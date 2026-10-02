/* Page assembly. Reads data/manifest.json (dataset clips, teaser, result rows) and
   data/models.json (model display names, editable until the paper's naming is final),
   then mounts one ClipPlayer per card into every [data-grid] on the page. */
(async function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const page = document.body.dataset.page || 'overview';
  const players = [];

  document.querySelectorAll('.navrow a.nl').forEach(a => { if (a.dataset.page === page) a.classList.add('on'); });
  const tb = document.getElementById('themeToggle');
  if (tb) {
    let saved = null;
    try { saved = localStorage.getItem('sf-theme'); } catch (e) { /* private mode */ }
    if (saved) document.documentElement.dataset.theme = saved;
    tb.addEventListener('click', () => {
      const dark = matchMedia('(prefers-color-scheme: dark)').matches;
      const cur = document.documentElement.dataset.theme || (dark ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('sf-theme', next); } catch (e) { /* ignore */ }
      players.forEach(p => p.resizeCanvases());
    });
  }

  let manifest, modelsCfg = { models: [] };
  try {
    manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
    try { modelsCfg = await (await fetch('data/models.json', { cache: 'no-cache' })).json(); } catch (e) { /* optional */ }
  } catch (e) {
    const slot = document.querySelector('[data-grid]');
    if (slot) slot.innerHTML = '<p class="mtp-err">Could not load data/manifest.json. Serve this folder over HTTP; file:// will not work.</p>';
    return;
  }

  const PALETTE = ['#3b6ea5', '#c2703d', '#6a994e', '#8e6bbf', '#b5566a', '#4f9a94'];
  const GT = '#9aa0a6', ACCENT = '#2f6fed';
  const fmtIv = iv => iv.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)} s`).join(', ');

  /** Dataset clip → player sample: original mix first, then one lane per stem. */
  function clipSample(c) {
    const tracks = [{ id: 'mix', label: 'Original mix', sub: 'all sources, as recorded', kind: 'gt', color: GT, audio: c.mix }];
    c.stems.forEach((st, i) => tracks.push({
      id: st.id, label: st.caption, sub: st.intervals && st.intervals.length ? 'active ' + fmtIv(st.intervals) : '',
      color: PALETTE[i % PALETTE.length], audio: st.audio, events: { spans: st.intervals || [] },
    }));
    return { id: c.id, n: c.n, origin: c.origin, video: c.video, poster: c.poster, duration: c.duration, tracks,
             title: `#${String(c.n).padStart(2, '0')}`, subtitle: `${c.origin} · ${c.stems.length} stems` };
  }

  /** Result row → player sample: reference stem, then one lane per configured model. */
  /** Result row + query index → player sample: target stem, then one lane per model with an output. */
  function resultSample(r, qi, prefix) {
    const q = r.queries[qi], tracks = [];
    for (const m of modelsCfg.models) {
      if (m.kind === 'gt') { tracks.push({ id: 'gt', label: m.name, sub: m.note || '', kind: 'gt', color: GT, audio: q.gt }); continue; }
      const audio = q.outputs && q.outputs[m.id];
      if (!audio) continue;                      // this row has no output from that model
      tracks.push({ id: m.id, label: m.name, sub: m.note || '', color: m.color || (m.ours ? ACCENT : PALETTE[tracks.length % PALETTE.length]),
                    highlight: !!m.ours, audio });
    }
    const num = `${prefix}${String(r.n).padStart(2, '0')}`, multi = r.queries.length > 1;
    return { id: `${r.id}_q${qi}`, video: r.video, poster: r.poster, duration: r.duration, tracks, row: r, qi, prefix,
             title: multi ? num : `“${q.caption}”`,
             subtitle: multi ? `${r.origin ? r.origin + ' · ' : ''}${r.queries.length} text queries` : `${num}${r.origin ? ' · ' + r.origin : ''}`,
             expandTitle: `${num} · “${q.caption}”` };
  }
  const clips = (manifest.dataset_clips || []).map(clipSample);
  const byId = new Map(clips.map(c => [c.id, c]));
  const lists = {
    dataset: clips,
    teaser: (manifest.teaser || []).map(id => byId.get(id)).filter(Boolean),
    results_eval: (manifest.results_eval || []).map(r => resultSample(r, 0, 'E')),
    results: (manifest.results_listening || []).map(r => resultSample(r, 0, 'L')),
  };

  const io = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { en.target._player && en.target._player.preload(); io.unobserve(en.target); }
  }, { rootMargin: '400px 0px' });

  function mount(slot, sample, opts = {}) {
    const root = el('div');
    slot.appendChild(root);
    const p = new ClipPlayer(root, sample, opts);
    root._player = p; players.push(p); io.observe(root);
    if (window.Expand) Expand.attach(p, slot, sample.expandTitle || [sample.title, sample.subtitle].filter(Boolean).join(' · '));
    requestAnimationFrame(() => p.resizeCanvases());
    return p;
  }
  function card(sample) {
    const c = el('div', 'card');
    if (sample.origin) c.dataset.origin = sample.origin;
    const head = el('div', 'card-head');
    head.appendChild(el('h3', null, esc(sample.title || sample.id)));
    if (sample.subtitle) head.appendChild(el('span', 'sub', esc(sample.subtitle)));
    c.appendChild(head);
    if (sample.row && sample.row.queries.length > 1) {
      const qs = el('div', 'queries');
      qs.appendChild(el('span', 'queries-k', 'Text query'));
      sample.row.queries.forEach((q, qi) => {
        const b = el('button', 'qchip' + (qi === sample.qi ? ' on' : ''), `“${esc(q.caption)}”`);
        b.dataset.qi = qi; qs.appendChild(b);
      });
      c.appendChild(qs);
    }
    const slot = el('div', 'player-slot');
    c.appendChild(slot);
    return { c, slot };
  }

  /** Switching the text query rebuilds the card's player on the same video, keeping the selected lane. */
  function wireQueries(c, slot, sample, first) {
    let p = first;
    c.querySelectorAll('.qchip').forEach(b => b.addEventListener('click', () => {
      const qi = +b.dataset.qi;
      if (qi === p.sample.qi) return;
      c.querySelectorAll('.qchip').forEach(x => x.classList.toggle('on', x === b));
      const keepLane = p.selected;
      if (window.Expand && Expand.current && Expand.current.player === p) Expand.close();
      p.destroy();
      if (MTPEngine.active === p) MTPEngine.active = null;
      io.unobserve(p.root);
      players.splice(players.indexOf(p), 1);
      slot.innerHTML = '';
      const ns = resultSample(sample.row, qi, sample.prefix);
      p = mount(slot, ns, { selected: Math.min(keepLane, ns.tracks.length - 1) });
      p.preload();
    }));
  }

  function renderGrid(gridEl, list, opts = {}) {
    if (!list.length) { gridEl.appendChild(el('p', 'fine', opts.empty || 'Nothing here yet.')); return; }
    const step = opts.step || list.length;
    let shown = 0;
    const more = el('div', 'morebar'); const btn = el('button', 'btn ghost', ''); more.appendChild(btn);
    const show = () => {
      list.slice(shown, shown + step).forEach(s => { const { c, slot } = card(s); gridEl.appendChild(c); const p = mount(slot, s); if (s.row) wireQueries(c, slot, s, p); });
      shown = Math.min(list.length, shown + step);
      btn.textContent = `Show more (${list.length - shown} left)`;
      more.hidden = shown >= list.length;
      applyFilter();
    };
    btn.addEventListener('click', show);
    show();
    if (list.length > step) gridEl.parentElement.insertBefore(more, gridEl.nextSibling);
  }

  // origin filter chips (dataset page)
  let filter = 'all';
  function applyFilter() {
    document.querySelectorAll('.card[data-origin]').forEach(c => { c.hidden = filter !== 'all' && c.dataset.origin !== filter; });
  }
  const fbar = $('[data-filters]');
  if (fbar) {
    const origins = [...new Set(clips.map(c => c.origin))];
    ['all', ...origins].forEach(o => {
      const b = el('button', o === 'all' ? 'on' : '', o === 'all' ? `All (${clips.length})` : `${esc(o)} (${clips.filter(c => c.origin === o).length})`);
      b.addEventListener('click', () => { filter = o; fbar.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); applyFilter(); });
      fbar.appendChild(b);
    });
  }

  document.querySelectorAll('[data-grid]').forEach(g => {
    const list = lists[g.dataset.grid] || [];
    renderGrid(g, list, { step: g.dataset.step ? +g.dataset.step : undefined, empty: g.dataset.empty });
    const counter = document.querySelector(`[data-count="${g.dataset.grid}"]`);
    if (counter) counter.textContent = list.length;
  });

  // model legend on the results page, from the same config
  // Query chips wrap to one or two lines; give every card in a visual grid row the same chip-row
  // height so the videos (and the lanes under them) line up across the row.
  function alignQueryRows() {
    document.querySelectorAll('.grid').forEach(grid => {
      const qs = [...grid.querySelectorAll(':scope > .card:not([hidden]) > .queries')];
      if (!qs.length) return;
      qs.forEach(q => { q.style.minHeight = ''; });
      const rows = new Map();
      qs.forEach(q => { const top = Math.round(q.parentElement.getBoundingClientRect().top); (rows.get(top) || rows.set(top, []).get(top)).push(q); });
      for (const group of rows.values()) {
        if (group.length < 2) continue;
        const h = Math.max(...group.map(q => q.getBoundingClientRect().height));
        group.forEach(q => { q.style.minHeight = h + 'px'; });
      }
    });
  }
  let alignRaf = 0;
  const scheduleAlign = () => { cancelAnimationFrame(alignRaf); alignRaf = requestAnimationFrame(alignQueryRows); };
  scheduleAlign();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleAlign);
  window.addEventListener('resize', scheduleAlign);

  document.querySelectorAll('[data-model-legend]').forEach(legend => {
    let only = legend.dataset.modelLegend ? legend.dataset.modelLegend.split(',') : null;
    const forGrid = legend.dataset.legendFor && lists[legend.dataset.legendFor];
    if (forGrid) only = ['gt', ...new Set(forGrid.flatMap(s => s.tracks.map(t => t.id)))];
    for (const m of modelsCfg.models) {
      if (only && !only.includes(m.id)) continue;
      const color = m.kind === 'gt' ? GT : (m.color || (m.ours ? ACCENT : '#9aa0a6'));
      legend.appendChild(el('span', null, esc(m.name))).style.setProperty('--c', color);
    }
  });
  const stems = clips.reduce((n, c) => n + c.tracks.length - 1, 0);
  document.querySelectorAll('[data-stat="shown_clips"]').forEach(n => { n.textContent = clips.length; });
  document.querySelectorAll('[data-stat="shown_stems"]').forEach(n => { n.textContent = stems; });
  if (manifest.dataset) document.querySelectorAll('[data-stat]').forEach(n => { const v = manifest.dataset[n.dataset.stat]; if (v != null) n.textContent = v; });

  document.addEventListener('keydown', ev => {
    if (ev.code !== 'Space' || /^(BUTTON|SELECT|INPUT|A|TEXTAREA)$/.test(ev.target.tagName) || ev.target.closest('.mtp')) return;
    if (MTPEngine.active) { ev.preventDefault(); MTPEngine.active.toggle(); }
  });
  window.addEventListener('resize', () => players.forEach(p => p.resizeCanvases()));
})();
