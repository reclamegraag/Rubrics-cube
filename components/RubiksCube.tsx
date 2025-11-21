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
  activeHint: Move | null;
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
  speed,
  activeHint
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotatingGroup = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  
  // Ref for tracking touch/click movement for robust tap detection
  const clickStartRef = useRef<{ x: number, y: number } | null>(null);

  // --- Material Setup ---
  const materials = useMemo(() => {
    // Reduced roughness and clearcoat to avoid "white cloud" glare
    const matSettings = {
      roughness: 0.2, 
      metalness: 0.0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.2,
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

  // --- Hint Logic: Auto-select when activeHint changes ---
  useEffect(() => {
    if (activeHint && cubiesRef.current.length > 0) {
      const offset = (size - 1) / 2;
      const targetLayerCoord = activeHint.layer - offset;
      
      // Find a cubie that is part of the layer to rotate AND is on a visible face
      // For X and Y axis rotations, the Front face (F) is usually best.
      // For Z axis rotation, the Up face (U) is usually best.
      
      let preferredFace = 'F';
      if (activeHint.axis === 'z') preferredFace = 'U';

      const candidate = cubiesRef.current.find(c => {
        // Must be on the target layer
        let onLayer = false;
        if (activeHint.axis === 'x' && Math.abs(c.x - targetLayerCoord) < 0.1) onLayer = true;
        if (activeHint.axis === 'y' && Math.abs(c.y - targetLayerCoord) < 0.1) onLayer = true;
        if (activeHint.axis === 'z' && Math.abs(c.z - targetLayerCoord) < 0.1) onLayer = true;
        if (!onLayer) return false;

        // Must be on the preferred face
        if (preferredFace === 'F' && Math.abs(c.z - offset) < 0.1) return true;
        if (preferredFace === 'U' && Math.abs(c.y - offset) < 0.1) return true;
        
        return false;
      });

      if (candidate && cubieObjectsRef.current[candidate.id]) {
        const obj = cubieObjectsRef.current[candidate.id];
        
        let normalVector = new THREE.Vector3(0, 0, 1); // Default F
        if (preferredFace === 'U') normalVector.set(0, 1, 0);

        // Apply object rotation to normal
        const worldNormal = normalVector.applyQuaternion(obj.quaternion).round();

        setSelection({
          id: candidate.id,
          face: preferredFace,
          normal: worldNormal,
          cubiePos: { ...candidate }
        });
      }
    } else {
      // Clear selection if hint is cleared
      if (!activeHint) setSelection(null);
    }
  }, [activeHint, size]);

  // Reset cursor when unmounting or changing size
  useEffect(() => {
    return () => {
      document.body.style.cursor = 'default';
    };
  }, [size]);

  // Helper to validate if a face is actually pointing outwards in world space
  const checkFaceOrientation = (localFace: string, object: THREE.Object3D, cx: number, cy: number, cz: number) => {
    const limit = (size - 1) / 2;
    const epsilon = 0.25; 
    
    const localNormal = new THREE.Vector3();
    if (localFace === 'R') localNormal.set(1, 0, 0);
    else if (localFace === 'L') localNormal.set(-1, 0, 0);
    else if (localFace === 'U') localNormal.set(0, 1, 0);
    else if (localFace === 'D') localNormal.set(0, -1, 0);
    else if (localFace === 'F') localNormal.set(0, 0, 1);
    else if (localFace === 'B') localNormal.set(0, 0, -1);

    const worldNormal = localNormal.applyQuaternion(object.quaternion);

    if (worldNormal.x > 0.9 && cx > limit - epsilon) return true;
    if (worldNormal.x < -0.9 && cx < -limit + epsilon) return true;
    if (worldNormal.y > 0.9 && cy > limit - epsilon) return true;
    if (worldNormal.y < -0.9 && cy < -limit + epsilon) return true;
    if (worldNormal.z > 0.9 && cz > limit - epsilon) return true;
    if (worldNormal.z < -0.9 && cz < -limit + epsilon) return true;

    return false;
  };

  // --- Interaction Handlers ---

  const handlePointerMove = (e: ThreeEvent<PointerEvent>, id: number) => {
    if (e.pointerType === 'touch') return;
    if (isAnimating || moveQueue.length > 0 || activeHint) return; // Disable hover during hint
    
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

    if (!checkFaceOrientation(face, object, cubieData.x, cubieData.y, cubieData.z)) {
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

  const handleClick = (e: ThreeEvent<PointerEvent>, cubieId: number) => {
    if (isAnimating || moveQueue.length > 0 || activeHint) return; // Lock manual selection during hint
    
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

    if (!checkFaceOrientation(face, object, cubieData.x, cubieData.y, cubieData.z)) {
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

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    clickStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>, cubieId: number) => {
    if (!clickStartRef.current) return;
    
    const deltaX = Math.abs(e.clientX - clickStartRef.current.x);
    const deltaY = Math.abs(e.clientY - clickStartRef.current.y);
    clickStartRef.current = null;

    // Tolerance for mobile tap (20px) to allow slight finger slips
    if (deltaX < 20 && deltaY < 20) {
        handleClick(e, cubieId);
    }
  };

  const handleArrowClick = (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
    if (!selection || !onManualMove) return;

    // Calculate Camera Vectors
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    
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
    const rotationAxisVec = new THREE.Vector3().crossVectors(selection.normal, moveVec);
    
    // Snap to nearest cardinal axis
    let axis: 'x' | 'y' | 'z' = 'x';
    let maxComp = 0;
    if (Math.abs(rotationAxisVec.x) > maxComp) { maxComp = Math.abs(rotationAxisVec.x); axis = 'x'; }
    if (Math.abs(rotationAxisVec.y) > maxComp) { maxComp = Math.abs(rotationAxisVec.y); axis = 'y'; }
    if (Math.abs(rotationAxisVec.z) > maxComp) { maxComp = Math.abs(rotationAxisVec.z); axis = 'z'; }

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

  // Determine hint state
  const isHintActive = !!activeHint && !!selection;
  
  // Logic for arrow visibility during hint:
  // X-axis: Up/Down arrows
  // Y-axis: Left/Right arrows
  // Z-axis (on U face): Left/Right arrows
  const showUpDown = !isHintActive || (activeHint?.axis === 'x');
  const showLeftRight = !isHintActive || (activeHint?.axis === 'y' || activeHint?.axis === 'z');

  // Logic for arrow highlighting (which arrow is correct?)
  // This requires mapping the visual arrow to the axis/direction
  const isCorrectArrow = (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
      if (!isHintActive || !activeHint) return false;
      const d = activeHint.direction;
      const a = activeHint.axis;
      
      // Mapping based on standard view assumptions
      // X-Axis (Vertical Slice) on Front Face:
      // Dir 1 (X+) -> DOWN visual
      // Dir -1 (X-) -> UP visual
      if (a === 'x') {
         if (d === 1 && dir === 'DOWN') return true;
         if (d === -1 && dir === 'UP') return true;
      }

      // Y-Axis (Horizontal Slice) on Front Face:
      // Dir 1 (Y+) -> RIGHT visual
      // Dir -1 (Y-) -> LEFT visual
      if (a === 'y') {
          if (d === 1 && dir === 'RIGHT') return true;
          if (d === -1 && dir === 'LEFT') return true;
      }

      // Z-Axis (Depth Slice) on UP Face:
      // Dir 1 (Z+) -> LEFT visual
      // Dir -1 (Z-) -> RIGHT visual
      if (a === 'z') {
          if (d === 1 && dir === 'LEFT') return true;
          if (d === -1 && dir === 'RIGHT') return true;
      }

      return false;
  };
  
  const getArrowClass = (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', isVisible: boolean) => {
    if (!isVisible) return "hidden";
    
    const isCorrect = isCorrectArrow(dir);
    
    // If Hint is active: 
    // - Correct arrow: Pulsing Green
    // - Opposite arrow: Visible but Dim (to show opposing pair)
    // - Irrelevant arrows: Hidden (handled by isVisible)
    if (isHintActive) {
        if (isCorrect) {
            return "bg-emerald-500 text-white scale-125 animate-pulse ring-4 ring-emerald-500/30 z-20 p-2 rounded-full shadow-xl flex items-center justify-center";
        } else {
            return "bg-white/40 text-black scale-90 opacity-80 z-10 p-2 rounded-full shadow-lg flex items-center justify-center";
        }
    }

    // Normal interaction styling
    return "bg-white/90 text-black hover:bg-white hover:scale-110 active:bg-indigo-500 active:text-white transition p-2 rounded-full shadow-lg flex items-center justify-center";
  };

  return (
    <group 
        ref={groupRef} 
        scale={displayScale} 
        onPointerMissed={(e) => {
            if (e.type === 'click' && selection && !activeHint) {
                setSelection(null);
            }
        }}
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
        
        const activeFace = isSelected ? selection?.face : (isHovered ? hoveredFace : null);
        
        return (
          <group
            key={cubie.id}
            ref={(el) => { if (el) cubieObjectsRef.current[cubie.id] = el; }}
            position={[cubie.x, cubie.y, cubie.z]}
            quaternion={cubie.q}
            onPointerDown={handlePointerDown}
            onPointerUp={(e) => handlePointerUp(e, cubie.id)}
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
                {['R','L','U','D','F','B'].map(face => {
                    if (face !== activeFace) return null;
                    const pos: [number, number, number] = 
                        face === 'R' ? [HIGHLIGHT_OFFSET, 0, 0] :
                        face === 'L' ? [-HIGHLIGHT_OFFSET, 0, 0] :
                        face === 'U' ? [0, HIGHLIGHT_OFFSET, 0] :
                        face === 'D' ? [0, -HIGHLIGHT_OFFSET, 0] :
                        face === 'F' ? [0, 0, HIGHLIGHT_OFFSET] : [0, 0, -HIGHLIGHT_OFFSET];
                    const rot: [number, number, number] =
                        face === 'R' ? [0, Math.PI/2, 0] :
                        face === 'L' ? [0, -Math.PI/2, 0] :
                        face === 'U' ? [-Math.PI/2, 0, 0] :
                        face === 'D' ? [Math.PI/2, 0, 0] :
                        face === 'F' ? [0, 0, 0] : [0, Math.PI, 0];
                    
                    return (
                        <mesh key={face} raycast={() => null} position={pos} rotation={rot} geometry={stickerGeometry} material={materials.Highlight} />
                    );
                })}
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
                        
                        {/* Up Arrow */}
                        <button 
                            onPointerDown={(e) => { e.stopPropagation(); handleArrowClick('UP'); }}
                            className={`absolute -top-10 ${getArrowClass('UP', showUpDown)}`}
                        >
                            <ChevronUp size={24} strokeWidth={3} />
                        </button>

                        {/* Down Arrow */}
                        <button 
                             onPointerDown={(e) => { e.stopPropagation(); handleArrowClick('DOWN'); }}
                             className={`absolute -bottom-10 ${getArrowClass('DOWN', showUpDown)}`}
                        >
                            <ChevronDown size={24} strokeWidth={3} />
                        </button>

                        {/* Left Arrow */}
                        <button 
                             onPointerDown={(e) => { e.stopPropagation(); handleArrowClick('LEFT'); }}
                             className={`absolute -left-10 ${getArrowClass('LEFT', showLeftRight)}`}
                        >
                            <ChevronLeft size={24} strokeWidth={3} />
                        </button>

                        {/* Right Arrow */}
                        <button 
                             onPointerDown={(e) => { e.stopPropagation(); handleArrowClick('RIGHT'); }}
                             className={`absolute -right-10 ${getArrowClass('RIGHT', showLeftRight)}`}
                        >
                            <ChevronRight size={24} strokeWidth={3} />
                        </button>
                        
                        {/* Close Button (Hide if hint is active to force them to move) */}
                        {!isHintActive && (
                          <button 
                              onPointerDown={(e) => { e.stopPropagation(); setSelection(null); if (onInteractionChange) onInteractionChange(false); }}
                              className="absolute bg-red-500/90 text-white p-1.5 rounded-full hover:bg-red-500 transition shadow-lg z-0 opacity-60 hover:opacity-100"
                          >
                              <X size={16} strokeWidth={3} />
                          </button>
                        )}
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