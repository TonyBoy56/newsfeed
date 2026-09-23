// More vibes. Same contract as the scenes in ambient.js:
//   init(w, h, c) → state
//   draw(ctx, state, w, h, t, dt, c, k)
// t = seconds, dt = seconds since last frame (speed-scaled),
// c = theme colors { dark, bg, text, accent, soft, warm, cool } as [r,g,b],
// k = intensity 0–1.

const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const density = (w, h, per, min, max) => Math.round(Math.max(min, Math.min(max, (w * h) / per)));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const ink = (c) => (c.dark ? [235, 240, 255] : c.text);
// Cheap smooth pseudo-noise from layered sines: plenty for decoration.
const noise = (x, y, t) => Math.sin(x * 1.3 + t) * Math.cos(y * 1.7 - t * 0.8) + 0.5 * Math.sin((x + y) * 0.7 + t * 0.5);

// Fades the last frame toward the background, leaving motion trails.
const fade = (ctx, w, h, c, a) => { ctx.fillStyle = rgba(c.bg, a); ctx.fillRect(0, 0, w, h); };
const solidReset = (ctx, w, h, c) => { ctx.fillStyle = rgba(c.bg, 1); ctx.fillRect(0, 0, w, h); };

export const MORE_SCENES = {
  // ---------------- Techy ----------------
  radar: {
    init: () => ({ blips: [], angle: 0 }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.62, cy = h * 0.5, R = Math.min(w, h) * 0.42;
      ctx.strokeStyle = rgba(c.accent, 0.3 * k);
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      s.angle = (s.angle + dt * 1.1) % (Math.PI * 2);
      // Sweep: a fan of fading wedges behind the beam.
      for (let i = 0; i < 24; i++) {
        const a0 = s.angle - i * 0.035;
        ctx.fillStyle = rgba(c.accent, (0.22 * (1 - i / 24)) * k);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0 - 0.036, a0); ctx.closePath(); ctx.fill();
      }
      // New contacts appear where the beam passes.
      if (Math.random() < 0.08) {
        const r = rand(0.15, 0.95) * R;
        s.blips.push({ x: cx + Math.cos(s.angle) * r, y: cy + Math.sin(s.angle) * r, life: 1, hot: Math.random() < 0.2 });
      }
      s.blips = s.blips.filter((b) => (b.life -= dt * 0.35) > 0);
      for (const b of s.blips) {
        ctx.fillStyle = rgba(b.hot ? c.warm : c.accent, b.life * k);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.hot ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
        if (b.hot) { ctx.strokeStyle = rgba(c.warm, b.life * 0.6 * k); ctx.beginPath(); ctx.arc(b.x, b.y, 9 * (1.4 - b.life), 0, Math.PI * 2); ctx.stroke(); }
      }
    },
  },

  circuit: {
    init(w, h) {
      const g = 22, paths = [];
      for (let n = 0; n < density(w, h, 16000, 10, 60); n++) {
        let x = Math.round(rand(0, w) / g) * g, y = Math.round(rand(0, h) / g) * g;
        const pts = [[x, y]];
        let dir = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        for (let i = 0; i < 12; i++) {
          if (Math.random() < 0.35) dir = Math.random() < 0.5 ? [dir[1], dir[0]] : [-dir[1], -dir[0]];
          x += dir[0] * g * Math.ceil(rand(1, 4)); y += dir[1] * g * Math.ceil(rand(1, 4));
          pts.push([x, y]);
        }
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        paths.push({ pts, len, pos: rand(0, len), speed: rand(60, 180) });
      }
      return { paths };
    },
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.5;
      for (const p of s.paths) {
        ctx.strokeStyle = rgba(c.accent, 0.16 * k);
        ctx.beginPath(); p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        ctx.fillStyle = rgba(c.accent, 0.35 * k);
        for (const [x, y] of [p.pts[0], p.pts[p.pts.length - 1]]) ctx.fillRect(x - 3, y - 3, 6, 6);
        // A pulse of current travelling along the trace.
        p.pos = (p.pos + p.speed * dt) % p.len;
        let d = p.pos;
        for (let i = 1; i < p.pts.length; i++) {
          const [x0, y0] = p.pts[i - 1], [x1, y1] = p.pts[i];
          const seg = Math.hypot(x1 - x0, y1 - y0);
          if (d <= seg) {
            const u = d / seg, px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u;
            const glow = ctx.createRadialGradient(px, py, 0, px, py, 10);
            glow.addColorStop(0, rgba(c.warm, 0.9 * k)); glow.addColorStop(1, rgba(c.warm, 0));
            ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill();
            break;
          }
          d -= seg;
        }
      }
    },
  },

  hexgrid: {
    init: () => ({}),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const r = 18, hw = Math.sqrt(3) * r;
      const cx1 = w * (0.5 + 0.3 * Math.sin(t * 0.3)), cy1 = h * (0.5 + 0.3 * Math.cos(t * 0.23));
      for (let row = -1, y = 0; y < h + r * 2; row++, y = row * r * 1.5) {
        for (let col = -1; col * hw < w + hw; col++) {
          const x = col * hw + (row % 2 ? hw / 2 : 0);
          const d = Math.hypot(x - cx1, y - cy1) / Math.max(w, h);
          const v = Math.max(0, Math.sin(d * 18 - t * 2.2)) * (1 - d);
          ctx.strokeStyle = rgba(c.accent, (0.08 + v * 0.5) * k);
          ctx.fillStyle = rgba(v > 0.85 ? c.warm : c.accent, v * 0.18 * k);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + (i * Math.PI) / 3;
            const px = x + Math.cos(a) * (r - 2), py = y + Math.sin(a) * (r - 2);
            if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
    },
  },

  flowfield: {
    fps: 40,
    init: (w, h) => ({ ps: Array.from({ length: density(w, h, 2500, 80, 700) }, () => ({ x: rand(0, w), y: rand(0, h), hue: Math.random() })) }),
    reset: solidReset,
    draw(ctx, s, w, h, t, dt, c, k) {
      fade(ctx, w, h, c, 0.035);
      ctx.lineWidth = 1.6;
      for (const p of s.ps) {
        const a = noise(p.x / 220, p.y / 220, t * 0.15) * Math.PI * 2;
        const nx = p.x + Math.cos(a) * 60 * dt, ny = p.y + Math.sin(a) * 60 * dt;
        ctx.strokeStyle = rgba(p.hue < 0.33 ? c.accent : p.hue < 0.66 ? c.warm : c.cool, 0.8 * k);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
        p.x = nx; p.y = ny;
        if (p.x < 0 || p.x > w || p.y < 0 || p.y > h || Math.random() < 0.002) { p.x = rand(0, w); p.y = rand(0, h); }
      }
    },
  },

  // ---------------- Calm ----------------
  ocean: {
    init: () => ({}),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const layers = [[c.cool, 0.55, 0.12], [c.accent, 0.64, 0.16], [mix(c.accent, c.cool, 0.5), 0.74, 0.2], [c.accent, 0.84, 0.26]];
      layers.forEach(([col, base, a], i) => {
        ctx.fillStyle = rgba(col, a * k * (c.dark ? 1.2 : 1));
        ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 10) {
          const y = h * base + Math.sin(x / (140 + i * 40) + t * (0.6 + i * 0.25)) * (10 + i * 5) + Math.sin(x / 57 - t * 1.3) * 4;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      });
      // Sun glints on the water
      for (let i = 0; i < 30; i++) {
        const x = (i * 97.3 + t * 20) % w, y = h * (0.6 + ((i * 37) % 30) / 100);
        ctx.fillStyle = rgba(ink(c), Math.max(0, Math.sin(t * 3 + i)) * 0.35 * k);
        ctx.fillRect(x, y, 6, 1.5);
      }
    },
  },

  lavalamp: {
    init: (w, h) => ({ blobs: Array.from({ length: 8 }, (_, i) => ({ x: rand(0.1, 0.9), r: rand(0.08, 0.16), sp: rand(0.05, 0.12), ph: rand(0, 6.28), col: i % 3 })) }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = c.dark ? 'lighter' : 'source-over';
      const cols = [c.accent, c.warm, c.cool];
      for (const b of s.blobs) {
        const y = (0.5 + 0.45 * Math.sin(t * b.sp * 2 + b.ph)) * h;
        const x = (b.x + 0.05 * Math.sin(t * 0.3 + b.ph)) * w;
        const r = b.r * Math.min(w, h) * (1 + 0.15 * Math.sin(t + b.ph)) * 1.6;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(cols[b.col], 0.55 * k));
        g.addColorStop(0.55, rgba(cols[b.col], 0.25 * k));
        g.addColorStop(1, rgba(cols[b.col], 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },

  bubbles: {
    init: (w, h) => ({ bs: Array.from({ length: density(w, h, 20000, 10, 70) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(3, 16), v: rand(15, 45), ph: rand(0, 6.28) })) }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      for (const b of s.bs) {
        b.y -= b.v * dt;
        if (b.y < -20) { b.y = h + 20; b.x = rand(0, w); }
        const x = b.x + Math.sin(t * 1.4 + b.ph) * 8;
        ctx.strokeStyle = rgba(c.accent, 0.55 * k);
        ctx.lineWidth = 1.2;
        ctx.fillStyle = rgba(c.accent, 0.08 * k);
        ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = rgba(ink(c), 0.5 * k);
        ctx.beginPath(); ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.2, 0, Math.PI * 2); ctx.fill();
      }
    },
  },

  // ---------------- Nature ----------------
  snow: {
    init: (w, h) => ({ fl: Array.from({ length: density(w, h, 5000, 40, 260) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.8, 3.2), v: rand(20, 60), ph: rand(0, 6.28) })) }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const col = c.dark ? [240, 246, 255] : mix(c.accent, c.text, 0.3);
      for (const f of s.fl) {
        f.y += f.v * dt * (0.5 + f.r / 3);
        f.x += Math.sin(t * 0.8 + f.ph) * 12 * dt;
        if (f.y > h + 5) { f.y = -5; f.x = rand(0, w); }
        ctx.fillStyle = rgba(col, (0.35 + f.r / 6) * k);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
    },
  },

  sakura: {
    init: (w, h) => ({ ps: Array.from({ length: density(w, h, 18000, 12, 80) }, () => ({ x: rand(0, w), y: rand(0, h), s: rand(5, 11), rot: rand(0, 6.28), vr: rand(-2, 2), v: rand(25, 55), ph: rand(0, 6.28) })) }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const pink = mix([255, 170, 200], c.warm, 0.35);
      for (const p of s.ps) {
        p.y += p.v * dt; p.x += (Math.sin(t + p.ph) * 25 + 18) * dt; p.rot += p.vr * dt;
        if (p.y > h + 12 || p.x > w + 12) { p.y = -12; p.x = rand(-w * 0.2, w); }
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.55 + 0.45 * Math.sin(t * 2 + p.ph));
        ctx.fillStyle = rgba(pink, 0.7 * k);
        ctx.beginPath();
        ctx.moveTo(0, -p.s);
        ctx.quadraticCurveTo(p.s, -p.s * 0.2, 0, p.s);
        ctx.quadraticCurveTo(-p.s, -p.s * 0.2, 0, -p.s);
        ctx.fill();
        ctx.restore();
      }
    },
  },

  // ---------------- Space ----------------
  galaxy: {
    init: (w, h) => ({
      stars: Array.from({ length: density(w, h, 1800, 200, 1400) }, () => {
        const arm = (Math.random() * 3) | 0, r = Math.pow(Math.random(), 0.6);
        return { r, a: arm * ((Math.PI * 2) / 3) + r * 5 + rand(-0.35, 0.35) * (1 - r * 0.5), size: rand(1, 2.6), tint: Math.random() };
      }),
    }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.6, cy = h * 0.5, R = Math.min(w, h) * 0.46;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.35);
      core.addColorStop(0, rgba(c.warm, 0.5 * k)); core.addColorStop(1, rgba(c.warm, 0));
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, R * 0.35, 0, Math.PI * 2); ctx.fill();
      for (const st of s.stars) {
        const a = st.a + t * 0.12 / (0.25 + st.r);
        const x = cx + Math.cos(a) * st.r * R, y = cy + Math.sin(a) * st.r * R * 0.55;
        ctx.fillStyle = rgba(st.tint < 0.5 ? c.accent : st.tint < 0.8 ? ink(c) : c.warm, (1 - st.r * 0.45) * k);
        ctx.fillRect(x, y, st.size, st.size);
      }
    },
  },

  nebula: {
    init: (w, h) => ({
      clouds: Array.from({ length: 7 }, (_, i) => ({ x: rand(0, 1), y: rand(0, 1), r: rand(0.25, 0.5), ph: rand(0, 6.28), col: i % 3 })),
      stars: Array.from({ length: density(w, h, 3000, 40, 400) }, () => ({ x: rand(0, w), y: rand(0, h), s: rand(0.4, 1.6), ph: rand(0, 6.28) })),
    }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = c.dark ? 'lighter' : 'source-over';
      const cols = [c.accent, c.warm, c.cool];
      for (const cl of s.clouds) {
        const x = (cl.x + 0.08 * Math.sin(t * 0.07 + cl.ph)) * w, y = (cl.y + 0.08 * Math.cos(t * 0.05 + cl.ph)) * h;
        const r = cl.r * Math.max(w, h);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(cols[cl.col], 0.22 * k)); g.addColorStop(1, rgba(cols[cl.col], 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const st of s.stars) {
        ctx.fillStyle = rgba(ink(c), (0.3 + 0.5 * Math.max(0, Math.sin(t * 1.5 + st.ph))) * k);
        ctx.fillRect(st.x, st.y, st.s, st.s);
      }
    },
  },

  // ---------------- Music ----------------
  vinyl: {
    init: () => ({ rot: 0 }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.38, cx = w * 0.62, cy = h * 0.5;
      s.rot += dt * 3.5; // 33⅓ rpm
      ctx.fillStyle = rgba(c.dark ? [12, 12, 14] : [28, 28, 32], 0.9 * k);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      for (let r = R * 0.38; r < R * 0.97; r += 3) {
        ctx.strokeStyle = rgba([255, 255, 255], (0.03 + 0.03 * Math.sin(r * 0.9)) * k);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      // Rotating sheen
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(s.rot);
      for (const off of [0, Math.PI]) {
        ctx.fillStyle = rgba([255, 255, 255], 0.07 * k);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 0.97, off - 0.25, off + 0.25); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = rgba(c.accent, 0.95 * k);
      ctx.beginPath(); ctx.arc(0, 0, R * 0.33, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(c.warm, 0.9 * k);
      ctx.fillRect(-R * 0.2, -R * 0.05, R * 0.4, R * 0.04);
      ctx.restore();
      ctx.fillStyle = rgba(c.bg, 1);
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.025, 0, Math.PI * 2); ctx.fill();
      // Tonearm
      ctx.strokeStyle = rgba(ink(c), 0.6 * k); ctx.lineWidth = 4; ctx.lineCap = 'round';
      const px = cx + R * 1.05, py = cy - R * 0.85, sway = Math.sin(t * 0.2) * 0.02;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx + R * (0.62 + sway), cy + R * 0.2); ctx.stroke();
      ctx.fillStyle = rgba(ink(c), 0.7 * k); ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
      ctx.lineCap = 'butt';
    },
  },

  spectrum: {
    init: () => ({}),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.6, cy = h * 0.5, R = Math.min(w, h) * 0.2, bars = 96;
      const beat = Math.pow(Math.max(0, Math.sin(t * 4.2)), 8);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (1.1 + beat * 0.2));
      g.addColorStop(0, rgba(c.accent, 0.35 * k)); g.addColorStop(1, rgba(c.accent, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(2, (Math.PI * 2 * R) / bars - 2);
      ctx.lineCap = 'round';
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2 + t * 0.15;
        const v = Math.abs(noise(i * 0.35, 0, t * 1.8)) * 0.8 + beat * 0.4 * (i % 4 === 0 ? 1 : 0.4);
        const len = R * (0.15 + v * 0.9);
        ctx.strokeStyle = rgba(mix(c.accent, c.warm, i / bars), 0.8 * k);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len));
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    },
  },

  // ---------------- Retro ----------------
  plasma: {
    fps: 30,
    init: () => {
      const off = document.createElement('canvas');
      off.width = 96; off.height = 54;
      return { off, octx: off.getContext('2d') };
    },
    draw(ctx, s, w, h, t, dt, c, k) {
      const { off, octx } = s;
      const img = octx.createImageData(off.width, off.height);
      const A = c.accent, B = c.warm, C = c.cool;
      for (let y = 0; y < off.height; y++) {
        for (let x = 0; x < off.width; x++) {
          const v = (Math.sin(x / 9 + t) + Math.sin(y / 7 - t * 0.7) + Math.sin((x + y) / 11 + t * 0.5) + Math.sin(Math.hypot(x - 48, y - 27) / 6 - t)) / 4;
          const u = (v + 1) / 2;
          const col = u < 0.5 ? mix(C, A, u * 2) : mix(A, B, (u - 0.5) * 2);
          const i = (y * off.width + x) * 4;
          img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255 * 0.5 * k;
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, w, h);
    },
  },

  invaders: {
    fps: 20,
    init: (w, h) => ({ x: 0, dir: 1, y: 0, frame: 0, acc: 0, cols: Math.max(4, Math.min(11, Math.floor(w / 70))), rows: Math.max(2, Math.min(5, Math.floor(h / 120))) }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const SPRITES = [
        ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'],
        ['00100000100', '10010001001', '10111111101', '11101110111', '11111111111', '01111111110', '00100000100', '01000000010'],
      ];
      const px = Math.max(2, Math.min(5, Math.floor(w / 220)));
      const sw = 11 * px, gap = sw * 0.7;
      const gridW = s.cols * (sw + gap);
      s.acc += dt;
      if (s.acc > 0.5) {
        s.acc = 0; s.frame ^= 1;
        s.x += s.dir * px * 3;
        if (s.x < 0 || s.x + gridW > w * 0.95) { s.dir *= -1; s.y += px * 6; }
        if (s.y > h * 0.5) s.y = 0;
      }
      const cols = [c.accent, c.warm, c.cool];
      for (let r = 0; r < s.rows; r++) {
        for (let q = 0; q < s.cols; q++) {
          const ox = s.x + w * 0.03 + q * (sw + gap), oy = h * 0.12 + s.y + r * (8 * px + gap);
          ctx.fillStyle = rgba(cols[r % 3], 0.7 * k);
          SPRITES[s.frame].forEach((line, yy) => {
            for (let xx = 0; xx < line.length; xx++) if (line[xx] === '1') ctx.fillRect(ox + xx * px, oy + yy * px, px, px);
          });
        }
      }
      // The player's cannon and a shot
      const cx = w * (0.5 + 0.35 * Math.sin(t * 0.6));
      ctx.fillStyle = rgba(ink(c), 0.6 * k);
      ctx.fillRect(cx - px * 5, h - px * 8, px * 10, px * 3); ctx.fillRect(cx - px, h - px * 10, px * 2, px * 2);
      const shotY = h - px * 12 - ((t * 300) % (h * 0.8));
      ctx.fillStyle = rgba(c.warm, 0.8 * k); ctx.fillRect(cx - px / 2, shotY, px, px * 3);
    },
  },

  tetris: {
    fps: 30,
    init(w, h) {
      const size = 22, cols = Math.floor(w / size), rows = Math.floor(h / size);
      // Start with a ragged stack so there's something to look at right away.
      const grid = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, () => (y > rows * 0.7 && Math.random() < 0.55 ? (Math.random() * 4) | 0 : -1)));
      return { size, cols, rows, grid, pieces: [], acc: 0 };
    },
    draw(ctx, s, w, h, t, dt, c, k) {
      const SHAPES = [[[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 1], [1, 1], [2, 1]], [[2, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]]];
      const cols = [c.accent, c.warm, c.cool, mix(c.accent, c.warm, 0.5)];
      const fits = (p, dy = 0) => p.cells.every(([x, y]) => {
        const gx = p.x + x, gy = p.y + y + dy;
        return gx >= 0 && gx < s.cols && gy < s.rows && (gy < 0 || s.grid[gy][gx] < 0);
      });
      // Several pieces fall at once, each in its own lane.
      const lanes = Math.max(1, Math.floor(s.cols / 8));
      while (s.pieces.length < lanes) {
        const lane = s.pieces.length;
        s.pieces.push({ cells: pick(SHAPES), x: Math.floor(lane * (s.cols / lanes) + rand(0, s.cols / lanes - 3)), y: -2, col: (Math.random() * cols.length) | 0 });
      }
      s.acc += dt;
      while (s.acc > 0.06) {
        s.acc -= 0.06;
        s.pieces = s.pieces.filter((piece) => {
          if (fits(piece, 1)) { piece.y++; return true; }
          for (const [x, y] of piece.cells) if (piece.y + y >= 0) s.grid[piece.y + y][piece.x + x] = piece.col;
          if (piece.y <= 0) s.grid = s.grid.map((row) => row.fill(-1)); // topped out: start fresh
          s.grid = s.grid.filter((row) => row.some((v) => v < 0));
          while (s.grid.length < s.rows) s.grid.unshift(Array(s.cols).fill(-1));
          return false;
        });
      }
      ctx.clearRect(0, 0, w, h);
      const cell = (x, y, col, a) => {
        ctx.fillStyle = rgba(cols[col], a * k);
        ctx.fillRect(x * s.size + 1, y * s.size + 1, s.size - 2, s.size - 2);
        ctx.fillStyle = rgba([255, 255, 255], 0.15 * k);
        ctx.fillRect(x * s.size + 1, y * s.size + 1, s.size - 2, 3);
      };
      s.grid.forEach((row, y) => row.forEach((v, x) => { if (v >= 0) cell(x, y, v, 0.45); }));
      for (const piece of s.pieces) for (const [x, y] of piece.cells) if (piece.y + y >= 0) cell(piece.x + x, piece.y + y, piece.col, 0.8);
    },
  },

  dvd: {
    init: (w, h) => ({ x: rand(0, w * 0.6), y: rand(0, h * 0.6), vx: 110, vy: 80, col: 0, flash: 0 }),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const size = Math.max(22, Math.min(64, w / 12));
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      const tw = ctx.measureText('SIGNAL').width, th = size;
      s.x += s.vx * dt; s.y += s.vy * dt;
      let hits = 0;
      if (s.x < 0 || s.x + tw > w) { s.vx *= -1; s.x = Math.max(0, Math.min(w - tw, s.x)); hits++; }
      if (s.y < 0 || s.y + th > h) { s.vy *= -1; s.y = Math.max(0, Math.min(h - th, s.y)); hits++; }
      if (hits) s.col = (s.col + 1) % 3;
      if (hits === 2) s.flash = 1; // the legendary corner hit
      s.flash = Math.max(0, s.flash - dt * 0.5);
      const cols = [c.accent, c.warm, c.cool];
      ctx.fillStyle = rgba(cols[s.col], (0.55 + s.flash * 0.45) * k);
      ctx.textBaseline = 'top';
      ctx.fillText('SIGNAL', s.x, s.y);
      if (s.flash > 0) {
        ctx.font = `600 ${size * 0.35}px system-ui, sans-serif`;
        ctx.fillText('CORNER!', s.x, s.y + th * 1.05);
      }
    },
  },

  // ---------------- Trippy ----------------
  kaleidoscope: {
    init: () => ({}),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.6, cy = h * 0.5, R = Math.min(w, h) * 0.45, n = 12;
      const cols = [c.accent, c.warm, c.cool];
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.05);
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI * 2) / n);
        if (i % 2) ctx.scale(1, -1);
        for (let j = 0; j < 5; j++) {
          const d = R * (0.2 + j * 0.16) + Math.sin(t * 0.8 + j) * R * 0.05;
          const sz = R * (0.05 + 0.04 * Math.sin(t * 1.2 + j * 1.7));
          ctx.fillStyle = rgba(cols[j % 3], 0.3 * k);
          ctx.strokeStyle = rgba(cols[(j + 1) % 3], 0.5 * k);
          ctx.beginPath();
          ctx.moveTo(d, 0); ctx.lineTo(d + sz * 2, sz * (1 + Math.sin(t + j))); ctx.lineTo(d + sz * 0.5, sz * 2.2);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    },
  },

  tunnel: {
    init: () => ({}),
    draw(ctx, s, w, h, t, dt, c, k) {
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.6 + Math.sin(t * 0.4) * w * 0.05, cy = h * 0.5 + Math.cos(t * 0.3) * h * 0.05;
      const cols = [c.accent, c.warm, c.cool];
      for (let i = 0; i < 22; i++) {
        const depth = (i / 22 + (t * 0.25) % 1) % 1;
        const r = Math.pow(depth, 2.2) * Math.max(w, h) * 0.9;
        ctx.strokeStyle = rgba(cols[i % 3], depth * 0.6 * k);
        ctx.lineWidth = 1 + depth * 3;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(depth * 2 + t * 0.2);
        ctx.strokeRect(-r, -r * 0.62, r * 2, r * 1.24);
        ctx.restore();
      }
    },
  },
};

// Picker groups and descriptions for every vibe (built-in ones included).
export const VIBE_GROUPS = ['Calm', 'Nature', 'Techy', 'Space', 'Music', 'Retro', 'Trippy'];
export const MORE_VIBES = [
  { id: 'ocean', name: 'Ocean', mood: 'Rolling waves, slow breaths', group: 'Calm' },
  { id: 'lavalamp', name: 'Lava lamp', mood: 'Warm blobs, groovy and slow', group: 'Calm' },
  { id: 'bubbles', name: 'Bubbles', mood: 'Light and fizzy', group: 'Calm' },
  { id: 'snow', name: 'Snowfall', mood: 'Quiet, cozy, blanket weather', group: 'Nature' },
  { id: 'sakura', name: 'Sakura', mood: 'Drifting cherry blossoms', group: 'Nature' },
  { id: 'radar', name: 'Radar', mood: 'SOC at 2 a.m., contacts inbound', group: 'Techy' },
  { id: 'circuit', name: 'Circuit', mood: 'Current running through the board', group: 'Techy' },
  { id: 'hexgrid', name: 'Hex grid', mood: 'Cyber HUD pulse', group: 'Techy' },
  { id: 'flowfield', name: 'Flow field', mood: 'Generative art, silky trails', group: 'Trippy' },
  { id: 'galaxy', name: 'Galaxy', mood: 'A spiral turning slowly', group: 'Space' },
  { id: 'nebula', name: 'Nebula', mood: 'Glowing gas and twinkles', group: 'Space' },
  { id: 'vinyl', name: 'Vinyl', mood: 'Record spinning, needle down', group: 'Music' },
  { id: 'spectrum', name: 'Spectrum', mood: 'Visualizer ring on the beat', group: 'Music' },
  { id: 'plasma', name: 'Plasma', mood: '90s demoscene melt', group: 'Retro' },
  { id: 'invaders', name: 'Invaders', mood: '8-bit arcade marching in', group: 'Retro' },
  { id: 'tetris', name: 'Blocks', mood: 'Falling blocks, lines clearing', group: 'Retro' },
  { id: 'dvd', name: 'DVD bounce', mood: 'Waiting for the corner hit', group: 'Retro' },
  { id: 'kaleidoscope', name: 'Kaleidoscope', mood: 'Mirrored shapes, hypnotic', group: 'Trippy' },
  { id: 'tunnel', name: 'Tunnel', mood: 'Endless neon corridor', group: 'Trippy' },
];
