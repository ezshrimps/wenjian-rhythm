// 用有符号距离场（SDF）「雕刻」模型，再用 Surface Nets 转成网格。
// 每个顶点额外烘焙三个量：环境光遮蔽、凸边程度（边缘磨损用）、凹陷程度（缝隙积灰用）。
import * as THREE from 'three';
const { abs, max, min, hypot, sqrt, sin, cos, floor, atan2, PI } = Math;
const c01 = t => t < 0 ? 0 : t > 1 ? 1 : t;

// ───────── 基本形体：(x,y,z) → 到表面的带符号距离 ─────────
export const sphere = r => (x, y, z) => hypot(x, y, z) - r;
export const box = (bx, by, bz, r = 0) => (x, y, z) => { const qx = abs(x) - bx + r, qy = abs(y) - by + r, qz = abs(z) - bz + r; return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, qy, qz), 0) - r; };
export const ellipsoid = (rx, ry, rz) => (x, y, z) => { const k0 = hypot(x / rx, y / ry, z / rz), k1 = hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz)); return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -min(rx, ry, rz); };
export const capsule = (ax, ay, az, bx, by, bz, ra, rb = ra) => { const dx = bx - ax, dy = by - ay, dz = bz - az, dd = dx * dx + dy * dy + dz * dz; return (x, y, z) => { const px = x - ax, py = y - ay, pz = z - az; const h = c01((px * dx + py * dy + pz * dz) / dd); return hypot(px - dx * h, py - dy * h, pz - dz * h) - (ra + (rb - ra) * h); }; };
export const torus = (R, r) => (x, y, z) => hypot(hypot(x, z) - R, y) - r;                       // 环躺在 XZ 平面
export const cyl = (r, h, rr = 0) => (x, y, z) => { const dx = hypot(x, z) - r + rr, dy = abs(y) - h + rr; return min(max(dx, dy), 0) + hypot(max(dx, 0), max(dy, 0)) - rr; };   // 沿 Y
export const cone = (r1, r2, h) => (x, y, z) => {                                                 // 圆台：y=-h 处半径 r1，y=+h 处 r2
  const qx = hypot(x, z), k2x = r2 - r1, k2y = 2 * h, cax = qx - min(qx, y < 0 ? r1 : r2), cay = abs(y) - h;
  const t = c01(((r2 - qx) * k2x + (h - y) * k2y) / (k2x * k2x + k2y * k2y)), cbx = qx - r2 + k2x * t, cby = y - h + k2y * t;
  return (cbx < 0 && cay < 0 ? -1 : 1) * sqrt(min(cax * cax + cay * cay, cbx * cbx + cby * cby));
};
export const plane = (nx, ny, nz, d = 0) => (x, y, z) => x * nx + y * ny + z * nz + d;

// ───────── 组合 ─────────
export const smin = (a, b, k) => { const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; };
export const union = (...f) => (x, y, z) => { let d = 1e9; for (let i = 0; i < f.length; i++) { const v = f[i](x, y, z); if (v < d) d = v; } return d; };
export const sunion = (k, ...f) => (x, y, z) => { let d = f[0](x, y, z); for (let i = 1; i < f.length; i++) d = smin(d, f[i](x, y, z), k); return d; };   // 圆滑地融在一起
export const sub = (a, ...b) => (x, y, z) => { let d = a(x, y, z); for (let i = 0; i < b.length; i++) d = max(d, -b[i](x, y, z)); return d; };
export const ssub = (k, a, b) => (x, y, z) => -smin(-a(x, y, z), b(x, y, z), k);                    // 圆滑地挖掉
export const inter = (a, b) => (x, y, z) => max(a(x, y, z), b(x, y, z));
export const sinter = (k, a, b) => (x, y, z) => -smin(-a(x, y, z), -b(x, y, z), k);
export const shell = (f, t) => (x, y, z) => abs(f(x, y, z)) - t;                                   // 变成一层壳
export const grow = (f, r) => (x, y, z) => f(x, y, z) - r;
export const disp = (f, g) => (x, y, z) => f(x, y, z) + g(x, y, z);
// ───────── 变换（对采样点做逆变换） ─────────
export const tr = (f, tx, ty, tz) => (x, y, z) => f(x - tx, y - ty, z - tz);
export const rot = (f, rx, ry, rz) => { const e = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).elements, a = e[0], b = e[1], c = e[2], d = e[4], g = e[5], h = e[6], i = e[8], j = e[9], k = e[10]; return (x, y, z) => f(a * x + b * y + c * z, d * x + g * y + h * z, i * x + j * y + k * z); };
export const at = (f, tx, ty, tz, rx = 0, ry = 0, rz = 0) => (rx || ry || rz) ? tr(rot(f, rx, ry, rz), tx, ty, tz) : tr(f, tx, ty, tz);   // 先转再移
export const scl = (f, sx, sy = sx, sz = sx) => { const m = min(sx, sy, sz); return (x, y, z) => f(x / sx, y / sy, z / sz) * m; };
export const mirrorX = f => (x, y, z) => f(abs(x), y, z);
export const mirrorZ = f => (x, y, z) => f(x, y, abs(z));
export const polar = (f, n) => { const seg = 2 * PI / n; return (x, y, z) => { const r = hypot(x, z); let a = atan2(z, x); a = ((a % seg) + seg) % seg - seg / 2; return f(r * cos(a), y, r * sin(a)); }; };   // 绕 Y 轴重复 n 次
export const bendX = (f, k) => (x, y, z) => { const c = cos(k * y), s = sin(k * y); return f(x, c * y - s * z, s * y + c * z); };

// ───────── 噪声（做锤痕、石头的起伏） ─────────
const hsh = (x, y, z) => { const s = sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - floor(s); };
export function noise3(x, y, z) {
  const xi = floor(x), yi = floor(y), zi = floor(z), xf = x - xi, yf = y - yi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hsh(xi, yi, zi), hsh(xi + 1, yi, zi), u), l(hsh(xi, yi + 1, zi), hsh(xi + 1, yi + 1, zi), u), v), l(l(hsh(xi, yi, zi + 1), hsh(xi + 1, yi, zi + 1), u), l(hsh(xi, yi + 1, zi + 1), hsh(xi + 1, yi + 1, zi + 1), u), v), w);
}
export const fbm3 = (x, y, z, oct = 3) => { let a = 0.5, s = 0; for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); x = x * 2.03 + 17.3; y = y * 2.03 + 9.1; z = z * 2.03 + 5.7; a *= 0.5; } return s; };
export const rough = (f, amp, freq, oct = 3) => (x, y, z) => f(x, y, z) + (fbm3(x * freq, y * freq, z * freq, oct) - 0.47) * amp;

// ───────── 网格化 ─────────
// f: 距离场；b: [minx,miny,minz,maxx,maxy,maxz]；h: 体素边长；ao: 遮蔽取样距离；wear: 边缘/缝隙的取样尺度
export function meshSDF(f, b, h, { ao = [h * 3, h * 8, h * 20], wear = h * 2.5, flip = false } = {}) {
  const nx = Math.ceil((b[3] - b[0]) / h) + 2, ny = Math.ceil((b[4] - b[1]) / h) + 2, nz = Math.ceil((b[5] - b[2]) / h) + 2, x0 = b[0], y0 = b[1], z0 = b[2];
  const vals = new Float32Array(nx * ny * nz), id = (i, j, k) => i + nx * (j + ny * k), B = 4, lim = (B * h * 0.5 * 1.7321 + h) * 1.25;
  // 窄带：先在每个 4³ 小块的中心取一次样，离表面远的整块直接填掉
  for (let k0 = 0; k0 < nz; k0 += B) for (let j0 = 0; j0 < ny; j0 += B) for (let i0 = 0; i0 < nx; i0 += B) {
    const i1 = min(i0 + B, nx), j1 = min(j0 + B, ny), k1 = min(k0 + B, nz);
    const dc = f(x0 + (i0 + i1 - 1) * 0.5 * h, y0 + (j0 + j1 - 1) * 0.5 * h, z0 + (k0 + k1 - 1) * 0.5 * h), far = abs(dc) > lim;
    for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) vals[id(i, j, k)] = far ? dc : f(x0 + i * h, y0 + j * h, z0 + k * h);
  }
  const cell = new Int32Array(nx * ny * nz).fill(-1), P = [], idx = [];
  const EV = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v000 = vals[id(i, j, k)]; let neg = 0;
    for (let c = 0; c < 8; c++) if (vals[id(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))] < 0) neg++;
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;                                   // 顶点 = 各条变号棱上零点的平均
    for (let e = 0; e < 12; e++) { const E = EV[e], a = vals[id(i + E[0], j + E[1], k + E[2])], c = vals[id(i + E[3], j + E[4], k + E[5])]; if ((a < 0) === (c < 0)) continue; const t = a / (a - c); sx += E[0] + (E[3] - E[0]) * t; sy += E[1] + (E[4] - E[1]) * t; sz += E[2] + (E[5] - E[2]) * t; n++; }
    cell[id(i, j, k)] = P.length / 3; P.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
    void v000;
  }
  const quad = (a, b2, c, d, inv) => { if (a < 0 || b2 < 0 || c < 0 || d < 0) return; if (inv !== flip) idx.push(a, b2, c, a, c, d); else idx.push(a, c, b2, a, d, c); };   // 绕序与朝外的法线一致
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v = vals[id(i, j, k)] < 0;
    if (v !== (vals[id(i + 1, j, k)] < 0)) quad(cell[id(i, j - 1, k - 1)], cell[id(i, j, k - 1)], cell[id(i, j, k)], cell[id(i, j - 1, k)], v);
    if (v !== (vals[id(i, j + 1, k)] < 0)) quad(cell[id(i - 1, j, k - 1)], cell[id(i - 1, j, k)], cell[id(i, j, k)], cell[id(i, j, k - 1)], v);
    if (v !== (vals[id(i, j, k + 1)] < 0)) quad(cell[id(i - 1, j - 1, k)], cell[id(i, j - 1, k)], cell[id(i, j, k)], cell[id(i - 1, j, k)], v);
  }
  const nv = P.length / 3, pos = new Float32Array(P), nor = new Float32Array(nv * 3), bake = new Float32Array(nv * 3), e = h * 0.6;
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e); const gl = hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    nor[v * 3] = gx; nor[v * 3 + 1] = gy; nor[v * 3 + 2] = gz;
    let occ = 0; for (let a = 0; a < ao.length; a++) { const d = ao[a]; occ += c01((d - f(x + gx * d, y + gy * d, z + gz * d)) / d) / ao.length; }
    bake[v * 3] = 1 - c01(occ * 1.35);                                                    // 环境光遮蔽
    bake[v * 3 + 1] = c01((f(x - gx * wear, y - gy * wear, z - gz * wear) + wear) / wear * 1.6);   // 凸边：往里退一步，如果还离表面很近，说明这里是棱
    bake[v * 3 + 2] = c01((wear - f(x + gx * wear, y + gy * wear, z + gz * wear)) / wear * 1.6);   // 凹陷：往外走一步，如果还离表面很近，说明这里是缝
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('bake', new THREE.BufferAttribute(bake, 3));
  g.setIndex(nv > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
// 把一个网格沿 X 镜像（左右对称的部件只雕一次）
export function mirrorGeo(g) {
  const m = g.clone(), p = m.attributes.position.array, n = m.attributes.normal.array, ix = m.index.array;
  for (let i = 0; i < p.length; i += 3) { p[i] = -p[i]; n[i] = -n[i]; }
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  m.computeBoundingSphere(); m.computeBoundingBox(); return m;
}
