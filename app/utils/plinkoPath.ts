import { useMemo } from 'react';
import { PATH_COLORS } from './plinkoPhysics';

// Types for pin and path data
export interface PinPosition {
  x: number;
  y: number;
  row: number;
}

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathState {
  paths: PathPoint[][];
  selectedPath: number | null;
}

// Group pins by row for path calculation
export function groupPinsByRow(pinPositions: PinPosition[]): { x: number, y: number }[][] {
  const pinsByRow: { x: number, y: number }[][] = [];
  let lastRowIndex = -1;
  
  // Group pins by row
  pinPositions.forEach(pin => {
    if (pin.row !== lastRowIndex) {
      pinsByRow[pin.row] = [];
      lastRowIndex = pin.row;
    }
    pinsByRow[pin.row].push({ x: pin.x, y: pin.y });
  });
  
  // Sort pins in each row by x position
  pinsByRow.forEach(row => row.sort((a, b) => a.x - b.x));
  
  return pinsByRow;
}

// Calculate path for a ball dropping through the pins
export function calculatePath(
  startX: number,
  pins: PinPosition[],
  pinRadius: number,
  rows: number,
  multipliers: number[],
  boardWidth: number
): PathPoint[] {
  // Initialize path with starting position
  const path: PathPoint[] = [{ x: startX, y: 0 }];
  let currentX = startX;
  let currentY = 0;
  
  // Group pins by row
  const pinsByRow: PinPosition[][] = [];
  for (let i = 0; i < rows; i++) {
    pinsByRow.push(pins.filter(pin => pin.row === i));
  }
  
  // For each row of pins
  for (let row = 0; row < rows; row++) {
    // Get next Y position (first pin's Y in this row)
    const nextY = pinsByRow[row][0].y;
    
    // First add a point straight down to the row's Y level
    path.push({ x: currentX, y: nextY - pinRadius - 2 });
    currentY = nextY - pinRadius - 2;
    
    // Find the nearest pin
    const rowPins = pinsByRow[row];
    let nearestPin = rowPins[0];
    let minDistance = Math.abs(nearestPin.x - currentX);
    
    for (let i = 1; i < rowPins.length; i++) {
      const distance = Math.abs(rowPins[i].x - currentX);
      if (distance < minDistance) {
        minDistance = distance;
        nearestPin = rowPins[i];
      }
    }
    
    // Determine if we go left or right of the pin
    const goLeft = Math.random() < 0.5;
    
    // New X position after deflection
    const deflectionX = nearestPin.x + (goLeft ? -pinRadius - 2 : pinRadius + 2);
    
    // Add deflection point - slightly below pin
    path.push({ x: deflectionX, y: nearestPin.y + 2 });
    
    // Update current position
    currentX = deflectionX;
    currentY = nearestPin.y + 2;
  }
  
  // Finally, determine which bin the ball lands in
  const binWidth = boardWidth / multipliers.length;
  let targetBin = Math.floor(currentX / binWidth);
  
  // Make sure we're within valid range
  targetBin = Math.max(0, Math.min(multipliers.length - 1, targetBin));
  
  // Add final point - center of the target bin
  const finalX = (targetBin * binWidth) + (binWidth / 2);
  path.push({ x: finalX, y: currentY + 50 });
  
  return path;
}

// Hook to memoize path calculation
export function usePathCalculation(
  pathDirections: number[],
  pinPositions: PinPosition[],
  containerWidth: number
): PathPoint[] {
  return useMemo(() => 
    calculatePath(pathDirections[0], pinPositions, 10, pathDirections.length, pathDirections, containerWidth),
    [pathDirections, pinPositions, containerWidth]
  );
}

// Calculate final bin based on path and container width
export function calculateFinalBin(
  pathPoints: PathPoint[],
  containerWidth: number,
  binCount: number
): number {
  if (pathPoints.length === 0) return 0;
  
  const lastPoint = pathPoints[pathPoints.length - 1];
  const binWidth = containerWidth / binCount;
  
  // Simple bin calculation based on x position
  return Math.min(Math.floor(lastPoint.x / binWidth), binCount - 1);
}

// Draw a path on the canvas
export function drawPath(
  ctx: CanvasRenderingContext2D,
  path: PathPoint[],
  pathIndex: number,
  isSelected: boolean = false
): void {
  if (!path || path.length < 2) return;
  
  const color = PATH_COLORS[pathIndex % PATH_COLORS.length];
  
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }
  
  ctx.strokeStyle = isSelected ? '#ffffff' : color;
  ctx.lineWidth = isSelected ? 3 : 2;
  ctx.stroke();
  
  // Draw dot at the end of the path
  const lastPoint = path[path.length - 1];
  ctx.beginPath();
  ctx.arc(lastPoint.x, lastPoint.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// Initialize path state
export function initPathState(): PathState {
  return {
    paths: [],
    selectedPath: null
  };
}

// Add a new path
export function addPath(
  pathState: PathState,
  startX: number,
  pins: PinPosition[],
  pinRadius: number,
  rows: number,
  multipliers: number[],
  boardWidth: number
): PathState {
  const path = calculatePath(startX, pins, pinRadius, rows, multipliers, boardWidth);
  return {
    paths: [...pathState.paths, path],
    selectedPath: pathState.paths.length
  };
}

// Clear all paths
export function clearPaths(): PathState {
  return {
    paths: [],
    selectedPath: null
  };
}

// Select a path
export function selectPath(pathState: PathState, index: number | null): PathState {
  return {
    ...pathState,
    selectedPath: index
  };
} 