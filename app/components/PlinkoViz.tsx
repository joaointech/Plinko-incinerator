import React, { useRef, useEffect, memo } from 'react';
import { PinPosition, PathPoint, drawPath } from '../utils/plinkoPath';
import { BallObject } from '../utils/plinkoBall';
import { PHYSICS_CONFIG } from '../utils/plinkoPhysics';

interface PlinkoVizProps {
  pinPositions: PinPosition[];
  containerWidth: number;
  containerHeight: number;
  pathPoints?: PathPoint[];
  activeBalls: BallObject[];
  binCount: number;
  showHeatmap?: boolean;
  landedBins?: number[];
  pinRadius: number;
}

const PlinkoViz: React.FC<PlinkoVizProps> = memo(({
  pinPositions,
  containerWidth,
  containerHeight,
  pathPoints,
  activeBalls,
  binCount,
  showHeatmap = false,
  landedBins = [],
  pinRadius
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  // Clear and prepare canvas
  const prepareCanvas = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, containerWidth, containerHeight);
    
    // Draw pins
    pinPositions.forEach(pin => {
      ctx.fillStyle = '#ffffff'; // Using white color for pins
      ctx.beginPath();
      ctx.arc(pin.x, pin.y, pinRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  // Draw balls
  const drawBalls = (ctx: CanvasRenderingContext2D) => {
    activeBalls.forEach(ball => {
      if (!ball.body || ball.animationCompleted) return;
      
      const ballColor = PHYSICS_CONFIG.COLORS.balls[ball.colorIndex];
      
      // Draw ball
      ctx.fillStyle = ballColor;
      ctx.beginPath();
      ctx.arc(
        ball.body.position.x,
        ball.body.position.y,
        pinRadius * 1.1, // Ball slightly larger than pins
        0,
        Math.PI * 2
      );
      ctx.fill();
      
      // Optional: draw ball path
      if (pathPoints && pathPoints.length > 0) {
        drawPath(ctx, ball.pathPoints, containerWidth, containerHeight, binCount, ballColor);
      }
    });
  };

  // Draw bin heatmap
  const drawHeatmap = (ctx: CanvasRenderingContext2D) => {
    if (!showHeatmap || landedBins.length === 0) return;
    
    const binWidth = containerWidth / binCount;
    const maxCount = Math.max(...landedBins.map(bin => bin || 0));
    
    for (let i = 0; i < binCount; i++) {
      const binCount = landedBins[i] || 0;
      const opacity = maxCount > 0 ? binCount / maxCount : 0;
      
      ctx.fillStyle = `rgba(255, 165, 0, ${opacity * 0.5})`;
      ctx.fillRect(
        i * binWidth,
        containerHeight - 80,
        binWidth,
        80
      );
      
      // Draw bin count
      if (binCount > 0) {
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          binCount.toString(),
          i * binWidth + binWidth / 2,
          containerHeight - 40
        );
      }
    }
  };

  // Animation loop
  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    prepareCanvas(ctx);
    drawBalls(ctx);
    drawHeatmap(ctx);
    
    animationRef.current = requestAnimationFrame(animate);
  };

  // Set up canvas and animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set canvas size
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    
    // Start animation
    animationRef.current = requestAnimationFrame(animate);
    
    // Cleanup
    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [containerWidth, containerHeight, pinPositions, activeBalls.length]);
  
  // Render canvas
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 pointer-events-none"
      width={containerWidth}
      height={containerHeight}
    />
  );
});

PlinkoViz.displayName = 'PlinkoViz';

export default PlinkoViz; 