"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Diorama — the scroll-scrubbed painterly WebGL backdrop for the cinematic
 * homepage, rebuilt from scratch on three.js in the spirit of vvvhound.com.
 * Each impressionist painting (mountains / ridge / pass / lake) is a
 * full-screen quad drawn by a shared "cover-fit" shader. Scroll drives:
 *   • which paintings are visible (smooth cross-fade between story "acts")
 *   • a continuous Ken-Burns pan + dolly-in zoom (every scroll offset is a
 *     distinct frame — the scrub IS the animation)
 * Time drives drifting fog, light-trails and a small flock of birds; the
 * pointer adds parallax. Fixed behind the scrolling DOM content.
 *
 * Paintings render in clip-space (gl_Position = position.xy) so they always
 * fill the viewport; the birds are ordinary camera-projected quads.
 * ssr:false — import via next/dynamic from the client page.
 */

const BASE = "/experience/";
const URLS = [
  "SC_01_BACKGROUND_MOUNTAINS_TEXTURE.webp", // 0 far mountains  (hero)
  "SC_01_MOUNTAIN_TEXTURE.webp", // 1 mountain      (act 2)
  "SC_01_RIDGE_TEXTURE.webp", // 2 ridge         (act 3)
  "SC_02_P3_TEXTURE.webp", // 3 bright pass   (act 4)
  "SC_03_LAKE_TEXTURE.webp", // 4 lake          (act 5)
  "fog.webp", // 5 fog puff
  "fog_flow.webp", // 6 fog flow
  "TRAILS.webp", // 7 rgb light trails
  "waterNormal.jpg", // 8 water normal
].map((f) => BASE + f);

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform sampler2D uWater;
  uniform int   uMode;        // 0 gradient, 1 painting, 2 fog, 3 trails
  uniform float uHasWater;
  uniform float uTime, uScroll, uOpacity;
  uniform float uParallax, uDrift, uZoom, uZoomTravel, uYOffset;
  uniform float uImgAspect, uScreenAspect;
  uniform float uFogAmt, uWaterAmt, uPointerAmt;
  uniform vec3  uTint, uFog, uGradTop, uGradBot;
  uniform vec2  uPointer;

  vec2 coverUv() {
    vec2 uv = vUv;
    float zoomNow = uZoom + uScroll * uZoomTravel;         // dolly-in with scroll
    uv = (uv - 0.5) / zoomNow + 0.5;                       // zoom headroom for panning
    vec2 s = (uScreenAspect > uImgAspect)
      ? vec2(1.0, uImgAspect / uScreenAspect)
      : vec2(uScreenAspect / uImgAspect, 1.0);             // background-size: cover
    uv = (uv - 0.5) * s + 0.5;
    uv.y += uScroll * uParallax + uYOffset;                // scroll pan (the "frames")
    uv.x += uPointer.x * uPointerAmt;
    uv.y += uPointer.y * uPointerAmt;
    uv.x += uTime * uDrift;                                // idle drift (fog/trails alive)
    return uv;
  }

  void main() {
    if (uMode == 0) {                                      // vertical sky gradient
      vec3 col = mix(uGradBot, uGradTop, smoothstep(0.0, 1.0, vUv.y));
      gl_FragColor = vec4(col, uOpacity);
      return;
    }
    vec2 uv = coverUv();
    if (uHasWater > 0.5) {                                 // lake shimmer
      vec3 n = texture2D(uWater, fract(uv * 1.4 + uTime * 0.015)).rgb;
      uv += (n.xy - 0.5) * uWaterAmt;
    }
    vec4 c = texture2D(uMap, uv);
    if (uMode == 2) {                                      // fog — alpha from luminance
      float m = max(max(c.r, c.g), c.b);
      gl_FragColor = vec4(uTint, smoothstep(0.15, 0.9, m) * uOpacity);
      return;
    }
    if (uMode == 3) {                                      // additive light trails
      gl_FragColor = vec4(c.rgb * uTint, uOpacity);
      return;
    }
    c.rgb = mix(c.rgb, uFog, uFogAmt);                     // atmospheric wash
    c.rgb *= uTint;
    gl_FragColor = vec4(c.rgb, c.a * uOpacity);
  }
`;

const BIRD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// the bird texture is a dark silhouette on white — alpha comes from darkness
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

type Ref2 = React.RefObject<{ x: number; y: number }>;
type RefN = React.RefObject<number>;

// smooth 0→1→0 "tent" so a painting fades in for its act and back out after
function band(s: number, a: number, b: number, fade: number): number {
  const inN = THREE.MathUtils.smoothstep(s, a - fade, a + fade);
  const outN = 1 - THREE.MathUtils.smoothstep(s, b - fade, b + fade);
  return Math.min(inN, outN);
}

type LayerCfg = {
  mode: 0 | 1 | 2 | 3;
  tex?: number;
  water?: boolean;
  parallax: number;
  drift: number;
  zoom: number;
  zoomTravel: number;
  yOffset: number;
  tint: [number, number, number];
  fog: [number, number, number];
  fogAmt: number;
  pointerAmt: number;
  additive?: boolean;
  opacity: (s: number) => number;
};

// ── the stack, back → front ────────────────────────────────────────────────
const LIME: [number, number, number] = [0.86, 0.95, 0.6];
const PALE: [number, number, number] = [0.9, 0.96, 0.78];
const DEEP: [number, number, number] = [0.11, 0.19, 0.13]; // #1c3020-ish

const LAYERS: LayerCfg[] = [
  // sky gradient (deep green → lime), always on
  {
    mode: 0, parallax: 0, drift: 0, zoom: 1, zoomTravel: 0, yOffset: 0,
    tint: [1, 1, 1], fog: DEEP, fogAmt: 0, pointerAmt: 0,
    opacity: () => 1,
  },
  // far mountains — hero
  {
    mode: 1, tex: 0, parallax: 0.07, drift: 0, zoom: 1.18, zoomTravel: 0.1, yOffset: 0,
    tint: [0.82, 0.9, 0.62], fog: DEEP, fogAmt: 0.35, pointerAmt: 0.01,
    opacity: (s) => band(s, -0.1, 0.34, 0.1) * 0.95,
  },
  // mountain — act 2
  {
    mode: 1, tex: 1, parallax: 0.11, drift: 0, zoom: 1.2, zoomTravel: 0.13, yOffset: 0,
    tint: [0.88, 0.95, 0.66], fog: DEEP, fogAmt: 0.22, pointerAmt: 0.015,
    opacity: (s) => band(s, 0.2, 0.56, 0.09),
  },
  // ridge — act 3
  {
    mode: 1, tex: 2, parallax: 0.15, drift: 0, zoom: 1.22, zoomTravel: 0.15, yOffset: 0,
    tint: [0.85, 0.93, 0.64], fog: DEEP, fogAmt: 0.18, pointerAmt: 0.02,
    opacity: (s) => band(s, 0.48, 0.72, 0.08),
  },
  // bright pass — act 4
  {
    mode: 1, tex: 3, parallax: 0.18, drift: 0, zoom: 1.25, zoomTravel: 0.16, yOffset: 0,
    tint: [0.9, 0.98, 0.7], fog: DEEP, fogAmt: 0.14, pointerAmt: 0.025,
    opacity: (s) => band(s, 0.66, 0.86, 0.07),
  },
  // lake — act 5 (+water shimmer)
  {
    mode: 1, tex: 4, water: true, parallax: 0.22, drift: 0, zoom: 1.2, zoomTravel: 0.12, yOffset: 0,
    tint: [0.83, 0.92, 0.66], fog: DEEP, fogAmt: 0.12, pointerAmt: 0.03,
    opacity: (s) => band(s, 0.8, 1.1, 0.08),
  },
  // fog flow — drifting mist over everything
  {
    mode: 2, tex: 6, parallax: 0.06, drift: 0.006, zoom: 1.3, zoomTravel: 0, yOffset: 0,
    tint: PALE, fog: DEEP, fogAmt: 0, pointerAmt: 0.02,
    opacity: (s) => 0.16 + 0.14 * Math.sin(s * 6.28),
  },
  // near fog — thickens toward the end
  {
    mode: 2, tex: 5, parallax: 0.1, drift: -0.008, zoom: 1.5, zoomTravel: 0, yOffset: 0,
    tint: PALE, fog: DEEP, fogAmt: 0, pointerAmt: 0.035,
    opacity: (s) => 0.12 + 0.28 * THREE.MathUtils.smoothstep(s, 0.55, 1.0),
  },
  // light trails — additive energy through the middle
  {
    mode: 3, tex: 7, parallax: 0.24, drift: 0.004, zoom: 1.1, zoomTravel: 0, yOffset: 0,
    tint: LIME, fog: DEEP, fogAmt: 0, pointerAmt: 0.04, additive: true,
    opacity: (s) => 0.5 * band(s, 0.34, 0.82, 0.12),
  },
];

function makeUniforms(cfg: LayerCfg, textures: THREE.Texture[]) {
  const map = cfg.tex != null ? textures[cfg.tex] : null;
  const img = map?.image as { width?: number; height?: number } | undefined;
  const imgAspect = img?.width && img?.height ? img.width / img.height : 1;
  return {
    uMap: { value: map },
    uWater: { value: textures[8] },
    uMode: { value: cfg.mode },
    uHasWater: { value: cfg.water ? 1 : 0 },
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uOpacity: { value: 0 },
    uParallax: { value: cfg.parallax },
    uDrift: { value: cfg.drift },
    uZoom: { value: cfg.zoom },
    uZoomTravel: { value: cfg.zoomTravel },
    uYOffset: { value: cfg.yOffset },
    uImgAspect: { value: imgAspect },
    uScreenAspect: { value: 1 },
    uFogAmt: { value: cfg.fogAmt },
    uWaterAmt: { value: cfg.water ? 0.02 : 0 },
    uPointerAmt: { value: cfg.pointerAmt },
    uTint: { value: new THREE.Color(...cfg.tint) },
    uFog: { value: new THREE.Color(...cfg.fog) },
    uGradTop: { value: new THREE.Color(0.72, 0.85, 0.5) },
    uGradBot: { value: new THREE.Color(0.06, 0.12, 0.09) },
    uPointer: { value: new THREE.Vector2(0, 0) },
  };
}

/** A few birds gliding across the middle acts — camera-projected quads. */
function Birds({ smooth, animate }: { smooth: RefN; animate: boolean }) {
  const tex = useLoader(THREE.TextureLoader, BASE + "BIRD_ALPHA.webp");
  const group = useRef<THREE.Group>(null!);

  const birds = useMemo(
    () => [
      { y: 1.7, s: 0.5, v: 0.5, ph: 0.0, flap: 7.5 },
      { y: 2.3, s: 0.34, v: 0.62, ph: 3.4, flap: 9 },
      { y: 1.1, s: 0.26, v: 0.74, ph: 6.1, flap: 10.5 },
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
              uColor: { value: new THREE.Color(0.08, 0.14, 0.1) },
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
    const vis = band(s, 0.14, 0.62, 0.12) * 0.8; // visible through the middle acts
    group.current.children.forEach((child, i) => {
      const b = birds[i];
      const mesh = child as THREE.Mesh;
      // glide left → right, wrapping around; sink slightly as you scroll on
      const x = (((t * b.v + b.ph) % 11) + 11) % 11 - 5.5;
      const y = b.y + Math.sin(t * 1.6 + b.ph) * 0.1 - s * 1.4;
      mesh.position.set(x, y, 0);
      const flap = 0.7 + 0.3 * Math.sin(t * b.flap + b.ph); // wing squash = flapping
      mesh.scale.set(b.s, b.s * flap, 1);
      (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = vis;
    });
  });

  return (
    <group ref={group}>
      {birds.map((_, i) => (
        <mesh key={i} material={materials[i]} renderOrder={20}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

function Scene({ scroll, pointer, animate }: { scroll: RefN; pointer: Ref2; animate: boolean }) {
  const textures = useLoader(THREE.TextureLoader, URLS);

  const materials = useMemo(() => {
    for (const t of textures) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
    }
    // paintings (all power-of-two) mirror when panned past their edge, so the
    // Ken-Burns offset never clamps into a flat strip of colour
    [0, 1, 2, 3, 4].forEach((i) => {
      textures[i].wrapS = textures[i].wrapT = THREE.MirroredRepeatWrapping;
    });
    textures[6].wrapS = textures[6].wrapT = THREE.RepeatWrapping; // fog flow drifts
    textures[5].wrapS = textures[5].wrapT = THREE.RepeatWrapping;
    textures[7].wrapS = textures[7].wrapT = THREE.RepeatWrapping;
    textures[8].wrapS = textures[8].wrapT = THREE.RepeatWrapping;

    return LAYERS.map((cfg) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: makeUniforms(cfg, textures),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      return { mat, cfg };
    });
  }, [textures]);

  // smoothed scroll so cross-fades glide even if the raw signal is steppy
  const smooth = useRef(0);

  useFrame((state) => {
    const raw = scroll.current ?? 0;
    smooth.current += (raw - smooth.current) * 0.08;
    const s = smooth.current;
    const t = animate ? state.clock.elapsedTime : 0;
    const asp = state.size.width / state.size.height;
    const px = pointer.current?.x ?? 0;
    const py = pointer.current?.y ?? 0;
    for (const { mat, cfg } of materials) {
      const u = mat.uniforms;
      u.uTime.value = t;
      u.uScroll.value = s;
      u.uOpacity.value = cfg.opacity(s);
      u.uScreenAspect.value = asp;
      (u.uPointer.value as THREE.Vector2).set(px, py);
    }
  });

  return (
    <>
      {materials.map(({ mat }, i) => (
        <mesh key={i} renderOrder={i}>
          <planeGeometry args={[2, 2]} />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}
      <Birds smooth={smooth} animate={animate} />
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
        dpr={[1, 1.75]}
        frameloop={animate ? "always" : "demand"}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0.04, 0.08, 0.06), 1)}
      >
        <Suspense fallback={null}>
          <Scene scroll={scroll} pointer={pointer} animate={animate} />
        </Suspense>
      </Canvas>
    </div>
  );
}
