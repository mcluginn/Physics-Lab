import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export type CharacterType = 'female' | 'male';

export function normalizeCharacterType(val: string | null | undefined): CharacterType {
  if (val === 'male' || val === 'eric') return 'male';
  return 'female';
}

export interface CharacterControllerOptions {
  scene: THREE.Scene;
  floorY?: number;
  initialPosition?: THREE.Vector3;
  initialYaw?: number;
  defaultCharacter?: CharacterType;
  allowThirdPerson?: boolean;
  defaultThirdPerson?: boolean;
  onLoaded?: () => void;
  onCharacterChanged?: (type: CharacterType) => void;
}

interface RiggedActor {
  gender: CharacterType;
  group: THREE.Group;
  loaded: boolean;
  bones: Record<string, THREE.Bone>;
  restQuats: Record<string, THREE.Quaternion>;
  restPositions: Record<string, THREE.Vector3>;
}

export class CharacterController {
  public root: THREE.Group;
  public isThirdPerson = true;
  public activeCharacter: CharacterType = 'female';
  public allowThirdPerson = true;

  private scene: THREE.Scene;
  private floorY: number;
  private currentMeshYaw = 0;
  private walkCycle = 0;
  private walkWeight = 0;
  private sprintWeight = 0;

  // Rigged actors
  private femaleActor: RiggedActor;
  private maleActor: RiggedActor;

  // Third-person camera tuning
  private cameraDistance = 2.15;
  private cameraHeightOffset = 0.32;
  private shoulderOffset = 0.28;

  private onCharacterChanged?: (type: CharacterType) => void;

  constructor(options: CharacterControllerOptions) {
    this.scene = options.scene;
    this.floorY = options.floorY ?? 0;
    this.currentMeshYaw = options.initialYaw ?? 0;
    this.onCharacterChanged = options.onCharacterChanged;
    this.allowThirdPerson = options.allowThirdPerson ?? true;
    this.isThirdPerson = this.allowThirdPerson ? (options.defaultThirdPerson ?? true) : false;

    // Load saved character preference if available (defaulting to female)
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('physics_lab_character_preference');
      this.activeCharacter = normalizeCharacterType(saved || options.defaultCharacter || 'female');
    } else if (options.defaultCharacter) {
      this.activeCharacter = options.defaultCharacter;
    }

    this.root = new THREE.Group();
    this.root.name = 'MainCharacter_Root';
    if (options.initialPosition) {
      this.root.position.copy(options.initialPosition);
      this.root.position.y = this.floorY;
    }
    this.scene.add(this.root);

    // Female container (Carla)
    const femaleGroup = new THREE.Group();
    femaleGroup.name = 'Character_Female_Carla';
    femaleGroup.visible = this.activeCharacter === 'female' && this.isThirdPerson;
    this.root.add(femaleGroup);
    this.femaleActor = {
      gender: 'female',
      group: femaleGroup,
      loaded: false,
      bones: {},
      restQuats: {},
      restPositions: {},
    };

    // Male container (Eric)
    const maleGroup = new THREE.Group();
    maleGroup.name = 'Character_Male_Eric';
    maleGroup.visible = this.activeCharacter === 'male' && this.isThirdPerson;
    this.root.add(maleGroup);
    this.maleActor = {
      gender: 'male',
      group: maleGroup,
      loaded: false,
      bones: {},
      restQuats: {},
      restPositions: {},
    };

    if (this.allowThirdPerson) {
      this.loadFemaleModel(options.onLoaded);
      this.loadMaleModel(options.onLoaded);
    }
  }

  /**
   * Load and configure Renderpeople Carla (Female) rigged FBX
   */
  private loadFemaleModel(onLoaded?: () => void) {
    const fbxLoader = new FBXLoader();
    const textureLoader = new THREE.TextureLoader();

    const diffMap = textureLoader.load('/assets/tex/rp_carla_rigged_001_dif.jpg');
    diffMap.colorSpace = THREE.SRGBColorSpace;
    const normMap = textureLoader.load('/assets/tex/rp_carla_rigged_001_norm.jpg');
    const glossMap = textureLoader.load('/assets/tex/rp_carla_rigged_001_gloss.jpg');

    const material = new THREE.MeshStandardMaterial({
      map: diffMap,
      normalMap: normMap,
      roughnessMap: glossMap,
      roughness: 0.82,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });

    fbxLoader.load(
      '/assets/rp_carla_rigged_001_yup_a.fbx',
      (fbx) => {
        // Compute bounding box and auto-scale to realistic 1.68m female height
        const box = new THREE.Box3().setFromObject(fbx);
        const rawHeight = Math.max(0.1, box.max.y - box.min.y);
        const targetHeight = 1.68;
        const scale = rawHeight > 10 ? targetHeight / rawHeight : 0.0096;
        fbx.scale.setScalar(scale);

        // Ground feet firmly so shoes press onto the floor surface (zero floating gap)
        const scaledBox = new THREE.Box3().setFromObject(fbx);
        fbx.position.set(0, -scaledBox.min.y - 0.015, 0);

        fbx.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.SkinnedMesh;
            mesh.material = material;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
          if ((child as THREE.Bone).isBone) {
            const bone = child as THREE.Bone;
            this.femaleActor.bones[bone.name] = bone;
            this.femaleActor.restQuats[bone.name] = bone.quaternion.clone();
            this.femaleActor.restPositions[bone.name] = bone.position.clone();
          }
        });

        this.relaxArms(this.femaleActor);
        this.femaleActor.group.add(fbx);
        this.femaleActor.loaded = true;
        this.syncVisibility();
        onLoaded?.();
      },
      undefined,
      (err) => console.error('Error loading Carla (Female) model:', err)
    );
  }

  /**
   * Load and configure Renderpeople Eric (Male) rigged FBX
   */
  private loadMaleModel(onLoaded?: () => void) {
    const fbxLoader = new FBXLoader();
    const textureLoader = new THREE.TextureLoader();

    const diffMap = textureLoader.load('/assets/tex/rp_eric_rigged_001_dif.jpg');
    diffMap.colorSpace = THREE.SRGBColorSpace;
    const normMap = textureLoader.load('/assets/tex/rp_eric_rigged_001_norm.jpg');
    const glossMap = textureLoader.load('/assets/tex/rp_eric_rigged_001_gloss.jpg');

    const material = new THREE.MeshStandardMaterial({
      map: diffMap,
      normalMap: normMap,
      roughnessMap: glossMap,
      roughness: 0.82,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });

    fbxLoader.load(
      '/assets/rp_eric_rigged_001_yup_a.fbx',
      (fbx) => {
        // Auto-scale to 1.80m male height
        const box = new THREE.Box3().setFromObject(fbx);
        const rawHeight = Math.max(0.1, box.max.y - box.min.y);
        const targetHeight = 1.80;
        const scale = rawHeight > 10 ? targetHeight / rawHeight : 0.0098;
        fbx.scale.setScalar(scale);

        // Ground feet firmly so shoes press onto the floor surface (zero floating gap)
        const scaledBox = new THREE.Box3().setFromObject(fbx);
        fbx.position.set(0, -scaledBox.min.y - 0.015, 0);

        fbx.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.SkinnedMesh;
            mesh.material = material;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
          if ((child as THREE.Bone).isBone) {
            const bone = child as THREE.Bone;
            this.maleActor.bones[bone.name] = bone;
            this.maleActor.restQuats[bone.name] = bone.quaternion.clone();
            this.maleActor.restPositions[bone.name] = bone.position.clone();
          }
        });

        this.relaxArms(this.maleActor);
        this.maleActor.group.add(fbx);
        this.maleActor.loaded = true;
        this.syncVisibility();
        onLoaded?.();
      },
      undefined,
      (err) => console.error('Error loading Eric (Male) model:', err)
    );
  }

  /**
   * Relax A-pose arms into a natural hanging standing posture
   */
  private relaxArms(actor: RiggedActor) {
    const isFemale = actor.gender === 'female';
    const inwardAngle = isFemale ? 0.65 : 0.65;

    // In Renderpeople FBX:
    // Rotating upperarm around local Y axis brings the arms down/inward flush against the sides of the torso
    if (actor.bones['upperarm_l'] && actor.restQuats['upperarm_l']) {
      const q = actor.restQuats['upperarm_l'].clone();
      const armRelax = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, inwardAngle, 0));
      actor.bones['upperarm_l'].quaternion.copy(q.multiply(armRelax));
      actor.restQuats['upperarm_l'] = actor.bones['upperarm_l'].quaternion.clone();
    }
    if (actor.bones['upperarm_r'] && actor.restQuats['upperarm_r']) {
      const q = actor.restQuats['upperarm_r'].clone();
      const armRelax = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, inwardAngle, 0));
      actor.bones['upperarm_r'].quaternion.copy(q.multiply(armRelax));
      actor.restQuats['upperarm_r'] = actor.bones['upperarm_r'].quaternion.clone();
    }
    // Rotating lowerarm around -Z bends elbow forward in natural resting flex
    if (actor.bones['lowerarm_l'] && actor.restQuats['lowerarm_l']) {
      const q = actor.restQuats['lowerarm_l'].clone();
      const elbowBend = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.15));
      actor.bones['lowerarm_l'].quaternion.copy(q.multiply(elbowBend));
      actor.restQuats['lowerarm_l'] = actor.bones['lowerarm_l'].quaternion.clone();
    }
    if (actor.bones['lowerarm_r'] && actor.restQuats['lowerarm_r']) {
      const q = actor.restQuats['lowerarm_r'].clone();
      const elbowBend = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.15));
      actor.bones['lowerarm_r'].quaternion.copy(q.multiply(elbowBend));
      actor.restQuats['lowerarm_r'] = actor.bones['lowerarm_r'].quaternion.clone();
    }
  }

  private syncVisibility() {
    if (!this.isThirdPerson) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.femaleActor.group.visible = this.activeCharacter === 'female';
    this.maleActor.group.visible = this.activeCharacter === 'male';
  }

  public setCharacter(type: CharacterType) {
    this.activeCharacter = type;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('physics_lab_character_preference', type);
    }
    this.syncVisibility();
    this.onCharacterChanged?.(type);
  }

  public switchCharacter(): CharacterType {
    const next: CharacterType = this.activeCharacter === 'female' ? 'male' : 'female';
    this.setCharacter(next);
    return next;
  }

  public toggleView(): boolean {
    if (!this.allowThirdPerson) {
      this.isThirdPerson = false;
      this.syncVisibility();
      return false;
    }
    this.isThirdPerson = !this.isThirdPerson;
    this.syncVisibility();
    return this.isThirdPerson;
  }

  public update(
    delta: number,
    playerPosition: THREE.Vector3,
    movementVector: THREE.Vector3,
    yaw: number,
    pitch: number,
    camera: THREE.Camera,
    isSprinting = false
  ) {
    // Sync root position to player floor position
    this.root.position.x = playerPosition.x;
    this.root.position.y = this.floorY;
    this.root.position.z = playerPosition.z;

    const isMoving = movementVector.lengthSq() > 1e-8;
    const targetWalkWeight = isMoving ? 1.0 : 0.0;
    this.walkWeight = THREE.MathUtils.lerp(this.walkWeight, targetWalkWeight, delta * 14.0);

    const targetSprint = (isMoving && isSprinting) ? 1.0 : 0.0;
    this.sprintWeight = THREE.MathUtils.lerp(this.sprintWeight, targetSprint, delta * 9.0);

    // Rotate character mesh to face direction of travel or camera yaw
    if (isMoving) {
      const moveAngle = Math.atan2(movementVector.x, movementVector.z);
      let diff = moveAngle - this.currentMeshYaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.currentMeshYaw += diff * Math.min(1.0, delta * 12.0);
    } else {
      let diff = yaw - this.currentMeshYaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.currentMeshYaw += diff * Math.min(1.0, delta * 5.0);
    }
    this.root.rotation.y = this.currentMeshYaw;

    const time = performance.now() * 0.001;
    const isFemale = this.activeCharacter === 'female';

    if (this.walkWeight > 0.01) {
      const moveDist = movementVector.length();
      // Gait cycle length: 2 full steps (left + right).
      // Synchronized to stride reach so feet maintain strict zero-skate ground contact.
      const walkCycleLen = isFemale ? 1.42 : 1.48;
      const sprintCycleLen = isFemale ? 1.70 : 1.80;
      const cycleLength = THREE.MathUtils.lerp(walkCycleLen, sprintCycleLen, this.sprintWeight);

      if (moveDist > 1e-8) {
        // Direct kinematic coupling to floor displacement (zero foot skating)
        this.walkCycle += (moveDist / cycleLength) * (Math.PI * 2);
      } else {
        // Cadence for in-place motion (~108 steps per minute)
        this.walkCycle += delta * (7.2 + this.sprintWeight * 2.8);
      }
    }

    // Update active actor locomotion
    const currentActor = isFemale ? this.femaleActor : this.maleActor;
    if (currentActor.loaded) {
      this.updateActorLocomotion(currentActor, time);
    }

    // Update camera position
    this.updateCamera(camera, playerPosition, yaw, pitch);
  }

  /**
   * Anatomically accurate bipedal leg and foot kinematics based on normalized gait cycle phi [0, 1)
   */
  private calculateLegKinematics(phi: number, isFemale: boolean, sprint: number) {
    phi = ((phi % 1.0) + 1.0) % 1.0;

    // Prominent, grounded stride angle: 0.56 rad (~32 deg) at normal walk; expands to 0.68 rad (~39 deg) at sprint
    const walkStride = isFemale ? 0.56 : 0.58;
    const sprintStride = isFemale ? 0.68 : 0.72;
    const strideAngle = THREE.MathUtils.lerp(walkStride, sprintStride, sprint);

    // 1. Thigh Pitch (Hip Z rotation)
    // phi = 0.0: Heel strike (forward reach +strideAngle)
    // phi = 0.5: Push-off / toe-off (backward extension -strideAngle)
    const thighZ = Math.cos(2 * Math.PI * phi) * strideAngle;

    // 2. Knee Flexion (Knee -Z rotation)
    // Stance phase (0.0 to 0.46): support weight, slight shock-absorption flex
    // Swing phase (0.46 to 0.94): deeply flex knee to lift shoe 30-35cm off floor (distinct bipedal steps)
    let kneeZ = -0.06; // Resting anatomical micro-flexion
    if (phi > 0.04 && phi <= 0.22) {
      // Stance shock absorption: absorbs impact as heel plants
      const p = (phi - 0.04) / 0.18;
      kneeZ = -0.06 - Math.sin(p * Math.PI) * 0.18;
    } else if (phi > 0.46 && phi <= 0.94) {
      // Swing phase: actively lifts lower leg and shoe backward and upward (clearly visible from behind)
      const p = (phi - 0.46) / 0.48;
      const swingFlex = THREE.MathUtils.lerp(isFemale ? 1.05 : 1.12, isFemale ? 1.25 : 1.30, sprint);
      kneeZ = -0.06 - Math.sin(p * Math.PI) * swingFlex;
    }

    // 3. Ankle Pitch (Foot Z rotation)
    // +Z = dorsiflexion (toes up, heel down)
    // -Z = plantarflexion (toes down, heel up)
    let ankleZ = 0;
    if (phi <= 0.12) {
      // Heel strike to flat foot plant:
      // At phi=0, toes are tilted up (+0.28 rad) so heel lands crisply on the floor
      // Rolls smoothly down to flat (0.0 rad)
      const p = phi / 0.12;
      ankleZ = THREE.MathUtils.lerp(0.28, 0.0, p);
    } else if (phi <= 0.42) {
      // Mid-stance: Foot flat on floor while shin rolls forward over it
      const p = (phi - 0.12) / 0.30;
      ankleZ = THREE.MathUtils.lerp(0.0, 0.14, p);
    } else if (phi <= 0.54) {
      // Push-off: Heel lifts, ankle extends back in strong plantarflexion
      const p = (phi - 0.42) / 0.12;
      ankleZ = THREE.MathUtils.lerp(0.14, -0.42, p);
    } else if (phi <= 0.76) {
      // Early swing: Knee bends and ankle rapidly dorsiflexes up to clear the ground
      const p = (phi - 0.54) / 0.22;
      ankleZ = THREE.MathUtils.lerp(-0.42, 0.22, p);
    } else {
      // Terminal swing: Leg reaches forward with toes up, preparing for heel strike
      const p = (phi - 0.76) / 0.24;
      ankleZ = THREE.MathUtils.lerp(0.22, 0.28, p);
    }

    // 4. Ball of Foot / Toes (Ball Z rotation)
    // Bends toes upward (+Z) during push-off while ball of foot is on the floor
    let ballZ = 0;
    if (phi > 0.40 && phi <= 0.56) {
      const p = (phi - 0.40) / 0.16;
      ballZ = Math.sin(p * Math.PI) * 0.50;
    }

    return { thighZ, kneeZ, ankleZ, ballZ, strideAngle };
  }

  /**
   * Anatomically accurate bipedal locomotion kinematics
   */
  private updateActorLocomotion(actor: RiggedActor, time: number) {
    const isFemale = actor.gender === 'female';
    const phi = ((this.walkCycle / (Math.PI * 2)) % 1.0 + 1.0) % 1.0;
    const leftPhi = phi;
    const rightPhi = (phi + 0.5) % 1.0;
    const sprint = this.sprintWeight;

    // Compute kinematics for both legs
    const leftLeg = this.calculateLegKinematics(leftPhi, isFemale, sprint);
    const rightLeg = this.calculateLegKinematics(rightPhi, isFemale, sprint);

    // 1. Pelvis / Hips Kinematic Grounding (Zero Floating)
    // Vertical bobbing: drops at heel strike and push-off, vaults upward over straight stance leg at mid-stance
    const bobAmount = (isFemale ? 3.8 : 4.2) * (1.0 + sprint * 0.35) * this.walkWeight;
    const bobDrop = (1 + Math.cos(4 * Math.PI * phi)) * 0.5 * bobAmount;

    // Lateral sway toward active stance leg (+X for left at 0.25, -X for right at 0.75)
    // Provides natural human weight shift with each step
    const hipSwayAmount = (isFemale ? 2.5 : 1.8) * (1.0 - sprint * 0.20) * this.walkWeight;
    const sway = Math.sin(2 * Math.PI * phi) * hipSwayAmount;

    // Pelvic tilt and yaw
    const pelvicYawAmount = (isFemale ? 0.075 : 0.055) * this.walkWeight;
    const pelvicRollAmount = (isFemale ? -0.035 : -0.024) * this.walkWeight;
    const pelvicYaw = Math.cos(2 * Math.PI * phi) * pelvicYawAmount;
    const pelvicRoll = Math.sin(2 * Math.PI * phi) * pelvicRollAmount;

    const hip = actor.bones['hip'];
    const hipRestPos = actor.restPositions['hip'];
    const hipRestQuat = actor.restQuats['hip'];
    if (hip && hipRestPos && hipRestQuat) {
      hip.position.y = hipRestPos.y - bobDrop;
      hip.position.x = hipRestPos.x + sway;

      const pRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pelvicYaw, pelvicRoll));
      hip.quaternion.copy(hipRestQuat.clone().multiply(pRot));
    }

    // 2. Thighs (Upper Legs) - Swing along local Z axis
    const leftThigh = actor.bones['upperleg_l'];
    const leftThighRest = actor.restQuats['upperleg_l'];
    if (leftThigh && leftThighRest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, leftLeg.thighZ * this.walkWeight));
      leftThigh.quaternion.copy(leftThighRest.clone().multiply(rot));
    }

    const rightThigh = actor.bones['upperleg_r'];
    const rightThighRest = actor.restQuats['upperleg_r'];
    if (rightThigh && rightThighRest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rightLeg.thighZ * this.walkWeight));
      rightThigh.quaternion.copy(rightThighRest.clone().multiply(rot));
    }

    // 3. Knees (Lower Legs) - Flexion along negative Z axis (lifts foot up/backward)
    const leftKnee = actor.bones['lowerleg_l'];
    const leftKneeRest = actor.restQuats['lowerleg_l'];
    if (leftKnee && leftKneeRest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, leftLeg.kneeZ * this.walkWeight));
      leftKnee.quaternion.copy(leftKneeRest.clone().multiply(rot));
    }

    const rightKnee = actor.bones['lowerleg_r'];
    const rightKneeRest = actor.restQuats['lowerleg_r'];
    if (rightKnee && rightKneeRest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rightLeg.kneeZ * this.walkWeight));
      rightKnee.quaternion.copy(rightKneeRest.clone().multiply(rot));
    }

    // 4. Feet / Ankles - Heel strike dorsiflexion (+Z), flat foot stance, and toe push-off (-Z)
    const leftFoot = actor.bones['foot_l'];
    const leftFootRest = actor.restQuats['foot_l'];
    if (leftFoot && leftFootRest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, leftLeg.ankleZ * this.walkWeight));
      leftFoot.quaternion.copy(leftFootRest.clone().multiply(rot));
    }

    const rightFoot = actor.bones['foot_r'];
    const rightFootRest = actor.restQuats['foot_r'];
    if (rightFoot && rightFootRest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rightLeg.ankleZ * this.walkWeight));
      rightFoot.quaternion.copy(rightFootRest.clone().multiply(rot));
    }

    // 5. Ball of Foot / Toes - Articulated toe bend during push-off (+Z)
    const leftBall = actor.bones['ball_l'];
    const leftBallRest = actor.restQuats['ball_l'];
    if (leftBall && leftBallRest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, leftLeg.ballZ * this.walkWeight));
      leftBall.quaternion.copy(leftBallRest.clone().multiply(rot));
    }

    const rightBall = actor.bones['ball_r'];
    const rightBallRest = actor.restQuats['ball_r'];
    if (rightBall && rightBallRest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rightLeg.ballZ * this.walkWeight));
      rightBall.quaternion.copy(rightBallRest.clone().multiply(rot));
    }

    // 6. Spine & Torso (Thoracic counter-rotation & natural forward lean)
    const spineYawAmount = -pelvicYaw * 0.75;
    const postureLean = (0.035 + sprint * 0.04) * this.walkWeight;

    const spine1 = actor.bones['spine_01'];
    const spine1Rest = actor.restQuats['spine_01'];
    if (spine1 && spine1Rest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(postureLean, spineYawAmount * 0.5, 0));
      spine1.quaternion.copy(spine1Rest.clone().multiply(rot));
    }

    const spine2 = actor.bones['spine_02'];
    const spine2Rest = actor.restQuats['spine_02'];
    if (spine2 && spine2Rest) {
      const breath = Math.sin(time * 2.2) * 0.015 * (1.0 - this.walkWeight * 0.7);
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(breath, spineYawAmount * 0.5, 0));
      spine2.quaternion.copy(spine2Rest.clone().multiply(rot));
    }

    // 7. Upper Arms (Contralateral swing along local Z axis)
    const armSwingAngle = THREE.MathUtils.lerp(isFemale ? 0.48 : 0.52, isFemale ? 0.65 : 0.70, sprint) * this.walkWeight;
    const leftArmSwingZ = Math.cos(2 * Math.PI * phi) * armSwingAngle;
    const rightArmSwingZ = -Math.cos(2 * Math.PI * phi) * armSwingAngle;

    const leftArm = actor.bones['upperarm_l'];
    const leftArmRest = actor.restQuats['upperarm_l'];
    if (leftArm && leftArmRest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, leftArmSwingZ));
      leftArm.quaternion.copy(leftArmRest.clone().multiply(rot));
    }

    const rightArm = actor.bones['upperarm_r'];
    const rightArmRest = actor.restQuats['upperarm_r'];
    if (rightArm && rightArmRest) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rightArmSwingZ));
      rightArm.quaternion.copy(rightArmRest.clone().multiply(rot));
    }

    // 8. Lower Arms / Elbows (Flexion along -Z during forward swing)
    const leftElbow = actor.bones['lowerarm_l'];
    const leftElbowRest = actor.restQuats['lowerarm_l'];
    if (leftElbow && leftElbowRest) {
      const elbowBend = -Math.max(0, -leftArmSwingZ) * 0.90;
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, elbowBend));
      leftElbow.quaternion.copy(leftElbowRest.clone().multiply(rot));
    }

    const rightElbow = actor.bones['lowerarm_r'];
    const rightElbowRest = actor.restQuats['lowerarm_r'];
    if (rightElbow && rightElbowRest) {
      const elbowBend = -Math.max(0, -rightArmSwingZ) * 0.90;
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, elbowBend));
      rightElbow.quaternion.copy(rightElbowRest.clone().multiply(rot));
    }
  }

  public updateCamera(
    camera: THREE.Camera,
    playerPosition: THREE.Vector3,
    yaw: number,
    pitch: number
  ) {
    const isFemale = this.activeCharacter === 'female';
    const targetHeight = isFemale ? 1.40 : 1.48;
    const eyeHeight = isFemale ? 1.56 : 1.70;

    if (this.isThirdPerson) {
      this.syncVisibility();

      const target = new THREE.Vector3(
        playerPosition.x,
        this.floorY + targetHeight,
        playerPosition.z
      );

      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);

      const forward = new THREE.Vector3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);
      const right = new THREE.Vector3(cosYaw, 0, -sinYaw);

      const camPos = target.clone()
        .sub(forward.clone().multiplyScalar(this.cameraDistance))
        .add(right.clone().multiplyScalar(this.shoulderOffset))
        .add(new THREE.Vector3(0, this.cameraHeightOffset, 0));

      camera.position.copy(camPos);
      camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    } else {
      this.root.visible = false;
      camera.position.set(playerPosition.x, this.floorY + eyeHeight, playerPosition.z);
      camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    }
  }

  public dispose() {
    this.scene.remove(this.root);
    this.root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
  }
}
