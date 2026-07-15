"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, useLoader, useThree, invalidate } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/**
 * Diorama v2 — a true 3D painterly mountain world, scrubbed by scroll.
 * Built the same way the reference site does it: PROCEDURAL peaks (displaced
 * cones, seeded sine-noise ridges) wearing the impressionist textures, under
 * a bright sky, with aerial-perspective fog, drifting mist sprites, particles,
 * birds, and a tilt-shift depth-of-field post pass. Scroll flies the camera
 * along a spline through the range — every scroll offset is a camera frame.
 * The sky/fog grade from day-blue to Velora dusk as you descend.
 *
 * ssr:false — import via next/dynamic from the client page.
 */

const BASE = "/experience/";
const TEX = {
  bg: BASE + "SC_01_BACKGROUND_MOUNTAINS_TEXTURE.webp",
  mountain: BASE + "SC_01_MOUNTAIN_TEXTURE.webp",
  ridge: BASE + "SC_01_RIDGE_TEXTURE.webp",
  river1: BASE + "SC_02_P1_TEXTURE.webp",
  river2: BASE + "SC_02_P6_TEXTURE.webp",
  lake: BASE + "SC_03_LAKE_TEXTURE.webp",
  fog: BASE + "fog.webp",
  bird: BASE + "BIRD_ALPHA.webp",
};

type RefN = React.RefObject<number>;
type Ref2 = React.RefObject<{ x: number; y: number }>;

/* ── colour script: sky/fog/dim stops across the scroll journey ────────── */
/* The journey is three chapters over a 1370vh runway:
   A (s 0 → ~0.37)   — the 3D mountain flight, daylight blues.
   ⬛ blackout #1 at the Built-For seam (s ≈ 0.372)
   B (s ~0.41 → 0.65) — the painted river flyover (SC_02 panels).
   ⬛ blackout #2 at the You-Decide seam (s ≈ 0.650)
   C (s ~0.68 → 1)   — the lake aerial finale; `dim` grades it to dusk. */
const SKY_STOPS = [
  // horizon stays MID-blue (not white): the thin serif needs the contrast
  { s: 0.0, top: [0.3, 0.44, 0.83], bot: [0.52, 0.66, 0.9], fog: [0.52, 0.66, 0.9], dim: 0 },
  { s: 0.3, top: [0.36, 0.51, 0.82], bot: [0.56, 0.7, 0.86], fog: [0.56, 0.7, 0.86], dim: 0 },
  { s: 0.45, top: [0.3, 0.44, 0.66], bot: [0.6, 0.72, 0.78], fog: [0.6, 0.72, 0.78], dim: 0.06 },
  { s: 0.75, top: [0.2, 0.32, 0.3], bot: [0.46, 0.58, 0.48], fog: [0.58, 0.68, 0.56], dim: 0.1 },
  { s: 0.9, top: [0.12, 0.22, 0.18], bot: [0.3, 0.42, 0.32], fog: [0.44, 0.54, 0.44], dim: 0.24 },
  { s: 1.0, top: [0.05, 0.11, 0.09], bot: [0.16, 0.26, 0.19], fog: [0.34, 0.44, 0.35], dim: 0.5 },
];

/** Hard cuts to black between chapters, timed to section seams so each new
 *  title emerges from the dark. */
function blackoutAt(s: number): number {
  // #1: mountains → river (Built-For seam, s ≈ 0.372)
  const b1 = Math.min(
    THREE.MathUtils.smoothstep(s, 0.335, 0.372),
    1 - THREE.MathUtils.smoothstep(s, 0.4, 0.45),
  );
  // #2: river → lake (You-Decide seam, s ≈ 0.650)
  const b2 = Math.min(
    THREE.MathUtils.smoothstep(s, 0.618, 0.65),
    1 - THREE.MathUtils.smoothstep(s, 0.678, 0.722),
  );
  return Math.max(b1, b2);
}

/** Chapter-A progress: the camera finishes its flight before blackout #1. */
function chapterA(s: number): number {
  return Math.min(1, Math.max(0, s / 0.34));
}

function skyAt(s: number) {
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (s >= SKY_STOPS[i].s && s <= SKY_STOPS[i + 1].s) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const t = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s);
  const mix = (u: number[], v: number[]) => u.map((x, i) => x + (v[i] - x) * t);
  return { top: mix(a.top, b.top), bot: mix(a.bot, b.bot), fog: mix(a.fog, b.fog), dim: a.dim + (b.dim - a.dim) * t };
}

/* ── procedural peak: displaced open cone with seeded ridged noise ─────── */
type PeakCfg = {
  x: number; z: number; h: number; r: number;
  squash: number; rot: number; seed: number; tex: "mountain" | "ridge";
};

/* The camera flies the x≈0 corridor from z 4.5 → -26.5. Displacement can
   swell a peak's reach to ~1.9 × r in ANY direction (squash is pre-rotation),
   so every peak the camera passes keeps |x| ≥ r * 1.9 + 1. Peaks beyond the
   path's end (z < -34) are scenery only and may sit anywhere. */
const PEAKS: PeakCfg[] = [
  // hero centrepiece — sits just right of the camera line; the path bends
  // left around it (fly-BY, not fly-through)
  { x: 3.8, z: -13, h: 10.5, r: 3.2, squash: 0.82, rot: 0.3, seed: 11, tex: "mountain" },
  { x: -12, z: -15, h: 7.8, r: 3.4, squash: 0.62, rot: 1.2, seed: 23, tex: "ridge" },
  { x: 11.5, z: -14.5, h: 8.6, r: 3.6, squash: 0.72, rot: 2.1, seed: 37, tex: "mountain" },
  // the camera passes z -22…-26 up close — these need reach (1.66×r) + ~6 clearance
  { x: -14.5, z: -22, h: 9.4, r: 4.4, squash: 0.6, rot: 4.0, seed: 51, tex: "ridge" },
  { x: 15, z: -23, h: 10.6, r: 4.8, squash: 0.66, rot: 5.2, seed: 67, tex: "mountain" },
  { x: -12.5, z: -28, h: 9.0, r: 4.0, squash: 0.7, rot: 0.9, seed: 83, tex: "ridge" },
  { x: 13.5, z: -32, h: 9.8, r: 4.2, squash: 0.76, rot: 3.3, seed: 97, tex: "mountain" },
  // far scenery — fills the haze gaps behind the hero title band while
  // staying out of the end-of-path sightline (camera ends at z -26.5
  // looking toward z -42, so keep these wide of centre)
  { x: -8.6, z: -37, h: 10.5, r: 2.4, squash: 0.8, rot: 2.6, seed: 113, tex: "mountain" },
  { x: 9.2, z: -40, h: 11.5, r: 2.6, squash: 0.75, rot: 4.4, seed: 127, tex: "ridge" },
];

function buildPeak(cfg: PeakCfg): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(cfg.r, cfg.h, 140, 56, true);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // deterministic per-peak randomness
  let seed = cfg.seed * 7919 + 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ph = Array.from({ length: 6 }, () => rnd() * Math.PI * 2);
  const fr = [1.7, 2.4, 3.2, 5.3, 8.9, 13.7];
  const am = [0.42, 0.3, 0.2, 0.12, 0.07, 0.04];

  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (y + cfg.h / 2) / cfg.h; // 0 base → 1 apex
    const ang = Math.atan2(x, z);

    let n = 0;
    for (let k = 0; k < 6; k++) n += Math.sin(ang * fr[k] + ph[k] + t * (k + 1) * 1.35) * am[k];
    n += Math.abs(Math.sin(ang * 2.2 + ph[0])) * 0.55; // sharp ridge lines
    n += Math.abs(Math.sin(ang * 4.7 + ph[2] + t * 2.0)) * 0.3; // secondary crags
    const fall = Math.sin(Math.min(1, 1 - t) * Math.PI * 0.5); // 0 at apex → 1 at base
    // clamp the swell so a peak's true reach stays ≤ ~1.66 × r — the camera
    // corridor math depends on this bound
    const kf = 1 + Math.min(1.1, Math.max(-0.6, n)) * 0.6 * fall;

    pos.setX(i, x * kf);
    pos.setZ(i, z * kf * cfg.squash);
    pos.setY(i, y + Math.sin(ang * 3.7 + ph[1]) * (0.22 + 0.5 * t) * fall);

    // painted-sun shading baked into vertex colors: bright apex + lit faces
    const lit = 0.52 + 0.62 * t + 0.18 * Math.sin(ang + 2.3) + n * 0.12;
    const l = Math.max(0.38, Math.min(1.3, lit));
    // pale scree/snow toward the apex, like the reference peaks
    const snow = THREE.MathUtils.smoothstep(t, 0.72, 0.96) * (0.5 + 0.5 * Math.sin(ang * 1.7 + ph[3]));
    colors[i * 3] = l * (1 + snow * 0.28);
    colors[i * 3 + 1] = l * 1.02 * (1 + snow * 0.26);
    colors[i * 3 + 2] = l * 0.97 * (1 + snow * 0.34);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/* ── tilt-shift depth-of-field post pass (sharp centre, soft edges) ────── */
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uAmount: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uAmount;
    void main() {
      vec2 c = vec2(0.5, 0.47);
      vec2 d2 = vec2((vUv.x - c.x) * 1.35, vUv.y - c.y);
      float blur = smoothstep(0.13, 0.72, length(d2)) * uAmount;
      vec2 r = uTexel * (blur * 13.0);
      vec4 col = texture2D(tDiffuse, vUv) * 0.2270;
      col += (texture2D(tDiffuse, vUv + vec2( 1.0,  0.0) * r) + texture2D(tDiffuse, vUv - vec2( 1.0,  0.0) * r)) * 0.1531;
      col += (texture2D(tDiffuse, vUv + vec2( 0.0,  1.0) * r) + texture2D(tDiffuse, vUv - vec2( 0.0,  1.0) * r)) * 0.1531;
      col += (texture2D(tDiffuse, vUv + vec2( 0.7,  0.7) * r) + texture2D(tDiffuse, vUv - vec2( 0.7,  0.7) * r)) * 0.0805;
      col += (texture2D(tDiffuse, vUv + vec2( 0.7, -0.7) * r) + texture2D(tDiffuse, vUv - vec2( 0.7, -0.7) * r)) * 0.0805;
      gl_FragColor = col;
    }
  `,
};

function Effects() {
  const { gl, scene, camera, size } = useThree();
  const bits = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    const tilt = new ShaderPass(TiltShiftShader);
    composer.addPass(tilt);
    return { composer, tilt };
  }, [gl, scene, camera]);

  useEffect(() => {
    const pr = gl.getPixelRatio();
    bits.composer.setPixelRatio(pr);
    bits.composer.setSize(size.width, size.height);
    (bits.tilt.uniforms.uTexel.value as THREE.Vector2).set(1 / (size.width * pr), 1 / (size.height * pr));
  }, [bits, gl, size]);

  useEffect(() => () => bits.composer.dispose(), [bits]);

  useFrame(() => {
    bits.composer.render();
  }, 1);

  return null;
}

/* ── full-screen clip-space quads: sky gradient behind, dusk dim in front ─ */
const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function SkyAndDim({ smooth }: { smooth: RefN }) {
  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform vec3 uTop, uBot;
          void main() {
            vec3 col = mix(uBot, uTop, smoothstep(0.12, 0.9, vUv.y));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        uniforms: { uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() } },
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  const dim = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform float uOpacity;
          void main() { gl_FragColor = vec4(vec3(0.01, 0.04, 0.02), uOpacity); }
        `,
        uniforms: { uOpacity: { value: 0 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  useFrame(() => {
    const s = smooth.current ?? 0;
    const g = skyAt(s);
    (sky.uniforms.uTop.value as THREE.Color).setRGB(g.top[0], g.top[1], g.top[2]);
    (sky.uniforms.uBot.value as THREE.Color).setRGB(g.bot[0], g.bot[1], g.bot[2]);
    // dusk grade OR the inter-chapter blackout — whichever is deeper
    dim.uniforms.uOpacity.value = Math.max(g.dim, blackoutAt(s));
  });

  return (
    <>
      <mesh renderOrder={-10} frustumCulled={false} material={sky}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh renderOrder={990} frustumCulled={false} material={dim}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </>
  );
}

/* ── camera flight path, scrubbed by scroll, nudged by pointer ─────────── */
const POS_CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 3.3, 4.5),
  new THREE.Vector3(-0.4, 2.9, -0.5),
  new THREE.Vector3(-1.4, 2.3, -7),
  new THREE.Vector3(-2.2, 2.7, -13.5), // swings left around the hero peak
  new THREE.Vector3(-0.6, 2.6, -20),
  new THREE.Vector3(0, 2.2, -26.5),
]);
const LOOK_CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.4, 5.2, -13),
  new THREE.Vector3(0, 4.2, -15),
  new THREE.Vector3(-0.4, 2.6, -19),
  new THREE.Vector3(0.2, 2.6, -26),
  new THREE.Vector3(0, 1.8, -34),
  new THREE.Vector3(0, 1.4, -42),
]);

function Rig({ smooth, pointer }: { smooth: RefN; pointer: Ref2 }) {
  const { camera } = useThree();
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const soft = useRef({ x: 0, y: 0 });

  useFrame(() => {
    // the flight is chapter A only — it completes before the blackout
    const s = chapterA(smooth.current ?? 0);
    POS_CURVE.getPoint(s, pos);
    LOOK_CURVE.getPoint(s, look);
    const px = pointer.current?.x ?? 0;
    const py = pointer.current?.y ?? 0;
    soft.current.x += (px - soft.current.x) * 0.04;
    soft.current.y += (py - soft.current.y) * 0.04;
    camera.position.set(pos.x + soft.current.x * 0.55, pos.y - soft.current.y * 0.3, pos.z);
    camera.lookAt(look.x + soft.current.x * 1.2, look.y - soft.current.y * 0.8, look.z);
  });
  return null;
}

/* ── the painted world: peaks, ground, horizon ring ────────────────────── */
function World() {
  const [bg, mountain, ridge, lake] = useLoader(THREE.TextureLoader, [TEX.bg, TEX.mountain, TEX.ridge, TEX.lake]);

  const { peakMeshes, groundMat, ringMat } = useMemo(() => {
    for (const t of [bg, mountain, ridge, lake]) {
      // NoColorSpace: the composer has no output-encode pass, so pass the
      // authored painting through untouched (WYSIWYG, no double conversion)
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
      t.anisotropy = 4;
    }

    // hand-curated clean windows of each atlas — clear of the pink flower
    // patch, the purple corner and the dark bark strips
    const WINDOWS: Record<"mountain" | "ridge", [number, number][]> = {
      mountain: [
        [0.06, 0.3],
        [0.16, 0.38],
        [0.1, 0.46],
        [0.24, 0.28],
      ],
      ridge: [
        [0.12, 0.16],
        [0.2, 0.26],
        [0.08, 0.32],
        [0.28, 0.2],
      ],
    };
    const peakMeshes = PEAKS.map((cfg, i) => {
      const geo = buildPeak(cfg);
      const map = (cfg.tex === "mountain" ? mountain : ridge).clone();
      map.needsUpdate = true;
      const win = WINDOWS[cfg.tex][i % WINDOWS[cfg.tex].length];
      map.offset.set(win[0], win[1]);
      map.repeat.set(0.44, 0.4); // strokes at reference scale, inside the window
      const mat = new THREE.MeshBasicMaterial({ map, fog: true, vertexColors: true });
      return { cfg, geo, mat };
    });

    // mossy valley floor — kept close to the fog tone so the horizon line
    // dissolves instead of cutting
    const groundMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.42, 0.31), fog: true });

    const ringMap = bg.clone();
    ringMap.needsUpdate = true;
    ringMap.repeat.set(2.5, 0.45);
    ringMap.offset.set(0, 0.28); // mid-band of the painting only
    const ringMat = new THREE.MeshBasicMaterial({ map: ringMap, fog: true, side: THREE.BackSide });

    return { peakMeshes, groundMat, ringMat };
  }, [bg, mountain, ridge, lake]);

  return (
    <>
      {/* peaks */}
      {peakMeshes.map(({ cfg, geo, mat }, i) => (
        <mesh
          key={i}
          geometry={geo}
          material={mat}
          position={[cfg.x, cfg.h / 2 - 0.15, cfg.z]}
          rotation={[0, cfg.rot, 0]}
        />
      ))}
      {/* valley floor — the aerial lake painting */}
      <mesh material={groundMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -30]}>
        <planeGeometry args={[110, 110]} />
      </mesh>
      {/* far horizon band */}
      <mesh material={ringMat} position={[0, 7, -28]}>
        <cylinderGeometry args={[72, 72, 34, 72, 1, true]} />
      </mesh>
    </>
  );
}

/* ── drifting mist sprites ─────────────────────────────────────────────── */
/** Soft radial puff drawn at runtime — always smooth, no asset surprises. */
function makePuffTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.45, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function Mist({ smooth, animate }: { smooth: RefN; animate: boolean }) {
  const fogTex = useMemo(makePuffTexture, []);
  const group = useRef<THREE.Group>(null!);

  const puffs = useMemo(() => {
    let seed = 4242;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 10 }, (_, i) => ({
      x: (rnd() - 0.5) * 26,
      y: 0.6 + rnd() * 2.6,
      z: -6 - rnd() * 32,
      sc: 7 + rnd() * 9,
      v: 0.12 + rnd() * 0.25,
      ph: rnd() * Math.PI * 2,
      base: 0.16 + rnd() * 0.2,
    }));
  }, []);

  const materials = useMemo(
    () =>
      puffs.map(
        () =>
          new THREE.SpriteMaterial({
            map: fogTex,
            transparent: true,
            depthWrite: false,
            color: new THREE.Color(0.93, 0.96, 1.0),
            opacity: 0,
          }),
      ),
    [puffs, fogTex],
  );

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    const s = smooth.current ?? 0;
    const boost = (0.4 + 1.1 * band(s, 0.12, 0.28, 0.08)) * (1 - THREE.MathUtils.smoothstep(s, 0.3, 0.34)); // gone before blackout #1
    group.current.children.forEach((child, i) => {
      const p = puffs[i];
      const spr = child as THREE.Sprite;
      spr.position.set(p.x + Math.sin(t * p.v + p.ph) * 1.6, p.y + Math.sin(t * 0.3 + p.ph) * 0.25, p.z);
      spr.scale.set(p.sc, p.sc * 0.6, 1);
      (spr.material as THREE.SpriteMaterial).opacity = p.base * boost;
    });
  });

  return (
    <group ref={group}>
      {puffs.map((_, i) => (
        <sprite key={i} material={materials[i]} renderOrder={500} />
      ))}
    </group>
  );
}

/* ── floating dust/light particles ─────────────────────────────────────── */
function Particles({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    let seed = 999;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 70;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (rnd() - 0.5) * 30;
      arr[i * 3 + 1] = 0.5 + rnd() * 7;
      arr[i * 3 + 2] = 2 - rnd() * 36;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);

  useFrame((state) => {
    if (!animate) return;
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.03) * 0.05;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.11) * 0.35;
  });

  return (
    <points ref={ref} geometry={geo} renderOrder={400}>
      <pointsMaterial
        size={0.055}
        transparent
        opacity={0.5}
        color={new THREE.Color(1, 1, 1)}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

/* ── birds gliding between the peaks ───────────────────────────────────── */
const BIRD_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float a = 1.0 - texture2D(uMap, vUv).g;
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`;
const BIRD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

function band(s: number, a: number, b: number, fade: number): number {
  const inN = THREE.MathUtils.smoothstep(s, a - fade, a + fade);
  const outN = 1 - THREE.MathUtils.smoothstep(s, b - fade, b + fade);
  return Math.min(inN, outN);
}

function Birds({ smooth, animate }: { smooth: RefN; animate: boolean }) {
  const tex = useLoader(THREE.TextureLoader, TEX.bird);
  const group = useRef<THREE.Group>(null!);
  const { camera } = useThree();

  const birds = useMemo(
    () => [
      { dy: 2.6, s: 0.62, v: 0.55, ph: 0.0, flap: 7.5, dz: -9 },
      { dy: 3.4, s: 0.4, v: 0.68, ph: 3.4, flap: 9, dz: -12 },
      { dy: 1.9, s: 0.3, v: 0.8, ph: 6.1, flap: 10.5, dz: -7 },
    ],
    [],
  );

  const materials = useMemo(
    () =>
      birds.map(
        () =>
          new THREE.ShaderMaterial({
            vertexShader: BIRD_VERT,
            fragmentShader: BIRD_FRAG,
            uniforms: {
              uMap: { value: tex },
              uColor: { value: new THREE.Color(0.16, 0.22, 0.26) },
              uOpacity: { value: 0 },
            },
            transparent: true,
            depthTest: false,
            depthWrite: false,
          }),
      ),
    [birds, tex],
  );

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    const s = smooth.current ?? 0;
    const vis = band(s, 0.1, 0.28, 0.07) * 0.65; // chapter A only, clear of the hero
    group.current.children.forEach((child, i) => {
      const b = birds[i];
      const mesh = child as THREE.Mesh;
      const x = ((((t * b.v + b.ph) % 14) + 14) % 14) - 7;
      mesh.position.set(
        camera.position.x + x,
        camera.position.y + b.dy + Math.sin(t * 1.4 + b.ph) * 0.25,
        camera.position.z + b.dz,
      );
      const flap = 0.7 + 0.3 * Math.sin(t * b.flap + b.ph);
      mesh.scale.set(b.s, b.s * flap, 1);
      mesh.quaternion.copy(camera.quaternion); // billboard
      (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = vis;
    });
  });

  return (
    <group ref={group}>
      {birds.map((_, i) => (
        <mesh key={i} material={materials[i]} renderOrder={600}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

/* ── painted flyover chapters: full-screen aerial paintings, scroll-scrubbed
      Ken-Burns (fade up out of a blackout, drift + zoom as you scroll) ──── */
type PaintCfg = {
  url: string;
  order: number;
  zoomFrom: number;
  zoomTo: number;
  panY: number; // total v drift across the panel's life
  opacity: (s: number) => number;
  prog: (s: number) => number;
};

const PAINT_CHAPTERS: PaintCfg[] = [
  // chapter B — river flyover, panel 1 (single river)
  {
    url: TEX.river1, order: 940, zoomFrom: 1.4, zoomTo: 1.15, panY: 0.22,
    opacity: (s) => band(s, 0.415, 0.545, 0.04),
    prog: (s) => Math.min(1, Math.max(0, (s - 0.4) / 0.155)),
  },
  // chapter B — river flyover, panel 2 (braided rivers), zooms IN for contrast
  {
    url: TEX.river2, order: 941, zoomFrom: 1.15, zoomTo: 1.42, panY: 0.18,
    opacity: (s) => band(s, 0.525, 0.645, 0.04),
    prog: (s) => Math.min(1, Math.max(0, (s - 0.515) / 0.14)),
  },
  // chapter C — the lake finale (holds to the end; dusk dim grades it)
  {
    url: TEX.lake, order: 945, zoomFrom: 1.45, zoomTo: 1.12, panY: 0.2,
    opacity: (s) => THREE.MathUtils.smoothstep(s, 0.68, 0.745),
    prog: (s) => Math.min(1, Math.max(0, (s - 0.68) / 0.32)),
  },
];

function PaintingLayer({ cfg, smooth }: { cfg: PaintCfg; smooth: RefN }) {
  const tex = useLoader(THREE.TextureLoader, cfg.url);

  const mat = useMemo(() => {
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
    tex.anisotropy = 4;
    return new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uMap;
        uniform float uOpacity, uProg, uTime;
        uniform float uZoomFrom, uZoomTo, uPanY;
        uniform float uImgAspect, uScreenAspect;
        void main() {
          // background-size: cover, with zoom headroom for the drift
          float zoom = mix(uZoomFrom, uZoomTo, uProg);
          vec2 uv = (vUv - 0.5) / zoom + 0.5;
          vec2 sc = (uScreenAspect > uImgAspect)
            ? vec2(1.0, uImgAspect / uScreenAspect)
            : vec2(uScreenAspect / uImgAspect, 1.0);
          uv = (uv - 0.5) * sc + 0.5;
          uv.y += (0.5 - uProg) * uPanY;                // fly "north" as you scroll
          uv.x += sin(uTime * 0.02) * 0.008;            // barely-there idle drift
          vec4 c = texture2D(uMap, uv);
          gl_FragColor = vec4(c.rgb, uOpacity);
        }
      `,
      uniforms: {
        uMap: { value: tex },
        uOpacity: { value: 0 },
        uProg: { value: 0 },
        uTime: { value: 0 },
        uZoomFrom: { value: cfg.zoomFrom },
        uZoomTo: { value: cfg.zoomTo },
        uPanY: { value: cfg.panY },
        uImgAspect: { value: 1 },
        uScreenAspect: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  }, [tex, cfg]);

  useFrame((state) => {
    const s = smooth.current ?? 0;
    const u = mat.uniforms;
    u.uOpacity.value = cfg.opacity(s);
    u.uProg.value = cfg.prog(s);
    u.uTime.value = state.clock.elapsedTime;
    u.uScreenAspect.value = state.size.width / state.size.height;
    const img = tex.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) u.uImgAspect.value = img.width / img.height;
  });

  return (
    <mesh renderOrder={cfg.order} frustumCulled={false} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/* ── scene root: fog grading + everything wired to the smoothed scroll ─── */
function SceneRoot({ scroll, pointer, animate }: { scroll: RefN; pointer: Ref2; animate: boolean }) {
  const { scene } = useThree();
  const smooth = useRef(0);

  const fog = useMemo(() => new THREE.Fog(new THREE.Color(0.85, 0.9, 0.97), 16, 54), []);
  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  useFrame(() => {
    const raw = scroll.current ?? 0;
    // demand mode (reduced motion / offscreen) renders single frames on
    // scroll — snap instead of easing so the frame matches the position
    if (animate) smooth.current += (raw - smooth.current) * 0.075;
    else smooth.current = raw;
    const g = skyAt(smooth.current);
    // fog matches the sky's horizon colour exactly → seamless blend
    fog.color.setRGB(g.bot[0], g.bot[1], g.bot[2]);
    fog.near = 14;
    fog.far = 62 - smooth.current * 8;
  });

  return (
    <>
      <SkyAndDim smooth={smooth} />
      <World />
      <Mist smooth={smooth} animate={animate} />
      <Particles animate={animate} />
      <Birds smooth={smooth} animate={animate} />
      {PAINT_CHAPTERS.map((cfg) => (
        <PaintingLayer key={cfg.url + cfg.order} cfg={cfg} smooth={smooth} />
      ))}
      <Rig smooth={smooth} pointer={pointer} />
      <Effects />
    </>
  );
}

export default function Diorama() {
  const wrap = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const scroll = useRef(0);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const onMove = (e: MouseEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scroll.current = max > 0 ? window.scrollY / max : 0;
      // in demand mode (reduced motion / offscreen) request a frame so the
      // scene still tracks the scroll position; no-op while looping
      invalidate();
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    const el = wrap.current;
    let io: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting)), {
        threshold: 0.01,
      });
      io.observe(el);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io?.disconnect();
    };
  }, []);

  const animate = inView && !reduced;

  return (
    <div className="vx-bg" ref={wrap} aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={animate ? "always" : "demand"}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: 50, near: 0.1, far: 120, position: [0, 3.3, 4.5] }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0.74, 0.82, 0.96), 1)}
      >
        <Suspense fallback={null}>
          <SceneRoot scroll={scroll} pointer={pointer} animate={animate} />
        </Suspense>
      </Canvas>
    </div>
  );
}
