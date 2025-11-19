import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { CubeTheme, Move } from '../types';
import { CUBE_SIZE, isSurface } from '../constants';

interface RubiksCubeProps {
  theme: CubeTheme;
  moveQueue: Move[];
  onMoveComplete: () => void;
  isShaking: boolean;
}

// Visual constants
const BOX_SIZE = 0.90; // Slightly smaller for cleaner gaps
const BEVEL_RADIUS = 0.06; // Tighter radius for a tech look
const STICKER_OFFSET = 0.455; // Position of the sticker relative to center
const STICKER_SIZE = 0.80; // Size of the colored tile

// Reusable Geometry to save memory
const stickerGeometry = new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE);

const RubiksCube: React.FC<RubiksCubeProps> = ({ theme, moveQueue, onMoveComplete, isShaking }) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotatingGroup = useRef<THREE.Group>(null);
  
  // --- Material Setup ---
  const materials = useMemo(() => {
    const matSettings = {
      roughness: 0.05, // Shinier
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
    const offset = (CUBE_SIZE - 1) / 2;
    let id = 0;

    for (let x = 0; x < CUBE_SIZE; x++) {
      for (let y = 0; y < CUBE_SIZE; y++) {
        for (let z = 0; z < CUBE_SIZE; z++) {
          const lx = x - offset;
          const ly = y - offset;
          const lz = z - offset;
          
          // Only render surface cubes for performance
          if (isSurface(lx, ly, lz, CUBE_SIZE)) {
            positions.push({ 
              id: id++, 
              x: lx, y: ly, z: lz,
              initialX: lx, initialY: ly, initialZ: lz 
            });
          }
        }
      }
    }
    return positions;
  }, []);

  const cubiesRef = useRef(initialPositions);
  const cubieObjectsRef = useRef<{ [id: number]: THREE.Object3D }>({});

  // Animation State
  const [isAnimating, setIsAnimating] = useState(false);
  const animationProgress = useRef(0);
  const currentMove = useRef<Move | null>(null);

  // --- Helper: Robust Snapping ---
  const snapTransform = (obj: THREE.Object3D) => {
    // 1. Snap Position to strictly match grid
    // The grid is always centered, so positions are like -4.5, -3.5, ... 3.5, 4.5
    const snap = (val: number) => {
        // Round to nearest .5
        return Math.round(val - 0.5) + 0.5;
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
      // Process queue very fast if shaking
      const speed = isShaking ? 50 : 6; 
      animationProgress.current += delta * speed;
      
      const targetRotation = (Math.PI / 2) * currentMove.current.direction;
      let currentRot = 0;

      if (animationProgress.current >= Math.PI / 2) {
        // Ensure we hit the exact target before finishing
        currentRot = targetRotation;
        rotatingGroup.current.setRotationFromAxisAngle(
            new THREE.Vector3(
                currentMove.current.axis === 'x' ? 1 : 0,
                currentMove.current.axis === 'y' ? 1 : 0,
                currentMove.current.axis === 'z' ? 1 : 0
            ), 
            currentRot
        );
        rotatingGroup.current.updateMatrixWorld(); // Force update before detach
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

    const offset = (CUBE_SIZE - 1) / 2;
    const coordinateValue = move.layer - offset; 
    
    // Increased epsilon to prevent "missed" blocks during fast floating point math
    const EPSILON = 0.6;

    if(rotatingGroup.current) {
      rotatingGroup.current.rotation.set(0,0,0);
      rotatingGroup.current.position.set(0,0,0);
      rotatingGroup.current.scale.set(1,1,1);
      rotatingGroup.current.updateMatrixWorld();
    }

    cubiesRef.current.forEach(cubie => {
      let inSlice = false;
      // Use the LOGICAL coordinates to select pieces, not physical ones (avoids drift)
      if (move.axis === 'x' && Math.abs(cubie.x - coordinateValue) < EPSILON) inSlice = true;
      if (move.axis === 'y' && Math.abs(cubie.y - coordinateValue) < EPSILON) inSlice = true;
      if (move.axis === 'z' && Math.abs(cubie.z - coordinateValue) < EPSILON) inSlice = true;

      if (inSlice) {
        const obj = cubieObjectsRef.current[cubie.id];
        if (obj && rotatingGroup.current) {
          rotatingGroup.current.attach(obj);
        }
      }
    });
  };

  const finishMove = () => {
    if (!currentMove.current || !rotatingGroup.current || !groupRef.current) return;

    const children = [...rotatingGroup.current.children];
    
    // 1. Detach and Snap immediately
    children.forEach(child => {
      groupRef.current?.attach(child);
      snapTransform(child);
    });

    // 2. Update Logical Coordinates from the Snapped Physical Positions
    cubiesRef.current.forEach(cubie => {
      const obj = cubieObjectsRef.current[cubie.id];
      if (obj) {
        // Trust the snapped position directly
        cubie.x = obj.position.x;
        cubie.y = obj.position.y;
        cubie.z = obj.position.z;
      }
    });

    // 3. Cleanup
    rotatingGroup.current.rotation.set(0,0,0);
    rotatingGroup.current.updateMatrix();
    
    setIsAnimating(false);
    currentMove.current = null;
    onMoveComplete();
  };

  const offset = (CUBE_SIZE - 1) / 2;

  return (
    <group ref={groupRef}>
      <group ref={rotatingGroup} />
      
      {cubiesRef.current.map((cubie) => {
        // Determine faces based on INITIAL position for stickers
        // This ensures the "colors" stick to the pieces correctly regardless of current rotation
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
          >
            {/* The Body */}
            <RoundedBox 
              args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} 
              radius={BEVEL_RADIUS} 
              smoothness={4} 
              material={materials.Plastic}
            />
            
            {/* Stickers - Physically separate geometry to eliminate Z-fighting flicker */}
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