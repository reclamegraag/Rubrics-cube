import React, { useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Stars, Sparkles, ContactShadows } from '@react-three/drei';
import { Move, CubeTheme } from './types';
import { DEFAULT_THEME, CUBE_SIZE, PRESET_THEMES } from './constants';
import RubiksCube from './components/RubiksCube';
import { 
  Palette, 
  Shuffle, 
  RotateCcw, 
  Smartphone, 
  Check
} from 'lucide-react';

function App() {
  const [theme, setTheme] = useState<CubeTheme>(DEFAULT_THEME);
  const [activeThemeName, setActiveThemeName] = useState<string>('Classic');
  const [moveQueue, setMoveQueue] = useState<Move[]>([]);
  const [history, setHistory] = useState<Move[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [shakeHint, setShakeHint] = useState(false);

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
    
    const newMoves: Move[] = [];
    for (let i = 0; i < 25; i++) {
      const axis = ['x', 'y', 'z'][Math.floor(Math.random() * 3)] as 'x'|'y'|'z';
      const layer = Math.floor(Math.random() * CUBE_SIZE);
      const direction = Math.random() > 0.5 ? 1 : -1;
      newMoves.push({ axis, layer, direction });
    }
    
    setMoveQueue(prev => [...prev, ...newMoves]);
    setHistory(prev => [...prev, ...newMoves]);
  }, [moveQueue]);

  const handleSolve = () => {
    if (moveQueue.length > 0 || history.length === 0) return;
    setIsShaking(true);
    
    const solveMoves = [...history].reverse().map(m => ({
      ...m,
      direction: (m.direction * -1) as 1 | -1
    }));
    
    setMoveQueue(solveMoves);
    setHistory([]); 
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

  return (
    <div className="w-full h-screen bg-[#050505] relative overflow-hidden font-sans">
      
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [16, 12, 20], fov: 35 }} shadows>
          <OrbitControls 
             enablePan={false} 
             minDistance={15} 
             maxDistance={50}
             // Camera spins automatically, faster when shuffling/solving
             autoRotate={true}
             autoRotateSpeed={isShaking ? 20.0 : 0.8}
             dampingFactor={0.05}
          />
          
          {/* High Quality Studio Lighting */}
          <Environment preset="studio" />
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
            theme={theme} 
            moveQueue={moveQueue} 
            onMoveComplete={onMoveComplete}
            isShaking={isShaking}
          />
          
          <ContactShadows position={[0, -6, 0]} opacity={0.5} scale={30} blur={2} far={6} />
        </Canvas>
      </div>

      {/* HUD / UI */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 sm:p-10">
        
        <div className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-200 to-gray-600 drop-shadow-2xl">
              HYPER<span className="text-indigo-500">CUBE</span>
            </h1>
            <p className="text-indigo-400/80 text-xs tracking-[0.2em] font-bold mt-1 uppercase">
              10x10 Edition
            </p>
          </div>
          
          <button 
            onClick={requestMotionPermission}
            className="bg-white/5 backdrop-blur-md border border-white/10 p-3 rounded-full text-white hover:bg-white/10 hover:scale-110 transition duration-300"
            title="Enable Motion Shake"
          >
            <Smartphone size={20} />
          </button>
        </div>

        {shakeHint && (
           <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-indigo-600/90 backdrop-blur px-6 py-2 rounded-full text-white text-sm font-semibold shadow-2xl animate-bounce">
             Device Motion Enabled: Shake your device!
           </div>
        )}

        <div className="flex flex-col gap-4 pointer-events-auto items-center justify-center w-full max-w-3xl mx-auto mb-4">
          
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 flex gap-3 shadow-2xl shadow-black/50 ring-1 ring-white/5 transform transition-all hover:scale-105">
            
            <button 
              onClick={handleShuffle} 
              disabled={isShaking || moveQueue.length > 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 text-white font-bold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <Shuffle size={18} />
              <span>SHAKE</span>
            </button>

            <button 
              onClick={handleSolve} 
              disabled={isShaking || moveQueue.length > 0 || history.length === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white font-bold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <RotateCcw size={18} />
              <span>SOLVE</span>
            </button>

            <div className="w-px bg-white/10 mx-1 my-2"></div>

            <button 
              onClick={() => setShowThemeSelector(!showThemeSelector)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition active:scale-95 ${showThemeSelector ? 'bg-white text-black shadow-white/20 shadow-lg' : 'bg-white/5 text-white hover:bg-white/10'}`}
            >
              <Palette size={18} />
              <span className="hidden sm:inline">THEME</span>
            </button>
          </div>

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
                        {/* Small visual representation of the palette */}
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
             Matrix: 10x10x10<br/>
             Total Cubies: 1000<br/>
             Moves in Stack: {history.length}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;