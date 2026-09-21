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
  function resultSample(r) {
    const tracks = [];
    for (const m of modelsCfg.models) {
      if (m.kind === 'gt') tracks.push({ id: 'gt', label: m.name, sub: 'from SelFoley3.3K', kind: 'gt', color: GT, audio: r.gt || null, pending: !r.gt });
      else {
        const audio = r.outputs && r.outputs[m.id];
        tracks.push({ id: m.id, label: m.name, sub: m.note || '', color: m.ours ? ACCENT : (m.color || PALETTE[tracks.length % PALETTE.length]),
                      highlight: !!m.ours, audio: audio || null, pending: !audio, status: audio ? '' : (m.status || 'pending') });
      }
    }
    return { id: r.id, video: r.video, poster: r.poster, duration: r.duration, tracks,
             title: `“${r.caption}”`, subtitle: `clip #${String(r.n).padStart(2, '0')} · ${r.origin}` };
  }

  const clips = (manifest.dataset_clips || []).map(clipSample);
  const byId = new Map(clips.map(c => [c.id, c]));
  const lists = {
    dataset: clips,
    teaser: (manifest.teaser || []).map(id => byId.get(id)).filter(Boolean),
    results: (manifest.results_rows || []).map(resultSample),
  };

  const io = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { en.target._player && en.target._player.preload(); io.unobserve(en.target); }
  }, { rootMargin: '400px 0px' });

  function mount(slot, sample) {
    const root = el('div');
    slot.appendChild(root);
    const p = new ClipPlayer(root, sample);
    root._player = p; players.push(p); io.observe(root);
    if (window.Expand) Expand.attach(p, slot, [sample.title, sample.subtitle].filter(Boolean).join(' · '));
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
    const slot = el('div', 'player-slot');
    c.appendChild(slot);
    return { c, slot };
  }

  function renderGrid(gridEl, list, opts = {}) {
    if (!list.length) { gridEl.appendChild(el('p', 'fine', opts.empty || 'Nothing here yet.')); return; }
    const step = opts.step || list.length;
    let shown = 0;
    const more = el('div', 'morebar'); const btn = el('button', 'btn ghost', ''); more.appendChild(btn);
    const show = () => {
      list.slice(shown, shown + step).forEach(s => { const { c, slot } = card(s); gridEl.appendChild(c); mount(slot, s); });
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
  const legend = $('[data-model-legend]');
  if (legend) {
    for (const m of modelsCfg.models) {
      const color = m.kind === 'gt' ? GT : (m.ours ? ACCENT : (m.color || '#9aa0a6'));
      const tag = m.kind === 'gt' ? '' : ` <span class="pending-tag">${esc(m.status || 'pending')}</span>`;
      legend.appendChild(el('span', null, `${esc(m.name)}${tag}`)).style.setProperty('--c', color);
    }
  }
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
