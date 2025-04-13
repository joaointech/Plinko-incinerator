import Matter from 'matter-js';
import { PathPoint } from './plinkoPath';
import { PHYSICS_CONFIG, createBall } from './plinkoPhysics';

// Ball object interface
export interface BallObject {
  id: number;
  body: Matter.Body;
  path: number[];
  pathPoints: PathPoint[];
  currentPathIndex: number;
  collisionBodyIds: Set<number>;
  prevCollisionTime: number;
  animationCompleted: boolean;
  colorIndex: number;
}

// Clean up completed balls
export function cleanupCompletedBalls(
  activeBalls: BallObject[],
  engine: Matter.Engine | null,
  maxActiveBalls: number = PHYSICS_CONFIG.MAX_ACTIVE_BALLS
): BallObject[] {
  if (!engine) return activeBalls;
  
  // Find balls that have completed their animation
  const completedBalls = activeBalls.filter(ball => ball.animationCompleted);
  let updatedBalls = [...activeBalls];
  
  // If we have completed balls or too many active balls, clean up
  if (completedBalls.length > 0 || updatedBalls.length > maxActiveBalls) {
    // Remove completed balls from physics world
    completedBalls.forEach(ballData => {
      if (engine && ballData.body) {
        Matter.Composite.remove(engine.world, ballData.body);
      }
    });
    
    // Remove completed balls from active balls array
    updatedBalls = updatedBalls.filter(ball => !ball.animationCompleted);
    
    // If we still have too many balls, remove the oldest ones
    while (updatedBalls.length > maxActiveBalls) {
      const oldestBall = updatedBalls[0];
      if (engine && oldestBall.body) {
        Matter.Composite.remove(engine.world, oldestBall.body);
      }
      updatedBalls.shift();
    }
  }
  
  return updatedBalls;
}

// Create a new ball and add it to the world
export function createNewBall(
  engine: Matter.Engine | null,
  containerWidth: number,
  pinRadius: number,
  pathDirections: number[],
  pathPoints: PathPoint[],
  ballId: number
): BallObject | null {
  if (!engine) return null;
  
  // Create a ball with a unique color based on index
  const colorIndex = ballId % PHYSICS_CONFIG.COLORS.balls.length;
  
  // Create a ball in Matter.js
  const ball = createBall(
    engine.world,
    containerWidth / 2, // Start in middle
    30, // A bit lower to avoid top barrier
    pinRadius * 1.1, // Slightly smaller relative to pins
    colorIndex
  );
  
  // Create ball object
  const ballObject: BallObject = {
    id: ballId,
    body: ball,
    path: pathDirections,
    pathPoints,
    currentPathIndex: 0,
    collisionBodyIds: new Set(),
    prevCollisionTime: 0,
    animationCompleted: false,
    colorIndex
  };
  
  return ballObject;
}

// Update ball position and check for completion
export function updateBall(
  ballData: BallObject,
  containerHeight: number,
  onComplete?: () => void
): boolean {
  const ball = ballData.body;
  
  // Skip if already completed
  if (ballData.animationCompleted) return false;
  
  let wasUpdated = false;
  
  if (ball.velocity) {
    // If ball is moving too slowly, give it a nudge
    const speed = Math.sqrt(ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y);
    if (speed < 0.5) {
      Matter.Body.setVelocity(ball, {
        x: ball.velocity.x,
        y: Math.max(ball.velocity.y, 1.5) // Increase minimum downward velocity
      });
      wasUpdated = true;
    }
    
    // Only correct path on significant deviation to reduce computation
    if (ballData.currentPathIndex < ballData.pathPoints.length) {
      const targetPin = ballData.pathPoints[ballData.currentPathIndex];
      
      // Only apply correction if ball is significantly off course
      const xDiff = targetPin.x - ball.position.x;
      if (Math.abs(xDiff) > 30) { // Increased threshold for correction
        const direction = Math.sign(xDiff);
        
        Matter.Body.applyForce(
          ball,
          ball.position,
          { 
            x: direction * 0.003, // Stronger force for correction
            y: 0
          }
        );
        wasUpdated = true;
      }
    }
    
    // Check if ball reached the bottom
    if (ball.position.y > containerHeight - 40) {
      ballData.animationCompleted = true;
      wasUpdated = true;
      
      if (onComplete) {
        onComplete();
      }
    }
  }
  
  return wasUpdated;
}

// Handle collision between a ball and a pin
export function handleBallPinCollision(
  ballData: BallObject,
  pinBody: Matter.Body,
  containerHeight: number,
  rows: number
): boolean {
  // Debounce collisions
  const now = Date.now();
  if (now - ballData.prevCollisionTime < 120) {
    return false;
  }
  
  // Prevent double counting the same pin
  if (ballData.collisionBodyIds.has(pinBody.id)) {
    return false;
  }
  
  // Find approximate row of this pin
  const pinY = pinBody.position.y;
  const rowEstimate = Math.floor((pinY - 60) / ((containerHeight - 120) / (rows + 1)));
  
  // Find the next target pin in our pre-calculated path
  if (ballData.currentPathIndex < ballData.pathPoints.length - 1 && rowEstimate >= ballData.currentPathIndex) {
    ballData.currentPathIndex++;
    const targetPin = ballData.pathPoints[ballData.currentPathIndex];
    
    if (!targetPin) return false;
    
    ballData.collisionBodyIds.add(pinBody.id);
    ballData.prevCollisionTime = now;
    
    // Calculate direction to the target pin
    const xDiff = targetPin.x - ballData.body.position.x;
    const direction = Math.sign(xDiff);
    
    // Reset velocity first to have better control
    Matter.Body.setVelocity(ballData.body, { x: 0, y: ballData.body.velocity.y * 0.5 });
    
    // Apply a precise force to guide the ball to the exact target
    const forceStrength = 0.01;
    
    Matter.Body.applyForce(
      ballData.body,
      ballData.body.position,
      { 
        x: direction * forceStrength, 
        y: 0.001 // Small downward force
      }
    );
    
    // Additionally set direct velocity for immediate response
    Matter.Body.setVelocity(ballData.body, {
      x: direction * 2.0,
      y: 1.5
    });
    
    return true;
  }
  
  return false;
} 