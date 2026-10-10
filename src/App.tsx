import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [timeSpeed, setTimeSpeed] = useState(1);
  const [showDome, setShowDome] = useState(true);
  const [showSunRays, setShowSunRays] = useState(true);
  const [dayNight, setDayNight] = useState(true);
  const timeDisplayRef = useRef<HTMLDivElement>(null);

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
    earthDisk: THREE.Mesh;
    nightOverlay: THREE.Mesh;
    animationId: number;
    time: number;
    timeSpeed: number;
    isPlaying: boolean;
  }

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
    camera.lookAt(0, 0, 0);

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
    const ambientLight = new THREE.AmbientLight(0x223355, 0.5);
    scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0x446688, 0x112233, 0.3);
    scene.add(hemisphereLight);

    // === FLAT EARTH DISK ===
    const earthRadius = 15;
    const earthGeometry = new THREE.CylinderGeometry(earthRadius, earthRadius, 0.5, 128);

    // Create detailed earth texture
    const earthCanvas = createEarthTexture(1024);
    const earthTexture = new THREE.CanvasTexture(earthCanvas);
    earthTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const earthMaterial = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.8,
      metalness: 0.1,
    });

    const earthDisk = new THREE.Mesh(earthGeometry, earthMaterial);
    earthDisk.position.y = 0;
    earthDisk.receiveShadow = true;
    earthDisk.castShadow = true;
    scene.add(earthDisk);

    // Earth bottom
    const bottomGeometry = new THREE.CylinderGeometry(earthRadius, earthRadius, 0.1, 128);
    const bottomMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 1,
    });
    const bottomDisk = new THREE.Mesh(bottomGeometry, bottomMaterial);
    bottomDisk.position.y = -0.3;
    scene.add(bottomDisk);

    // === NIGHT OVERLAY (day/night terminator) ===
    const nightGeometry = new THREE.CylinderGeometry(earthRadius + 0.01, earthRadius + 0.01, 0.52, 128, 1, false, 0, Math.PI);
    const nightMaterial = new THREE.MeshBasicMaterial({
      color: 0x000022,
      transparent: true,
      opacity: 0.6,
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
      transmission: 0.9,
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
    const starSizes: number[] = [];
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

      starSizes.push(0.05 + Math.random() * 0.2);

      // Star colors (white, blue-white, yellow-white)
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
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffee44,
    });
    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunGroup.add(sunMesh);

    // Sun inner glow
    const sunGlow1Geometry = new THREE.SphereGeometry(2.0, 32, 32);
    const sunGlow1Material = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.4,
    });
    const sunGlow1 = new THREE.Mesh(sunGlow1Geometry, sunGlow1Material);
    sunGroup.add(sunGlow1);

    // Sun outer glow
    const sunGlow2Geometry = new THREE.SphereGeometry(3.0, 32, 32);
    const sunGlow2Material = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.15,
    });
    const sunGlow2 = new THREE.Mesh(sunGlow2Geometry, sunGlow2Material);
    sunGroup.add(sunGlow2);

    // Sun point light
    const sunLight = new THREE.PointLight(0xffdd88, 3, 60);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 50;
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
      ray.lookAt(sunGroup.position);
      sunRaysGroup.add(ray);
    }
    scene.add(sunRaysGroup);

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
    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    moonGroup.add(moonMesh);

    // Moon glow
    const moonGlowGeometry = new THREE.SphereGeometry(1.3, 32, 32);
    const moonGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x8888cc,
      transparent: true,
      opacity: 0.15,
    });
    const moonGlow = new THREE.Mesh(moonGlowGeometry, moonGlowMaterial);
    moonGroup.add(moonGlow);

    // Moon light
    const moonLight = new THREE.PointLight(0x8888bb, 0.5, 25);
    moonGroup.add(moonLight);

    moonGroup.position.set(-8, 10, 5);
    scene.add(moonGroup);

    // === GRID LINES on earth ===
    const gridGroup = new THREE.Group();
    
    // Latitude circles
    for (let i = 1; i <= 6; i++) {
      const radius = (i / 6) * earthRadius;
      const points: THREE.Vector3[] = [];
      for (let j = 0; j <= 128; j++) {
        const angle = (j / 128) * Math.PI * 2;
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          0.26,
          Math.sin(angle) * radius
        ));
      }
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x3366aa,
        transparent: true,
        opacity: 0.2,
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      gridGroup.add(line);
    }

    // Longitude lines
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const points: THREE.Vector3[] = [];
      for (let j = 0; j <= 50; j++) {
        const r = (j / 50) * earthRadius;
        points.push(new THREE.Vector3(
          Math.cos(angle) * r,
          0.26,
          Math.sin(angle) * r
        ));
      }
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x3366aa,
        transparent: true,
        opacity: 0.15,
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      gridGroup.add(line);
    }
    scene.add(gridGroup);

    // === NORTH POLE ===
    const poleGeometry = new THREE.CylinderGeometry(0.08, 0.08, 2, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      emissive: 0xff0000,
      emissiveIntensity: 0.3,
    });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = 1;
    scene.add(pole);

    // Pole flag
    const flagGeometry = new THREE.PlaneGeometry(0.8, 0.5);
    const flagMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.set(0.4, 1.8, 0);
    scene.add(flag);

    // === CONTINENT LABELS ===
    const labelData = [
      { text: 'СЕВ. АМЕРИКА', x: -5.5, z: -5, size: 2.5 },
      { text: 'ЕВРОПА', x: 3, z: -5.5, size: 2 },
      { text: 'АЗИЯ', x: 8, z: -3, size: 3 },
      { text: 'АФРИКА', x: 2, z: 3, size: 2.5 },
      { text: 'ЮЖ. АМЕРИКА', x: -4, z: 6, size: 2.5 },
      { text: 'АВСТРАЛИЯ', x: 9, z: 7, size: 2 },
      { text: 'СЕВ. ПОЛЮС', x: 0, z: -1.5, size: 1.8 },
    ];

    labelData.forEach(label => {
      const sprite = createTextSprite(label.text, label.size);
      sprite.position.set(label.x, 1.0, label.z);
      scene.add(sprite);
    });

    // Ice wall label
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const sprite = createTextSprite('🧊 ЛЕДЯНАЯ СТЕНА', 2.5);
      sprite.position.set(
        Math.cos(angle) * (earthRadius + 2.5),
        2.5,
        Math.sin(angle) * (earthRadius + 2.5)
      );
      scene.add(sprite);
    }

    // === SUN ORBIT TRAIL ===
    const sunTrailGeometry = new THREE.RingGeometry(6.8, 7.2, 64);
    const sunTrailMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const sunTrail = new THREE.Mesh(sunTrailGeometry, sunTrailMaterial);
    sunTrail.rotation.x = -Math.PI / 2;
    sunTrail.position.y = 7;
    scene.add(sunTrail);

    // Tropic lines (Cancer and Capricorn)
    const tropicCancerGeometry = new THREE.RingGeometry(4.8, 5.0, 64);
    const tropicMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });
    const tropicCancer = new THREE.Mesh(tropicCancerGeometry, tropicMaterial);
    tropicCancer.rotation.x = -Math.PI / 2;
    tropicCancer.position.y = 0.3;
    scene.add(tropicCancer);

    const tropicCapricornGeometry = new THREE.RingGeometry(9.8, 10.0, 64);
    const tropicCapricorn = new THREE.Mesh(tropicCapricornGeometry, tropicMaterial.clone());
    tropicCapricorn.rotation.x = -Math.PI / 2;
    tropicCapricorn.position.y = 0.3;
    scene.add(tropicCapricorn);

    // Equator line
    const equatorGeometry = new THREE.RingGeometry(7.3, 7.5, 64);
    const equatorMaterial = new THREE.MeshBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });
    const equator = new THREE.Mesh(equatorGeometry, equatorMaterial);
    equator.rotation.x = -Math.PI / 2;
    equator.position.y = 0.3;
    scene.add(equator);

    // === MOON ORBIT TRAIL ===
    const moonTrailPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      moonTrailPoints.push(new THREE.Vector3(
        Math.cos(angle) * 10,
        9,
        Math.sin(angle) * 10
      ));
    }
    const moonTrailGeometry = new THREE.BufferGeometry().setFromPoints(moonTrailPoints);
    const moonTrailMaterial = new THREE.LineBasicMaterial({
      color: 0x6666aa,
      transparent: true,
      opacity: 0.2,
    });
    const moonTrail = new THREE.Line(moonTrailGeometry, moonTrailMaterial);
    scene.add(moonTrail);

    // === SUN LIGHT CONE (volumetric light beam) ===
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

    // === FIRMAMENT LABELS on dome ===
    const firmamentLabel = createTextSprite('✦ ТВЕРДЬ (FIRMAMENT) ✦', 4);
    firmamentLabel.position.set(0, domeRadius * 0.95, 0);
    scene.add(firmamentLabel);

    // === BACKGROUND STARS (outside dome) ===
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
    const bgStars = new THREE.Points(bgStarsGeometry, bgStarsMaterial);
    scene.add(bgStars);

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
      earthDisk,
      nightOverlay,
      animationId: 0,
      time: 0,
      timeSpeed: 1,
      isPlaying: true,
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
        ref.time += delta * ref.timeSpeed;
      }

      const t = ref.time;

      // Sun orbit (circular above the disk)
      const sunAngle = t * 0.8;
      const sunOrbitRadius = 7 + Math.sin(t * 0.2) * 3;
      const sunHeight = 7 + Math.sin(t * 0.15) * 1.5;
      ref.sun.position.x = Math.cos(sunAngle) * sunOrbitRadius;
      ref.sun.position.z = Math.sin(sunAngle) * sunOrbitRadius;
      ref.sun.position.y = sunHeight;

      // Sun rays follow sun
      ref.sunRays.position.copy(ref.sun.position);
      ref.sunRays.rotation.y = t * 0.5;
      ref.sunRays.rotation.z = Math.sin(t) * 0.2;

      // Light cone follows sun
      lightCone.position.x = ref.sun.position.x;
      lightCone.position.z = ref.sun.position.z;
      lightCone.position.y = ref.sun.position.y / 2;

      // Moon orbit
      const moonAngle = t * 0.5 + Math.PI * 0.7;
      const moonOrbitRadius = 10 + Math.sin(t * 0.3) * 2;
      const moonHeight = 9 + Math.sin(t * 0.25) * 2;
      ref.moon.position.x = Math.cos(moonAngle) * moonOrbitRadius;
      ref.moon.position.z = Math.sin(moonAngle) * moonOrbitRadius;
      ref.moon.position.y = moonHeight;

      // Night overlay rotation (opposite to sun)
      ref.nightOverlay.rotation.y = -sunAngle + Math.PI;

      // Stars slow rotation
      ref.stars.rotation.y = t * 0.05;

      // Update time display via DOM (avoid React re-render)
      if (timeDisplayRef.current) {
        const hours = (t % 24).toFixed(1);
        const days = Math.floor(t / 24 % 365);
        timeDisplayRef.current.textContent = `${hours}ч | День ${days}`;
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
          3D визуализация по представлениям плоскоземельщиков
        </p>
      </div>

      {/* Info Panel */}
      <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md rounded-xl p-3 sm:p-4 text-white border border-blue-900/50 max-w-[200px] sm:max-w-xs">
        <h3 className="text-xs sm:text-sm font-bold text-blue-300 mb-2">Элементы модели:</h3>
        <ul className="text-[10px] sm:text-xs text-gray-300 space-y-0.5">
          <li>☀️ Солнце — вращается над диском</li>
          <li>🌙 Луна — вращается по своей орбите</li>
          <li>⭐ Звёзды — на внутренней стороне купола</li>
          <li>🫧 Купол (твердь) — полусфера</li>
          <li>🧊 Ледяная стена — Антарктида</li>
          <li>📍 Сев. полюс — в центре диска</li>
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
          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-3 py-2 rounded-lg font-medium text-sm transition-all ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-900/30'
                : 'bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900/30'
            }`}
          >
            {isPlaying ? '⏸ Пауза' : '▶ Старт'}
          </button>

          {/* Speed Control */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 hidden sm:inline">Скорость:</span>
            <button
              onClick={() => setTimeSpeed(Math.max(0.1, timeSpeed / 2))}
              className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
            >
              ◀◀
            </button>
            <span className="px-2 py-1.5 bg-gray-800 rounded text-xs font-mono min-w-[50px] text-center text-blue-300">
              {timeSpeed.toFixed(1)}x
            </span>
            <button
              onClick={() => setTimeSpeed(Math.min(50, timeSpeed * 2))}
              className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
            >
              ▶▶
            </button>
          </div>

          {/* Speed presets */}
          <div className="flex gap-1">
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
      </div>
    </div>
  );
}

// Create earth texture canvas
function createEarthTexture(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.48;

  // Ocean gradient
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, '#1a5a8a');
  gradient.addColorStop(0.5, '#1a4a7a');
  gradient.addColorStop(1, '#0a2a4a');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Draw continents
  ctx.fillStyle = '#2d8a3a';
  ctx.strokeStyle = '#1a6a2a';
  ctx.lineWidth = 1.5;

  // North America
  drawContinent(ctx, cx, cy, radius, [
    [-0.55, -0.15], [-0.6, -0.35], [-0.45, -0.5], [-0.25, -0.45],
    [-0.15, -0.35], [-0.1, -0.2], [-0.2, -0.1], [-0.35, -0.05],
    [-0.45, -0.05], [-0.55, -0.15]
  ]);

  // South America
  drawContinent(ctx, cx, cy, radius, [
    [-0.2, 0.1], [-0.1, 0.15], [-0.08, 0.3], [-0.12, 0.45],
    [-0.18, 0.55], [-0.22, 0.5], [-0.25, 0.35], [-0.22, 0.2],
    [-0.2, 0.1]
  ]);

  // Europe
  drawContinent(ctx, cx, cy, radius, [
    [0.05, -0.25], [0.1, -0.35], [0.2, -0.38], [0.25, -0.3],
    [0.22, -0.22], [0.15, -0.2], [0.08, -0.22], [0.05, -0.25]
  ]);

  // Africa
  drawContinent(ctx, cx, cy, radius, [
    [0.08, -0.05], [0.18, -0.08], [0.28, 0.0], [0.25, 0.15],
    [0.2, 0.3], [0.15, 0.35], [0.1, 0.25], [0.05, 0.15],
    [0.05, 0.05], [0.08, -0.05]
  ]);

  // Asia
  drawContinent(ctx, cx, cy, radius, [
    [0.15, -0.35], [0.25, -0.45], [0.4, -0.45], [0.55, -0.35],
    [0.6, -0.2], [0.55, -0.1], [0.4, -0.05], [0.3, -0.1],
    [0.2, -0.15], [0.15, -0.25], [0.15, -0.35]
  ]);

  // Australia
  drawContinent(ctx, cx, cy, radius, [
    [0.45, 0.35], [0.55, 0.3], [0.65, 0.35], [0.62, 0.45],
    [0.55, 0.5], [0.45, 0.48], [0.42, 0.4], [0.45, 0.35]
  ]);

  // Greenland
  drawContinent(ctx, cx, cy, radius, [
    [-0.2, -0.5], [-0.12, -0.55], [-0.08, -0.48], [-0.12, -0.42],
    [-0.2, -0.45], [-0.2, -0.5]
  ]);

  // Indonesia/SE Asia
  drawContinent(ctx, cx, cy, radius, [
    [0.45, 0.1], [0.5, 0.08], [0.55, 0.12], [0.52, 0.18],
    [0.48, 0.15], [0.45, 0.1]
  ]);

  // Japan
  drawContinent(ctx, cx, cy, radius, [
    [0.55, -0.25], [0.58, -0.3], [0.6, -0.25], [0.57, -0.2],
    [0.55, -0.25]
  ]);

  // UK
  drawContinent(ctx, cx, cy, radius, [
    [-0.02, -0.32], [0.0, -0.36], [0.03, -0.33], [0.01, -0.3],
    [-0.02, -0.32]
  ]);

  // North Pole marker
  ctx.fillStyle = '#ff3333';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - 10);

  // Ice wall ring
  ctx.strokeStyle = '#aaddff';
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Outer ice area
  ctx.fillStyle = 'rgba(200, 220, 240, 0.3)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.arc(cx, cy, radius * 0.92, 0, Math.PI * 2, true);
  ctx.fill();

  return canvas;
}

function drawContinent(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, radius: number,
  points: number[][]
) {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(cx + points[0][0] * radius, cy + points[0][1] * radius);
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = cx + (prev[0] + curr[0]) / 2 * radius + (Math.random() - 0.5) * 5;
    const cpy = cy + (prev[1] + curr[1]) / 2 * radius + (Math.random() - 0.5) * 5;
    ctx.quadraticCurveTo(cpx, cpy, cx + curr[0] * radius, cy + curr[1] * radius);
  }
  
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Create text sprite
function createTextSprite(text: string, scale: number = 2): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(0, 0, 20, 0.6)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, 254, 62);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale * 0.25, 1);
  return sprite;
}

export default App;
