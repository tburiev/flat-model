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

  nightOverlay: THREE.Mesh;
  lightCone: THREE.Mesh;
  sunOrbitRing: THREE.Object3D;
  moonOrbitRing: THREE.Object3D;
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

  const [dayNight, setDayNight] = useState(true);
  const [season, setSeason] = useState(0.25); // Start at summer solstice (northern hemisphere)
  const [timeDirection, setTimeDirection] = useState(1); // 1 = forward, -1 = backward
  const timeDirectionRef = useRef(1);
  const timeSliderRef = useRef<HTMLInputElement>(null);

  // Keep ref in sync
  useEffect(() => {
    timeDirectionRef.current = timeDirection;
  }, [timeDirection]);

  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);

    // Camera
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 500);
    camera.position.set(25, 30, 25);
    camera.lookAt(0, 2, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.8;
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
    const ambientLight = new THREE.AmbientLight(0x445566, 0.4);
    scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0x667788, 0x223344, 0.3);
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
      color: 0x001133,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const nightOverlay = new THREE.Mesh(nightGeometry, nightMaterial);
    nightOverlay.position.y = 0.01;
    scene.add(nightOverlay);


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
    const starSizes: number[] = [];

    for (let i = 0; i < 5000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.47;
      const r = domeRadius - 0.5;

      starPositions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );

      const colorType = Math.random();
      if (colorType < 0.5) {
        starColors.push(1, 1, 0.95);
      } else if (colorType < 0.7) {
        starColors.push(0.8, 0.85, 1);
      } else if (colorType < 0.85) {
        starColors.push(1, 0.95, 0.8);
      } else if (colorType < 0.95) {
        starColors.push(1, 0.7, 0.5);
      } else {
        starColors.push(0.7, 0.8, 1);
      }

      // Variable star sizes
      const sizeType = Math.random();
      if (sizeType < 0.8) {
        starSizes.push(0.15);
      } else if (sizeType < 0.95) {
        starSizes.push(0.3);
      } else {
        starSizes.push(0.5);
      }
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    starsGeometry.setAttribute('size', new THREE.Float32BufferAttribute(starSizes, 1));

    const starsMaterial = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // === SUN ===
    const sunGroup = new THREE.Group();

    // Sun core with gradient
    const sunGeometry = new THREE.SphereGeometry(1.2, 64, 64);
    const sunMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffaa,
    });
    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunGroup.add(sunMesh);

    // Sun corona (inner glow)
    const sunGlow1Geometry = new THREE.SphereGeometry(1.6, 64, 64);
    const sunGlow1Material = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0.5,
    });
    sunGroup.add(new THREE.Mesh(sunGlow1Geometry, sunGlow1Material));

    // Sun outer corona
    const sunGlow2Geometry = new THREE.SphereGeometry(2.2, 64, 64);
    const sunGlow2Material = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.25,
    });
    sunGroup.add(new THREE.Mesh(sunGlow2Geometry, sunGlow2Material));

    // Sun soft halo
    const sunHaloGeometry = new THREE.SphereGeometry(3.0, 64, 64);
    const sunHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.1,
    });
    sunGroup.add(new THREE.Mesh(sunHaloGeometry, sunHaloMaterial));

    // Sun point light
    const sunLight = new THREE.PointLight(0xffdd88, 5, 80);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunGroup.add(sunLight);

    // Sun spotlight (beam down)
    const sunSpot = new THREE.SpotLight(0xffee88, 4, 60, Math.PI / 4, 0.6, 1);
    sunSpot.castShadow = true;
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, -10, 0);
    sunGroup.add(spotTarget);
    sunSpot.target = spotTarget;
    sunGroup.add(sunSpot);

    sunGroup.position.set(10, 8, 0);
    scene.add(sunGroup);



    // === SUN ORBIT RING (visual indicator) ===
    const sunOrbitInner = 6.7;
    const sunOrbitOuter = 7.3;
    const sunOrbitGeometry = new THREE.RingGeometry(sunOrbitInner, sunOrbitOuter, 128);
    const sunOrbitMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const sunOrbitRing = new THREE.Mesh(sunOrbitGeometry, sunOrbitMaterial);
    sunOrbitRing.rotation.x = -Math.PI / 2;
    sunOrbitRing.position.y = 8;
    scene.add(sunOrbitRing);

    // === MOON ===
    const moonGroup = new THREE.Group();

    const moonGeometry = new THREE.SphereGeometry(0.8, 64, 64);
    const moonMaterial = new THREE.MeshStandardMaterial({
      color: 0xeeeeff,
      emissive: 0x445566,
      emissiveIntensity: 0.4,
      roughness: 0.8,
      metalness: 0.1,
    });
    moonGroup.add(new THREE.Mesh(moonGeometry, moonMaterial));

    // Moon soft glow
    const moonGlowGeometry = new THREE.SphereGeometry(1.1, 64, 64);
    const moonGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xaabbdd,
      transparent: true,
      opacity: 0.2,
    });
    moonGroup.add(new THREE.Mesh(moonGlowGeometry, moonGlowMaterial));

    // Moon outer glow
    const moonHaloGeometry = new THREE.SphereGeometry(1.5, 64, 64);
    const moonHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0x8899bb,
      transparent: true,
      opacity: 0.08,
    });
    moonGroup.add(new THREE.Mesh(moonHaloGeometry, moonHaloMaterial));

    // Moon light
    const moonLight = new THREE.PointLight(0x8888bb, 0.8, 30);
    moonGroup.add(moonLight);

    moonGroup.position.set(-8, 10, 5);
    scene.add(moonGroup);

    // === MOON ORBIT RING ===
    const moonOrbitInner = 9.7;
    const moonOrbitOuter = 10.3;
    const moonOrbitGeometry = new THREE.RingGeometry(moonOrbitInner, moonOrbitOuter, 128);
    const moonOrbitMaterial = new THREE.MeshBasicMaterial({
      color: 0x8888cc,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const moonOrbitRing = new THREE.Mesh(moonOrbitGeometry, moonOrbitMaterial);
    moonOrbitRing.rotation.x = -Math.PI / 2;
    moonOrbitRing.position.y = 10;
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

      // Update time slider via DOM (only when playing)
      if (ref.isPlaying && timeSliderRef.current) {
        timeSliderRef.current.value = String(t % 100);
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
    <div className="w-full h-screen flex flex-col bg-gray-950">
      {/* Верхняя часть: 3D модель */}
      <div className="flex-1 relative bg-gray-950 overflow-hidden">
        {/* 3D Canvas */}
        <div ref={containerRef} className="w-full h-full" />
        
        {/* Заголовок */}
        <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white border border-blue-500/50">
          <h1 className="text-lg font-bold text-blue-300">
            🌍 Модель Плоской Земли
          </h1>
        </div>

        {/* Время */}
        <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white border border-blue-500/50">
          <div ref={timeDisplayRef} className="text-base font-mono text-blue-300">
            0.0ч | День 0
          </div>
        </div>
      </div>

      {/* Нижняя часть: Панель управления */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-black border-t border-cyan-500/30 shadow-2xl">
        <div className="max-w-7xl mx-auto px-8 py-5 space-y-4">
          {/* Row 1: Time Control */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 bg-slate-800/50 rounded-xl p-3 backdrop-blur-sm border border-slate-700/50">
              <button
                onClick={() => { setTimeDirection(-1); setIsPlaying(true); }}
                className={`relative px-6 py-3 rounded-lg text-sm font-bold transition-all duration-300 overflow-hidden group ${
                  timeDirection === -1 && isPlaying
                    ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/50 scale-105'
                    : 'bg-gradient-to-br from-slate-700 to-slate-800 text-slate-200 hover:from-red-600 hover:to-red-700 hover:text-white hover:shadow-lg hover:shadow-red-500/30 hover:scale-105'
                }`}
              >
                <span className="relative z-10">⏪ Назад</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              </button>
              
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`relative px-10 py-3 rounded-lg text-base font-bold transition-all duration-300 overflow-hidden group ${
                  isPlaying
                    ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/50 hover:shadow-xl hover:shadow-amber-500/60'
                    : 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/60'
                }`}
              >
                <span className="relative z-10">{isPlaying ? '⏸ Пауза' : '▶ Старт'}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              </button>
              
              <button
                onClick={() => { setTimeDirection(1); setIsPlaying(true); }}
                className={`relative px-6 py-3 rounded-lg text-sm font-bold transition-all duration-300 overflow-hidden group ${
                  timeDirection === 1 && isPlaying
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/50 scale-105'
                    : 'bg-gradient-to-br from-slate-700 to-slate-800 text-slate-200 hover:from-emerald-600 hover:to-emerald-700 hover:text-white hover:shadow-lg hover:shadow-emerald-500/30 hover:scale-105'
                }`}
              >
                <span className="relative z-10">Вперёд ⏩</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              </button>
            </div>

            <div className="h-12 w-px bg-gradient-to-b from-transparent via-slate-600 to-transparent"></div>

            <div className="flex items-center gap-3 bg-slate-800/50 rounded-xl p-3 backdrop-blur-sm border border-slate-700/50">
              <button
                onClick={() => { if (sceneRef.current) sceneRef.current.time -= 1; }}
                className="relative w-12 h-12 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 hover:from-cyan-600 hover:to-cyan-700 text-white font-bold transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-cyan-500/50 flex items-center justify-center group overflow-hidden"
              >
                <span className="relative z-10 text-xl">◀</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              </button>
              <button
                onClick={() => { if (sceneRef.current) sceneRef.current.time += 1; }}
                className="relative w-12 h-12 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 hover:from-cyan-600 hover:to-cyan-700 text-white font-bold transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-cyan-500/50 flex items-center justify-center group overflow-hidden"
              >
                <span className="relative z-10 text-xl">▶</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              </button>
            </div>
          </div>

          {/* Row 2: Speed Control */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 bg-slate-800/50 rounded-xl p-3 backdrop-blur-sm border border-slate-700/50">
              <span className="text-sm text-slate-400 font-semibold">Скорость:</span>
              <button
                onClick={() => setTimeSpeed(Math.max(0.1, timeSpeed / 2))}
                className="relative w-11 h-11 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 hover:from-blue-600 hover:to-blue-700 text-white text-xl font-bold transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-blue-500/50 flex items-center justify-center group overflow-hidden"
              >
                <span className="relative z-10">−</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              </button>
              <div className="px-6 py-2.5 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg border border-blue-500/40 min-w-[100px] text-center shadow-inner">
                <span className="text-lg font-mono font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  {timeSpeed.toFixed(1)}x
                </span>
              </div>
              <button
                onClick={() => setTimeSpeed(Math.min(50, timeSpeed * 2))}
                className="relative w-11 h-11 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 hover:from-blue-600 hover:to-blue-700 text-white text-xl font-bold transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-blue-500/50 flex items-center justify-center group overflow-hidden"
              >
                <span className="relative z-10">+</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              </button>
            </div>
            
            <div className="h-12 w-px bg-gradient-to-b from-transparent via-slate-600 to-transparent"></div>

            <div className="flex items-center gap-2 bg-slate-800/50 rounded-xl p-3 backdrop-blur-sm border border-slate-700/50">
              {[0.5, 1, 2, 5, 10].map(speed => (
                <button
                  key={speed}
                  onClick={() => setTimeSpeed(speed)}
                  className={`relative px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 overflow-hidden group ${
                    Math.abs(timeSpeed - speed) < 0.01
                      ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/50 scale-105'
                      : 'bg-gradient-to-br from-slate-700 to-slate-800 text-slate-300 hover:from-blue-600 hover:to-blue-700 hover:text-white hover:shadow-lg hover:shadow-blue-500/30 hover:scale-105'
                  }`}
                >
                  <span className="relative z-10">{speed}x</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Time Slider */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-4 bg-slate-800/50 rounded-xl p-4 backdrop-blur-sm border border-slate-700/50 w-full max-w-2xl">
              <span className="text-sm text-slate-400 font-semibold whitespace-nowrap">Время:</span>
              <input
                ref={timeSliderRef}
                type="range"
                min="0"
                max="24"
                step="0.01"
                defaultValue="0"
                onChange={(e) => {
                  const newTime = parseFloat(e.target.value);
                  if (sceneRef.current) {
                    sceneRef.current.time = newTime;
                  }
                }}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-xs text-slate-500 whitespace-nowrap">±24ч</span>
            </div>
          </div>

          {/* Row 4: Season Control */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-4 bg-slate-800/50 rounded-xl p-4 backdrop-blur-sm border border-slate-700/50">
              <span className="text-sm text-slate-400 font-semibold">Сезон:</span>
              <div className="px-6 py-2.5 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg border border-amber-500/40 min-w-[160px] text-center shadow-inner">
                <span className="text-sm font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                  {getSeasonName(season)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={season}
                onChange={(e) => setSeason(parseFloat(e.target.value))}
                className="w-64 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex gap-2">
                {['🌸', '☀️', '🍂', '❄️'].map((icon, i) => (
                  <button
                    key={i}
                    onClick={() => setSeason(i * 0.25)}
                    className={`relative w-12 h-12 rounded-lg text-xl transition-all duration-300 flex items-center justify-center overflow-hidden group ${
                      Math.abs(season - i * 0.25) < 0.125
                        ? 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/50 scale-110'
                        : 'bg-gradient-to-br from-slate-700 to-slate-800 hover:from-amber-600 hover:to-amber-700 hover:shadow-lg hover:shadow-amber-500/30 hover:scale-105'
                    }`}
                  >
                    <span className="relative z-10">{icon}</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Update orbit ring geometry
function updateOrbitRing(ring: THREE.Object3D, radius: number, height: number) {
  const mesh = ring as THREE.Mesh;
  const thickness = 0.3;
  const newGeometry = new THREE.RingGeometry(radius - thickness, radius + thickness, 128);
  mesh.geometry.dispose();
  mesh.geometry = newGeometry;
  mesh.position.y = height;
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
