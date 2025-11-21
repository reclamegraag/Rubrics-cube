import React, { useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Stars, Sparkles, ContactShadows } from '@react-three/drei';
import { Move, CubeTheme } from './types';
import { DEFAULT_THEME, DEFAULT_CUBE_SIZE, PRESET_THEMES } from './constants';
import RubiksCube from './components/RubiksCube';
import { 
  Palette, 
  Shuffle, 
  RotateCcw, 
  Smartphone, 
  Check, 
  Gauge,
  Grid3x3,
  Lightbulb,
} from 'lucide-react';

// Reusable Styled Control Button with Tooltip
const ControlButton = ({ 
  onClick, 
  disabled, 
  icon: Icon, 
  label, 
  hotkey, 
  active,
  colorClass = "bg-white/5 hover:bg-white/10 text-white"
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ElementType;
  label: string;
  hotkey?: string;
  active?: boolean;
  colorClass?: string;
}) => (
  <button 
    onClick={onClick} 
    disabled={disabled}
    className={`group relative flex items-center gap-2 px-3 sm:px-5 py-3 rounded-xl font-semibold transition active:scale-95 ${active ? 'bg-white text-black shadow-white/20 shadow-lg' : colorClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <Icon size={18} />
    {/* Tooltip */}
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 hidden group-hover:flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
      <div className="bg-gray-900/90 backdrop-blur-md text-white text-xs px-3 py-2 rounded-lg shadow-2xl whitespace-nowrap flex items-center gap-2 border border-white/10 transform translate-y-1 group-hover:translate-y-0 transition-transform">
        {label}
        {hotkey && (
          <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold min-w-[1.2em] text-center shadow-sm">
            {hotkey}
          </kbd>
        )}
      </div>
      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900/90 mt-[-1px]"></div>
    </div>
  </button>
);

function App() {
  const [theme, setTheme] = useState<CubeTheme>(DEFAULT_THEME);
  const [activeThemeName, setActiveThemeName] = useState<string>('Classic');
  const [cubeSize, setCubeSize] = useState<number>(DEFAULT_CUBE_SIZE);
  const [moveQueue, setMoveQueue] = useState<Move[]>([]);
  const [history, setHistory] = useState<Move[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  
  // Camera & Interaction State
  const [isInteracting, setIsInteracting] = useState(false);
  const [isOrbitEnabled, setIsOrbitEnabled] = useState(true);
  
  // UI Panel States
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [showSizeSelector, setShowSizeSelector] = useState(false);
  
  const [shakeHint, setShakeHint] = useState(false);
  const [hintMessage, setHintMessage] = useState<string | null>(null);
  const [activeHint, setActiveHint] = useState<Move | null>(null);
  const [solveSpeed, setSolveSpeed] = useState(15);

  const isBusy = isShaking || moveQueue.length > 0;

  useEffect(() => {
    let lastX = 0, lastY = 0, lastZ = 0;
    let shakeThreshold = 25; 
    
    const handleMotion = (event: DeviceMotionEvent) => {
      const { accelerationIncludingGravity } = event;
      if (!accelerationIncludingGravity) return;

      const { x, y, z } = accelerationIncludingGravity;
      if (x === null || y === null || z === null) return;

      const deltaX = Math.abs(x - lastX);
      const deltaY = Math.abs(y - lastY);
      const deltaZ = Math.abs(z - lastZ);

      if ((deltaX + deltaY + deltaZ) > shakeThreshold) {
        if (!isShaking && moveQueue.length === 0) {
           handleShuffle();
        }
      }

      lastX = x;
      lastY = y;
      lastZ = z;
    };

    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
       window.addEventListener('devicemotion', handleMotion);
    }

    return () => {
       if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
         window.removeEventListener('devicemotion', handleMotion);
       }
    }
  }, [isShaking, moveQueue]);

  const handleShuffle = useCallback(() => {
    if (moveQueue.length > 0) return;
    setIsShaking(true);
    setActiveHint(null); // Clear hints on shuffle
    
    const newMoves: Move[] = [];
    const shuffleCount = Math.max(25, cubeSize * 2);
    
    for (let i = 0; i < shuffleCount; i++) {
      const axis = ['x', 'y', 'z'][Math.floor(Math.random() * 3)] as 'x'|'y'|'z';
      const layer = Math.floor(Math.random() * cubeSize);
      const direction = Math.random() > 0.5 ? 1 : -1;
      newMoves.push({ axis, layer, direction });
    }
    
    setMoveQueue(prev => [...prev, ...newMoves]);
    setHistory(prev => [...prev, ...newMoves]);
  }, [moveQueue, cubeSize]);

  const handleSolve = useCallback(() => {
    if (moveQueue.length > 0 || history.length === 0) return;
    setIsShaking(true);
    setActiveHint(null);
    
    const solveMoves = [...history].reverse().map(m => ({
      ...m,
      direction: (m.direction * -1) as 1 | -1
    }));
    
    setMoveQueue(solveMoves);
    setHistory([]); 
  }, [history, moveQueue]);

  const handleHint = useCallback(() => {
    if (isBusy) return;
    
    if (history.length === 0) {
      setHintMessage("Cube is perfectly solved!");
      setTimeout(() => setHintMessage(null), 2000);
      return;
    }

    // Calculate the move needed to reverse the last step
    const lastMove = history[history.length - 1];
    const hintMove: Move = {
      axis: lastMove.axis,
      layer: lastMove.layer,
      direction: (lastMove.direction * -1) as 1 | -1
    };

    setActiveHint(hintMove);
    setHintMessage("Follow the arrows to reverse the last move.");
    // Auto-clear message but keep visual hint until move is made
    setTimeout(() => setHintMessage(null), 3000);
  }, [history, isBusy]);

  // Callback for direct touch interaction from RubiksCube component
  const handleDirectMove = (move: Move) => {
    if (isShaking || moveQueue.length > 0) return;
    
    // If a hint is active, check if this move matches the hint
    if (activeHint) {
        // Simple validation: check if we moved the right layer/axis
        // If successful, clear the hint
        if (move.axis === activeHint.axis && move.layer === activeHint.layer) {
           setActiveHint(null);
           
           // If direction matches, pop from history (undo)
           if (move.direction === activeHint.direction) {
             setHistory(prev => prev.slice(0, -1));
             setMoveQueue([move]);
             return;
           }
        } else {
            // Moved wrong part? Just keep going, user overrides hint
            setActiveHint(null);
        }
    }

    setMoveQueue([move]);
    setHistory(prev => [...prev, move]);
  };

  const onMoveComplete = () => {
    setMoveQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0) {
        setIsShaking(false);
      }
      return next;
    });
  };

  const handleSizeChange = (newSize: number) => {
    if (isBusy) return;
    setCubeSize(newSize);
    setHistory([]);
    setMoveQueue([]);
    setActiveHint(null);
  };

  const applyTheme = (name: string) => {
    setTheme(PRESET_THEMES[name]);
    setActiveThemeName(name);
    setShowThemeSelector(false);
  };

  const requestMotionPermission = async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response === 'granted') {
          setShakeHint(true);
          setTimeout(() => setShakeHint(false), 3000);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
       setShakeHint(true);
       setTimeout(() => setShakeHint(false), 3000);
    }
  };

  const togglePanel = (panel: 'theme' | 'size') => {
    if (isBusy) return;
    
    if (panel === 'theme') {
      setShowThemeSelector(!showThemeSelector);
      setShowSizeSelector(false);
    } else if (panel === 'size') {
      setShowSizeSelector(!showSizeSelector);
      setShowThemeSelector(false);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isBusy) return;

      switch(e.key.toLowerCase()) {
        case 's':
          handleShuffle();
          break;
        case 'r':
        case 'enter':
          handleSolve();
          break;
        case 'h':
          handleHint();
          break;
        case 'g':
          togglePanel('size');
          break;
        case 't':
          togglePanel('theme');
          break;
        case 'escape':
          setShowSizeSelector(false);
          setShowThemeSelector(false);
          setActiveHint(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, handleShuffle, handleSolve, handleHint]);


  return (
    <div className="w-full h-screen bg-[#050505] relative overflow-hidden font-sans">
      
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [16, 12, 20], fov: 35 }} shadows>
          <OrbitControls 
             enabled={isOrbitEnabled}
             enablePan={false} 
             minDistance={15} 
             maxDistance={50}
             // Auto rotate stops if interacting, otherwise spins unless shaking handles it
             autoRotate={!isInteracting && !activeHint}
             autoRotateSpeed={isShaking ? 20.0 : 1.0}
             dampingFactor={0.05}
             makeDefault
          />
          
          {/* Changed to 'city' with blur to remove the sharp "white cloud" reflection */}
          <Environment preset="city" blur={0.8} />
          
          <ambientLight intensity={0.4} />
          <spotLight 
            position={[20, 20, 20]} 
            angle={0.15} 
            penumbra={1} 
            intensity={1.5} 
            castShadow 
            shadow-bias={-0.0001}
          />
          <pointLight position={[-10, -10, -10]} intensity={0.5} color={theme.U} />
          
          <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />
          <Sparkles count={40} scale={14} size={3} speed={0.4} opacity={0.2} color={theme.U} />
          
          <RubiksCube 
            key={cubeSize} 
            size={cubeSize}
            theme={theme} 
            moveQueue={moveQueue} 
            onMoveComplete={onMoveComplete}
            onManualMove={handleDirectMove}
            onInteractionChange={setIsInteracting}
            setOrbitEnabled={setIsOrbitEnabled}
            isShaking={isShaking}
            speed={solveSpeed}
            activeHint={activeHint}
          />
          
          <ContactShadows position={[0, -6, 0]} opacity={0.5} scale={30} blur={2} far={6} />
        </Canvas>
      </div>

      {/* UI Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-8">
        
        {/* Header */}
        <div className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-200 to-gray-600 drop-shadow-2xl">
              HYPER<span className="text-indigo-500">CUBE</span>
            </h1>
            <p className="text-indigo-400/80 text-[10px] sm:text-xs tracking-[0.2em] font-bold mt-1 uppercase">
              {cubeSize}x{cubeSize} Edition
            </p>
          </div>
          
          <button 
            onClick={requestMotionPermission}
            className="bg-white/5 backdrop-blur-md border border-white/10 p-3 rounded-full text-white hover:bg-white/10 hover:scale-110 transition duration-300 group relative"
          >
            <Smartphone size={20} />
             <div className="absolute right-0 top-full mt-3 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap border border-white/10 z-50">
               Enable Motion
             </div>
          </button>
        </div>

        {shakeHint && (
           <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-indigo-600/90 backdrop-blur px-6 py-2 rounded-full text-white text-sm font-semibold shadow-2xl animate-bounce">
             Device Motion Enabled: Shake your device!
           </div>
        )}

        {hintMessage && (
           <div className="absolute top-32 left-1/2 -translate-x-1/2 w-full max-w-md px-4 flex justify-center">
             <div className="bg-amber-500/90 backdrop-blur-md text-white px-6 py-3 rounded-full font-bold shadow-2xl animate-bounce flex items-center gap-3 border border-white/20 text-sm sm:text-base">
               <Lightbulb size={20} className="fill-white text-white" />
               {hintMessage}
             </div>
           </div>
        )}

        {/* Main Controls */}
        <div className="flex flex-col-reverse gap-4 pointer-events-auto items-center justify-center w-full max-w-3xl mx-auto mb-8 pb-[env(safe-area-inset-bottom)]">
          
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 flex gap-2 sm:gap-3 shadow-2xl shadow-black/50 ring-1 ring-white/5 transform transition-all relative z-50">
            
            <button 
              onClick={handleShuffle} 
              disabled={isBusy}
              className="group relative flex items-center gap-2 px-4 sm:px-6 py-3 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 text-white font-bold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <Shuffle size={18} />
              <span className="hidden sm:inline">SHAKE</span>
              {/* Custom inline tooltip for main button */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 hidden group-hover:flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                <div className="bg-gray-900/90 backdrop-blur-md text-white text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap flex items-center gap-2 border border-white/10 transform translate-y-1 group-hover:translate-y-0 transition-transform">
                  Shuffle <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shadow-sm">S</kbd>
                </div>
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900/90 mt-[-1px]"></div>
              </div>
            </button>

            <button 
              onClick={handleSolve} 
              disabled={isBusy || history.length === 0}
              className="group relative flex items-center gap-2 px-4 sm:px-6 py-3 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white font-bold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <RotateCcw size={18} />
              <span className="hidden sm:inline">SOLVE</span>
               <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 hidden group-hover:flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                <div className="bg-gray-900/90 backdrop-blur-md text-white text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap flex items-center gap-2 border border-white/10 transform translate-y-1 group-hover:translate-y-0 transition-transform">
                  Solve <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shadow-sm">R</kbd>
                </div>
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900/90 mt-[-1px]"></div>
              </div>
            </button>

            <div className="w-px bg-white/10 mx-1 my-2"></div>

            <ControlButton 
              onClick={handleHint}
              disabled={isBusy}
              icon={Lightbulb}
              label="Hint"
              hotkey="H"
              active={!!activeHint}
            />

            <ControlButton 
              onClick={() => togglePanel('size')}
              disabled={isBusy}
              icon={Grid3x3}
              label="Grid Size"
              hotkey="G"
              active={showSizeSelector}
            />

            <ControlButton 
              onClick={() => togglePanel('theme')}
              disabled={isBusy}
              icon={Palette}
              label="Theme"
              hotkey="T"
              active={showThemeSelector}
            />
          </div>

          {/* Speed Slider (visible when no other panel is open) */}
          {!showSizeSelector && !showThemeSelector && (
            <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md rounded-full px-5 py-2 border border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <Gauge size={16} className="text-indigo-400" />
              <input
                type="range"
                min="1"
                max="50"
                value={solveSpeed}
                onChange={(e) => setSolveSpeed(Number(e.target.value))}
                className="w-32 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <span className="text-xs font-mono text-white/60 w-8 text-right">{solveSpeed}x</span>
            </div>
          )}

          {/* Size Selector Panel */}
          {showSizeSelector && (
             <div className="bg-black/80 backdrop-blur-xl border border-indigo-500/30 p-6 rounded-2xl flex flex-col gap-4 shadow-2xl w-full max-w-md animate-in slide-in-from-bottom-4 fade-in duration-300">
                <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2 text-indigo-300 font-mono text-xs uppercase tracking-wider">
                     <Grid3x3 size={16} /> Cube Dimension
                   </div>
                   <span className="text-2xl font-black text-white">{cubeSize} x {cubeSize}</span>
                </div>
                
                <input
                  type="range"
                  min="2"
                  max="10"
                  step="1"
                  value={cubeSize}
                  onChange={(e) => handleSizeChange(Number(e.target.value))}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                
                <div className="flex justify-between text-[10px] text-white/40 uppercase font-bold tracking-widest">
                  <span>Pocket (2)</span>
                  <span>Max (10)</span>
                </div>
             </div>
          )}

          {/* Theme Selector Panel */}
          {showThemeSelector && (
            <div className="bg-black/80 backdrop-blur-xl border border-indigo-500/30 p-4 rounded-2xl flex flex-wrap justify-center gap-3 shadow-2xl w-full max-w-2xl animate-in slide-in-from-bottom-4 fade-in duration-300">
              {Object.keys(PRESET_THEMES).map((themeName) => (
                <button
                  key={themeName}
                  onClick={() => applyTheme(themeName)}
                  className={`group relative px-4 py-2 rounded-xl border transition-all duration-300 ${activeThemeName === themeName ? 'bg-white/10 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-transparent border-white/10 hover:border-white/40'}`}
                >
                  <div className="flex flex-col items-center gap-2">
                     <div className="flex gap-0.5">
                        {[PRESET_THEMES[themeName].F, PRESET_THEMES[themeName].R, PRESET_THEMES[themeName].U].map((c, i) => (
                          <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                        ))}
                     </div>
                     <span className={`text-xs font-bold uppercase tracking-wider ${activeThemeName === themeName ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>
                       {themeName}
                     </span>
                  </div>
                  {activeThemeName === themeName && (
                    <div className="absolute -top-2 -right-2 bg-indigo-500 rounded-full p-0.5 text-white">
                      <Check size={10} strokeWidth={4} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="hidden sm:block absolute bottom-8 right-8 pointer-events-none text-right">
          <div className="text-white/20 font-mono text-[10px] tracking-widest uppercase leading-relaxed">
             Matrix: {cubeSize}x{cubeSize}x{cubeSize}<br/>
             Total Cubies: {Math.pow(cubeSize, 3)}<br/>
             Moves in Stack: {history.length}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;