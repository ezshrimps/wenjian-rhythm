// 骑士：全身板甲用 SDF 一块一块雕出来，按骨骼分件（刚性甲片，关节处露出锁子甲）。
// 同一套雕刻函数做两种造型：'hero'（主角，银甲）和 'tyrant'（Boss，黑金重甲、带角巨盔），Boss 整体再放大。
import * as THREE from 'three';
import * as S from './sdf.js';
import { triMat } from './materials.js';
const { sunion, union, sub, ssub, at, mirrorX, mirrorZ, sphere, box, ellipsoid, capsule, torus, cyl, cone, scl, grow, polar, inter, plane } = S;
const PI = Math.PI, H = 0.0046;                       // 体素边长（骑士本地单位：米）
const mesh = (f, b, h = H) => S.meshSDF(f, b, h, { ao: [h * 3, h * 9, h * 24], wear: h * 2.2 });

// 一把剑：握柄在原点，剑身沿 +Y。返回 { blade, hilt } 两个距离场
function swordSDF({ len, w, th, guard, tyrant }) {
  const bladeCore = (x, y, z) => {
    const t = Math.min(1, Math.max(0, y / len)), ww = w * (t < 0.82 ? 1 - 0.1 * t + (tyrant ? 0.22 * Math.max(0, 1 - Math.abs(t - 0.66) / 0.14) : 0) : (0.918) * Math.max(0.02, 1 - (t - 0.82) / 0.18));
    const d = (Math.abs(x) * th + Math.abs(z) * ww - ww * th) / Math.hypot(ww, th);     // 菱形截面
    return Math.max(d, -y, y - len);
  };
  const fuller = mirrorZ(capsule(0, len * 0.06, th * 1.05, 0, len * 0.62, th * 1.05, w * 0.24));
  let blade = ssub(th * 0.3, bladeCore, fuller);
  if (tyrant) blade = sub(blade, at(sphere(w * 0.7), w * 1.25, len * 0.34, 0), at(sphere(w * 0.5), -w * 1.2, len * 0.5, 0), at(sphere(w * 0.32), w * 1.1, len * 0.74, 0));   // 崩口
  const g = guard, hilt = sunion(0.008,
    at(box(g, 0.02, 0.028, 0.012), 0, -0.022, 0), at(sphere(0.034), 0, -0.022, 0),
    mirrorX(tyrant ? sunion(0.012, capsule(g * 0.7, -0.022, 0, g * 1.25, 0.05, 0, 0.026, 0.016), capsule(g * 1.25, 0.05, 0, g * 1.15, 0.15, 0, 0.016, 0.004)) : at(sphere(0.026), g, -0.022, 0)),
    at(cyl(0.019, tyrant ? 0.16 : 0.1, 0.005), 0, tyrant ? -0.2 : -0.14, 0),
    ...[0, 1, 2, 3, 4, 5, 6].map(i => at(torus(0.021, 0.0055), 0, -0.06 - i * (tyrant ? 0.042 : 0.026), 0)),
    at(tyrant ? ellipsoid(0.045, 0.05, 0.045) : sphere(0.032), 0, tyrant ? -0.4 : -0.27, 0), at(cyl(0.03, 0.008, 0.004), 0, tyrant ? -0.35 : -0.235, 0));
  return { blade, hilt, hiltBounds: [-g * 1.4 - 0.03, tyrant ? -0.47 : -0.32, -0.06, g * 1.4 + 0.03, 0.18, 0.06] };
}

export function buildKnight(T, style = 'hero', uTime = { value: 0 }) {
  const ty = style === 'tyrant', b = ty ? 1.3 : 1, SW = ty ? 0.3 : 0.215, ab = ty ? 1.5 : 1, lb = ty ? 1.42 : 1;   // ab / lb: 手臂 / 腿的粗壮程度                       // b: 身板的粗壮程度；SW: 肩半宽
  // ── 材质 ──
  const M = ty ? {
    plate: triMat({ set: T.metal, scale: 3.2, nStr: 1.0, color: 0x3c3f49, metalness: 1, roughness: 0.38, wear: 0.72, wearColor: 0x9a9ea8, wearRough: 0.3, dirt: 0.9, dirtColor: 0x0a0605, tint: 0.5 }),
    trim: triMat({ set: T.metal, scale: 4, nStr: 0.8, color: 0x8a5a16, metalness: 1, roughness: 0.34, wear: 1, wearColor: 0xf0c060, wearRough: 0.16, dirt: 1, dirtColor: 0x120a04, tint: 0.4 }),
    mail: triMat({ set: T.mail, scale: 3.4, nStr: 1.6, color: 0x2a2c30, metalness: 1, roughness: 0.5, bake: false, dirt: 0.9, dirtColor: 0x050404 }),
    cloth: triMat({ set: T.cloth, scale: 2.2, nStr: 1.2, color: 0x4a0808, roughness: 0.92, bake: false, dirt: 0.8, dirtColor: 0x0c0202, tint: 0.6, side: THREE.DoubleSide }),
    steel: triMat({ set: T.metal, scale: 2.6, nStr: 0.8, color: 0x666a73, metalness: 1, roughness: 0.26, envMapIntensity: 1.3, wear: 1, wearColor: 0xd9dde6, wearRough: 0.12, dirt: 0.9, dirtColor: 0x0a0605, tint: 0.4 }),
  } : {
    plate: triMat({ set: T.metal, scale: 6, nStr: 0.9, color: 0x4c5058, metalness: 1, roughness: 0.42, wear: 0.9, wearColor: 0xaeb3bc, wearRough: 0.24, dirt: 0.85, dirtColor: 0x0d0a08, tint: 0.4 }),
    trim: triMat({ set: T.metal, scale: 7, nStr: 0.8, color: 0x9a742a, metalness: 1, roughness: 0.32, wear: 1, wearColor: 0xf2cc70, wearRough: 0.16, dirt: 1, dirtColor: 0x120a04, tint: 0.4 }),
    mail: triMat({ set: T.mail, scale: 7, nStr: 1.6, color: 0x3a3d42, metalness: 1, roughness: 0.48, bake: false, dirt: 0.9, dirtColor: 0x050404 }),
    cloth: triMat({ set: T.cloth, scale: 4, nStr: 1.2, color: 0x10244a, roughness: 0.92, bake: false, dirt: 0.8, dirtColor: 0x02040a, tint: 0.6, side: THREE.DoubleSide }),
    steel: triMat({ set: T.metal, scale: 5, nStr: 0.7, color: 0x9a9fa8, metalness: 1, roughness: 0.2, envMapIntensity: 1.5, wear: 1, wearColor: 0xf2f5fa, wearRough: 0.08, dirt: 0.8, dirtColor: 0x0a0605, tint: 0.3 }),
  };
  M.leather = triMat({ set: T.leather, scale: 9, nStr: 1.3, color: 0x2a1a10, roughness: 0.75, wear: 0.4, wearColor: 0x6a4a30, wearMetal: 0, wearRough: 0.6, dirt: 0.8, dirtColor: 0x060302 });
  const glow = new THREE.MeshBasicMaterial({ color: ty ? new THREE.Color(3.2, 0.62, 0.14) : new THREE.Color(0.6, 1.6, 3.2) });
  const K = { M, glow, bones: {}, style };
  const bone = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); K.bones[name] = g; return g; };
  const put = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const root = K.root = new THREE.Group(), hips = bone('hips', root, 0, 1.0, 0), chest = bone('chest', hips, 0, 0.1, 0), head = bone('head', chest, 0, 0.47, 0);

  // ── 胸甲 ──
  const torso = sunion(0.05, at(ellipsoid(0.185 * b, 0.2, 0.135 * b), 0, 0.24, 0), at(ellipsoid(0.15 * b, 0.15, 0.115 * b), 0, 0.06, 0), at(ellipsoid(0.16 * b, 0.19, 0.095 * b), 0, 0.25, -0.055 * b));
  const armhole = mirrorX(at(sphere(0.09 * b), SW - 0.005, 0.345, 0)), neckhole = at(cyl(0.062, 0.2), 0, 0.5, 0);
  const cuirass = sub(ssub(0.006, sunion(0.014, torso,
    mirrorX(at(ellipsoid(0.098 * b, 0.088, 0.072), 0.08 * b, 0.275, 0.088 * b)),                                    // 胸肌状的隆起
    capsule(0, 0.03, 0.118 * b, 0, 0.33, 0.15 * b, 0.014, 0.02),                                                    // 正中的脊线
    at(scl(torus(0.092, 0.024), 1, 1, 0.9), 0, 0.432, 0), at(cyl(0.082, 0.04, 0.012), 0, 0.455, 0),                 // 护颈
    ...(ty ? [mirrorX(capsule(0.03, 0.12, 0.135 * b, 0.15 * b, 0.02, 0.09 * b, 0.012)), mirrorX(capsule(0.04, 0.2, 0.15 * b, 0.17 * b, 0.13, 0.1 * b, 0.012))] : [])),   // Boss：肋状的加强筋
    mirrorX(capsule(0.012, 0.36, 0.15 * b, 0.13 * b, 0.4, 0.1 * b, 0.005)), at(scl(torus(0.158 * b, 0.005), 1, 1, 0.78), 0, 0.11, 0)), armhole, neckhole);                 // 刻线
  put(chest, mesh(cuirass, [-0.25 * b, -0.12, -0.2 * b, 0.25 * b, 0.52, 0.21 * b]), M.plate);
  const chestTrim = sub(union(at(scl(torus(0.153 * b, 0.011), 1, 1, 0.78), 0, -0.035, 0), at(scl(torus(0.094, 0.009), 1, 1, 0.9), 0, 0.47, 0),
    mirrorX(at(torus(0.094 * b, 0.009), SW - 0.03, 0.345, 0, 0, 0, PI / 2 - 0.25)),
    at(polar(at(sphere(0.0075), 0.153 * b, 0, 0), 22), 0, -0.012, 0),
    ...(ty ? [at(sunion(0.006, at(cyl(0.05, 0.012, 0.004), 0, 0, 0), polar(capsule(0.03, 0, 0, 0.085, 0, 0, 0.011, 0.003), 8), torus(0.052, 0.007)), 0, 0.27, 0.172 * b, PI / 2, 0, 0)] : [at(sunion(0.004, box(0.012, 0.06, 0.006, 0.004), box(0.04, 0.012, 0.006, 0.004)), 0, 0.26, 0.158, -0.12, 0, 0)])),
    at(cyl(0.062, 0.2), 0, 0.6, 0));
  put(chest, mesh(chestTrim, [-0.27 * b, -0.07, -0.16 * b, 0.27 * b, 0.5, 0.27 * b], H * 0.8), M.trim);
  if (ty) { const gem = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), glow); gem.position.set(0, 0.27, 0.172 * b + 0.012); gem.scale.z = 0.5; chest.add(gem); K.gem = gem; }
  // 腰腹的锁子甲
  const mailBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.125 * b, 0.42, 8, 20), M.mail); mailBody.position.y = 0.12; mailBody.scale.z = 0.8; mailBody.castShadow = true; chest.add(mailBody);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.066, 0.14, 16), M.mail); neck.position.y = 0.47; chest.add(neck);

  // ── 头盔 ──
  let helm, helmTrim, hb;
  if (ty) {
    const shellF = sunion(0.02, ellipsoid(0.118, 0.135, 0.128), at(cyl(0.104, 0.075, 0.012), 0, -0.115, 0), at(box(0.062, 0.1, 0.03, 0.014), 0, -0.065, 0.1, -0.14, 0, 0),
      capsule(-0.095, 0.03, 0.1, 0.095, 0.03, 0.1, 0.02), capsule(0, 0.05, 0.12, 0, 0.14, 0.02, 0.014, 0.02),
      mirrorX(sunion(0.03, capsule(0.095, 0.07, 0, 0.2, 0.15, -0.02, 0.04, 0.03), capsule(0.2, 0.15, -0.02, 0.255, 0.3, 0.0, 0.03, 0.016), capsule(0.255, 0.3, 0, 0.22, 0.44, 0.04, 0.016, 0.003))),   // 一对大角
      mirrorX(capsule(0.06, 0.12, -0.03, 0.1, 0.27, -0.07, 0.022, 0.003)), capsule(0, 0.13, 0.0, 0, 0.33, -0.05, 0.026, 0.004));                                                              // 冠上的尖刺
    helm = sub(shellF, at(box(0.09, 0.0085, 0.06), 0, 0.0, 0.125), at(box(0.0075, 0.075, 0.06), 0, -0.07, 0.125), mirrorX(at(sphere(0.006), 0.04, -0.09, 0.12)), mirrorX(at(sphere(0.006), 0.04, -0.115, 0.118)),
      grow(sunion(0.02, ellipsoid(0.118, 0.135, 0.128), at(cyl(0.104, 0.075, 0.012), 0, -0.115, 0)), -0.016));
    helmTrim = union(at(torus(0.121, 0.009), 0, 0.055, 0), at(torus(0.106, 0.009), 0, -0.185, 0), at(polar(at(sphere(0.0065), 0.121, 0, 0), 18), 0, 0.075, 0), mirrorX(at(torus(0.036, 0.007), 0.11, 0.08, 0, 0, 0, PI / 2 - 0.7)));
    hb = [-0.3, -0.21, -0.17, 0.3, 0.47, 0.16];
  } else {
    const shellF = sunion(0.02, ellipsoid(0.106, 0.126, 0.12), at(cyl(0.092, 0.055, 0.01), 0, -0.105, 0), at(ellipsoid(0.08, 0.075, 0.08), 0, -0.035, 0.07),
      at(box(0.007, 0.105, 0.115, 0.005), 0, 0.075, -0.012, 0.32, 0, 0), capsule(0, -0.01, 0.15, 0, -0.1, 0.11, 0.012));
    helm = sub(shellF, at(box(0.078, 0.0075, 0.06), 0, 0.016, 0.115), mirrorX(at(box(0.0045, 0.022, 0.06), 0.03, -0.06, 0.13)), mirrorX(at(box(0.0045, 0.022, 0.06), 0.052, -0.058, 0.12)),
      grow(sunion(0.02, ellipsoid(0.106, 0.126, 0.12), at(cyl(0.092, 0.055, 0.01), 0, -0.105, 0)), -0.014));
    helmTrim = union(at(torus(0.094, 0.007), 0, -0.155, 0), mirrorX(at(cyl(0.02, 0.006, 0.003), 0.106, 0.0, 0.01, 0, 0, PI / 2)), at(torus(0.108, 0.006), 0, 0.03, -0.005, 0.25, 0, 0));
    hb = [-0.14, -0.17, -0.15, 0.14, 0.2, 0.17];
  }
  const headG = new THREE.Group(); headG.position.y = 0.13; head.add(headG); K.headG = headG;
  put(headG, mesh(helm, hb), M.plate); put(headG, mesh(helmTrim, hb, H * 0.8), M.trim);
  const eyes = K.eyes = new THREE.Mesh(new THREE.BoxGeometry(ty ? 0.16 : 0.14, 0.022, 0.02), glow); eyes.position.set(0, ty ? 0.0 : 0.016, ty ? 0.085 : 0.078); headG.add(eyes);
  const dark = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), new THREE.MeshBasicMaterial({ color: 0x020202 })); dark.position.set(0, -0.02, 0); headG.add(dark);

  // ── 肩甲 / 手臂（雕 x>0 的一侧，另一侧镜像）──
  const lames = sunion(0.006, at(ellipsoid(0.124 * b, 0.102, 0.13 * b), 0.02, 0.035, 0), at(ellipsoid(0.118 * b, 0.082, 0.124 * b), 0.058, -0.035, 0), at(ellipsoid(0.104 * b, 0.066, 0.11 * b), 0.08, -0.098, 0),
    ...(ty ? [at(cone(0.04, 0.004, 0.1), 0.085, 0.165, 0, 0, 0, -0.55), at(cone(0.03, 0.003, 0.07), 0.14, 0.09, 0.05, 0.3, 0, -1.0), at(cone(0.03, 0.003, 0.07), 0.14, 0.09, -0.05, -0.3, 0, -1.0), at(torus(0.1, 0.016), 0.03, 0.05, 0, 0, 0, -0.45)] : [at(box(0.01, 0.05, 0.1, 0.006), 0.02, 0.105, 0, 0, 0, -0.3)]));
  const pauldron = sub(lames, grow(sunion(0.006, at(ellipsoid(0.124 * b, 0.102, 0.13 * b), 0.02, 0.035, 0), at(ellipsoid(0.118 * b, 0.082, 0.124 * b), 0.058, -0.035, 0), at(ellipsoid(0.104 * b, 0.066, 0.11 * b), 0.08, -0.098, 0)), -0.013), at(box(0.3, 0.1, 0.3), 0, -0.235, 0), at(box(0.1, 0.3, 0.3), -0.2, 0, 0));
  const pb = [-0.14 * b, -0.17, -0.16 * b, 0.24 * b, ty ? 0.3 : 0.17, 0.16 * b], pGeo = mesh(pauldron, pb);
  const pTrim = sub(union(at(scl(torus(0.117 * b, 0.0075), 1, 1, 1.05), 0.058, -0.075, 0, 0, 0, -0.38), at(scl(torus(0.105 * b, 0.0075), 1, 1, 1.05), 0.08, -0.135, 0, 0, 0, -0.45), at(polar(at(sphere(0.007), 0.112 * b, 0, 0), 12), 0.05, -0.05, 0, 0, 0, -0.38)), at(box(0.3, 0.1, 0.3), 0, -0.245, 0), at(box(0.1, 0.3, 0.3), -0.16, 0, 0));
  const pTrimGeo = mesh(pTrim, pb, H * 0.8);
  const upper = sunion(0.012, capsule(0, -0.07, 0, 0, -0.26, 0, 0.058 * ab, 0.052 * ab), at(sphere(0.064 * ab), 0, -0.3, 0), at(ellipsoid(0.02, 0.075, 0.08), 0.058 * ab, -0.3, 0), at(torus(0.058 * ab, 0.008), 0, -0.2, 0));
  const upGeo = mesh(upper, [-0.09 * ab, -0.39, -0.1 * ab, 0.1 * ab, 0.0, 0.1 * ab]);
  const fore = sunion(0.012, capsule(0, -0.04, 0, 0, -0.25, 0, 0.056 * ab, 0.044 * ab), at(cone(0.047 * ab, 0.064 * ab, 0.03), 0, -0.05, 0), at(torus(0.046 * ab, 0.008), 0, -0.245, 0),
    capsule(0.04 * ab, -0.06, 0, 0.034 * ab, -0.23, 0, 0.012, 0.008),
    at(box(0.046 * ab, 0.05, 0.036 * ab, 0.016), 0, -0.325, 0.004), capsule(-0.036 * ab, -0.362, 0.03, 0.036 * ab, -0.362, 0.03, 0.016), at(box(0.042 * ab, 0.022, 0.032 * ab, 0.013), 0, -0.378, 0.014),
    capsule(0.046 * ab, -0.3, 0.02, 0.05 * ab, -0.352, 0.036, 0.016),
    ...(ty ? [at(cone(0.02, 0.003, 0.05), 0.05 * ab, -0.12, 0, 0, 0, -1.2), at(cone(0.02, 0.003, 0.05), 0.048 * ab, -0.19, 0, 0, 0, -1.2)] : []));
  const foreGeo = mesh(ssub(0.004, fore, union(at(torus(0.052 * ab, 0.004), 0, -0.11, 0), at(torus(0.05 * ab, 0.004), 0, -0.17, 0))), [-0.085 * ab, -0.42, -0.08 * ab, 0.12 * ab, 0.0, 0.085 * ab]);
  for (const s of [1, -1]) {
    const sh = bone(s > 0 ? 'shL' : 'shR', chest, s * SW, 0.37, 0), el = bone(s > 0 ? 'elL' : 'elR', sh, 0, -0.3, 0), mir = g => s > 0 ? g : S.mirrorGeo(g);
    const pg = new THREE.Group(); sh.add(pg); K.bones[s > 0 ? 'padL' : 'padR'] = pg; put(pg, mir(pGeo), M.plate); put(pg, mir(pTrimGeo), M.trim);
    put(sh, mir(upGeo), M.plate); put(el, mir(foreGeo), M.plate);
    const am = new THREE.Mesh(new THREE.CapsuleGeometry(0.047 * ab, 0.3, 6, 14), M.mail); am.position.y = -0.17; am.castShadow = true; sh.add(am);
    K.bones[s > 0 ? 'handL' : 'handR'] = bone(s > 0 ? 'hL' : 'hR', el, 0, -0.345, 0.03);
  }

  // ── 腰甲 / 腿 ──
  const lame = (i) => at(scl(cone(0.178 * b + 0.016 * i, 0.158 * b + 0.012 * i, 0.04), 1, 1, 0.8), 0, 0.02 - i * 0.062, 0);
  const fauld = sub(sunion(0.007, at(scl(cyl(0.166 * b, 0.034, 0.012), 1, 1, 0.8), 0, 0.085, 0), lame(0), lame(1), lame(2),
    mirrorX(at(box(0.068 * b, 0.105, 0.013, 0.011), 0.098 * b, -0.215, 0.122 * b, -0.13, 0, 0.06)), mirrorX(at(box(0.07 * b, 0.09, 0.013, 0.011), 0.105 * b, -0.2, -0.12 * b, 0.12, 0, 0.06)), at(ellipsoid(0.05, 0.065, 0.045), 0, -0.13, 0.115 * b)),
    at(scl(cyl(0.135 * b, 0.2), 1, 1, 0.78), 0, -0.13, 0));
  put(hips, mesh(fauld, [-0.25 * b, -0.34, -0.22 * b, 0.25 * b, 0.13, 0.22 * b]), M.plate);
  put(hips, mesh(union(at(scl(torus(0.168 * b, 0.011), 1, 1, 0.8), 0, 0.085, 0), at(scl(polar(at(sphere(0.008), 0.17 * b, 0, 0), 20), 1, 1, 0.8), 0, 0.085, 0), at(box(0.036, 0.03, 0.012, 0.006), 0, 0.085, 0.137 * b)), [-0.2 * b, 0.05, -0.16 * b, 0.2 * b, 0.13, 0.17 * b], H * 0.8), M.trim);
  const mailHip = new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * b, 0.1, 6, 18), M.mail); mailHip.position.y = -0.06; mailHip.scale.z = 0.82; hips.add(mailHip);
  const thigh = sunion(0.014, capsule(0, -0.04, 0, 0, -0.38, 0, 0.084 * lb, 0.068 * lb), capsule(0, -0.06, 0.07 * lb, 0, -0.36, 0.06 * lb, 0.016, 0.012),
    at(sphere(0.074 * lb), 0, -0.44, 0.012), at(ellipsoid(0.02, 0.066, 0.07), 0.072 * lb, -0.44, 0), at(ellipsoid(0.05 * lb, 0.026, 0.03), 0, -0.44, 0.07 * lb), at(torus(0.076 * lb, 0.008), 0, -0.3, 0));
  const thGeo = mesh(thigh, [-0.11 * lb, -0.53, -0.11 * lb, 0.12 * lb, 0.05, 0.12 * lb]);
  const shin = sub(sunion(0.014, capsule(0, -0.06, 0, 0, -0.37, 0, 0.062 * lb, 0.048 * lb), at(ellipsoid(0.052 * lb, 0.11, 0.056 * lb), 0, -0.17, -0.026), capsule(0, -0.07, 0.052 * lb, 0, -0.36, 0.04 * lb, 0.014, 0.01),
    at(ellipsoid(0.056 * lb, 0.048, 0.09), 0, -0.432, 0.032), at(ellipsoid(0.044 * lb, 0.032, 0.075), 0, -0.45, 0.11), at(torus(0.05 * lb, 0.008), 0, -0.36, 0),
    ...(ty ? [at(cone(0.022, 0.003, 0.055), 0, -0.02, 0.08 * lb, 1.1, 0, 0)] : [])), at(box(0.3, 0.05, 0.3), 0, -0.53, 0));
  const shGeo = mesh(ssub(0.004, shin, union(at(box(0.08, 0.003, 0.02), 0, -0.445, 0.085, 0.3, 0, 0), at(box(0.08, 0.003, 0.02), 0, -0.455, 0.125, 0.3, 0, 0))), [-0.09 * lb, -0.49, -0.11 * lb, 0.09 * lb, 0.02, 0.2]);
  for (const s of [1, -1]) {
    const th = bone(s > 0 ? 'thL' : 'thR', hips, s * 0.1 * b, -0.04, 0), kn = bone(s > 0 ? 'knL' : 'knR', th, 0, -0.44, 0), mir = g => s > 0 ? g : S.mirrorGeo(g);
    put(th, mir(thGeo), M.plate); put(kn, mir(shGeo), M.plate);
    const lm = new THREE.Mesh(new THREE.CapsuleGeometry(0.062 * lb, 0.36, 6, 14), M.mail); lm.position.y = -0.22; lm.castShadow = true; th.add(lm);
  }

  // ── 披风与战裙（破旧的布：顶点着色器里随风摆动，下摆按噪声撕出缺口）──
  const cloth = (w, h, tat, sway, billow) => { const m = triMat({ set: T.cloth, scale: ty ? 2.2 : 4, nStr: 1.2, color: ty ? 0x4a0808 : 0x10244a, roughness: 0.92, bake: false, dirt: 0.8, dirtColor: ty ? 0x0c0202 : 0x02040a, tint: 0.6, side: THREE.DoubleSide });
    const base = m.onBeforeCompile; m.onBeforeCompile = sh => { base(sh); sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
uniform float uTime;`).replace('#include <begin_vertex>', `#include <begin_vertex>
        float cw = clamp(-position.y / ${h.toFixed(3)}, 0., 1.); transformed.x *= 1. + cw * .35;
        transformed.z += (sin(uTime * 1.6 + position.y * 4. + position.x * 5.) * ${sway.toFixed(3)} + sin(uTime * 2.7 + position.y * 9.) * ${(sway * 0.35).toFixed(3)}) * cw + ${billow.toFixed(3)} * cw * cw;`);
      sh.fragmentShader = sh.fragmentShader.replace('float tCav =', `if (vOP.y < ${(-h * tat).toFixed(3)} + (tmk2.g - .5) * ${(h * 0.5).toFixed(3)} + (tmk.r - .5) * ${(h * 0.12).toFixed(3)}) discard;
        float tCav =`); };
    m.customProgramCacheKey = () => 'cloth' + w + h; const g = new THREE.PlaneGeometry(w, h, 14, 26); g.translate(0, -h / 2, 0); const q = new THREE.Mesh(g, m); q.castShadow = true; q.receiveShadow = true; return q; };
  const cape = cloth(ty ? 0.56 : 0.4, ty ? 1.3 : 1.0, 0.86, 0.045, -0.22); cape.position.set(0, 0.4, -0.15 * b); cape.rotation.y = PI; chest.add(cape); K.cape = cape;
  if (ty) { const tab = cloth(0.2, 0.62, 0.84, 0.02, 0.05); tab.position.set(0, 0.06, 0.142 * b); hips.add(tab); const tb = cloth(0.24, 0.6, 0.84, 0.025, -0.06); tb.position.set(0, 0.06, -0.14 * b); tb.rotation.y = PI; hips.add(tb); }

  // ── 剑 ──
  const sp = ty ? { len: 1.62, w: 0.078, th: 0.013, guard: 0.17, tyrant: true } : { len: 0.98, w: 0.027, th: 0.0058, guard: 0.1, tyrant: false };
  const sw = swordSDF(sp), sword = K.sword = new THREE.Group();
  put(sword, S.meshSDF(sw.blade, [-sp.w * 1.6, -0.01, -sp.th * 1.6, sp.w * 1.6, sp.len + 0.01, sp.th * 1.6], ty ? 0.0038 : 0.0022, { ao: [0.01, 0.03], wear: 0.006 }), M.steel);
  put(sword, mesh(sw.hilt, sw.hiltBounds, H * 0.8), M.trim);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.0215, ty ? 0.3 : 0.19, 12), M.leather); grip.position.y = ty ? -0.2 : -0.14; sword.add(grip);
  // 剑身血槽里发光的符文
  const runeMat = K.runeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { color: { value: ty ? new THREE.Color(5, 1.0, 0.2) : new THREE.Color(0.4, 1.3, 3) }, power: { value: 1 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec2 vUv; uniform vec3 color; uniform float power, time;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){ vec2 g = vec2(vUv.x * 3., vUv.y * 22.); vec2 c = floor(g), f = fract(g) - .5; float r = h(c);
        float glyph = step(abs(f.x), .32) * step(abs(f.y), .34) * step(.35, h(c * 1.7 + floor(f * vec2(3., 4.) + 2.))) * step(.25, r);
        float edge = smoothstep(.5, .2, abs(vUv.x - .5)) * smoothstep(0., .04, vUv.y) * smoothstep(1., .9, vUv.y);
        float a = (glyph * .9 + .12) * edge * (.75 + .25 * sin(time * 3. + c.y)); gl_FragColor = vec4(color * power, a); }` });
  for (const z of [1, -1]) { const q = new THREE.Mesh(new THREE.PlaneGeometry(sp.w * 0.5, sp.len * 0.56), runeMat); q.position.set(0, sp.len * 0.34, z * sp.th * 0.78); if (z < 0) q.rotation.y = PI; sword.add(q); }
  K.swordLen = sp.len; K.foreGeoR = S.mirrorGeo(foreGeo); K.bladeGeo = sword.children[0].geometry;
  return K;
}
