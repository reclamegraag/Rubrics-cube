export type Axis = 'x' | 'y' | 'z';

export interface Move {
  axis: Axis;
  layer: number; // 0 to 9
  direction: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
}

export interface CubeTheme {
  U: string; // Up
  D: string; // Down
  L: string; // Left
  R: string; // Right
  F: string; // Front
  B: string; // Back
  core: string; // Inner color
}

export interface CubieData {
  id: number;
  x: number;
  y: number;
  z: number;
  // We store initial positions to map colors correctly, 
  // but for a simple visual simulation, we can just use current coordinates to determine face colors if we don't need to track stickers per piece perfectly in the data model for a specific solver algorithm.
  // However, to preserve colors during rotation, we need to track orientation or current position.
}
