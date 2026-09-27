'use client';

import * as THREE from 'three';
import { useEffect, useRef, useState } from 'react';

type DoorId = 'room-1' | 'room-2' | 'room-3';
type DoorInfo = { id: DoorId; number: string; title: string; subtitle: string; href?: string; color: number };

const DOORS: DoorInfo[] = [
  { id: 'room-1', number: '01', title: 'Thermal & Fluid Sciences', subtitle: '4 experiments · Active', href: '/room-1/index.html', color: 0x22d3ee },
  { id: 'room-2', number: '02', title: 'Waves, Sound & Fields', subtitle: '3 experiments · Active', href: '/room-2', color: 0xfbbf24 },
  { id: 'room-3', number: '03', title: 'Future Laboratory', subtitle: 'Reserved for the next course', color: 0xa78bfa },
];

type HallControls = {
  interact: () => void;
  lock: () => void;
  setMove: (direction: 'forward' | 'backward' | 'left' | 'right', active: boolean) => void;
};

export default function CampusHallway() {
  const sceneContainer = useRef<HTMLDivElement>(null);
  const controls = useRef<HallControls | null>(null);
  const [target, setTarget] = useState<DoorInfo | null>(null);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('Walk toward a door and press E to enter.');

  useEffect(() => {
    const container = sceneContainer.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a14);
    scene.fog = new THREE.Fog(0x050a14, 14, 34);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 70);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const textureLoader = new THREE.TextureLoader();
    const floorTexture = textureLoader.load('/assets/textures/lab_floor_tiles.jpg');
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(4, 9);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x16253a, roughness: 0.82, metalness: 0.08 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x334b63, roughness: 0.3, metalness: 0.72 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 28), new THREE.MeshStandardMaterial({ map: floorTexture, color: 0x8395a8, roughness: 0.7, metalness: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -2;
    floor.receiveShadow = true;
    scene.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(14, 28), new THREE.MeshStandardMaterial({ color: 0x08111f, roughness: 0.92 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 5, -2);
    scene.add(ceiling);
    [-7, 7].forEach((x) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 5, 28), wallMaterial);
      wall.position.set(x, 2.5, -2);
      scene.add(wall);
    });
    const endWall = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 0.34), wallMaterial);
    endWall.position.set(0, 2.5, -12);
    scene.add(endWall);
    const entranceWall = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 0.34), wallMaterial);
    entranceWall.position.set(0, 2.5, 12);
    scene.add(entranceWall);

    scene.add(new THREE.HemisphereLight(0xb8dcff, 0x101827, 1.65));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
    keyLight.position.set(4, 8, 7);
    keyLight.castShadow = true;
    scene.add(keyLight);
    [-8, -2, 4, 10].forEach((z, index) => {
      const fixtureMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: index % 2 ? 0x92ddff : 0xffe0a3, emissiveIntensity: 1.25 });
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.55), fixtureMaterial);
      fixture.position.set(0, 4.86, z);
      scene.add(fixture);
      const light = new THREE.PointLight(index % 2 ? 0x8adfff : 0xffd28a, 5.5, 10, 2);
      light.position.set(0, 4.5, z);
      scene.add(light);
    });

    const doorObjects: THREE.Object3D[] = [];
    const doorInfoByObject = new Map<THREE.Object3D, DoorInfo>();
    const doorGlows: THREE.MeshStandardMaterial[] = [];
    const doorX = [-4.4, 0, 4.4];
    DOORS.forEach((door, index) => {
      const group = new THREE.Group();
      group.position.set(doorX[index], 2.05, -11.72);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.45, 4.38, 0.28), trimMaterial);
      group.add(frame);
      const canvas = document.createElement('canvas');
      canvas.width = 768; canvas.height = 1024;
      const context = canvas.getContext('2d');
      if (context) {
        const gradient = context.createLinearGradient(0, 0, 768, 1024);
        gradient.addColorStop(0, index === 0 ? '#082036' : index === 1 ? '#2e2108' : '#1d1636');
        gradient.addColorStop(1, '#07111f');
        context.fillStyle = gradient; context.fillRect(0, 0, 768, 1024);
        context.strokeStyle = `#${door.color.toString(16).padStart(6, '0')}`; context.lineWidth = 18; context.strokeRect(34, 34, 700, 956);
        context.textAlign = 'center'; context.fillStyle = '#9db6ca'; context.font = '700 38px Arial'; context.fillText('PHYSICS UNIVERSITY', 384, 150);
        context.fillStyle = '#ffffff'; context.font = '800 158px Arial'; context.fillText(door.number, 384, 405);
        context.fillStyle = '#dcebf6'; context.font = '700 42px Arial';
        const titleParts = door.title.split(' & ');
        context.fillText(titleParts[0], 384, 535);
        if (titleParts[1]) context.fillText(`& ${titleParts[1]}`, 384, 590);
        context.fillStyle = `#${door.color.toString(16).padStart(6, '0')}`; context.font = '700 28px Arial'; context.fillText(door.href ? 'ACTIVE LABORATORY' : 'COMING SOON', 384, 760);
        context.fillStyle = '#ffffff'; context.font = '700 26px Arial'; context.fillText(door.href ? 'E  ·  ENTER ROOM' : 'ROOM RESERVED', 384, 900);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const glowMaterial = new THREE.MeshStandardMaterial({ map: texture, emissive: door.color, emissiveIntensity: 0.08, roughness: 0.5, metalness: 0.08 });
      doorGlows.push(glowMaterial);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.14, 4.08), glowMaterial);
      panel.position.z = 0.17;
      group.add(panel);
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 20), new THREE.MeshStandardMaterial({ color: door.href ? door.color : 0x64748b, metalness: 0.9, roughness: 0.16 }));
      handle.position.set(1.08, -0.2, 0.26);
      group.add(handle);
      const marker = new THREE.Mesh(new THREE.TorusGeometry(1.73, 0.025, 10, 48), new THREE.MeshBasicMaterial({ color: door.color, transparent: true, opacity: 0.35 }));
      marker.position.z = 0.21;
      marker.scale.y = 1.28;
      group.add(marker);
      scene.add(group);
      [panel, handle].forEach((object) => { doorObjects.push(object); doorInfoByObject.set(object, door); });
    });

    const player = new THREE.Vector3(0, 1.72, 8.8);
    let yaw = 0;
    let pitch = -0.04;
    const movement = { forward: false, backward: false, left: false, right: false };
    let currentDoor: DoorInfo | null = null;
    let currentDoorId = '';
    let lastTime = performance.now();
    const raycaster = new THREE.Raycaster();
    const updateCamera = () => {
      camera.position.copy(player);
      camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    };
    updateCamera();

    const enterDoor = () => {
      if (!currentDoor) return;
      if (currentDoor.href) window.location.assign(currentDoor.href);
      else setMessage('Room 03 is reserved for the next group of experiments.');
    };
    const requestWalkMode = () => {
      const lockRequest = renderer.domElement.requestPointerLock();
      // Chromium returns a rejected promise when pointer lock is unavailable
      // (for example in an embedded preview). Keep the hallway playable with
      // the directory/mobile controls instead of surfacing an unhandled error.
      if (lockRequest && typeof (lockRequest as Promise<void>).catch === 'function') {
        void (lockRequest as Promise<void>).catch(() => {
          setMessage('Walk mode is unavailable here. Use the room directory or touch controls to continue.');
          setLocked(false);
        });
      }
    };
    const updateTarget = () => {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hit = raycaster.intersectObjects(doorObjects, false).find((entry) => entry.distance < 6.5);
      const next = hit ? doorInfoByObject.get(hit.object) ?? null : null;
      if ((next?.id ?? '') !== currentDoorId) {
        currentDoor = next;
        currentDoorId = next?.id ?? '';
        setTarget(next);
      }
    };
    const updateMovement = (time: number) => {
      const delta = Math.min((time - lastTime) / 1000, 0.08);
      lastTime = time;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const direction = new THREE.Vector3();
      if (movement.forward) direction.add(forward);
      if (movement.backward) direction.sub(forward);
      if (movement.left) direction.sub(right);
      if (movement.right) direction.add(right);
      if (direction.lengthSq() === 0) return;
      direction.normalize().multiplyScalar(delta * 3.5);
      player.x = THREE.MathUtils.clamp(player.x + direction.x, -6.1, 6.1);
      player.z = THREE.MathUtils.clamp(player.z + direction.z, -10.25, 10.5);
      updateCamera();
    };

    const resize = () => {
      const width = Math.max(1, container.clientWidth); const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (document.pointerLockElement !== renderer.domElement) requestWalkMode(); else enterDoor();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= event.movementX * 0.0022;
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -1.2, 1.2);
      updateCamera();
    };
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (!isLocked) movement.forward = movement.backward = movement.left = movement.right = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyW' || event.code === 'ArrowUp') movement.forward = true;
      if (event.code === 'KeyS' || event.code === 'ArrowDown') movement.backward = true;
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') movement.left = true;
      if (event.code === 'KeyD' || event.code === 'ArrowRight') movement.right = true;
      if (event.code === 'KeyE') { event.preventDefault(); enterDoor(); }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyW' || event.code === 'ArrowUp') movement.forward = false;
      if (event.code === 'KeyS' || event.code === 'ArrowDown') movement.backward = false;
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') movement.left = false;
      if (event.code === 'KeyD' || event.code === 'ArrowRight') movement.right = false;
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let frame = 0;
    const clock = new THREE.Clock();
    const animate = (time = performance.now()) => {
      frame = requestAnimationFrame(animate);
      updateMovement(time); updateTarget();
      const elapsed = clock.getElapsedTime();
      doorGlows.forEach((material, index) => { material.emissiveIntensity = 0.08 + (currentDoorId === DOORS[index].id ? 0.24 : 0.03) + Math.sin(elapsed * 1.6 + index) * 0.02; });
      renderer.render(scene, camera);
    };
    animate();

    controls.current = {
      interact: enterDoor,
      lock: requestWalkMode,
      setMove: (direction, active) => { movement[direction] = active; },
    };
    return () => {
      cancelAnimationFrame(frame); resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => { material.map?.dispose(); material.dispose(); }); } });
      floorTexture.dispose(); renderer.dispose(); container.replaceChildren(); controls.current = null;
    };
  }, []);

  const goTo = (door: DoorInfo) => {
    if (door.href) window.location.assign(door.href); else setMessage('Room 03 is reserved for the next group of experiments.');
  };

  return (
    <main className="hallway-shell">
      <div ref={sceneContainer} className="hallway-scene" aria-label="Walkable Physics University laboratory hallway" />
      <div className="hallway-vignette" aria-hidden="true" />
      <div className={`hallway-reticle ${target ? 'active' : ''}`} aria-hidden="true">+</div>
      <header className="hallway-header"><div className="campus-brand"><span>λ</span><div><b>Physics University</b><small>Experimental Sciences Building · Laboratory Hall</small></div></div><div className="hallway-status"><i />2 ROOMS ACTIVE · 1 RESERVED</div></header>
      <section className="hallway-welcome"><span>VIRTUAL CAMPUS · LEVEL 02</span><h1>Laboratory hallway</h1><p>{target ? `Room ${target.number}: ${target.title}` : message}</p></section>
      {!locked && <button className="hallway-enter" onClick={() => controls.current?.lock()}><b>ENTER WALK MODE</b><span>WASD walk · Mouse look · E enter</span></button>}
      {target && <div className={`hallway-door-prompt ${target.href ? '' : 'reserved'}`}><span>ROOM {target.number}</span><b>{target.title}</b><small>{target.subtitle}</small><button onClick={() => goTo(target)}>{target.href ? 'ENTER ROOM' : 'COMING SOON'}</button></div>}
      <nav className="hallway-directory" aria-label="Laboratory room directory">{DOORS.map((door) => <button key={door.id} className={target?.id === door.id ? 'active' : ''} onClick={() => goTo(door)}><span>{door.number}</span><div><b>{door.title}</b><small>{door.subtitle}</small></div></button>)}</nav>
      <div className="hallway-mobile-controls"><div><button onPointerDown={() => controls.current?.setMove('forward', true)} onPointerUp={() => controls.current?.setMove('forward', false)}>▲</button><button onPointerDown={() => controls.current?.setMove('left', true)} onPointerUp={() => controls.current?.setMove('left', false)}>◀</button><button onPointerDown={() => controls.current?.setMove('backward', true)} onPointerUp={() => controls.current?.setMove('backward', false)}>▼</button><button onPointerDown={() => controls.current?.setMove('right', true)} onPointerUp={() => controls.current?.setMove('right', false)}>▶</button></div><button onClick={() => controls.current?.interact()} disabled={!target}>ENTER</button></div>
    </main>
  );
}
