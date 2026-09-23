// Ambient background animations ("vibes") for the empty space on desktop.
//
// Every scene is drawn on one <canvas> behind the page, in your theme's
// colors, and redraws when you change themes. To stay light:
// * it runs only on screens at least 1024px wide,
// * it pauses when the tab is hidden,
// * it caps the frame rate and pixel density,
// * it draws a single still frame if your system asks for reduced motion.

import { MORE_SCENES, MORE_VIBES, VIBE_GROUPS as GROUPS } from './ambient-more.js?v=9';

export const VIBE_GROUPS = ['Modes', ...GROUPS];
export const VIBES = [
  { id: 'off', name: 'Off', mood: 'Just the page', group: 'Modes' },
  { id: 'shuffle', name: 'Shuffle', mood: 'A new vibe every 5 minutes', group: 'Modes' },
  { id: 'topic', name: 'Match my topic', mood: 'Changes with what you read', group: 'Modes' },
  { id: 'aurora', name: 'Aurora', mood: 'Calm, drifting light', group: 'Calm' },
  { id: 'constellation', name: 'Constellation', mood: 'Connected, a little techy', group: 'Techy' },
  { id: 'coderain', name: 'Code rain', mood: 'Hacker-movie energy', group: 'Techy' },
  { id: 'synthwave', name: 'Synthwave', mood: 'Retro neon, night drive', group: 'Retro' },
  { id: 'waveform', name: 'Waveform', mood: 'Oscilloscope, studio glow', group: 'Music' },
  { id: 'starfield', name: 'Starfield', mood: 'Deep focus, warp speed', group: 'Space' },
  { id: 'lofi', name: 'Lo-fi rain', mood: 'Rainy window, study session', group: 'Nature' },
  { id: 'fireflies', name: 'Fireflies', mood: 'Warm summer night', group: 'Nature' },
  ...MORE_VIBES,
];
const SCENE_IDS = VIBES.map((v) => v.id).filter((id) => !['off', 'shuffle', 'topic'].includes(id));
// "Match my topic": which vibes suit which section.
const TOPIC_VIBES = {
  security: ['radar', 'circuit', 'coderain', 'constellation', 'hexgrid'],
  music: ['waveform', 'vinyl', 'spectrum', 'lofi'],
  games: ['invaders', 'synthwave', 'tetris', 'dvd', 'plasma'],
  default: ['aurora', 'nebula', 'ocean', 'galaxy', 'lavalamp'],
};

const INTENSITY = { subtle: 0.45, medium: 0.75, vivid: 1 };
const SPEED = { slow: 0.5, normal: 1, fast: 1.7 };

// ---------- color helpers ----------

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (k, fallback) => cs.getPropertyValue(k).trim() || fallback;
  const accent = hexToRgb(get('--accent', '#0f766e'));
  return {
    dark: document.documentElement.dataset.theme === 'dark',
    bg: hexToRgb(get('--bg', '#f6f7f5')),
    text: hexToRgb(get('--text', '#17201c')),
    accent,
    soft: hexToRgb(get('--accent-soft', '#d8efec')),
    // Two companions a little around the color wheel, for richer scenes.
    warm: shiftHue(accent, 40),
    cool: shiftHue(accent, -55),
  };
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [120, 120, 120];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shiftHue([r, g, b], deg) {
  // Rotate hue in RGB space (good enough for decoration).
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const m = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
  const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
  return [clamp(m[0] * r + m[1] * g + m[2] * b), clamp(m[3] * r + m[4] * g + m[5] * b), clamp(m[6] * r + m[7] * g + m[8] * b)];
}

const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
const rand = (a, b) => a + Math.random() * (b - a);
// How many things to draw for a given area, so tiny previews and big screens both look right.
const density = (w, h, per, min, max) => Math.round(Math.max(min, Math.min(max, (w * h) / per)));

// ---------- scenes ----------
// Each scene: init(w, h, c) returns state; draw(ctx, s, w, h, t, dt, c, k).
// t = seconds, dt = seconds since last frame (already speed-scaled),
// c = colors, k = intensity (0–1).

const SCENES = {
  aurora: {
    init: () => ({ bands: Array.from({ length: 4 }, (_, i) => ({ phase: rand(0, 10), speed: rand(0.05, 0.12), amp: rand(0.06, 0.14), y: 0.2 + i * 0.17 })) }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = c.dark ? 'lighter' : 'source-over';
      const hues = [c.accent, c.warm, c.cool, c.accent];
      s.bands.forEach((b, i) => {
        const col = hues[i % hues.length];
        const grad = ctx.createLinearGradient(0, b.y * h - h * 0.25, 0, b.y * h + h * 0.25);
        grad.addColorStop(0, rgba(col, 0));
        grad.addColorStop(0.5, rgba(col, (c.dark ? 0.22 : 0.16) * k));
        grad.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const y = b.y * h + Math.sin(x / w * 3 + t * b.speed * 4 + b.phase) * b.amp * h
            + Math.sin(x / w * 7 - t * b.speed * 2.3) * b.amp * 0.4 * h;
          if (x === 0) ctx.moveTo(x, y - h * 0.18); else ctx.lineTo(x, y - h * 0.18);
        }
        for (let x = w; x >= 0; x -= 12) {
          const y = b.y * h + Math.sin(x / w * 2.5 + t * b.speed * 3 + b.phase + 1) * b.amp * h;
          ctx.lineTo(x, y + h * 0.18);
        }
        ctx.closePath();
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    },
  },

  constellation: {
    init: (w, h) => ({
      pts: Array.from({ length: density(w, h, 14000, 16, 140) }, () => ({ x: rand(0, w), y: rand(0, h), vx: rand(-12, 12), vy: rand(-12, 12), r: rand(1, 2.4) })),
    }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const link = 130;
      for (const p of s.pts) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      const mouse = pointer.inside ? pointer : null;
      for (let i = 0; i < s.pts.length; i++) {
        const a = s.pts[i];
        for (let j = i + 1; j < s.pts.length; j++) {
          const b = s.pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < link) {
            ctx.strokeStyle = rgba(c.accent, (1 - d / link) * 0.45 * k);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        if (mouse) {
          const d = Math.hypot(a.x - mouse.x, a.y - mouse.y);
          if (d < link * 1.6) {
            ctx.strokeStyle = rgba(c.warm, (1 - d / (link * 1.6)) * 0.6 * k);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
          }
        }
        ctx.fillStyle = rgba(c.accent, 0.8 * k);
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      }
    },
  },

  coderain: {
    fps: 24,
    init: (w, h) => {
      const size = 16;
      return { size, cols: Array.from({ length: Math.ceil(w / size) }, () => ({ y: rand(-h, 0), speed: rand(60, 160) })) };
    },
    draw(ctx, s, w, h, t, dt, c, k) {
      // Fade the previous frame toward the background to leave trails.
      ctx.fillStyle = rgba(c.bg, 0.16);
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${s.size - 2}px ui-monospace, Menlo, Consolas, monospace`;
      const glyphs = '01<>/{}[]#$%&*+=?アイウエオカキクケコサシスセソ';
      s.cols.forEach((col, i) => {
        col.y += col.speed * dt;
        const x = i * s.size;
        ctx.fillStyle = rgba(c.dark ? [255, 255, 255] : c.text, 0.55 * k);
        ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], x, col.y);
        ctx.fillStyle = rgba(c.accent, 0.75 * k);
        ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], x, col.y - s.size);
        if (col.y > h + rand(0, h * 0.6)) { col.y = rand(-200, 0); col.speed = rand(60, 160); }
      });
    },
    reset(ctx, w, h, c) { ctx.fillStyle = rgba(c.bg, 1); ctx.fillRect(0, 0, w, h); },
  },

  synthwave: {
    init: () => ({ offset: 0 }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const horizon = h * 0.58;
      const neon = c.warm, glow = c.accent, sky = c.cool;
      // Sky glow
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
      skyGrad.addColorStop(0, rgba(sky, 0));
      skyGrad.addColorStop(1, rgba(sky, 0.22 * k));
      ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, w, horizon);
      // Sun with slits
      const r = Math.min(w, h) * 0.22, cx = w * 0.5, cy = horizon - r * 0.35;
      const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      sun.addColorStop(0, rgba(neon, 0.85 * k));
      sun.addColorStop(1, rgba(glow, 0.7 * k));
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = sun; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      for (let i = 0; i < 6; i++) {
        const y = cy + r * (0.1 + i * 0.16) + ((t * 8) % (r * 0.16));
        ctx.clearRect(cx - r, y, r * 2, 2 + i * 1.3);
      }
      ctx.restore();
      ctx.clearRect(0, horizon, w, h - horizon);
      // Floor grid
      s.offset = (s.offset + dt * 0.6) % 1;
      ctx.strokeStyle = rgba(glow, 0.55 * k);
      ctx.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const z = (i + s.offset) / 18;
        const y = horizon + (h - horizon) * z * z;
        ctx.globalAlpha = Math.min(1, z * 1.4);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (let i = -14; i <= 14; i++) {
        ctx.beginPath(); ctx.moveTo(cx + i * 12, horizon); ctx.lineTo(cx + i * w * 0.16, h); ctx.stroke();
      }
      ctx.strokeStyle = rgba(neon, 0.8 * k);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(w, horizon); ctx.stroke();
    },
  },

  waveform: {
    init: () => ({}),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const lines = [
        { col: c.accent, amp: 0.13, f: 2.2, sp: 1.1, width: 2.2, a: 0.8 },
        { col: c.warm, amp: 0.09, f: 3.7, sp: -1.6, width: 1.6, a: 0.6 },
        { col: c.cool, amp: 0.06, f: 5.3, sp: 2.3, width: 1.2, a: 0.5 },
        { col: c.accent, amp: 0.18, f: 1.3, sp: 0.6, width: 1, a: 0.3 },
      ];
      const mid = h * 0.5;
      for (const L of lines) {
        ctx.strokeStyle = rgba(L.col, L.a * k);
        ctx.lineWidth = L.width;
        ctx.shadowColor = rgba(L.col, 0.6 * k);
        ctx.shadowBlur = c.dark ? 12 : 0;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const u = x / w;
          const env = Math.sin(u * Math.PI); // fade at the edges
          const y = mid + Math.sin(u * Math.PI * 2 * L.f + t * L.sp) * Math.sin(t * 0.7 + L.f) * L.amp * h * env
            + Math.sin(u * 40 + t * 6) * 3 * env;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // Equalizer bars along the bottom
      const bars = 40, bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const v = (Math.sin(i * 0.7 + t * 3) * 0.5 + 0.5) * (Math.sin(i * 0.23 - t * 1.7) * 0.5 + 0.5);
        const bh = v * h * 0.14;
        ctx.fillStyle = rgba(c.accent, 0.25 * k);
        ctx.fillRect(i * bw + 2, h - bh - 8, bw - 4, bh);
      }
    },
  },

  starfield: {
    init: (w, h) => ({ stars: Array.from({ length: density(w, h, 6000, 60, 260) }, () => ({ x: rand(-1, 1), y: rand(-1, 1), z: rand(0.05, 1) })) }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, scale = Math.max(w, h) * 0.5;
      for (const st of s.stars) {
        const pz = st.z;
        st.z -= dt * 0.18;
        if (st.z <= 0.02) { st.x = rand(-1, 1); st.y = rand(-1, 1); st.z = 1; continue; }
        const x = cx + (st.x / st.z) * scale, y = cy + (st.y / st.z) * scale;
        const px = cx + (st.x / pz) * scale, py = cy + (st.y / pz) * scale;
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const bright = (1 - st.z) * k;
        ctx.strokeStyle = rgba(st.z < 0.3 ? c.accent : (c.dark ? [255, 255, 255] : c.text), bright * 0.9);
        ctx.lineWidth = (1 - st.z) * 2.4;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      }
    },
  },

  lofi: {
    init: (w, h) => ({
      drops: Array.from({ length: density(w, h, 9000, 24, 160) }, () => ({ x: rand(0, w), y: rand(0, h), l: rand(10, 26), v: rand(380, 620) })),
      bokeh: Array.from({ length: density(w, h, 90000, 3, 16) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(20, 70), vx: rand(-6, 6), vy: rand(-4, 4), a: rand(0.2, 0.6) })),
      ripples: [],
    }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      for (const b of s.bokeh) {
        b.x = (b.x + b.vx * dt + w) % w; b.y = (b.y + b.vy * dt + h) % h;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, rgba(Math.random() < 0.5 ? c.warm : c.accent, b.a * 0.35 * k));
        g.addColorStop(1, rgba(c.accent, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = rgba(c.dark ? [200, 220, 255] : c.text, 0.35 * k);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of s.drops) {
        d.y += d.v * dt; d.x -= d.v * dt * 0.12;
        if (d.y > h) {
          if (Math.random() < 0.25) s.ripples.push({ x: d.x, y: h - rand(4, 40), r: 0 });
          d.y = rand(-40, 0); d.x = rand(0, w * 1.15);
        }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.12, d.y - d.l);
      }
      ctx.stroke();
      s.ripples = s.ripples.filter((r) => r.r < 26);
      for (const r of s.ripples) {
        r.r += dt * 40;
        ctx.strokeStyle = rgba(c.accent, (1 - r.r / 26) * 0.5 * k);
        ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      }
    },
  },

  fireflies: {
    init: (w, h) => ({ flies: Array.from({ length: density(w, h, 30000, 8, 48) }, () => ({ x: rand(0, w), y: rand(0, h), a: rand(0, 6.28), sp: rand(12, 30), ph: rand(0, 6.28), r: rand(1.5, 3.2) })) }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      for (const f of s.flies) {
        f.a += (Math.sin(t * 0.7 + f.ph) * 0.9) * dt;
        f.x = (f.x + Math.cos(f.a) * f.sp * dt + w) % w;
        f.y = (f.y + Math.sin(f.a) * f.sp * dt + h) % h;
        const pulse = Math.max(0, Math.sin(t * 1.3 + f.ph)) ** 2;
        const col = f.ph > 3.14 ? c.warm : [255, 214, 120];
        const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 9);
        glow.addColorStop(0, rgba(col, (0.25 + pulse * 0.6) * k));
        glow.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba(col, (0.5 + pulse * 0.5) * k);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
};

Object.assign(SCENES, MORE_SCENES);

// Pointer position for interactive scenes (the canvas itself ignores clicks).
const pointer = { x: 0, y: 0, inside: false };
window.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; }, { passive: true });
window.addEventListener('pointerleave', () => { pointer.inside = false; });

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

/** Runs one scene on one canvas. Used for the page background and the picker previews. */
export class VibeRunner {
  constructor(canvas, { fullscreen = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fullscreen = fullscreen;
    this.scene = null;
    this.state = null;
    this.settings = { vibeIntensity: 'medium', vibeSpeed: 'normal' };
    this.colors = readColors();
    this.raf = 0;
    this.last = 0;
    this.t = rand(0, 100);
    this.loop = this.loop.bind(this);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = this.fullscreen ? window.innerWidth : this.canvas.clientWidth;
    const h = this.fullscreen ? window.innerHeight : this.canvas.clientHeight;
    if (!w || !h) return false;
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  set(sceneId, settings) {
    this.settings = { ...this.settings, ...settings };
    this.colors = readColors();
    const scene = SCENES[sceneId] || null;
    if (scene !== this.scene || !this.state) {
      this.stop();
      this.scene = scene;
      if (!scene || !this.resize()) { this.clear(); return; }
      this.state = scene.init(this.w, this.h, this.colors);
      scene.reset?.(this.ctx, this.w, this.h, this.colors);
    } else {
      this.scene.reset?.(this.ctx, this.w, this.h, this.colors);
    }
    this.start();
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.state = null;
  }

  start() {
    if (!this.scene || this.raf) return;
    if (reducedMotion?.matches) { this.frame(1 / 30); return; } // one still frame
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Draw a still frame (a short burst of simulation), for quiet previews. */
  snapshot(sceneId, settings, steps = 45) {
    this.stop();
    this.settings = { ...this.settings, ...settings };
    this.colors = readColors();
    this.scene = SCENES[sceneId] || null;
    if (!this.scene || !this.resize()) return;
    this.state = this.scene.init(this.w, this.h, this.colors);
    this.scene.reset?.(this.ctx, this.w, this.h, this.colors);
    for (let i = 0; i < steps; i++) this.frame(1 / 30);
  }

  frame(dt) {
    const speed = SPEED[this.settings.vibeSpeed] ?? 1;
    const k = INTENSITY[this.settings.vibeIntensity] ?? 0.75;
    this.t += dt * speed;
    this.scene.draw(this.ctx, this.state, this.w, this.h, this.t, dt * speed, this.colors, k);
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const minGap = 1000 / (this.scene.fps || 45);
    if (now - this.last < minGap) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frame(dt);
  }
}

// ---------- the page background ----------

let bg = null;
const DESKTOP = window.matchMedia?.('(min-width: 1024px)');

let shuffleScene = null;
let shuffleTimer = 0;
let currentSection = null;
const topicChoice = {};

function resolveScene(vibe) {
  if (vibe === 'shuffle') {
    if (!shuffleScene) {
      shuffleScene = pickDifferent(SCENE_IDS, shuffleScene);
      clearInterval(shuffleTimer);
      shuffleTimer = setInterval(() => {
        shuffleScene = pickDifferent(SCENE_IDS, shuffleScene);
        syncBackground(currentSettings());
      }, 5 * 60 * 1000);
    }
    return shuffleScene;
  }
  clearInterval(shuffleTimer);
  shuffleScene = null;
  if (vibe === 'topic') {
    const key = TOPIC_VIBES[currentSection] ? currentSection : 'default';
    // Keep the same pick while you stay in a topic.
    topicChoice[key] ||= TOPIC_VIBES[key][(Math.random() * TOPIC_VIBES[key].length) | 0];
    return topicChoice[key];
  }
  return vibe;
}

function pickDifferent(list, not) {
  const options = list.filter((x) => x !== not);
  return options[(Math.random() * options.length) | 0];
}

function syncBackground(settings) {
  const canvas = document.getElementById('ambient');
  if (!canvas) return;
  bg ||= new VibeRunner(canvas, { fullscreen: true });
  const on = settings.vibe !== 'off' && DESKTOP?.matches && !document.hidden;
  canvas.hidden = !on;
  if (on) bg.set(resolveScene(settings.vibe), settings); else { bg.stop(); bg.clear(); bg.scene = null; }
}

// The app tells us which topic you're looking at (for "Match my topic").
document.addEventListener('signal-section', (e) => {
  const next = e.detail || null;
  if (next === currentSection) return;
  currentSection = next;
  if (currentSettings().vibe === 'topic') syncBackground(currentSettings());
});

const currentSettings = () => window.SignalTheme?.current || { vibe: 'off' };

document.addEventListener('signal-theme', (e) => syncBackground(e.detail));
document.addEventListener('visibilitychange', () => syncBackground(currentSettings()));
DESKTOP?.addEventListener?.('change', () => syncBackground(currentSettings()));
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (bg?.scene) { bg.state = null; syncBackground(currentSettings()); } }, 200);
});

syncBackground(currentSettings());
