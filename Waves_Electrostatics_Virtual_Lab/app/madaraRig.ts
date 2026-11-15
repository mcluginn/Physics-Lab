import * as THREE from 'three';

export interface MadaraBoneMap {
  hip: THREE.Bone;
  spine_01: THREE.Bone;
  spine_02: THREE.Bone;
  head: THREE.Bone;
  shoulder_l: THREE.Bone;
  upperarm_l: THREE.Bone;
  lowerarm_l: THREE.Bone;
  shoulder_r: THREE.Bone;
  upperarm_r: THREE.Bone;
  lowerarm_r: THREE.Bone;
  upperleg_l: THREE.Bone;
  lowerleg_l: THREE.Bone;
  foot_l: THREE.Bone;
  ball_l: THREE.Bone;
  upperleg_r: THREE.Bone;
  lowerleg_r: THREE.Bone;
  foot_r: THREE.Bone;
  ball_r: THREE.Bone;
  apron_front: THREE.Bone;
}

export interface MadaraRigHandles {
  bones: MadaraBoneMap;
  skeleton: THREE.Skeleton;
  objScale: number;
  baseObjY: number;
  hipRestPos: THREE.Vector3;
  relaxAngleRad: number;
  elbowAxisL: THREE.Vector3;
  elbowAxisR: THREE.Vector3;
}

export interface MadaraGaitPose {
  moveWeight: number;
  sprintWeight: number;
  hipBobMeters: number;
  hipSwayMeters: number;
  pelvisYaw: number;
  pelvisRoll: number;
  pelvisPitch: number;
  spineCounterYaw: number;
  spinePitch: number;
  headCounterYaw: number;
  leftThighForward: number;
  leftKneeFlex: number;
  leftAnkleDorsi: number;
  leftToeLift: number;
  rightThighForward: number;
  rightKneeFlex: number;
  rightAnkleDorsi: number;
  rightToeLift: number;
  leftArmForward: number;
  leftElbowFlex: number;
  rightArmForward: number;
  rightElbowFlex: number;
}

// Measured OBJ landmark coordinates in raw Madara_Uchiha.obj units (Y-up, +Z forward, +X left).
const LANDMARKS = {
  hipPos: new THREE.Vector3(0, 2.12, -0.02),
  spine01Pos: new THREE.Vector3(0, 2.55, -0.03),
  spine02Pos: new THREE.Vector3(0, 3.05, -0.03),
  headPos: new THREE.Vector3(0, 3.55, 0.01),
  shoulderL: new THREE.Vector3(0.44, 3.21, -0.05),
  elbowL: new THREE.Vector3(0.98, 2.76, -0.13),
  shoulderR: new THREE.Vector3(-0.44, 3.21, -0.05),
  elbowR: new THREE.Vector3(-0.98, 2.76, -0.13),
  hipL: new THREE.Vector3(0.24, 2.02, -0.03),
  kneeL: new THREE.Vector3(0.26, 1.15, -0.04),
  ankleL: new THREE.Vector3(0.27, 0.23, -0.05),
  ballL: new THREE.Vector3(0.29, 0.06, 0.21),
  hipR: new THREE.Vector3(-0.24, 2.02, -0.03),
  kneeR: new THREE.Vector3(-0.26, 1.15, -0.04),
  ankleR: new THREE.Vector3(-0.27, 0.23, -0.05),
  ballR: new THREE.Vector3(-0.29, 0.06, 0.21),
  apronFront: new THREE.Vector3(0, 2.25, 0.25),
} as const;

const ARM_RELAX_RAD = 0.64; // ~37 deg inward from 51 deg A-pose -> ~14 deg natural arm hang clear of waist plates

const LEG_UPPER_LEN = LANDMARKS.hipL.y - LANDMARKS.kneeL.y; // 0.87 raw units
const LEG_LOWER_LEN = LANDMARKS.kneeL.y - LANDMARKS.ankleL.y; // 0.92 raw units
const ANKLE_CLEARANCE = LANDMARKS.ankleL.y; // 0.23 raw units
const BALL_REL_Y = LANDMARKS.ballL.y - LANDMARKS.ankleL.y; // -0.17 raw units
const BALL_REL_Z = LANDMARKS.ballL.z - LANDMARKS.ankleL.z; // +0.26 raw units

const BONE_ORDER: ReadonlyArray<keyof MadaraBoneMap> = [
  'hip',
  'spine_01',
  'spine_02',
  'head',
  'shoulder_l',
  'upperarm_l',
  'lowerarm_l',
  'shoulder_r',
  'upperarm_r',
  'lowerarm_r',
  'upperleg_l',
  'lowerleg_l',
  'foot_l',
  'ball_l',
  'upperleg_r',
  'lowerleg_r',
  'foot_r',
  'ball_r',
  'apron_front',
];

const BONE_INDEX: Record<keyof MadaraBoneMap, number> = Object.fromEntries(
  BONE_ORDER.map((name, idx) => [name, idx])
) as Record<keyof MadaraBoneMap, number>;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// Reusable scratch math objects for per-frame gait updates (zero GC pressure).
const _qSwing = new THREE.Quaternion();
const _qRelax = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

function createBone(name: string, parent: THREE.Object3D, worldPos: THREE.Vector3, parentWorldPos?: THREE.Vector3): THREE.Bone {
  const bone = new THREE.Bone();
  bone.name = name;
  if (parentWorldPos) {
    bone.position.copy(worldPos).sub(parentWorldPos);
  } else {
    bone.position.copy(worldPos);
  }
  parent.add(bone);
  return bone;
}

/**
 * Builds the 19-bone Three.js skeleton aligned to Madara_Uchiha.obj landmarks.
 */
function buildSkeletonHierarchy(rootParent: THREE.Object3D): {
  bones: MadaraBoneMap;
  boneList: THREE.Bone[];
} {
  const hip = createBone('hip', rootParent, LANDMARKS.hipPos);
  const spine_01 = createBone('spine_01', hip, LANDMARKS.spine01Pos, LANDMARKS.hipPos);
  const spine_02 = createBone('spine_02', spine_01, LANDMARKS.spine02Pos, LANDMARKS.spine01Pos);
  const head = createBone('head', spine_02, LANDMARKS.headPos, LANDMARKS.spine02Pos);

  const shoulder_l = createBone('shoulder_l', spine_02, LANDMARKS.shoulderL, LANDMARKS.spine02Pos);
  const upperarm_l = createBone('upperarm_l', shoulder_l, LANDMARKS.shoulderL, LANDMARKS.shoulderL);
  const lowerarm_l = createBone('lowerarm_l', upperarm_l, LANDMARKS.elbowL, LANDMARKS.shoulderL);

  const shoulder_r = createBone('shoulder_r', spine_02, LANDMARKS.shoulderR, LANDMARKS.spine02Pos);
  const upperarm_r = createBone('upperarm_r', shoulder_r, LANDMARKS.shoulderR, LANDMARKS.shoulderR);
  const lowerarm_r = createBone('lowerarm_r', upperarm_r, LANDMARKS.elbowR, LANDMARKS.shoulderR);

  const upperleg_l = createBone('upperleg_l', hip, LANDMARKS.hipL, LANDMARKS.hipPos);
  const lowerleg_l = createBone('lowerleg_l', upperleg_l, LANDMARKS.kneeL, LANDMARKS.hipL);
  const foot_l = createBone('foot_l', lowerleg_l, LANDMARKS.ankleL, LANDMARKS.kneeL);
  const ball_l = createBone('ball_l', foot_l, LANDMARKS.ballL, LANDMARKS.ankleL);

  const upperleg_r = createBone('upperleg_r', hip, LANDMARKS.hipR, LANDMARKS.hipPos);
  const lowerleg_r = createBone('lowerleg_r', upperleg_r, LANDMARKS.kneeR, LANDMARKS.hipR);
  const foot_r = createBone('foot_r', lowerleg_r, LANDMARKS.ankleR, LANDMARKS.kneeR);
  const ball_r = createBone('ball_r', foot_r, LANDMARKS.ballR, LANDMARKS.ankleR);

  const apron_front = createBone('apron_front', hip, LANDMARKS.apronFront, LANDMARKS.hipPos);

  const bones: MadaraBoneMap = {
    hip,
    spine_01,
    spine_02,
    head,
    shoulder_l,
    upperarm_l,
    lowerarm_l,
    shoulder_r,
    upperarm_r,
    lowerarm_r,
    upperleg_l,
    lowerleg_l,
    foot_l,
    ball_l,
    upperleg_r,
    lowerleg_r,
    foot_r,
    ball_r,
    apron_front,
  };

  const boneList = BONE_ORDER.map((key) => bones[key]);
  return { bones, boneList };
}

type WeightAccumulator = Partial<Record<keyof MadaraBoneMap, number>>;

function addSideLegWeights(weights: WeightAccumulator, isLeft: boolean, y: number, z: number, scaleFactor: number) {
  const upperKey: keyof MadaraBoneMap = isLeft ? 'upperleg_l' : 'upperleg_r';
  const lowerKey: keyof MadaraBoneMap = isLeft ? 'lowerleg_l' : 'lowerleg_r';
  const footKey: keyof MadaraBoneMap = isLeft ? 'foot_l' : 'foot_r';
  const ballKey: keyof MadaraBoneMap = isLeft ? 'ball_l' : 'ball_r';

  const belowKnee = 1 - smoothstep(1.00, 1.30, y);
  const belowAnkle = 1 - smoothstep(0.14, 0.30, y);
  const isToe = smoothstep(0.18, 0.25, z) * (1 - smoothstep(0.11, 0.16, y));

  const wUpper = (1 - belowKnee) * scaleFactor;
  const wLower = belowKnee * (1 - belowAnkle) * scaleFactor;
  const wFoot = belowKnee * belowAnkle * (1 - isToe) * scaleFactor;
  const wBall = belowKnee * belowAnkle * isToe * scaleFactor;

  if (wUpper > 0) weights[upperKey] = (weights[upperKey] ?? 0) + wUpper;
  if (wLower > 0) weights[lowerKey] = (weights[lowerKey] ?? 0) + wLower;
  if (wFoot > 0) weights[footKey] = (weights[footKey] ?? 0) + wFoot;
  if (wBall > 0) weights[ballKey] = (weights[ballKey] ?? 0) + wBall;
}

const _armDirL = new THREE.Vector3().subVectors(LANDMARKS.elbowL, LANDMARKS.shoulderL).normalize();
const _armUpperLen = LANDMARKS.elbowL.distanceTo(LANDMARKS.shoulderL);

function computeVertexBoneWeights(meshName: string, x: number, y: number, z: number): WeightAccumulator {
  const lower = meshName.toLowerCase();
  const absX = Math.abs(x);

  // 1. Hair, eyebrows, and face plates follow head + back mane flows with spine
  if (lower.includes('eye_brows') || lower.includes('top_hair') || lower.includes('front_hair')) {
    return { head: 1 };
  }
  if (lower.includes('back_hair')) {
    if (y >= 3.45) return { head: 1 };
    const headFrac = smoothstep(3.10, 3.45, y);
    const spine01Frac = (1 - smoothstep(2.15, 2.95, y)) * 0.45 * (1 - headFrac);
    const spine02Frac = Math.max(0, 1 - headFrac - spine01Frac);
    return { head: headFrac, spine_02: spine02Frac, spine_01: spine01Frac };
  }

  // 2. Upper chest & shoulder pauldrons
  if (lower.includes('upper_metal_plates')) {
    const tShoulder = smoothstep(0.38, 0.74, absX);
    const pauldronDropWeight = 0.56 * tShoulder;
    if (pauldronDropWeight <= 0.001) return { spine_02: 1 };
    const armBone: keyof MadaraBoneMap = x >= 0 ? 'upperarm_l' : 'upperarm_r';
    return { spine_02: 1 - pauldronDropWeight, [armBone]: pauldronDropWeight };
  }

  // 3. Lower metal waist plates & pleated hakama coat
  if (lower.includes('lower_metal_plates_middle')) {
    const tApron = 1 - smoothstep(1.98, 2.28, y);
    return { hip: 1 - tApron, apron_front: tApron };
  }
  if (lower.includes('lower_metal_plates_right') || lower.includes('lower_metal_plates_left')) {
    const tFollow = (1 - smoothstep(1.75, 2.30, y)) * 0.80;
    const thighBone: keyof MadaraBoneMap = x >= 0 ? 'upperleg_l' : 'upperleg_r';
    return { hip: 1 - tFollow, [thighBone]: tFollow };
  }
  if (lower.includes('lower_robe')) {
    if (y >= 2.26) return { hip: 1 };
    const drop = 1 - smoothstep(1.55, 2.26, y);
    const leftMix = smoothstep(-0.42, 0.42, x);
    const frontApronBias = smoothstep(0.06, 0.24, z) * (1 - smoothstep(0.08, 0.30, absX));
    const wApron = drop * 0.44 * frontApronBias;
    const wLegs = drop * 0.46 * (1 - frontApronBias);
    const wHip = Math.max(0.10, 1 - wApron - wLegs);
    return {
      hip: wHip,
      apron_front: wApron,
      upperleg_l: wLegs * leftMix,
      upperleg_r: wLegs * (1 - leftMix),
    };
  }

  // 4. Main body mesh (head, chest, sleeves/arms, trousers, leg wraps, sandals)
  if (y >= 3.44 && absX <= 0.36) {
    const wHead = smoothstep(3.44, 3.62, y);
    return { head: wHead, spine_02: 1 - wHead };
  }

  // Diagonal armpit/torso separation boundary
  const armMask = smoothstep(0.35, 0.52, absX) * smoothstep(2.86, 3.04, y + (absX - 0.36) * 0.90);
  if (armMask > 0.001) {
    const isLeft = x >= 0;
    const shoulder = isLeft ? LANDMARKS.shoulderL : LANDMARKS.shoulderR;
    const dirX = isLeft ? _armDirL.x : -_armDirL.x;
    const proj =
      (x - shoulder.x) * dirX +
      (y - shoulder.y) * _armDirL.y +
      (z - shoulder.z) * _armDirL.z;
    const wElbow = smoothstep(_armUpperLen - 0.16, _armUpperLen + 0.16, proj);
    const upperArmBone: keyof MadaraBoneMap = isLeft ? 'upperarm_l' : 'upperarm_r';
    const lowerArmBone: keyof MadaraBoneMap = isLeft ? 'lowerarm_l' : 'lowerarm_r';

    const weights: WeightAccumulator = {
      [upperArmBone]: armMask * (1 - wElbow),
      [lowerArmBone]: armMask * wElbow,
    };
    const torsoShare = 1 - armMask;
    if (torsoShare > 0.001) {
      const wSpine02 = smoothstep(2.75, 3.05, y);
      weights.spine_02 = torsoShare * wSpine02;
      weights.spine_01 = torsoShare * (1 - wSpine02);
    }
    return weights;
  }

  // Legs below hip/pelvis seam
  if (y < 2.06) {
    const pelvisCenterTrap = (1 - smoothstep(0.02, 0.10, absX)) * smoothstep(1.80, 1.98, y);
    const wHip = Math.max(smoothstep(1.86, 2.08, y), pelvisCenterTrap);
    const wLegs = 1 - wHip;
    const weights: WeightAccumulator = {};
    if (wHip > 0.001) weights.hip = wHip;
    if (wLegs > 0.001) {
      const leftFrac = smoothstep(-0.04, 0.04, x);
      if (leftFrac > 0.001) addSideLegWeights(weights, true, y, z, wLegs * leftFrac);
      if (1 - leftFrac > 0.001) addSideLegWeights(weights, false, y, z, wLegs * (1 - leftFrac));
    }
    return weights;
  }

  // Pelvis -> lumbar spine -> upper chest
  if (y <= 2.30) return { hip: 1 };
  if (y <= 2.80) {
    const t = smoothstep(2.30, 2.80, y);
    return { hip: 1 - t, spine_01: t };
  }
  const tUpper = smoothstep(2.80, 3.12, y);
  return { spine_01: 1 - tUpper, spine_02: tUpper };
}

function attachSkinAttributes(geometry: THREE.BufferGeometry, meshName: string) {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = posAttr.count;
  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const rawWeights = computeVertexBoneWeights(meshName, x, y, z);

    const pairs: Array<[number, number]> = [];
    for (const key of Object.keys(rawWeights) as Array<keyof MadaraBoneMap>) {
      const val = rawWeights[key] ?? 0;
      if (val > 0.0005) {
        pairs.push([BONE_INDEX[key], val]);
      }
    }
    if (pairs.length === 0) {
      pairs.push([BONE_INDEX.hip, 1]);
    }
    pairs.sort((a, b) => b[1] - a[1]);
    if (pairs.length > 4) pairs.length = 4;

    let sum = 0;
    for (let j = 0; j < pairs.length; j++) sum += pairs[j][1];
    const invSum = sum > 0 ? 1 / sum : 1;

    const base = i * 4;
    for (let j = 0; j < 4; j++) {
      if (j < pairs.length) {
        skinIndices[base + j] = pairs[j][0];
        skinWeights[base + j] = pairs[j][1] * invSum;
      } else {
        skinIndices[base + j] = 0;
        skinWeights[base + j] = 0;
      }
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

/**
 * Converts a loaded static Madara OBJ group into an articulated SkinnedMesh rig,
 * relaxes his wide A-pose arms down cleanly to his sides, and grounds soles to y=0.
 */
export function buildMadaraSkeletonAndSkin(obj: THREE.Group): MadaraRigHandles {
  // Measure raw OBJ bounds before adding helper bones or scaling
  const rawBox = new THREE.Box3().setFromObject(obj);
  const rawHeight = Math.max(0.1, rawBox.max.y - rawBox.min.y);
  const objScale = 1.79 / rawHeight;
  const baseObjY = -rawBox.min.y * objScale - 0.006;

  // Bind skeleton while obj is at identity transform so bindMatrix/inverses stay exact
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);
  obj.scale.set(1, 1, 1);

  const { bones, boneList } = buildSkeletonHierarchy(obj);
  const skeleton = new THREE.Skeleton(boneList);

  const sourceMeshes: THREE.Mesh[] = [];
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !(child as THREE.SkinnedMesh).isSkinnedMesh) {
      sourceMeshes.push(child as THREE.Mesh);
    }
  });

  obj.updateMatrixWorld(true);
  const identityBind = new THREE.Matrix4();

  for (const mesh of sourceMeshes) {
    const parent = mesh.parent;
    if (!parent) continue;

    attachSkinAttributes(mesh.geometry, mesh.name || '');

    const skinned = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
    skinned.name = mesh.name;
    skinned.position.copy(mesh.position);
    skinned.quaternion.copy(mesh.quaternion);
    skinned.scale.copy(mesh.scale);
    skinned.castShadow = mesh.castShadow;
    skinned.receiveShadow = mesh.receiveShadow;
    skinned.frustumCulled = false;

    parent.remove(mesh);
    parent.add(skinned);

    skinned.bind(skeleton, identityBind);
  }

  obj.updateMatrixWorld(true);
  skeleton.calculateInverses();

  // Compute exact elbow flex axes inside upperarm local space so elbows bend forward (+Z)
  const qRelaxL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -ARM_RELAX_RAD, 'YXZ'));
  const qRelaxR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ARM_RELAX_RAD, 'YXZ'));
  const elbowAxisL = new THREE.Vector3(1, 0, 0).applyQuaternion(qRelaxL.clone().invert()).normalize();
  const elbowAxisR = new THREE.Vector3(1, 0, 0).applyQuaternion(qRelaxR.clone().invert()).normalize();

  bones.upperarm_l.quaternion.copy(qRelaxL);
  bones.upperarm_r.quaternion.copy(qRelaxR);
  bones.lowerarm_l.quaternion.setFromAxisAngle(elbowAxisL, -0.16);
  bones.lowerarm_r.quaternion.setFromAxisAngle(elbowAxisR, -0.16);

  // Now apply uniform character height scaling & floor grounding cleanly
  obj.scale.setScalar(objScale);
  obj.position.set(0, baseObjY, 0);

  return {
    bones,
    skeleton,
    objScale,
    baseObjY,
    hipRestPos: LANDMARKS.hipPos.clone(),
    relaxAngleRad: ARM_RELAX_RAD,
    elbowAxisL,
    elbowAxisR,
  };
}

/**
 * Returns lowest vertical offset (in raw OBJ units) of one articulated leg's heel/ball
 * relative to rest height at straight stance, used to keep the planted foot grounded.
 */
function computeLegLowestRawY(thighForward: number, kneeFlex: number, ankleDorsi: number): number {
  const thighAngle = -thighForward; // bone Euler.x
  const shinAngle = thighAngle + Math.max(0.02, kneeFlex);
  const footAngle = shinAngle - ankleDorsi;

  const ankleY =
    LANDMARKS.hipL.y -
    Math.cos(thighAngle) * LEG_UPPER_LEN -
    Math.cos(shinAngle) * LEG_LOWER_LEN;
  // Heel drop below ankle (~0.23 at flat foot), plus forefoot tip under ankle pitch
  const heelSoleY = ankleY - Math.cos(footAngle) * ANKLE_CLEARANCE;
  const toeSoleY =
    ankleY +
    BALL_REL_Y * Math.cos(footAngle) -
    BALL_REL_Z * Math.sin(footAngle) -
    0.055; // sandal front thickness
  return Math.min(heelSoleY, toeSoleY);
}

/**
 * Applies coordinated bipedal walking/sprinting/idle joint rotations to Madara's rig.
 */
export function applyMadaraGait(handles: MadaraRigHandles, pose: MadaraGaitPose): void {
  const { bones, objScale, hipRestPos, relaxAngleRad, elbowAxisL, elbowAxisR } = handles;
  const invScale = 1 / Math.max(0.01, objScale);

  // Compute exact FK stance foot elevation so the lowest planted foot stays grounded during stride
  const leftMinRawY = computeLegLowestRawY(pose.leftThighForward, pose.leftKneeFlex, pose.leftAnkleDorsi);
  const rightMinRawY = computeLegLowestRawY(pose.rightThighForward, pose.rightKneeFlex, pose.rightAnkleDorsi);
  const stanceRawDrop = Math.min(leftMinRawY, rightMinRawY);
  const kinematicGroundMeters = THREE.MathUtils.clamp(-stanceRawDrop * objScale, -0.095, 0.015);
  const blendedHipY = THREE.MathUtils.lerp(pose.hipBobMeters, kinematicGroundMeters, pose.moveWeight * 0.92);

  // Root pelvis translation (world meters converted into unscaled OBJ bone space)
  bones.hip.position.set(
    hipRestPos.x + pose.hipSwayMeters * invScale,
    hipRestPos.y + blendedHipY * invScale,
    hipRestPos.z
  );
  _euler.set(pose.pelvisPitch, pose.pelvisYaw, pose.pelvisRoll, 'YXZ');
  bones.hip.quaternion.setFromEuler(_euler);

  // Spine counter-rotation and gentle forward walk lean
  _euler.set(pose.spinePitch * 0.45, pose.spineCounterYaw * 0.45, -pose.pelvisRoll * 0.35, 'YXZ');
  bones.spine_01.quaternion.setFromEuler(_euler);
  _euler.set(pose.spinePitch * 0.55, pose.spineCounterYaw * 0.55, -pose.pelvisRoll * 0.35, 'YXZ');
  bones.spine_02.quaternion.setFromEuler(_euler);
  _euler.set(-pose.spinePitch * 0.65, pose.headCounterYaw, 0, 'YXZ');
  bones.head.quaternion.setFromEuler(_euler);

  // Legs: negative X swings leg forward (+Z), positive X bends knee back (-Z)
  _euler.set(-pose.leftThighForward, 0, 0.018, 'YXZ');
  bones.upperleg_l.quaternion.setFromEuler(_euler);
  bones.lowerleg_l.rotation.set(Math.max(0.02, pose.leftKneeFlex), 0, 0);
  bones.foot_l.rotation.set(-pose.leftAnkleDorsi, 0, 0);
  bones.ball_l.rotation.set(-pose.leftToeLift, 0, 0);

  _euler.set(-pose.rightThighForward, 0, -0.018, 'YXZ');
  bones.upperleg_r.quaternion.setFromEuler(_euler);
  bones.lowerleg_r.rotation.set(Math.max(0.02, pose.rightKneeFlex), 0, 0);
  bones.foot_r.rotation.set(-pose.rightAnkleDorsi, 0, 0);
  bones.ball_r.rotation.set(-pose.rightToeLift, 0, 0);

  // Front waist plate clears whichever knee drives forward
  const maxKneeForward = Math.max(0, pose.leftThighForward, pose.rightThighForward);
  bones.apron_front.rotation.set(-maxKneeForward * 0.52, 0, 0);

  // Arms: shoulder swings strictly in sagittal X plane, while upperarm keeps relaxed adduction
  const subtleArmBreath = 0.025 * (1 - pose.moveWeight);
  _qSwing.setFromEuler(_euler.set(-pose.leftArmForward, 0, subtleArmBreath, 'YXZ'));
  bones.shoulder_l.quaternion.copy(_qSwing);
  _qRelax.setFromEuler(_euler.set(0, -0.06, -relaxAngleRad, 'YXZ'));
  bones.upperarm_l.quaternion.copy(_qRelax);
  bones.lowerarm_l.quaternion.setFromAxisAngle(elbowAxisL, -Math.max(0.14, pose.leftElbowFlex));

  _qSwing.setFromEuler(_euler.set(-pose.rightArmForward, 0, -subtleArmBreath, 'YXZ'));
  bones.shoulder_r.quaternion.copy(_qSwing);
  _qRelax.setFromEuler(_euler.set(0, 0.06, relaxAngleRad, 'YXZ'));
  bones.upperarm_r.quaternion.copy(_qRelax);
  bones.lowerarm_r.quaternion.setFromAxisAngle(elbowAxisR, -Math.max(0.14, pose.rightElbowFlex));
}
