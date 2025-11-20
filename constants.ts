import { CubeTheme } from './types';

export const DEFAULT_CUBE_SIZE = 10;
export const ANIMATION_SPEED = 300; // ms per 90 degree turn

export const DEFAULT_THEME: CubeTheme = {
  U: '#ffffff', // White
  D: '#ffd500', // Yellow
  L: '#ff5800', // Orange
  R: '#b71234', // Red
  F: '#009b48', // Green
  B: '#0046ad', // Blue
  core: '#1a1a1a'
};

export const PRESET_THEMES: Record<string, CubeTheme> = {
  "Classic": DEFAULT_THEME,
  "Neon Night": {
    U: '#ffffff', D: '#faff00', L: '#ff00ff', R: '#00ffff', F: '#39ff14', B: '#1b03a3', core: '#000000'
  },
  "Cotton Candy": {
    U: '#ffebf7', D: '#e0f7fa', L: '#ffb7b2', R: '#ffdac1', F: '#e2f0cb', B: '#b5ead7', core: '#2d2d2d'
  },
  "Matrix": {
    U: '#00ff00', D: '#003b00', L: '#008f11', R: '#00dd00', F: '#ccffcc', B: '#001a00', core: '#050505'
  },
  "Ocean Depth": {
    U: '#E0F7FA', D: '#006064', L: '#4DD0E1', R: '#00BCD4', F: '#0097A7', B: '#00838F', core: '#001014'
  },
  "Sunset": {
    U: '#FDCB82', D: '#3E2723', L: '#FF7043', R: '#F4511E', F: '#FFAB91', B: '#BF360C', core: '#1a0500'
  },
  "Monochrome": {
    U: '#ffffff', D: '#000000', L: '#aaaaaa', R: '#555555', F: '#dddddd', B: '#222222', core: '#111111'
  },
  "Royal": {
    U: '#F3E5F5', D: '#4A148C', L: '#CE93D8', R: '#BA68C8', F: '#AB47BC', B: '#7B1FA2', core: '#180029'
  }
};

// Helper to check if a cubie is on the surface (optimization)
export const isSurface = (x: number, y: number, z: number, size: number) => {
  const limit = (size - 1) / 2;
  // Use a small epsilon for float comparison safety, though logic usually holds for .5 steps
  const epsilon = 0.01;
  return (
    Math.abs(Math.abs(x) - limit) < epsilon ||
    Math.abs(Math.abs(y) - limit) < epsilon ||
    Math.abs(Math.abs(z) - limit) < epsilon
  );
};