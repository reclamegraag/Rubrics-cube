import { CubeTheme } from './types';

export const CUBE_SIZE = 10;
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

// Helper to check if a cubie is on the surface (optimization)
export const isSurface = (x: number, y: number, z: number, size: number) => {
  const limit = (size - 1) / 2;
  return (
    Math.abs(x) === limit ||
    Math.abs(y) === limit ||
    Math.abs(z) === limit
  );
};
