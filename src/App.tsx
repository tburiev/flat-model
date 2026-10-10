import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface SceneRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  sun: THREE.Group;
  moon: THREE.Group;
  stars: THREE.Points;
  domeGroup: THREE.Group;
  sunRays: THREE.Group;
  nightOverlay: THREE.Mesh;
  lightCone: THREE.Mesh;
  sunOrbitRing: THREE.Line;
  moonOrbitRing: THREE.Line;
  animationId: number;
  time: number;
  timeSpeed: number;
  isPlaying: boolean;
  season: number; // 0-1, 0=spring equinox, 0.25=summer solstice, 0.5=autumn equinox, 0.75=winter solstice
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const timeDisplayRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [timeSpeed, setTimeSpeed] = useState(1);
  const [showDome, setShowDome] = useState(true);
  const [showSunRays, setShowSunRays] = useState(true);
  const [dayNight, setDayNight] = useState(true);
  const [season, setSeason] = useState(0.25); // Start at summer solstice (northern hemisphere)
  const [timeDirection, setTimeDirection] = useState(1); // 1 = forward, -1 = backward
  const timeDirectionRef = useRef(1);

  // Keep ref in sync
  useEffect(() => {
    timeDirectionRef.current = timeDirection;
  }, [timeDirection]);

  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020010);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      55,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      500
    );
    camera.position.set(25, 30, 25);
    camera.lookAt(0, 2, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    containerRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 8;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.target.set(0, 2, 0);

    // === LIGHTING ===
    const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
    scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0x446688, 0x112233, 0.3);
    scene.add(hemisphereLight);

    // === FLAT EARTH DISK ===
    const earthRadius = 15;
    const earthGeometry = new THREE.CylinderGeometry(earthRadius, earthRadius, 0.5, 128);

    // Load real earth map texture (azimuthal equidistant projection)
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');
    
    const earthTexture = textureLoader.load(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Azimuthal_equidistant_projection_SW.jpg/1280px-Azimuthal_equidistant_projection_SW.jpg',
      (texture) => {
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
      },
      undefined,
      () => {
        // Fallback: create procedural texture if loading fails
        console.warn('Failed to load earth texture, using fallback');
        const fallbackCanvas = createFallbackEarthTexture(1024);
        const fallbackTexture = new THREE.CanvasTexture(fallbackCanvas);
        earthMaterial.map = fallbackTexture;
        earthMaterial.needsUpdate = true;
      }
    );

    const earthMaterial = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.7,
      metalness: 0.05,
    });

    const earthDisk = new THREE.Mesh(earthGeometry, earthMaterial);
    earthDisk.position.y = 0;
    earthDisk.receiveShadow = true;
    earthDisk.castShadow = true;
    scene.add(earthDisk);

    // Earth edge (side of disk)
    const edgeGeometry = new THREE.CylinderGeometry(earthRadius, earthRadius, 0.5, 128, 1, true);
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a3a5a,
      roughness: 0.9,
    });
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edge.position.y = 0;
    scene.add(edge);

    // === NIGHT OVERLAY (day/night terminator) ===
    const nightGeometry = new THREE.CylinderGeometry(earthRadius + 0.01, earthRadius + 0.01, 0.52, 128, 1, false, 0, Math.PI);
    const nightMaterial = new THREE.MeshBasicMaterial({
      color: 0x000022,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const nightOverlay = new THREE.Mesh(nightGeometry, nightMaterial);
    nightOverlay.position.y = 0.01;
    scene.add(nightOverlay);

    // === ICE WALL (Antarctica) ===
    const iceWallGroup = new THREE.Group();

    // Main ice ring
    const iceWallGeometry = new THREE.TorusGeometry(earthRadius + 0.3, 1.2, 8, 128);
    const iceWallMaterial = new THREE.MeshStandardMaterial({
      color: 0xc8ddf0,
      emissive: 0x223344,
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.1,
    });
    const iceWall = new THREE.Mesh(iceWallGeometry, iceWallMaterial);
    iceWall.rotation.x = Math.PI / 2;
    iceWall.position.y = 0.8;
    iceWall.castShadow = true;
    iceWallGroup.add(iceWall);

    // Ice spikes
    for (let i = 0; i < 80; i++) {
      const angle = (i / 80) * Math.PI * 2;
      const spikeHeight = 0.8 + Math.random() * 2.5;
      const spikeWidth = 0.15 + Math.random() * 0.3;
      const spikeGeometry = new THREE.ConeGeometry(spikeWidth, spikeHeight, 5);
      const spikeMaterial = new THREE.MeshStandardMaterial({
        color: 0xddeeff,
        emissive: 0x334466,
        emissiveIntensity: 0.1,
        roughness: 0.2,
        metalness: 0.3,
        transparent: true,
        opacity: 0.85,
      });
      const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
      const r = earthRadius + 0.3 + (Math.random() - 0.5) * 0.8;
      spike.position.x = Math.cos(angle) * r;
      spike.position.z = Math.sin(angle) * r;
      spike.position.y = spikeHeight / 2 + 0.3;
      spike.rotation.z = (Math.random() - 0.5) * 0.3;
      spike.rotation.x = (Math.random() - 0.5) * 0.3;
      iceWallGroup.add(spike);
    }
    scene.add(iceWallGroup);

    // === DOME (Firmament) ===
    const domeRadius = 28;
    const domeGroup = new THREE.Group();

    // Dome solid
    const domeGeometry = new THREE.SphereGeometry(domeRadius, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x4488cc,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      roughness: 0,
      metalness: 0.1,
    });
    const domeMesh = new THREE.Mesh(domeGeometry, domeMaterial);
    domeGroup.add(domeMesh);

    // Dome wireframe
    const domeWireGeometry = new THREE.SphereGeometry(domeRadius + 0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeWireMaterial = new THREE.MeshBasicMaterial({
      color: 0x3366aa,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    const domeWire = new THREE.Mesh(domeWireGeometry, domeWireMaterial);
    domeGroup.add(domeWire);

    // Dome base ring
    const domeBaseGeometry = new THREE.TorusGeometry(domeRadius, 0.15, 8, 128);
    const domeBaseMaterial = new THREE.MeshBasicMaterial({
      color: 0x4488cc,
      transparent: true,
      opacity: 0.4,
    });
    const domeBase = new THREE.Mesh(domeBaseGeometry, domeBaseMaterial);
    domeBase.rotation.x = Math.PI / 2;
    domeBase.position.y = 0.1;
    domeGroup.add(domeBase);

    scene.add(domeGroup);

    // === STARS on dome ===
    const starsGeometry = new THREE.BufferGeometry();
    const starPositions: number[] = [];
    const starColors: number[] = [];

    for (let i = 0; i < 3000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.47;
      const r = domeRadius - 0.5;

      starPositions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );

      const colorType = Math.random();
      if (colorType < 0.6) {
        starColors.push(1, 1, 0.95);
      } else if (colorType < 0.8) {
        starColors.push(0.8, 0.85, 1);
      } else {
        starColors.push(1, 0.95, 0.8);
      }
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));

    const starsMaterial = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // === SUN ===
    const sunGroup = new THREE.Group();

    // Sun core
    const sunGeometry = new THREE.SphereGeometry(1.5, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffee44 });
    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunGroup.add(sunMesh);

    // Sun inner glow
    const sunGlow1Geometry = new THREE.SphereGeometry(2.0, 32, 32);
    const sunGlow1Material = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.4,
    });
    sunGroup.add(new THREE.Mesh(sunGlow1Geometry, sunGlow1Material));

    // Sun outer glow
    const sunGlow2Geometry = new THREE.SphereGeometry(3.0, 32, 32);
    const sunGlow2Material = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.15,
    });
    sunGroup.add(new THREE.Mesh(sunGlow2Geometry, sunGlow2Material));

    // Sun point light
    const sunLight = new THREE.PointLight(0xffdd88, 3, 60);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunGroup.add(sunLight);

    // Sun spotlight (beam down)
    const sunSpot = new THREE.SpotLight(0xffee88, 2, 40, Math.PI / 5, 0.8, 1);
    sunSpot.castShadow = true;
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, -10, 0);
    sunGroup.add(spotTarget);
    sunSpot.target = spotTarget;
    sunGroup.add(sunSpot);

    sunGroup.position.set(10, 8, 0);
    scene.add(sunGroup);

    // === SUN RAYS ===
    const sunRaysGroup = new THREE.Group();
    const rayCount = 12;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      const rayLength = 2 + Math.random() * 1.5;
      const rayGeometry = new THREE.CylinderGeometry(0.02, 0.08, rayLength, 4);
      const rayMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdd44,
        transparent: true,
        opacity: 0.6,
      });
      const ray = new THREE.Mesh(rayGeometry, rayMaterial);
      ray.position.x = Math.cos(angle) * 2;
      ray.position.z = Math.sin(angle) * 2;
      ray.rotation.z = -Math.PI / 2 + angle;
      sunRaysGroup.add(ray);
    }
    scene.add(sunRaysGroup);

    // === SUN ORBIT RING (visual indicator) ===
    const sunOrbitPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      sunOrbitPoints.push(new THREE.Vector3(
        Math.cos(angle) * 7,
        8,
        Math.sin(angle) * 7
      ));
    }
    const sunOrbitGeometry = new THREE.BufferGeometry().setFromPoints(sunOrbitPoints);
    const sunOrbitMaterial = new THREE.LineBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.25,
    });
    const sunOrbitRing = new THREE.Line(sunOrbitGeometry, sunOrbitMaterial);
    scene.add(sunOrbitRing);

    // === MOON ===
    const moonGroup = new THREE.Group();

    const moonGeometry = new THREE.SphereGeometry(0.9, 32, 32);
    const moonMaterial = new THREE.MeshStandardMaterial({
      color: 0xccccee,
      emissive: 0x334455,
      emissiveIntensity: 0.3,
      roughness: 0.9,
      metalness: 0,
    });
    moonGroup.add(new THREE.Mesh(moonGeometry, moonMaterial));

    // Moon glow
    const moonGlowGeometry = new THREE.SphereGeometry(1.3, 32, 32);
    const moonGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x8888cc,
      transparent: true,
      opacity: 0.15,
    });
    moonGroup.add(new THREE.Mesh(moonGlowGeometry, moonGlowMaterial));

    // Moon light
    const moonLight = new THREE.PointLight(0x8888bb, 0.5, 25);
    moonGroup.add(moonLight);

    moonGroup.position.set(-8, 10, 5);
    scene.add(moonGroup);

    // === MOON ORBIT RING ===
    const moonOrbitPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      moonOrbitPoints.push(new THREE.Vector3(
        Math.cos(angle) * 10,
        10,
        Math.sin(angle) * 10
      ));
    }
    const moonOrbitGeometry = new THREE.BufferGeometry().setFromPoints(moonOrbitPoints);
    const moonOrbitMaterial = new THREE.LineBasicMaterial({
      color: 0x6666aa,
      transparent: true,
      opacity: 0.2,
    });
    const moonOrbitRing = new THREE.Line(moonOrbitGeometry, moonOrbitMaterial);
    scene.add(moonOrbitRing);

    // === LIGHT CONE ===
    const lightConeGeometry = new THREE.ConeGeometry(4, 8, 32, 1, true);
    const lightConeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const lightCone = new THREE.Mesh(lightConeGeometry, lightConeMaterial);
    lightCone.position.y = 3;
    scene.add(lightCone);

    // === GRID LINES on earth ===
    const gridGroup = new THREE.Group();

    // Latitude circles (Tropic of Cancer, Equator, Tropic of Capricorn)
    const latitudes = [
      { r: 5, color: 0xff8800, label: 'Тропик Рака' },    // Tropic of Cancer (~23.5°N)
      { r: 7.5, color: 0x44aaff, label: 'Экватор' },      // Equator
      { r: 10, color: 0xff8800, label: 'Тропик Козерога' }, // Tropic of Capricorn (~23.5°S)
    ];

    latitudes.forEach(({ r, color }) => {
      const points: THREE.Vector3[] = [];
      for (let j = 0; j <= 128; j++) {
        const angle = (j / 128) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * r, 0.26, Math.sin(angle) * r));
      }
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
      });
      gridGroup.add(new THREE.Line(lineGeometry, lineMaterial));
    });

    // Additional latitude circles
    for (let i = 1; i <= 6; i++) {
      const radius = (i / 6) * earthRadius;
      const points: THREE.Vector3[] = [];
      for (let j = 0; j <= 128; j++) {
        const angle = (j / 128) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, 0.26, Math.sin(angle) * radius));
      }
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x3366aa,
        transparent: true,
        opacity: 0.1,
      });
      gridGroup.add(new THREE.Line(lineGeometry, lineMaterial));
    }

    // Longitude lines
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const points: THREE.Vector3[] = [];
      for (let j = 0; j <= 50; j++) {
        const r = (j / 50) * earthRadius;
        points.push(new THREE.Vector3(Math.cos(angle) * r, 0.26, Math.sin(angle) * r));
      }
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x3366aa,
        transparent: true,
        opacity: 0.1,
      });
      gridGroup.add(new THREE.Line(lineGeometry, lineMaterial));
    }
    scene.add(gridGroup);

    // === NORTH POLE marker (no flag!) ===
    const poleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      emissive: 0xff0000,
      emissiveIntensity: 0.3,
    });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = 0.75;
    scene.add(pole);

    // Pole top sphere
    const poleTopGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const poleTop = new THREE.Mesh(poleTopGeometry, poleMaterial);
    poleTop.position.y = 1.6;
    scene.add(poleTop);

    // === FIRMAMENT LABEL ===
    const firmamentLabel = createTextSprite('✦ ТВЕРДЬ (FIRMAMENT) ✦', 4);
    firmamentLabel.position.set(0, domeRadius * 0.95, 0);
    scene.add(firmamentLabel);

    // === BACKGROUND STARS ===
    const bgStarsGeometry = new THREE.BufferGeometry();
    const bgStarPositions: number[] = [];
    for (let i = 0; i < 5000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = 100 + Math.random() * 100;
      bgStarPositions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    bgStarsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bgStarPositions, 3));
    const bgStarsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.3,
      transparent: true,
      opacity: 0.6,
    });
    scene.add(new THREE.Points(bgStarsGeometry, bgStarsMaterial));

    // Store references
    const refs: SceneRefs = {
      scene,
      camera,
      renderer,
      controls,
      sun: sunGroup,
      moon: moonGroup,
      stars,
      domeGroup,
      sunRays: sunRaysGroup,
      nightOverlay,
      lightCone,
      sunOrbitRing,
      moonOrbitRing,
      animationId: 0,
      time: 0,
      timeSpeed: 1,
      isPlaying: true,
      season: 0.25,
    };
    sceneRef.current = refs;

    // Animation loop
    let lastTime = performance.now();
    const animate = (now: number) => {
      const ref = sceneRef.current;
      if (!ref) return;

      ref.animationId = requestAnimationFrame(animate);

      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (ref.isPlaying) {
        ref.time += delta * ref.timeSpeed * timeDirectionRef.current;
      }

      const t = ref.time;
      const s = ref.season;

      // === SEASON-BASED CALCULATIONS ===
      // Season affects the orbit radius of sun and moon
      // s=0: spring equinox, s=0.25: summer solstice, s=0.5: autumn equinox, s=0.75: winter solstice
      // In flat earth model:
      // - Summer (s=0.25): sun orbits closer to center (North Pole) - smaller radius
      // - Winter (s=0.75): sun orbits farther from center (toward ice wall) - larger radius
      // - Equinoxes (s=0, s=0.5): sun orbits at "equator" radius

      // Season factor: -1 (winter, far) to +1 (summer, close to center)
      const seasonFactor = Math.cos(s * Math.PI * 2);

      // === SUN ORBIT (independent) ===
      // Sun orbit radius varies with season
      // Equator radius = 7.5, Tropic of Cancer (summer) = 5, Tropic of Capricorn (winter) = 10
      const sunBaseRadius = 7.5;
      const sunSeasonAmplitude = 2.5;
      const sunRadius = sunBaseRadius - seasonFactor * sunSeasonAmplitude;
      const sunHeight = 7 + seasonFactor * 1.5; // Higher in summer, lower in winter

      // Sun moves around the disk - its own independent speed
      const sunAngle = t * 0.8;
      ref.sun.position.x = Math.cos(sunAngle) * sunRadius;
      ref.sun.position.z = Math.sin(sunAngle) * sunRadius;
      ref.sun.position.y = sunHeight;

      // Update sun orbit ring to show current orbit
      updateOrbitRing(ref.sunOrbitRing, sunRadius, sunHeight);

      // Sun rays follow sun
      ref.sunRays.position.copy(ref.sun.position);
      ref.sunRays.rotation.y = t * 0.5;
      ref.sunRays.rotation.z = Math.sin(t) * 0.2;

      // Light cone follows sun
      lightCone.position.x = ref.sun.position.x;
      lightCone.position.z = ref.sun.position.z;
      lightCone.position.y = ref.sun.position.y / 2;

      // === MOON ORBIT (completely independent) ===
      // Moon has its own cycle, slightly different from sun
      // Moon's season cycle is offset from sun's (different phase)
      const moonSeasonPhase = s + 0.15; // Moon's season is offset
      const moonSeasonFactor = Math.cos(moonSeasonPhase * Math.PI * 2);

      const moonBaseRadius = 10;
      const moonSeasonAmplitude = 2;
      const moonRadius = moonBaseRadius - moonSeasonFactor * moonSeasonAmplitude;
      const moonHeight = 9.5 + moonSeasonFactor * 1;

      // Moon moves at its own speed (slower than sun, different starting angle)
      const moonAngle = t * 0.53 + 2.1; // Independent speed and phase
      ref.moon.position.x = Math.cos(moonAngle) * moonRadius;
      ref.moon.position.z = Math.sin(moonAngle) * moonRadius;
      ref.moon.position.y = moonHeight;

      // Update moon orbit ring
      updateOrbitRing(ref.moonOrbitRing, moonRadius, moonHeight);

      // Night overlay rotation (opposite to sun)
      ref.nightOverlay.rotation.y = -sunAngle + Math.PI;

      // Stars slow rotation
      ref.stars.rotation.y = t * 0.05;

      // Update time display via DOM
      if (timeDisplayRef.current) {
        const hours = ((t % 24) + 24) % 24;
        const days = Math.floor(((t / 24) % 365) + 365) % 365;
        timeDisplayRef.current.textContent = `${hours.toFixed(1)}ч | День ${days}`;
      }

      ref.controls.update();
      ref.renderer.render(ref.scene, ref.camera);
    };

    animate(performance.now());

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      sceneRef.current.camera.aspect = width / height;
      sceneRef.current.camera.updateProjectionMatrix();
      sceneRef.current.renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        sceneRef.current.renderer.dispose();
        if (containerRef.current && sceneRef.current.renderer.domElement.parentNode === containerRef.current) {
          containerRef.current.removeChild(sceneRef.current.renderer.domElement);
        }
      }
    };
  }, []);

  useEffect(() => {
    const cleanup = initScene();
    return cleanup;
  }, [initScene]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.isPlaying = isPlaying;
    }
  }, [isPlaying]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.timeSpeed = timeSpeed;
    }
  }, [timeSpeed]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.domeGroup.visible = showDome;
      sceneRef.current.stars.visible = showDome;
    }
  }, [showDome]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.sunRays.visible = showSunRays;
    }
  }, [showSunRays]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.nightOverlay.visible = dayNight;
    }
  }, [dayNight]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.season = season;
    }
  }, [season]);

  const getSeasonName = (s: number) => {
    if (s < 0.125 || s >= 0.875) return '🌸 Весна';
    if (s < 0.375) return '☀️ Лето';
    if (s < 0.625) return '🍂 Осень';
    return '❄️ Зима';
  };

  return (
    <div className="w-full h-screen relative overflow-hidden bg-gray-950">
      {/* 3D Canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Title */}
      <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md rounded-xl p-3 sm:p-4 text-white border border-blue-900/50 max-w-xs">
        <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-300 to-purple-300 bg-clip-text text-transparent">
          🌍 Модель Плоской Земли
        </h1>
        <p className="text-[10px] sm:text-xs text-gray-400 mt-1">
          Интерактивная 3D визуализация
        </p>
      </div>

      {/* Info Panel */}
      <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md rounded-xl p-3 sm:p-4 text-white border border-blue-900/50 max-w-[200px] sm:max-w-xs">
        <h3 className="text-xs sm:text-sm font-bold text-blue-300 mb-2">Элементы модели:</h3>
        <ul className="text-[10px] sm:text-xs text-gray-300 space-y-0.5">
          <li>☀️ Солнце — независимая орбита</li>
          <li>🌙 Луна — независимая орбита</li>
          <li>⭐ Звёзды — на куполе</li>
          <li>🫧 Купол (твердь)</li>
          <li>🧊 Ледяная стена</li>
          <li>📍 Сев. полюс — в центре</li>
        </ul>
        <div className="mt-2 pt-2 border-t border-gray-700/50">
          <p className="text-[9px] sm:text-[10px] text-gray-500">
            🖱️ ЛКМ — вращение | Колёсико — зум | ПКМ — сдвиг
          </p>
        </div>
      </div>

      {/* Time display */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md rounded-lg px-3 py-1.5 text-white border border-blue-900/50">
        <div className="text-[10px] text-gray-400 text-center">Время модели</div>
        <div ref={timeDisplayRef} className="text-sm font-mono text-blue-300 text-center">
          0.0ч | День 0
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-3 left-3 right-3 bg-black/80 backdrop-blur-md rounded-xl p-3 sm:p-4 text-white border border-blue-900/50">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Playback controls */}
          <div className="flex items-center gap-1">
            {/* Rewind */}
            <button
              onClick={() => { setTimeDirection(-1); setIsPlaying(true); }}
              className={`px-2 py-2 rounded-lg text-sm transition-all ${
                timeDirection === -1 && isPlaying
                  ? 'bg-red-600 shadow-lg shadow-red-900/30'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title="Перемотка назад"
            >
              ⏪
            </button>
            {/* Play/Pause */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                isPlaying
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-900/30'
                  : 'bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900/30'
              }`}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            {/* Forward */}
            <button
              onClick={() => { setTimeDirection(1); setIsPlaying(true); }}
              className={`px-2 py-2 rounded-lg text-sm transition-all ${
                timeDirection === 1 && isPlaying
                  ? 'bg-green-600 shadow-lg shadow-green-900/30'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title="Перемотка вперёд"
            >
              ⏩
            </button>
            {/* Step controls */}
            <button
              onClick={() => {
                if (sceneRef.current) {
                  sceneRef.current.time -= 1;
                }
              }}
              className="px-2 py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 transition-all"
              title="Шаг назад"
            >
              ◀
            </button>
            <button
              onClick={() => {
                if (sceneRef.current) {
                  sceneRef.current.time += 1;
                }
              }}
              className="px-2 py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 transition-all"
              title="Шаг вперёд"
            >
              ▶
            </button>
          </div>

          {/* Speed Control */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 hidden sm:inline">Скорость:</span>
            <button
              onClick={() => setTimeSpeed(Math.max(0.1, timeSpeed / 2))}
              className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
            >
              ÷2
            </button>
            <span className="px-2 py-1.5 bg-gray-800 rounded text-xs font-mono min-w-[50px] text-center text-blue-300">
              {timeSpeed.toFixed(1)}x
            </span>
            <button
              onClick={() => setTimeSpeed(Math.min(50, timeSpeed * 2))}
              className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
            >
              ×2
            </button>
          </div>

          {/* Speed presets */}
          <div className="flex gap-0.5">
            {[0.25, 0.5, 1, 2, 5, 10, 20].map(speed => (
              <button
                key={speed}
                onClick={() => setTimeSpeed(speed)}
                className={`px-1.5 py-1 rounded text-[10px] sm:text-xs transition-all ${
                  Math.abs(timeSpeed - speed) < 0.01
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                    : 'bg-gray-700/80 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Toggles */}
          <div className="flex gap-1.5 ml-auto">
            <button
              onClick={() => setShowDome(!showDome)}
              className={`px-2 py-1.5 rounded-lg text-xs transition-all ${
                showDome ? 'bg-purple-600 hover:bg-purple-500' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              🫧 Купол
            </button>
            <button
              onClick={() => setShowSunRays(!showSunRays)}
              className={`px-2 py-1.5 rounded-lg text-xs transition-all ${
                showSunRays ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              ☀️ Лучи
            </button>
            <button
              onClick={() => setDayNight(!dayNight)}
              className={`px-2 py-1.5 rounded-lg text-xs transition-all ${
                dayNight ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              🌗 День/Ночь
            </button>
          </div>
        </div>

        {/* Season control row */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 pt-3 border-t border-gray-700/50">
          <span className="text-xs text-gray-400">Время года:</span>
          <span className="text-sm font-medium text-amber-300 min-w-[140px]">
            {getSeasonName(season)}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={season}
            onChange={(e) => setSeason(parseFloat(e.target.value))}
            className="flex-1 min-w-[120px] max-w-[300px] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex gap-1">
            <button
              onClick={() => setSeason(0)}
              className={`px-2 py-1 rounded text-[10px] transition-all ${
                season < 0.125 || season >= 0.875 ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              🌸 Весна
            </button>
            <button
              onClick={() => setSeason(0.25)}
              className={`px-2 py-1 rounded text-[10px] transition-all ${
                season >= 0.125 && season < 0.375 ? 'bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              ☀️ Лето
            </button>
            <button
              onClick={() => setSeason(0.5)}
              className={`px-2 py-1 rounded text-[10px] transition-all ${
                season >= 0.375 && season < 0.625 ? 'bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              🍂 Осень
            </button>
            <button
              onClick={() => setSeason(0.75)}
              className={`px-2 py-1 rounded text-[10px] transition-all ${
                season >= 0.625 && season < 0.875 ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              ❄️ Зима
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Update orbit ring geometry
function updateOrbitRing(ring: THREE.Line, radius: number, height: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 128; i++) {
    const angle = (i / 128) * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    ));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  ring.geometry.dispose();
  ring.geometry = geometry;
}

// Fallback earth texture
function createFallbackEarthTexture(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.48;

  // Ocean
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, '#1a5a8a');
  gradient.addColorStop(1, '#0a2a4a');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Simple continents
  ctx.fillStyle = '#2d8a3a';
  ctx.strokeStyle = '#1a6a2a';
  ctx.lineWidth = 1;

  // North America
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.35, cy - radius * 0.3, radius * 0.2, radius * 0.15, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // South America
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.15, cy + radius * 0.3, radius * 0.1, radius * 0.2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Europe/Africa
  ctx.beginPath();
  ctx.ellipse(cx + radius * 0.15, cy - radius * 0.1, radius * 0.12, radius * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Asia
  ctx.beginPath();
  ctx.ellipse(cx + radius * 0.4, cy - radius * 0.25, radius * 0.2, radius * 0.15, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Australia
  ctx.beginPath();
  ctx.ellipse(cx + radius * 0.5, cy + radius * 0.35, radius * 0.1, radius * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ice wall
  ctx.strokeStyle = '#aaddff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.95, 0, Math.PI * 2);
  ctx.stroke();

  // North pole
  ctx.fillStyle = '#ff3333';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

// Create text sprite
function createTextSprite(text: string, scale: number = 2): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(0, 0, 20, 0.6)';
  ctx.fillRect(0, 0, 512, 64);
  ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, 510, 62);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale * 0.125, 1);
  return sprite;
}

export default App;
