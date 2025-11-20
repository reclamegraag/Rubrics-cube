import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { CubeTheme, Move } from '../types';
import { isSurface } from '../constants';

// Fix for missing JSX type definitions for React Three Fiber elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
    }
  }
}

interface RubiksCubeProps {
  size: number;
  theme: CubeTheme;
  moveQueue: Move[];
  onMoveComplete: () => void;
  isShaking: boolean;
  speed: number;
}

// Visual constants
const BOX_SIZE = 0.90; 
const BEVEL_RADIUS = 0.06; 
const STICKER_OFFSET = 0.455; 
const STICKER_SIZE = 0.80; 

// Reusable Geometry
const stickerGeometry = new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE);

const RubiksCube: React.FC<RubiksCubeProps> = ({ size, theme, moveQueue, onMoveComplete, isShaking, speed }) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotatingGroup = useRef<THREE.Group>(null);
  
  // --- Material Setup ---
  const materials = useMemo(() => {
    const matSettings = {
      roughness: 0.05, 
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    };
    return {
      U: new THREE.MeshPhysicalMaterial({ color: theme.U, ...matSettings }),
      D: new THREE.MeshPhysicalMaterial({ color: theme.D, ...matSettings }),
      L: new THREE.MeshPhysicalMaterial({ color: theme.L, ...matSettings }),
      R: new THREE.MeshPhysicalMaterial({ color: theme.R, ...matSettings }),
      F: new THREE.MeshPhysicalMaterial({ color: theme.F, ...matSettings }),
      B: new THREE.MeshPhysicalMaterial({ color: theme.B, ...matSettings }),
      Plastic: new THREE.MeshPhysicalMaterial({ color: '#080808', roughness: 0.4, metalness: 0.0 }),
    };
  }, [theme]);

  // --- Initialization ---
  const initialPositions = useMemo(() => {
    const positions = [];
    const offset = (size - 1) / 2;
    let id = 0;

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          const lx = x - offset;
          const ly = y - offset;
          const lz = z - offset;
          
          if (isSurface(lx, ly, lz, size)) {
            positions.push({ 
              id: id++, 
              x: lx, y: ly, z: lz,
              initialX: lx, initialY: ly, initialZ: lz,
              // Persist rotation state explicitly
              q: new THREE.Quaternion() 
            });
          }
        }
      }
    }
    return positions;
  }, [size]); // Re-calculate when size changes

  const cubiesRef = useRef(initialPositions);
  const cubieObjectsRef = useRef<{ [id: number]: THREE.Object3D }>({});

  // Reset refs if size changed significantly (safety check, though 'key' in parent usually handles this)
  if (cubiesRef.current.length !== initialPositions.length) {
      cubiesRef.current = initialPositions;
      cubieObjectsRef.current = {};
  }

  // Animation State
  const [isAnimating, setIsAnimating] = useState(false);
  const animationProgress = useRef(0);
  const currentMove = useRef<Move | null>(null);

  // --- Helper: Robust Snapping ---
  const snapTransform = (obj: THREE.Object3D) => {
    // 1. Snap Position
    // Odd sizes (3, 5, etc) use integer coordinates (-1, 0, 1)
    // Even sizes (2, 4, etc) use half-integer coordinates (-1.5, -0.5, 0.5, 1.5)
    const snap = (val: number) => {
        // Adding a tiny epsilon to handle -0.5 vs 0.5 boundaries correctly when floating point drift occurs
        const epsilon = 0.001;
        if (size % 2 === 0) {
            // Even: Snap to nearest x.5
            // Shift by 0.5, round, shift back. 
            // e.g. 0.5 -> 1.0 -> 1 -> 0.5
            // e.g. 0.49 -> 0.99 -> 1 -> 0.5
            return Math.round(val - 0.5 + epsilon) + 0.5;
        } else {
            // Odd: Snap to nearest integer
            return Math.round(val + epsilon);
        }
    };
    
    obj.position.x = snap(obj.position.x);
    obj.position.y = snap(obj.position.y);
    obj.position.z = snap(obj.position.z);

    // 2. Snap Rotation to strict 90 degree increments
    obj.updateMatrix();
    const euler = new THREE.Euler().setFromQuaternion(obj.quaternion);
    
    const snapAngle = (angle: number) => {
        return Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
    };

    obj.rotation.set(snapAngle(euler.x), snapAngle(euler.y), snapAngle(euler.z));
    obj.updateMatrix();
  };

  // --- Animation Loop ---
  useFrame((state, delta) => {
    if (isAnimating && currentMove.current && rotatingGroup.current) {
      // Animation speed: Use prop if shaking/solving, otherwise default manual speed
      const animSpeed = isShaking ? speed : 6; 
      animationProgress.current += delta * animSpeed;
      
      const targetRotation = (Math.PI / 2) * currentMove.current.direction;
      let currentRot = 0;

      if (animationProgress.current >= Math.PI / 2) {
        currentRot = targetRotation;
        
        const axisVector = new THREE.Vector3(
            currentMove.current.axis === 'x' ? 1 : 0,
            currentMove.current.axis === 'y' ? 1 : 0,
            currentMove.current.axis === 'z' ? 1 : 0
        );

        rotatingGroup.current.setRotationFromAxisAngle(axisVector, currentRot);
        rotatingGroup.current.updateMatrixWorld(); 
        finishMove();
      } else {
        currentRot = animationProgress.current * currentMove.current.direction;
        const axisVector = new THREE.Vector3(
            currentMove.current.axis === 'x' ? 1 : 0,
            currentMove.current.axis === 'y' ? 1 : 0,
            currentMove.current.axis === 'z' ? 1 : 0
        );
        rotatingGroup.current.setRotationFromAxisAngle(axisVector, currentRot);
      }
      return;
    }

    if (!isAnimating && moveQueue.length > 0) {
      startMove(moveQueue[0]);
    }
  });

  const startMove = (move: Move) => {
    currentMove.current = move;
    setIsAnimating(true);
    animationProgress.current = 0;

    const offset = (size - 1) / 2;
    const coordinateValue = move.layer - offset; 
    
    // Reset Rotating Group
    if(rotatingGroup.current) {
      rotatingGroup.current.rotation.set(0,0,0);
      rotatingGroup.current.position.set(0,0,0);
      rotatingGroup.current.scale.set(1,1,1);
      rotatingGroup.current.updateMatrixWorld();
    }

    let attachedCount = 0;

    cubiesRef.current.forEach(cubie => {
      let inSlice = false;
      // Robust selection: Check if coordinate matches expected layer index (allowing for tiny float drift)
      // The grid is 1 unit apart, so a tolerance of 0.25 is extremely safe.
      if (move.axis === 'x' && Math.abs(cubie.x - coordinateValue) < 0.25) inSlice = true;
      if (move.axis === 'y' && Math.abs(cubie.y - coordinateValue) < 0.25) inSlice = true;
      if (move.axis === 'z' && Math.abs(cubie.z - coordinateValue) < 0.25) inSlice = true;

      if (inSlice) {
        const obj = cubieObjectsRef.current[cubie.id];
        if (obj && rotatingGroup.current) {
          rotatingGroup.current.attach(obj);
          attachedCount++;
        }
      }
    });

    // Safety: If no blocks found (shouldn't happen), finish immediately to unblock queue
    if (attachedCount === 0) {
        console.warn("Ghost move detected, skipping animation");
        setIsAnimating(false);
        currentMove.current = null;
        onMoveComplete();
    }
  };

  const finishMove = () => {
    if (!currentMove.current || !rotatingGroup.current || !groupRef.current) return;

    const children = [...rotatingGroup.current.children];
    
    children.forEach(child => {
      groupRef.current?.attach(child);
      snapTransform(child);
    });

    // Update Logical State from Physical State
    cubiesRef.current.forEach(cubie => {
      const obj = cubieObjectsRef.current[cubie.id];
      if (obj) {
        cubie.x = obj.position.x;
        cubie.y = obj.position.y;
        cubie.z = obj.position.z;
        // IMPORTANT: Save rotation so it persists if React re-renders the component
        cubie.q.copy(obj.quaternion);
      }
    });

    rotatingGroup.current.rotation.set(0,0,0);
    rotatingGroup.current.updateMatrix();
    
    setIsAnimating(false);
    currentMove.current = null;
    onMoveComplete();
  };

  const offset = (size - 1) / 2;
  
  // Dynamically scale the cube so large cubes fit in view
  // Base scale 1.0 for size 10.
  const displayScale = 10 / Math.max(size, 5);

  return (
    <group ref={groupRef} scale={displayScale}>
      <group ref={rotatingGroup} />
      
      {cubiesRef.current.map((cubie) => {
        // Determine stickers based on INITIAL position relative to the dynamic size
        const isActive = {
          R: cubie.initialX === offset,
          L: cubie.initialX === -offset,
          U: cubie.initialY === offset,
          D: cubie.initialY === -offset,
          F: cubie.initialZ === offset,
          B: cubie.initialZ === -offset,
        };

        return (
          <group
            key={cubie.id}
            ref={(el) => { if (el) cubieObjectsRef.current[cubie.id] = el; }}
            position={[cubie.x, cubie.y, cubie.z]}
            quaternion={cubie.q} // Apply persisted rotation
          >
            <RoundedBox 
              args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} 
              radius={BEVEL_RADIUS} 
              smoothness={4} 
              material={materials.Plastic}
            />
            
            {isActive.R && <mesh position={[STICKER_OFFSET, 0, 0]} rotation={[0, Math.PI/2, 0]} geometry={stickerGeometry} material={materials.R} />}
            {isActive.L && <mesh position={[-STICKER_OFFSET, 0, 0]} rotation={[0, -Math.PI/2, 0]} geometry={stickerGeometry} material={materials.L} />}
            
            {isActive.U && <mesh position={[0, STICKER_OFFSET, 0]} rotation={[-Math.PI/2, 0, 0]} geometry={stickerGeometry} material={materials.U} />}
            {isActive.D && <mesh position={[0, -STICKER_OFFSET, 0]} rotation={[Math.PI/2, 0, 0]} geometry={stickerGeometry} material={materials.D} />}
            
            {isActive.F && <mesh position={[0, 0, STICKER_OFFSET]} rotation={[0, 0, 0]} geometry={stickerGeometry} material={materials.F} />}
            {isActive.B && <mesh position={[0, 0, -STICKER_OFFSET]} rotation={[0, Math.PI, 0]} geometry={stickerGeometry} material={materials.B} />}
          </group>
        );
      })}
    </group>
  );
};

export default RubiksCube;