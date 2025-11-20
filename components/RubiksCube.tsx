import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { RoundedBox, Html } from '@react-three/drei';
import * as THREE from 'three';
import { CubeTheme, Move } from '../types';
import { isSurface } from '../constants';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface RubiksCubeProps {
  size: number;
  theme: CubeTheme;
  moveQueue: Move[];
  onMoveComplete: () => void;
  onManualMove?: (move: Move) => void;
  onInteractionChange?: (isInteracting: boolean) => void;
  setOrbitEnabled?: (enabled: boolean) => void;
  isShaking: boolean;
  speed: number;
}

// Visual constants
const BOX_SIZE = 0.90; 
const BEVEL_RADIUS = 0.06; 
const STICKER_OFFSET = 0.455; 
const STICKER_SIZE = 0.80; 
const HIGHLIGHT_OFFSET = 0.46; // Slightly above sticker

// Reusable Geometry
const stickerGeometry = new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE);

const RubiksCube: React.FC<RubiksCubeProps> = ({ 
  size, 
  theme, 
  moveQueue, 
  onMoveComplete, 
  onManualMove,
  onInteractionChange,
  setOrbitEnabled,
  isShaking, 
  speed 
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotatingGroup = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  
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
      // High contrast white highlight
      Highlight: new THREE.MeshBasicMaterial({ 
        color: '#ffffff', 
        transparent: true, 
        opacity: 0.6, 
        depthWrite: false,
        side: THREE.DoubleSide
      })
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
              q: new THREE.Quaternion() 
            });
          }
        }
      }
    }
    return positions;
  }, [size]); 

  const cubiesRef = useRef(initialPositions);
  const cubieObjectsRef = useRef<{ [id: number]: THREE.Object3D }>({});

  if (cubiesRef.current.length !== initialPositions.length) {
      cubiesRef.current = initialPositions;
      cubieObjectsRef.current = {};
  }

  // Animation State
  const [isAnimating, setIsAnimating] = useState(false);
  const animationProgress = useRef(0);
  const currentMove = useRef<Move | null>(null);

  // Interaction State
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hoveredFace, setHoveredFace] = useState<string | null>(null);

  // Selection State for Arrow UI
  const [selection, setSelection] = useState<{
    id: number;
    face: string;
    normal: THREE.Vector3;
    cubiePos: { x: number, y: number, z: number };
  } | null>(null);

  // Reset cursor when unmounting or changing size
  useEffect(() => {
    return () => {
      document.body.style.cursor = 'default';
    };
  }, [size]);

  // Deselect if clicking purely on background
  useEffect(() => {
    const handleMissedClick = () => {
        setSelection(null);
    };
    // We attach a listener to the canvas via the parent logic or just use logic below
    // Since we can't easily attach to 'background' here without a mesh, we rely on clicking X or clicking another cube.
  }, []);

  // Helper to validate if a face is actually on the outside of the main cube
  const isOuterFace = (face: string, cx: number, cy: number, cz: number) => {
    const limit = (size - 1) / 2;
    const epsilon = 0.15; // For floating point safety

    if (face === 'R' && Math.abs(cx - limit) < epsilon) return true;
    if (face === 'L' && Math.abs(cx + limit) < epsilon) return true;
    if (face === 'U' && Math.abs(cy - limit) < epsilon) return true;
    if (face === 'D' && Math.abs(cy + limit) < epsilon) return true;
    if (face === 'F' && Math.abs(cz - limit) < epsilon) return true;
    if (face === 'B' && Math.abs(cz + limit) < epsilon) return true;
    
    return false;
  };

  // --- Interaction Handlers ---

  const handlePointerMove = (e: ThreeEvent<PointerEvent>, id: number) => {
    if (isAnimating || moveQueue.length > 0) return;
    
    e.stopPropagation();
    
    const object = cubieObjectsRef.current[id];
    const cubieData = cubiesRef.current.find(c => c.id === id);
    if (!object || !cubieData) return;

    const localPoint = object.worldToLocal(e.point.clone());
    const absX = Math.abs(localPoint.x);
    const absY = Math.abs(localPoint.y);
    const absZ = Math.abs(localPoint.z);

    let face = '';
    if (absX > absY && absX > absZ) face = localPoint.x > 0 ? 'R' : 'L';
    else if (absY > absX && absY > absZ) face = localPoint.y > 0 ? 'U' : 'D';
    else face = localPoint.z > 0 ? 'F' : 'B';

    if (!isOuterFace(face, cubieData.x, cubieData.y, cubieData.z)) {
        if (hoveredId === id) {
            setHoveredId(null);
            setHoveredFace(null);
            document.body.style.cursor = 'default';
        }
        return;
    }

    if (hoveredId !== id || hoveredFace !== face) {
        setHoveredId(id);
        setHoveredFace(face);
        document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    setHoveredId(null);
    setHoveredFace(null);
    document.body.style.cursor = 'default';
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>, cubieId: number) => {
    if (isAnimating || moveQueue.length > 0) return;
    
    e.stopPropagation(); 
    
    const object = cubieObjectsRef.current[cubieId];
    const cubieData = cubiesRef.current.find(c => c.id === cubieId);
    if (!object || !cubieData) return;

    const localPoint = object.worldToLocal(e.point.clone());
    const absX = Math.abs(localPoint.x);
    const absY = Math.abs(localPoint.y);
    const absZ = Math.abs(localPoint.z);
    
    let normal = new THREE.Vector3(0, 0, 0);
    let face = '';

    if (absX > absY && absX > absZ) {
        normal.set(Math.sign(localPoint.x), 0, 0);
        face = localPoint.x > 0 ? 'R' : 'L';
    }
    else if (absY > absX && absY > absZ) {
        normal.set(0, Math.sign(localPoint.y), 0);
        face = localPoint.y > 0 ? 'U' : 'D';
    }
    else {
        normal.set(0, 0, Math.sign(localPoint.z));
        face = localPoint.z > 0 ? 'F' : 'B';
    }

    if (!isOuterFace(face, cubieData.x, cubieData.y, cubieData.z)) {
        setSelection(null);
        return;
    }

    // Apply rotation to normal to get world space normal
    const worldNormal = normal.clone().applyQuaternion(object.quaternion).round();
    
    setSelection({
        id: cubieId,
        face: face,
        normal: worldNormal,
        cubiePos: { ...cubieData }
    });

    if (onInteractionChange) onInteractionChange(true);
  };

  const handleArrowClick = (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
    if (!selection || !onManualMove) return;

    // Calculate Camera Vectors
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    
    // Assume standard Up unless rolled heavily, but we use cross product for robustness
    // If camera is looking straight down/up, we need safe fallbacks
    let camUp = camera.up.clone();
    let camRight = new THREE.Vector3().crossVectors(viewDir, camUp).normalize();
    let realCamUp = new THREE.Vector3().crossVectors(camRight, viewDir).normalize();

    // Determine desired visual movement direction in world space
    let moveVec = new THREE.Vector3();
    if (dir === 'UP') moveVec.copy(realCamUp);
    if (dir === 'DOWN') moveVec.copy(realCamUp).negate();
    if (dir === 'RIGHT') moveVec.copy(camRight);
    if (dir === 'LEFT') moveVec.copy(camRight).negate();

    // Logic: Rotation Axis = FaceNormal x MoveDirection
    // Example: Face Normal (0,0,1) [Front], Move Up (0,1,0) -> Axis (-1, 0, 0) [Left/Right Axis]
    const rotationAxisVec = new THREE.Vector3().crossVectors(selection.normal, moveVec);
    
    // Snap to nearest cardinal axis
    let axis: 'x' | 'y' | 'z' = 'x';
    let maxComp = 0;
    if (Math.abs(rotationAxisVec.x) > maxComp) { maxComp = Math.abs(rotationAxisVec.x); axis = 'x'; }
    if (Math.abs(rotationAxisVec.y) > maxComp) { maxComp = Math.abs(rotationAxisVec.y); axis = 'y'; }
    if (Math.abs(rotationAxisVec.z) > maxComp) { maxComp = Math.abs(rotationAxisVec.z); axis = 'z'; }

    // Determine direction sign based on the snapped axis
    // We need to re-verify direction because cross product gives torque vector.
    // The rotation sign around that axis depends on coordinate system.
    // Visual check: Face F(Z+), Move U(Y+) -> Cross(-X). Rotation around X in negative direction moves Y+ to Z+. Correct.
    // So we use the sign of the computed cross product component directly.
    const sign = Math.sign(rotationAxisVec[axis]) || 1;

    const offset = (size - 1) / 2;
    let layerIndex = 0;
    if (axis === 'x') layerIndex = Math.round(selection.cubiePos.x + offset);
    if (axis === 'y') layerIndex = Math.round(selection.cubiePos.y + offset);
    if (axis === 'z') layerIndex = Math.round(selection.cubiePos.z + offset);

    onManualMove({
        axis,
        layer: layerIndex,
        direction: sign as 1 | -1
    });

    // Deselect after move to require new selection for next move
    setSelection(null);
    if (onInteractionChange) onInteractionChange(false);
  };

  // --- Helper: Robust Snapping ---
  const snapTransform = (obj: THREE.Object3D) => {
    const snap = (val: number) => {
        const epsilon = 0.001;
        if (size % 2 === 0) {
            return Math.round(val - 0.5 + epsilon) + 0.5;
        } else {
            return Math.round(val + epsilon);
        }
    };
    obj.position.x = snap(obj.position.x);
    obj.position.y = snap(obj.position.y);
    obj.position.z = snap(obj.position.z);

    obj.updateMatrix();
    const euler = new THREE.Euler().setFromQuaternion(obj.quaternion);
    const snapAngle = (angle: number) => Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
    obj.rotation.set(snapAngle(euler.x), snapAngle(euler.y), snapAngle(euler.z));
    obj.updateMatrix();
  };

  // --- Animation Loop ---
  useFrame((state, delta) => {
    if (isAnimating && currentMove.current && rotatingGroup.current) {
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
    
    if(rotatingGroup.current) {
      rotatingGroup.current.rotation.set(0,0,0);
      rotatingGroup.current.position.set(0,0,0);
      rotatingGroup.current.scale.set(1,1,1);
      rotatingGroup.current.updateMatrixWorld();
    }

    let attachedCount = 0;

    cubiesRef.current.forEach(cubie => {
      let inSlice = false;
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

    if (attachedCount === 0) {
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

    cubiesRef.current.forEach(cubie => {
      const obj = cubieObjectsRef.current[cubie.id];
      if (obj) {
        cubie.x = obj.position.x;
        cubie.y = obj.position.y;
        cubie.z = obj.position.z;
        cubie.q.copy(obj.quaternion);
      }
    });

    // Update selection pos if valid
    if (selection) {
        const selCubie = cubiesRef.current.find(c => c.id === selection.id);
        if (selCubie) {
             setSelection(prev => prev ? ({...prev, cubiePos: {...selCubie}}) : null);
        }
    }

    rotatingGroup.current.rotation.set(0,0,0);
    rotatingGroup.current.updateMatrix();
    
    setIsAnimating(false);
    currentMove.current = null;
    onMoveComplete();
  };

  const offset = (size - 1) / 2;
  const displayScale = 10 / Math.max(size, 5);

  return (
    <group 
        ref={groupRef} 
        scale={displayScale} 
        onPointerLeave={() => { 
            setHoveredId(null); 
            setHoveredFace(null); 
            document.body.style.cursor = 'default'; 
        }}
    >
      <group ref={rotatingGroup} />
      
      {cubiesRef.current.map((cubie) => {
        const isActive = {
          R: cubie.initialX === offset,
          L: cubie.initialX === -offset,
          U: cubie.initialY === offset,
          D: cubie.initialY === -offset,
          F: cubie.initialZ === offset,
          B: cubie.initialZ === -offset,
        };
        
        const isHovered = hoveredId === cubie.id;
        const isSelected = selection?.id === cubie.id;
        
        // Determine which face to highlight: hover takes precedence visually for pointer location, 
        // but selection persists. 
        // If selected, we show the selection highlight. 
        // If just hovered, we show hover highlight.
        const activeFace = isSelected ? selection?.face : (isHovered ? hoveredFace : null);
        
        return (
          <group
            key={cubie.id}
            ref={(el) => { if (el) cubieObjectsRef.current[cubie.id] = el; }}
            position={[cubie.x, cubie.y, cubie.z]}
            quaternion={cubie.q}
            onPointerDown={(e) => handlePointerDown(e, cubie.id)}
            onPointerMove={(e) => handlePointerMove(e, cubie.id)}
            onPointerOut={handlePointerOut}
          >
            <RoundedBox 
              args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} 
              radius={BEVEL_RADIUS} 
              smoothness={4} 
              material={materials.Plastic}
            />
            
            {/* Stickers */}
            {isActive.R && <mesh position={[STICKER_OFFSET, 0, 0]} rotation={[0, Math.PI/2, 0]} geometry={stickerGeometry} material={materials.R} />}
            {isActive.L && <mesh position={[-STICKER_OFFSET, 0, 0]} rotation={[0, -Math.PI/2, 0]} geometry={stickerGeometry} material={materials.L} />}
            
            {isActive.U && <mesh position={[0, STICKER_OFFSET, 0]} rotation={[-Math.PI/2, 0, 0]} geometry={stickerGeometry} material={materials.U} />}
            {isActive.D && <mesh position={[0, -STICKER_OFFSET, 0]} rotation={[Math.PI/2, 0, 0]} geometry={stickerGeometry} material={materials.D} />}
            
            {isActive.F && <mesh position={[0, 0, STICKER_OFFSET]} rotation={[0, 0, 0]} geometry={stickerGeometry} material={materials.F} />}
            {isActive.B && <mesh position={[0, 0, -STICKER_OFFSET]} rotation={[0, Math.PI, 0]} geometry={stickerGeometry} material={materials.B} />}

            {/* Face Highlight - Hover or Selection */}
            {(isHovered || isSelected) && !isAnimating && moveQueue.length === 0 && activeFace && (
              <>
                {activeFace === 'R' && <mesh raycast={() => null} position={[HIGHLIGHT_OFFSET, 0, 0]} rotation={[0, Math.PI/2, 0]} geometry={stickerGeometry} material={materials.Highlight} />}
                {activeFace === 'L' && <mesh raycast={() => null} position={[-HIGHLIGHT_OFFSET, 0, 0]} rotation={[0, -Math.PI/2, 0]} geometry={stickerGeometry} material={materials.Highlight} />}
                {activeFace === 'U' && <mesh raycast={() => null} position={[0, HIGHLIGHT_OFFSET, 0]} rotation={[-Math.PI/2, 0, 0]} geometry={stickerGeometry} material={materials.Highlight} />}
                {activeFace === 'D' && <mesh raycast={() => null} position={[0, -HIGHLIGHT_OFFSET, 0]} rotation={[Math.PI/2, 0, 0]} geometry={stickerGeometry} material={materials.Highlight} />}
                {activeFace === 'F' && <mesh raycast={() => null} position={[0, 0, HIGHLIGHT_OFFSET]} rotation={[0, 0, 0]} geometry={stickerGeometry} material={materials.Highlight} />}
                {activeFace === 'B' && <mesh raycast={() => null} position={[0, 0, -HIGHLIGHT_OFFSET]} rotation={[0, Math.PI, 0]} geometry={stickerGeometry} material={materials.Highlight} />}
              </>
            )}

            {/* Controls Overlay - Only for selected cube and face */}
            {isSelected && activeFace && (
                <Html position={[
                    activeFace === 'R' ? HIGHLIGHT_OFFSET : activeFace === 'L' ? -HIGHLIGHT_OFFSET : 0,
                    activeFace === 'U' ? HIGHLIGHT_OFFSET : activeFace === 'D' ? -HIGHLIGHT_OFFSET : 0,
                    activeFace === 'F' ? HIGHLIGHT_OFFSET : activeFace === 'B' ? -HIGHLIGHT_OFFSET : 0
                ]} center zIndexRange={[100, 0]} distanceFactor={12}>
                    <div className="relative w-32 h-32 flex flex-col items-center justify-center pointer-events-auto select-none">
                        <button 
                            onPointerDown={(e) => { e.stopPropagation(); handleArrowClick('UP'); }}
                            className="absolute -top-8 bg-white/90 text-black p-2 rounded-full hover:bg-white hover:scale-110 transition shadow-lg active:bg-indigo-500 active:text-white"
                        >
                            <ChevronUp size={24} strokeWidth={3} />
                        </button>
                        <button 
                             onPointerDown={(e) => { e.stopPropagation(); handleArrowClick('DOWN'); }}
                            className="absolute -bottom-8 bg-white/90 text-black p-2 rounded-full hover:bg-white hover:scale-110 transition shadow-lg active:bg-indigo-500 active:text-white"
                        >
                            <ChevronDown size={24} strokeWidth={3} />
                        </button>
                        <button 
                             onPointerDown={(e) => { e.stopPropagation(); handleArrowClick('LEFT'); }}
                            className="absolute -left-8 bg-white/90 text-black p-2 rounded-full hover:bg-white hover:scale-110 transition shadow-lg active:bg-indigo-500 active:text-white"
                        >
                            <ChevronLeft size={24} strokeWidth={3} />
                        </button>
                        <button 
                             onPointerDown={(e) => { e.stopPropagation(); handleArrowClick('RIGHT'); }}
                            className="absolute -right-8 bg-white/90 text-black p-2 rounded-full hover:bg-white hover:scale-110 transition shadow-lg active:bg-indigo-500 active:text-white"
                        >
                            <ChevronRight size={24} strokeWidth={3} />
                        </button>
                        
                        {/* Close Button */}
                        <button 
                            onPointerDown={(e) => { e.stopPropagation(); setSelection(null); if (onInteractionChange) onInteractionChange(false); }}
                            className="absolute bg-red-500/90 text-white p-1.5 rounded-full hover:bg-red-500 transition shadow-lg"
                        >
                            <X size={16} strokeWidth={3} />
                        </button>
                    </div>
                </Html>
            )}
          </group>
        );
      })}
    </group>
  );
};

export default RubiksCube;