/* Roptimer Hub — local Three.js nebula scene.
   Vendored from three.js 0.169.0 (MIT). No CDN, no remote assets, no tracking. */
import * as THREE from './vendor/three/three.module.min.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('three-canvas');
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function radialSprite(inner, outer) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.35, outer);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function shieldShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 2.15);
  shape.bezierCurveTo(0.55, 1.85, 1.72, 1.55, 1.9, 0.55);
  shape.bezierCurveTo(2.05, -0.45, 1.5, -1.45, 0, -2.25);
  shape.bezierCurveTo(-1.5, -1.45, -2.05, -0.45, -1.9, 0.55);
  shape.bezierCurveTo(-1.72, 1.55, -0.55, 1.85, 0, 2.15);
  return shape;
}

function start() {
  if (!canvas || !window.WebGLRenderingContext) {
    document.documentElement.classList.add('no-webgl');
    window.RoptimerThree = { started: false, reason: 'WebGL unavailable' };
    return;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x030307, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030307, 0.055);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.35, 10.5);

  const world = new THREE.Group();
  scene.add(world);

  // Cool blue/violet/cyan lighting. No green neon.
  scene.add(new THREE.AmbientLight(0x4b3f7a, 1.15));
  const key = new THREE.PointLight(0x8b7cff, 80, 30);
  key.position.set(-5, 4, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0x5ec8ff, 65, 28);
  rim.position.set(6, -2, 5);
  scene.add(rim);
  const warm = new THREE.PointLight(0xf2b65d, 22, 22);
  warm.position.set(3, 5, -3);
  scene.add(warm);

  // Central shield.
  const geometry = new THREE.ExtrudeGeometry(shieldShape(), {
    depth: 0.38,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: 0.12,
    bevelThickness: 0.1,
    curveSegments: 24,
  });
  geometry.center();
  const shieldMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1a1740,
    emissive: 0x4d3fa8,
    emissiveIntensity: 0.75,
    metalness: 0.62,
    roughness: 0.22,
    transmission: 0.18,
    thickness: 0.9,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
  });
  const shield = new THREE.Mesh(geometry, shieldMaterial);
  shield.scale.setScalar(1.12);
  world.add(shield);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 18),
    new THREE.LineBasicMaterial({ color: 0x9c8cff, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending })
  );
  edges.scale.setScalar(1.14);
  world.add(edges);

  // Orbiting rings.
  const ringGroup = new THREE.Group();
  world.add(ringGroup);
  const ringSpecs = [
    { radius: 3.15, tube: 0.018, color: 0x9c8cff, rot: [1.15, 0.2, 0.4] },
    { radius: 3.7, tube: 0.012, color: 0x6fcfff, rot: [0.35, 1.0, 0.2] },
    { radius: 4.25, tube: 0.009, color: 0xf2b65d, rot: [1.45, 0.8, 1.1] },
  ];
  ringSpecs.forEach((spec) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(spec.radius, spec.tube, 12, 180),
      new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending })
    );
    ring.rotation.set(...spec.rot);
    ringGroup.add(ring);
  });

  // Floating shards.
  const shardGroup = new THREE.Group();
  world.add(shardGroup);
  const shardGeometry = new THREE.OctahedronGeometry(0.18, 0);
  for (let i = 0; i < 18; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? 0x6fcfff : i % 3 === 1 ? 0x9c8cff : 0xf2b65d,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
    });
    const shard = new THREE.Mesh(shardGeometry, material);
    const angle = (i / 18) * Math.PI * 2;
    const radius = 4.8 + Math.random() * 2.6;
    shard.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 6.5, -2 - Math.random() * 5);
    shard.userData.spin = 0.25 + Math.random() * 0.6;
    shard.userData.float = Math.random() * Math.PI * 2;
    shardGroup.add(shard);
  }

  // Particle field.
  const count = 900;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [new THREE.Color(0xffffff), new THREE.Color(0x9c8cff), new THREE.Color(0x6fcfff), new THREE.Color(0xf2b65d)];
  for (let i = 0; i < count; i += 1) {
    const radius = 7 + Math.random() * 18;
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 18;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = -6 - Math.random() * 18 + Math.sin(angle) * 4;
    const color = palette[i % palette.length];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  scene.add(particles);

  // Soft glow sprites.
  const spriteTexture = radialSprite('rgba(190,180,255,0.95)', 'rgba(120,95,255,0.32)');
  if (spriteTexture) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(9, 9, 1);
    glow.position.set(0, 0, -1.5);
    world.add(glow);
  }

  // Subtle floor grid.
  const grid = new THREE.GridHelper(34, 34, 0x4b3f7a, 0x1d1b34);
  grid.position.set(0, -5.2, -4);
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  scene.add(grid);

  // Bloom pipeline.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.25, 0.55, 0.12);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  // Command palette / focus mode integration. Purely visual, no privileged APIs.
  let boostUntil = 0;
  const baseBloom = 1.25;
  window.addEventListener('roptimer:glow-boost', () => {
    boostUntil = performance.now() + 1700;
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (document.body && document.body.classList.contains('focus-mode')) {
      // keep rendering paused state consistent; CSS hides the canvas.
    }
  }, { passive: true });

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
  }
  window.addEventListener('resize', resize, { passive: true });

  const clock = new THREE.Clock();
  function frame() {
    const time = clock.getElapsedTime();
    world.rotation.y = time * 0.12 + pointer.x * 0.12;
    world.rotation.x = Math.sin(time * 0.3) * 0.06 - pointer.y * 0.05;
    shield.rotation.z = Math.sin(time * 0.5) * 0.06;
    edges.rotation.z = shield.rotation.z;
    ringGroup.rotation.y = time * 0.2;
    ringGroup.rotation.x = Math.sin(time * 0.25) * 0.18;
    shardGroup.children.forEach((shard, index) => {
      shard.rotation.x += shard.userData.spin * 0.01;
      shard.rotation.y += shard.userData.spin * 0.014;
      shard.position.y += Math.sin(time * 0.6 + shard.userData.float + index) * 0.0015;
    });
    particles.rotation.y = time * 0.018;
    camera.position.x += (pointer.x * 0.55 - camera.position.x) * 0.025;
    camera.position.y += (0.35 - pointer.y * 0.35 - camera.position.y) * 0.025;
    camera.lookAt(0, 0, 0);
    const boosting = performance.now() < boostUntil;
    bloom.strength += ((boosting ? 2.4 : baseBloom) - bloom.strength) * 0.08;
    composer.render();
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  document.documentElement.classList.add('webgl-ready');
  window.RoptimerThree = { started: true, three: '0.169.0', bloom: true };
  frame();
}

try {
  start();
} catch (error) {
  document.documentElement.classList.add('no-webgl');
  window.RoptimerThree = { started: false, reason: String(error && error.message ? error.message : error) };
  console.warn('Roptimer Three.js scene disabled:', error);
}
