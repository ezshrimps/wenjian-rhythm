// 水彩叠色的圆：好几层半透明的色块叠在一起。每层轮廓略不规则、边缘较硬、边上有一圈积色；
// 中心叠的层数多所以深，边缘只有一两层所以淡。逐像素生成，返回一张 canvas。
const h2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const sm = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// 颜色随浓度变化：淡 → 中 → 浓
export const WASH_RED = [[238, 160, 160], [206, 44, 48], [150, 12, 24]];
export const WASH_INK = [[150, 150, 152], [60, 60, 64], [18, 18, 22]];

// size: 贴图边长；radius: 圆的半径（像素，四周要留出洇开的余量）；layers: 叠几层
export function makeWash(size, radius, seed = 1, palette = WASH_RED, layers = 7) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data, c = size / 2, L = [];
  for (let k = 0; k < layers; k++) {
    const u = k / (layers - 1);                                    // 0 最外层 → 1 最里层
    L.push({ r: radius * mix(1.12, 0.86, u) * (0.95 + 0.1 * h2(seed, k)),
      ox: (h2(seed + 1, k) - 0.5) * radius * 0.26, oy: (h2(seed + 2, k) - 0.5) * radius * 0.26,   // 各层错开，不是同心圆
      base: mix(0.24, 0.5, u), rim: mix(0.2, 0.08, u), s: seed * 7.3 + k * 3.1 });
  }
  for (let py = 0, i = 0; py < size; py++) for (let px = 0; px < size; px++, i += 4) {
    let keep = 1;                                                  // 各层透过率的乘积
    for (const l of L) {
      const x = px - c - l.ox, y = py - c - l.oy, dist = Math.hypot(x, y); if (dist > l.r * 1.3) continue;
      const cx = x / (dist || 1), cy = y / (dist || 1);            // 用方向向量取噪声，绕一圈首尾相接
      const rr = l.r * (1 + 0.13 * (vnoise(cx * 1.3 + l.s, cy * 1.3 + l.s) - 0.5) * 2 + 0.05 * (vnoise(cx * 4 + l.s, cy * 4) - 0.5) * 2 + 0.022 * (vnoise(cx * 13 + l.s, cy * 13) - 0.5) * 2);
      const e = (rr - dist) / radius; if (e <= 0) continue;         // e: 离这一层边缘有多深
      keep *= 1 - sm(0, 0.022, e) * (l.base + l.rim * Math.exp(-e / 0.045));   // 硬边 + 边上一圈积色
    }
    const dens = 1 - keep, grain = 0.94 + 0.12 * vnoise(px * 0.5 + seed, py * 0.5), t = Math.min(1, dens * 1.08);
    const a = t < 0.5 ? palette[0] : palette[1], b = t < 0.5 ? palette[1] : palette[2], f = t < 0.5 ? t * 2 : t * 2 - 1;
    d[i] = mix(a[0], b[0], f); d[i + 1] = mix(a[1], b[1], f); d[i + 2] = mix(a[2], b[2], f); d[i + 3] = Math.min(1, dens * 1.5) * grain * 255;
  }
  g.putImageData(img, 0, 0); return cv;
}
