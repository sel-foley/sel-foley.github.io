/* Clip player: one muted <video> is the master clock; every lane (original mix,
   stems, model outputs) is a Web Audio source scheduled on the same context, so a
   lane is always sample-aligned with the video. One lane is audible at a time.
   Pressing a lane's play button stops every other player on the page and starts
   this row's video from 0 s together with that lane. */
(function () {
  'use strict';

  const Engine = {
    ctx: null, master: null, active: null, cache: new Map(),
    get() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -8; comp.knee.value = 8; comp.ratio.value = 12;
      comp.attack.value = 0.002; comp.release.value = 0.12;
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      return this.ctx;
    },
    async resume() {
      const c = this.get();
      if (c.state !== 'running') { try { await c.resume(); } catch (e) { /* needs a gesture */ } }
      return c;
    },
    load(url) {
      if (this.cache.has(url)) return this.cache.get(url);
      const p = fetch(url)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`); return r.arrayBuffer(); })
        .then(ab => new Promise((res, rej) => this.get().decodeAudioData(ab, res, rej)));
      this.cache.set(url, p);
      p.catch(() => this.cache.delete(url));
      return p;
    },
    /** Only one player plays at a time: activating one pauses the previous one. */
    setActive(p) { if (this.active && this.active !== p) this.active.pause(); this.active = p; },
  };

  // ── DSP helpers ──────────────────────────────────────────────────────────
  function monoOf(buf) {
    if (buf._mono) return buf._mono;
    const n = buf.length, ch = buf.numberOfChannels;
    const out = new Float32Array(n);
    for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / ch; }
    buf._mono = out; return out;
  }
  function peaks(buf, columns, duration) {
    const x = monoOf(buf), total = Math.round(duration * buf.sampleRate);
    const out = new Float32Array(columns * 2), step = total / columns;
    for (let i = 0; i < columns; i++) {
      const s = Math.floor(i * step), e = Math.max(s + 1, Math.floor((i + 1) * step));
      let mn = 0, mx = 0;
      for (let j = s; j < e && j < x.length; j++) { const v = x[j]; if (v < mn) mn = v; if (v > mx) mx = v; }
      out[i * 2] = mn; out[i * 2 + 1] = mx;
    }
    return out;
  }
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < half; j++) {
          const a = i + j, b = a + half;
          const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function spectrogram(buf, cols, rows, duration, color, bg) {
    const x = monoOf(buf), sr = buf.sampleRate, N = 2048, half = N >> 1;
    const total = Math.round(duration * sr), hop = total / cols;
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const re = new Float32Array(N), im = new Float32Array(N);
    const mags = new Float32Array(cols * half); let max = -1e9;
    for (let c = 0; c < cols; c++) {
      const start = Math.round(c * hop) - half;
      for (let i = 0; i < N; i++) { const k = start + i; re[i] = (k >= 0 && k < x.length) ? x[k] * win[i] : 0; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k < half; k++) { const db = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-12); mags[c * half + k] = db; if (db > max) max = db; }
    }
    const fmin = 40, fmax = Math.min(16000, sr / 2), img = new ImageData(cols, rows);
    const [cr, cg, cb] = hexToRgb(color), [br, bg_, bb] = hexToRgb(bg);
    for (let r = 0; r < rows; r++) {
      const f = fmin * Math.pow(fmax / fmin, 1 - r / (rows - 1));
      const k = Math.min(half - 1, Math.round(f / (sr / 2) * half));
      for (let c = 0; c < cols; c++) {
        let v = (mags[c * half + k] - (max - 75)) / 75; v = v < 0 ? 0 : v > 1 ? 1 : v;
        const t = Math.pow(v, 1.4), w = Math.max(0, (t - 0.72) / 0.28);
        const o = (r * cols + c) * 4;
        img.data[o] = br + (cr - br) * t + (255 - cr) * w * t;
        img.data[o + 1] = bg_ + (cg - bg_) * t + (255 - cg) * w * t;
        img.data[o + 2] = bb + (cb - bb) * t + (255 - cb) * w * t;
        img.data[o + 3] = 255;
      }
    }
    const cv = document.createElement('canvas'); cv.width = cols; cv.height = rows;
    cv.getContext('2d').putImageData(img, 0, 0);
    return cv;
  }

  const fmt = t => { t = Math.max(0, t || 0); const s = Math.floor(t), d = Math.floor((t - s) * 10); return `0:${String(s).padStart(2, '0')}.${d}`; };
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── Player ───────────────────────────────────────────────────────────────
  class ClipPlayer {
    constructor(root, sample, opts = {}) {
      this.root = root; this.sample = sample;
      this.duration = sample.duration || 10;
      this.lanes = []; this.playing = false; this.view = 'wave'; this.loop = false;
      this.startCtx = 0; this.startMedia = 0; this.lastResync = 0; this.raf = 0; this.rate = 1;
      this.wantSeek = null; this.primed = false; this.preloading = null;
      this.selected = Math.max(0, sample.tracks.findIndex(t => !t.pending));
      if (typeof opts.selected === 'number') this.selected = opts.selected;
      this.build();
    }

    build() {
      const s = this.sample, root = this.root;
      root.classList.add('mtp'); root.tabIndex = 0;

      const vw = el('div', 'mtp-video-wrap');
      this.video = document.createElement('video');
      this.video.muted = true; this.video.playsInline = true; this.video.preload = 'metadata';
      this.video.loop = false; this.video.disablePictureInPicture = true;
      if (s.poster) this.video.poster = s.poster;
      this.video.src = s.video;
      vw.appendChild(this.video);
      this.videoWrap = vw;
      this.bigPlay = el('button', 'mtp-bigplay'); this.bigPlay.title = 'Play from the start';
      vw.appendChild(this.bigPlay);
      root.appendChild(vw);

      const tr = el('div', 'mtp-transport');
      this.playBtn = el('button', 'mtp-play'); this.playBtn.title = 'Play / pause the selected lane';
      this.timeEl = el('span', 'mtp-time', fmt(0));
      this.timeline = el('div', 'mtp-timeline'); this.timeline.innerHTML = '<i></i><b></b>';
      this.durEl = el('span', 'mtp-time mtp-dur', fmt(this.duration));
      this.loopBtn = el('button', 'mtp-tool', '⟲'); this.loopBtn.title = 'Loop';
      this.specBtn = el('button', 'mtp-tool', 'Spec'); this.specBtn.title = 'Spectrogram view';
      tr.append(this.playBtn, this.timeEl, this.timeline, this.durEl, this.loopBtn, this.specBtn);
      root.appendChild(tr);

      this.lanesEl = el('div', 'mtp-lanes');
      root.appendChild(this.lanesEl);
      s.tracks.forEach((t, i) => this.buildLane(t, i));
      if (s.hint) root.appendChild(el('div', 'mtp-hint', esc(s.hint)));

      // events
      this.bigPlay.addEventListener('click', () => this.playLane(this.selected, true));
      this.video.addEventListener('click', () => this.toggle());
      this.playBtn.addEventListener('click', () => this.toggle());
      this.video.addEventListener('playing', () => { if (this.playing) this.startSources(this.video.currentTime); });
      this.video.addEventListener('seeked', () => { if (this.playing) this.startSources(this.video.currentTime); });
      this.video.addEventListener('waiting', () => this.stopSources());
      ['loadeddata', 'canplay', 'canplaythrough', 'progress'].forEach(ev =>
        this.video.addEventListener(ev, () => this.applySeek()));
      this.video.addEventListener('ended', () => { if (this.loop) { this.seek(0); } else { this.pause(); this.drawAll(this.duration); } });
      this.loopBtn.addEventListener('click', () => { this.loop = !this.loop; this.loopBtn.classList.toggle('on', this.loop); });
      this.specBtn.addEventListener('click', () => {
        this.view = this.view === 'wave' ? 'spec' : 'wave';
        this.specBtn.classList.toggle('on', this.view === 'spec');
        this.drawAll(this.video.currentTime);
      });
      const seekFromEvent = (ev, target) => {
        const r = target.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width;
        this.seek(Math.min(this.duration - 0.01, Math.max(0, x * this.duration)));
      };
      let dragging = false;
      this.timeline.addEventListener('pointerdown', ev => { dragging = true; this.timeline.setPointerCapture(ev.pointerId); seekFromEvent(ev, this.timeline); });
      this.timeline.addEventListener('pointermove', ev => { if (dragging) seekFromEvent(ev, this.timeline); });
      this.timeline.addEventListener('pointerup', () => { dragging = false; });
      root.addEventListener('keydown', ev => {
        if (ev.code === 'Space' && !/^(BUTTON|SELECT|INPUT|A)$/.test(ev.target.tagName)) { ev.preventDefault(); this.toggle(); }
      });
      this.ro = new ResizeObserver(() => this.resizeCanvases());
      this.ro.observe(root);
      this.applyGains(true);
      this.drawAll(0);
    }

    buildLane(t, i) {
      const L = { t, idx: i, buffer: null, gain: null, source: null, peaksCache: new Map(), specCache: new Map(), error: null, pending: !!t.pending || !t.audio };
      const lane = el('div', 'mtp-lane'); lane.style.setProperty('--lane', t.color || '#888');
      if (t.kind === 'gt') lane.classList.add('is-gt');
      if (t.highlight) lane.classList.add('is-highlight');
      if (L.pending) lane.classList.add('is-pending');
      L.el = lane;

      const top = el('div', 'mtp-lane-top');
      const pb = el('button', 'lane-play'); pb.title = L.pending ? 'Output pending' : 'Play this lane with the video from 0 s';
      pb.disabled = L.pending;
      pb.addEventListener('click', () => this.playLane(i));
      L.playBtn = pb;
      top.appendChild(pb);

      const label = el('div', 'mtp-lane-label');
      const sub = t.sub != null ? esc(t.sub) : (t.prompt ? `“${esc(t.prompt)}”` : '');
      label.innerHTML = `<span class="prompt" title="${esc(t.label)}">${esc(t.label)}</span>` + (sub ? `<span class="sub">${sub}</span>` : '');
      if (!L.pending) label.addEventListener('click', () => this.playLane(i));
      top.appendChild(label);

      const ctrl = el('div', 'mtp-lane-ctrl');
      if (!L.pending) {
        const dl = el('a', 'icon', '↓'); dl.title = 'Download this lane (wav)'; dl.setAttribute('download', ''); dl.href = t.audio;
        L.dl = dl; ctrl.appendChild(dl);
      } else {
        ctrl.appendChild(el('span', 'pending-tag', t.status || 'pending'));
      }
      top.appendChild(ctrl);

      const wave = el('div', 'mtp-lane-wave');
      L.canvas = document.createElement('canvas'); L.g2d = L.canvas.getContext('2d');
      L.loading = el('div', 'mtp-lane-loading', L.pending ? 'no output yet' : 'loading…');
      wave.append(L.canvas, L.loading);
      if (!L.pending) {
        L.canvas.addEventListener('click', ev => {
          const r = L.canvas.getBoundingClientRect();
          if (this.selected !== i) this.select(i);
          this.seek(Math.min(this.duration - 0.01, Math.max(0, (ev.clientX - r.left) / r.width * this.duration)));
        });
      }
      lane.append(top, wave);
      this.lanesEl.appendChild(lane);
      this.lanes.push(L);
    }

    // ── loading ────────────────────────────────────────────────────────────
    ensureGraph() {
      const ctx = Engine.get();
      for (const L of this.lanes) if (!L.gain && !L.pending) { L.gain = ctx.createGain(); L.gain.connect(Engine.master); }
    }
    loadLane(L) {
      if (L.pending) return Promise.resolve(null);
      if (L.buffer) return Promise.resolve(L.buffer);
      if (L.pendingLoad) return L.pendingLoad;
      L.pendingLoad = Engine.load(L.t.audio)
        .then(buf => { L.buffer = buf; this.redrawLane(L); return buf; })
        .catch(err => { L.error = err; L.loading.textContent = 'audio unavailable'; L.loading.classList.add('mtp-err'); console.warn(err); return null; });
      return L.pendingLoad;
    }
    preload() {
      this.ensureGraph();
      const all = Promise.all(this.lanes.map(L => this.loadLane(L))).then(() => this.applyGains(true));
      this.preloading = all;
      return all;
    }

    // ── transport ──────────────────────────────────────────────────────────
    /** Lane play button: this lane becomes the audible one and the row restarts from 0 s.
     *  Pressing the button of the lane that is already playing pauses. */
    async playLane(i, force) {
      const L = this.lanes[i]; if (!L || L.pending) return;
      if (this.playing && this.selected === i && !force) { this.pause(); return; }
      this.select(i);
      this.seek(0);
      await this.play();
    }
    toggle() { this.playing ? this.pause() : this.play(); }
    async play() {
      Engine.setActive(this);                       // stops any other player on the page
      this.primeVideo();
      this.root.classList.add('is-loading');
      await Engine.resume();
      await this.preload();
      this.root.classList.remove('is-loading');
      if (Engine.active !== this) return;
      if (this.wantSeek == null && this.video.currentTime >= this.duration - 0.05) this.seek(0);
      this.playing = true; this.root.classList.add('is-playing');
      this.updateLaneButtons();
      try { await this.video.play(); } catch (e) { console.warn('video.play failed', e); }
      if (!this.playing) return;
      if (this.video.readyState >= 3 && !this.video.paused && this.wantSeek == null) this.startSources(this.video.currentTime);
      cancelAnimationFrame(this.raf); this.tick();
    }
    pause() {
      this.playing = false; this.root.classList.remove('is-playing');
      this.video.pause(); this.stopSources(); cancelAnimationFrame(this.raf);
      this.updateLaneButtons();
      this.drawAll(this.video.currentTime);
    }
    seek(t) {
      this.wantSeek = t;
      this.drawAll(t);
      if (this.playing) this.stopSources();
      this.applySeek();
    }
    applySeek() {
      const t = this.wantSeek;
      if (t == null) return;
      const v = this.video, sk = v.seekable;
      // With preload="metadata" the browser reports seekable = [0,0] and clamps to 0.
      const ready = v.readyState >= 2 && sk.length && sk.end(sk.length - 1) >= t - 0.02;
      if (!ready) { this.primeVideo(); return; }
      this.wantSeek = null;
      if (Math.abs(v.currentTime - t) < 0.005) { if (this.playing) this.startSources(t); return; }
      v.currentTime = t;                           // 'seeked' reschedules the audio
    }
    /** Request the whole media file; Chrome cannot seek a preload="metadata" element. Calling
     *  load() while the metadata request is in flight breaks seeking for good, so wait for it. */
    primeVideo() {
      if (this.primed) return;
      const v = this.video;
      if (v.readyState < 1) {
        v.addEventListener('loadedmetadata', () => this.primeVideo(), { once: true });
        v.preload = 'auto';
        return;
      }
      this.primed = true;
      v.preload = 'auto';
      if (!v.paused) return;
      if (v.currentTime > 0.01 && this.wantSeek == null) this.wantSeek = v.currentTime;
      v.load();
    }
    startSources(at) {
      const ctx = Engine.get(); this.stopSources();
      const when = ctx.currentTime + 0.015;
      this.startCtx = when; this.startMedia = at; this.rate = 1;
      for (const L of this.lanes) {
        if (!L.buffer || !L.gain) continue;
        if (at >= L.buffer.duration - 0.002) continue;
        const src = ctx.createBufferSource(); src.buffer = L.buffer; src.connect(L.gain);
        src.start(when, at); L.source = src;
      }
      this.applyGains(true);
    }
    stopSources() {
      for (const L of this.lanes) if (L.source) { try { L.source.stop(); } catch (e) { /* noop */ } L.source.disconnect(); L.source = null; }
    }
    audioPos() { return this.startMedia + (Engine.get().currentTime - this.startCtx); }
    tick() {
      if (!this.playing) return;
      const v = this.video, t = v.currentTime;
      if (!v.paused && !v.seeking && v.readyState >= 3 && this.wantSeek == null) {
        const running = this.lanes.some(L => L.source);
        const now = performance.now();
        if (!running && now - this.lastResync > 120 && t < this.duration - 0.05) {
          this.lastResync = now; this.startSources(t);
        } else if (running) {
          const drift = this.audioPos() - t;
          if (Math.abs(drift) > 0.15 && now - this.lastResync > 400) {
            this.lastResync = now; this.startSources(t);
          } else {
            const rate = Math.abs(drift) < 0.012 ? 1 : 1 - Math.max(-0.03, Math.min(0.03, drift * 0.25));
            if (Math.abs(rate - this.rate) > 0.0015) {
              this.rate = rate;
              for (const L of this.lanes) if (L.source) L.source.playbackRate.setTargetAtTime(rate, Engine.get().currentTime, 0.05);
            }
          }
        }
      }
      this.drawAll(t);
      this.raf = requestAnimationFrame(() => this.tick());
    }

    // ── lane state ─────────────────────────────────────────────────────────
    select(i) { if (this.lanes[i] && !this.lanes[i].pending) { this.selected = i; this.applyGains(); this.updateLaneButtons(); } }
    applyGains(immediate) {
      const ctx = Engine.ctx;
      this.lanes.forEach((L, i) => {
        const on = i === this.selected;
        if (L.gain && ctx) {
          const param = L.gain.gain, g = on ? 1 : 0;
          param.cancelScheduledValues(ctx.currentTime);
          if (immediate) { param.value = g; }
          else { param.setValueAtTime(param.value, ctx.currentTime); param.linearRampToValueAtTime(g, ctx.currentTime + 0.02); }
        }
        L.el.classList.toggle('is-off', !on);
        L.el.classList.toggle('is-selected', on);
      });
    }
    updateLaneButtons() {
      this.lanes.forEach((L, i) => L.el.classList.toggle('is-live', this.playing && i === this.selected));
    }

    // ── drawing ────────────────────────────────────────────────────────────
    resizeCanvases() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const L of this.lanes) {
        const r = L.canvas.getBoundingClientRect(); if (!r.width) continue;
        const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
        if (L.canvas.width !== w || L.canvas.height !== h) { L.canvas.width = w; L.canvas.height = h; }
      }
      this.drawAll(this.video.currentTime);
    }
    redrawLane(L) { this.drawLane(L, this.video.currentTime); }
    drawAll(t) {
      for (const L of this.lanes) this.drawLane(L, t);
      const p = Math.min(1, Math.max(0, t / this.duration)) * 100;
      this.timeline.firstChild.style.width = p + '%'; this.timeline.lastChild.style.left = p + '%';
      this.timeEl.textContent = fmt(t);
    }
    drawLane(L, t) {
      const cv = L.canvas, W = cv.width, H = cv.height, g = L.g2d; if (!W || !H) return;
      const color = L.t.color || '#888', dur = this.duration;
      const bg = cssVar('--wavebg') || '#f2f3f5', play = cssVar('--playhead') || '#000';
      g.clearRect(0, 0, W, H);
      const px = t / dur * W;
      if (L.buffer) {
        L.loading.style.display = 'none';
        const key = `${W}`;
        if (this.view === 'spec') {
          let sc = L.specCache.get(key);
          if (!sc) { sc = spectrogram(L.buffer, Math.min(W, 900), 96, dur, color, bg); L.specCache.set(key, sc); }
          g.drawImage(sc, 0, 0, W, H);
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(px, 0, W - px, H);
        } else {
          let pk = L.peaksCache.get(key);
          if (!pk) { pk = peaks(L.buffer, W, dur); L.peaksCache.set(key, pk); }
          const mid = H / 2, amp = H * 0.47;
          g.fillStyle = color; g.globalAlpha = 1;
          for (let x = 0; x < W; x++) {
            if (x === Math.ceil(px)) { g.globalAlpha = 0.5; }
            const mn = pk[x * 2], mx = pk[x * 2 + 1];
            let y0 = mid - mx * amp, y1 = mid - mn * amp; if (y1 - y0 < 1.5) { y0 = mid - 0.75; y1 = mid + 0.75; }
            g.fillRect(x, y0, 1, y1 - y0);
          }
          g.globalAlpha = 1;
        }
      } else if (!L.error && !L.pending) {
        L.loading.style.display = '';
      }
      // active intervals from the dataset annotation: faint bands + edge ticks
      const ev = L.t.events;
      if (ev && ev.spans && ev.spans.length) {
        g.fillStyle = play; g.globalAlpha = 0.08;
        ev.spans.forEach(([a, b]) => g.fillRect(a / dur * W, 0, Math.max(1, (b - a) / dur * W), H));
        g.globalAlpha = 0.55;
        ev.spans.forEach(([a, b]) => { g.fillRect(a / dur * W, 0, 1.5, H); g.fillRect(b / dur * W - 1.5, 0, 1.5, H); });
        g.globalAlpha = 1;
      }
      if (!L.pending) { g.fillStyle = play; g.fillRect(px - 1, 0, 2, H); }
    }

    destroy() { this.pause(); this.ro.disconnect(); this.root.innerHTML = ''; }
  }

  window.ClipPlayer = ClipPlayer;
  window.MTPEngine = Engine;
})();
