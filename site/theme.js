// Theme engine. It loads before the page renders (a plain, non-module
// script in <head>) so your colors apply without a flash of the default theme.
//
// Every palette is generated from one hue, and the accent colors are nudged
// lighter or darker until text on them meets WCAG AA contrast (4.5:1). That
// means any color you pick stays readable.
//
// Colors are applied with element.style.setProperty(). The page's CSP blocks
// inline style attributes and <style> tags, but not the CSS Object Model.

(function () {
  'use strict';

  const PRESETS = {
    lagoon:   { name: 'Lagoon',   hue: 174, sat: 70 },
    ocean:    { name: 'Ocean',    hue: 211, sat: 78 },
    lavender: { name: 'Lavender', hue: 262, sat: 62 },
    rose:     { name: 'Rose',     hue: 338, sat: 68 },
    sunset:   { name: 'Sunset',   hue: 20,  sat: 82 },
    honey:    { name: 'Honey',    hue: 40,  sat: 86 },
    forest:   { name: 'Forest',   hue: 145, sat: 48 },
    graphite: { name: 'Graphite', hue: 215, sat: 10 },
  };

  const DEFAULTS = {
    preset: 'lagoon', custom: '#0f766e', mode: 'auto', tint: 'tinted', size: 'm', density: 'comfy', corners: 'round',
    // Background animation ("vibe") shown in the empty space on desktop. See ambient.js.
    vibe: 'aurora', vibeIntensity: 'medium', vibeSpeed: 'normal', vibePlace: 'side', layoutWidth: 'full',
  };
  const OPTIONS = {
    mode: ['auto', 'light', 'dark'],
    tint: ['tinted', 'neutral'],
    size: ['s', 'm', 'l'],
    density: ['comfy', 'compact'],
    corners: ['square', 'soft', 'round'],
    vibe: ['off', 'shuffle', 'topic', 'aurora', 'constellation', 'coderain', 'synthwave', 'waveform', 'starfield', 'lofi', 'fireflies',
      'ocean', 'lavalamp', 'bubbles', 'snow', 'sakura', 'radar', 'circuit', 'hexgrid', 'flowfield', 'galaxy', 'nebula',
      'vinyl', 'spectrum', 'plasma', 'invaders', 'tetris', 'dvd', 'kaleidoscope', 'tunnel'],
    vibeIntensity: ['subtle', 'medium', 'vivid'],
    vibeSpeed: ['slow', 'normal', 'fast'],
    vibePlace: ['side', 'full'],
    layoutWidth: ['full', 'roomy'],
  };

  // ---------- color math ----------

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((x) => Math.round(x * 255));
  }

  function hexToHsl(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return { hue: Math.round(h), sat: Math.round(s * 100), light: Math.round(l * 100) };
  }

  const hex = (h, s, l) => '#' + hslToRgb(h, s, l).map((x) => x.toString(16).padStart(2, '0')).join('');

  function luminance([r, g, b]) {
    const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }

  // Move lightness in `step` direction until `fg` has enough contrast on `bg`.
  function ensureContrast(h, s, l, bgRgb, step, min = 4.5) {
    while (l > 2 && l < 98 && contrast(hslToRgb(h, s, l), bgRgb) < min) l += step;
    return l;
  }

  // ---------- palette ----------

  function palette(hue, sat, dark, tint) {
    const n = tint === 'neutral' ? Math.min(sat, 5) : Math.min(sat * 0.35, 22); // neutral saturation
    const h = hue;
    if (!dark) {
      const surface = [h, n * 0.4, 100], bg = [h, n, 97];
      const accentL = ensureContrast(h, sat, 40, hslToRgb(...surface), -1);
      const soft = [h, Math.min(sat, 70) * 0.7, 92];
      const accentTextL = ensureContrast(h, sat, accentL, hslToRgb(...soft), -1);
      return {
        '--bg': hex(...bg), '--surface': hex(...surface), '--surface-2': hex(h, n, 94), '--border': hex(h, n, 86),
        '--text': hex(h, Math.min(n, 18), 11), '--muted': hex(h, Math.min(n, 12), 37),
        '--accent': hex(h, sat, accentL), '--accent-soft': hex(...soft), '--accent-text': hex(h, sat, accentTextL),
        '--focus': hex(h, sat, accentL),
        '--warn': '#b45309', '--warn-soft': '#fdf0dd', '--danger': '#b42318', '--danger-soft': '#fbe3e1',
        '--shadow': '0 1px 2px rgb(0 0 0 / 0.05)', 'color-scheme': 'light',
      };
    }
    const bg = [h, n, 7], surface = [h, n, 10];
    const accentL = ensureContrast(h, sat, 58, hslToRgb(...surface), +1);
    const soft = [h, Math.min(sat, 60) * 0.55, 17];
    const accentTextL = ensureContrast(h, sat, Math.max(accentL, 72), hslToRgb(...soft), +1);
    return {
      '--bg': hex(...bg), '--surface': hex(...surface), '--surface-2': hex(h, n, 14), '--border': hex(h, n, 21),
      '--text': hex(h, Math.min(n, 14), 91), '--muted': hex(h, Math.min(n, 10), 65),
      '--accent': hex(h, sat, accentL), '--accent-soft': hex(...soft), '--accent-text': hex(h, sat, accentTextL),
      '--focus': hex(h, sat, accentL),
      '--warn': '#f59e0b', '--warn-soft': '#3a2a10', '--danger': '#f87171', '--danger-soft': '#3b1a18',
      '--shadow': 'none', 'color-scheme': 'dark',
    };
  }

  // ---------- settings ----------

  function sanitize(input) {
    const a = Object.assign({}, DEFAULTS);
    if (!input || typeof input !== 'object') return a;
    if (input.preset === 'custom' || Object.prototype.hasOwnProperty.call(PRESETS, input.preset)) a.preset = input.preset;
    if (hexToHsl(input.custom)) a.custom = input.custom.toLowerCase();
    for (const [k, allowed] of Object.entries(OPTIONS)) if (allowed.includes(input[k])) a[k] = input[k];
    return a;
  }

  function load() {
    try {
      const prefs = JSON.parse(localStorage.getItem('signal:v1'))?.prefs || {};
      // Older versions stored only a light/dark choice.
      return sanitize(prefs.appearance || { mode: prefs.theme === 'light' || prefs.theme === 'dark' ? prefs.theme : 'auto' });
    } catch {
      return sanitize(null);
    }
  }

  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let current = load();

  function isDark(a) {
    return a.mode === 'dark' || (a.mode === 'auto' && !!media?.matches);
  }

  function colorsFor(a) {
    if (a.preset === 'custom') {
      const c = hexToHsl(a.custom);
      return { hue: c.hue, sat: Math.max(c.sat, 8) };
    }
    return PRESETS[a.preset];
  }

  function apply(a) {
    current = sanitize(a);
    const root = document.documentElement;
    const { hue, sat } = colorsFor(current);
    const vars = palette(hue, sat, isDark(current), current.tint);
    for (const [k, v] of Object.entries(vars)) {
      if (k === 'color-scheme') root.style.colorScheme = v;
      else root.style.setProperty(k, v);
    }
    root.dataset.theme = isDark(current) ? 'dark' : 'light';
    root.dataset.size = current.size;
    root.dataset.density = current.density;
    root.dataset.corners = current.corners;
    root.dataset.vibePlace = current.vibePlace;
    root.dataset.width = current.layoutWidth;
    // Tell the background animation to pick up the new colors and settings.
    document.dispatchEvent(new CustomEvent('signal-theme', { detail: current }));
    return current;
  }

  media?.addEventListener?.('change', () => { if (current.mode === 'auto') apply(current); });

  // Swatch preview colors for the picker: [background, surface, accent].
  function preview(presetOrHex, dark, tint) {
    const c = PRESETS[presetOrHex] || { ...hexToHsl(presetOrHex) };
    const p = palette(c.hue, Math.max(c.sat, 8), dark, tint || 'tinted');
    return { bg: p['--bg'], surface: p['--surface'], accent: p['--accent'], soft: p['--accent-soft'], text: p['--text'] };
  }

  window.SignalTheme = { PRESETS, DEFAULTS, OPTIONS, sanitize, apply, preview, isDark, get current() { return current; } };
  apply(current);
})();
