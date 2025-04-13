import Matter from 'matter-js';

// Physics configuration constants
export const PHYSICS_CONFIG = {
  GRAVITY: 1.2,
  POSITION_ITERATIONS: 6,
  VELOCITY_ITERATIONS: 4,
  CONSTRAINT_ITERATIONS: 2,
  TIME_SCALE: 1.2,
  PIN_RESTITUTION: 0.8,
  PIN_FRICTION: 0.01,
  BALL_RESTITUTION: 0.5,
  BALL_FRICTION: 0.001,
  BALL_FRICTION_AIR: 0.0001,
  BALL_FRICTION_STATIC: 0.0001,
  BALL_DENSITY: 0.02,
  BALL_SLEEP_THRESHOLD: 60
};

// Ball configuration
export const BALL_COLORS = ['#22ff88', '#ff6622', '#2288ff', '#ffdd22', '#ff22dd'];

// Path colors - same as ball colors for consistency
export const PATH_COLORS = ['#22ff88', '#ff6622', '#2288ff', '#ffdd22', '#ff22dd'];

// Create engine with optimized settings
export function createEngine() {
  const engine = Matter.Engine.create({
    positionIterations: PHYSICS_CONFIG.POSITION_ITERATIONS,
    velocityIterations: PHYSICS_CONFIG.VELOCITY_ITERATIONS,
    enableSleeping: true,
    constraintIterations: PHYSICS_CONFIG.CONSTRAINT_ITERATIONS
  });
  
  // Set engine parameters
  engine.timing.timeScale = PHYSICS_CONFIG.TIME_SCALE;
  engine.gravity.y = PHYSICS_CONFIG.GRAVITY;
  
  return engine;
}

// Create renderer with performance optimizations
export function createRenderer(canvas: HTMLCanvasElement, engine: Matter.Engine, width: number, height: number) {
  return Matter.Render.create({
    canvas,
    engine,
    options: {
      width,
      height,
      wireframes: false,
      background: 'transparent',
      pixelRatio: Math.min(window.devicePixelRatio, 2), // Limit pixel ratio for better performance
    }
  });
}

// Create board boundaries
export function createBoardBoundaries(world: Matter.World, width: number, height: number) {
  const wallOptions = {
    isStatic: true,
    render: {
      fillStyle: '#334155'
    }
  };
  
  // Create walls
  Matter.Composite.add(world, [
    // Left wall
    Matter.Bodies.rectangle(0, height / 2, 10, height, wallOptions),
    // Right wall
    Matter.Bodies.rectangle(width, height / 2, 10, height, wallOptions),
    // Bottom wall
    Matter.Bodies.rectangle(width / 2, height, width, 10, wallOptions),
    // Top barrier
    Matter.Bodies.rectangle(width / 2, 5, width, 10, wallOptions)
  ]);
}

// Create bin dividers
export function createBinDividers(world: Matter.World, width: number, height: number, binCount: number) {
  const wallOptions = {
    isStatic: true,
    render: {
      fillStyle: '#334155'
    }
  };
  
  const binWidth = width / binCount;
  const dividerHeight = 70; // Taller dividers
  
  for (let i = 1; i < binCount; i++) {
    Matter.Composite.add(
      world, 
      Matter.Bodies.rectangle(
        i * binWidth, 
        height - (dividerHeight / 2), // Position from bottom
        3, // Thinner dividers
        dividerHeight, 
        wallOptions
      )
    );
  }
}

// Create pins in a triangular pattern
export function createPins(world: Matter.World, width: number, height: number, rows: number) {
  const pinOptions = {
    isStatic: true,
    render: {
      fillStyle: '#ffffff'
    },
    restitution: PHYSICS_CONFIG.PIN_RESTITUTION,
    friction: PHYSICS_CONFIG.PIN_FRICTION,
    chamfer: { radius: 2 }, // Rounded corners
    slop: 0.2  // Add some slop to prevent sticking
  };
  
  // Calculate spacing for pins - we want 3 on top and 18 on bottom over multiple rows
  const topPins = 3;
  const bottomPins = 18;
  const pinsIncrement = (bottomPins - topPins) / (rows - 1);
  const pinRadius = width / (bottomPins * 10);
  
  // Store all pin positions for path visualization
  const pinPositions: {x: number, y: number, row: number}[] = [];
  
  // Position pins in a triangular pattern
  for (let row = 0; row < rows; row++) {
    // Calculate number of pins in this row
    const rowPins = Math.round(topPins + (pinsIncrement * row));
    
    // Calculate spacing
    const spacing = width / (bottomPins + 1);
    const verticalSpacing = (height - 120) / (rows + 1);
    const offsetY = 60 + (row * verticalSpacing);
    
    // Calculate starting X position to center the pins
    const startX = (width - (rowPins - 1) * spacing) / 2;
    
    // Add pins for this row
    for (let i = 0; i < rowPins; i++) {
      const pin = Matter.Bodies.circle(
        startX + i * spacing,
        offsetY,
        pinRadius,
        pinOptions
      );
      Matter.Composite.add(world, pin);
      
      // Store pin position for path visualization
      pinPositions.push({
        x: startX + i * spacing,
        y: offsetY,
        row: row
      });
    }
  }
  
  // Sort pins by row for easier access
  pinPositions.sort((a, b) => a.row - b.row);
  
  return { pinPositions, pinRadius };
}

// Create a ball with optimized properties
export function createBall(
  world: Matter.World, 
  x: number, 
  y: number, 
  radius: number, 
  colorIndex: number
) {
  const ball = Matter.Bodies.circle(
    x,
    y,
    radius,
    {
      restitution: PHYSICS_CONFIG.BALL_RESTITUTION,
      friction: PHYSICS_CONFIG.BALL_FRICTION,
      frictionAir: PHYSICS_CONFIG.BALL_FRICTION_AIR,
      frictionStatic: PHYSICS_CONFIG.BALL_FRICTION_STATIC,
      density: PHYSICS_CONFIG.BALL_DENSITY,
      render: {
        fillStyle: BALL_COLORS[colorIndex % BALL_COLORS.length],
        visible: true,
      },
      sleepThreshold: PHYSICS_CONFIG.BALL_SLEEP_THRESHOLD
    }
  );
  
  // Add ball to world
  Matter.Composite.add(world, ball);
  
  // Apply initial velocity
  Matter.Body.setVelocity(ball, { x: 0, y: 3 });
  
  return ball;
}

// Get multiplier colors
export function getMultiplierColor(multiplier: number): string {
  if (multiplier >= 10) return 'bg-red-500';
  if (multiplier >= 3) return 'bg-orange-500';
  if (multiplier >= 1) return 'bg-yellow-500';
  if (multiplier >= 0.5) return 'bg-green-500';
  return 'bg-purple-500';
} 