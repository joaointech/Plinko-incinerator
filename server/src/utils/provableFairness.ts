import crypto from 'crypto';

interface ProvablyFairResult {
  clientSeed: string;
  serverSeed: string;
  hashedServerSeed: string;
  nonce: number;
  gameResult: number;
  path: number[];
  finalMultiplier: number;
}

export interface GameOptions {
  rows: number;
  riskMode: 'low' | 'medium' | 'high';
}

const MULTIPLIERS = {
  low: [1.5, 1.2, 1.1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.5],
  medium: [5, 3, 2, 1.5, 1, 0.5, 0.3, 0.2, 0.1, 0.2, 0.3, 0.5, 1, 1.5, 2, 3, 5],
  high: [110, 41, 10, 5, 3, 2, 1.5, 0.5, 0.3, 0.5, 1.5, 2, 3, 5, 10, 41, 110]
};

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashServerSeed(serverSeed: string): string {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

export function generateClientSeed(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Deterministic random number generator
function deterministicRandom(serverSeed: string, clientSeed: string, nonce: number): number {
  const seedData = `${serverSeed}:${clientSeed}:${nonce}`;
  const hash = crypto.createHash('sha256').update(seedData).digest('hex');
  
  // Convert the first 8 characters of the hash to a number between 0 and 1
  const decimalValue = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
  return decimalValue;
}

// Get the path the ball will take through the pins
function calculatePath(serverSeed: string, clientSeed: string, nonce: number, rows: number): number[] {
  const path: number[] = [];
  
  for (let i = 0; i < rows; i++) {
    // For each row, generate a random direction (0 = left, 1 = right)
    const random = deterministicRandom(serverSeed, clientSeed, nonce + i);
    path.push(random < 0.5 ? 0 : 1);
  }
  
  return path;
}

// Calculate the final bin the ball lands in
function calculateFinalBin(path: number[]): number {
  // For the board with 3 pins on top row and 18 pins on bottom (over 16 rows)
  // We need to map the path to one of the multiplier positions
  
  // Start with position relative to our starting point (middle of top row)
  let position = 0;
  
  // For each step in the path, adjust the position
  for (const direction of path) {
    position += direction === 0 ? -1 : 1;
  }
  
  // Normalize to our multiplier array indices
  // For a board with 16 rows, the possible ending positions range from -16 to +16
  // Map this to our actual multiplier count
  
  // First, shift position to be 0-indexed from our leftmost possible position
  const normalizedPosition = position + path.length;
  
  // Scale to the number of multipliers
  // For a board with 3 pins on top and 18 on bottom, we have 18-1 = 17 bins
  const totalBins = 17; // Number of dividers + 1
  const scaleFactor = totalBins / (path.length * 2);
  
  // Calculate the final bin, ensuring we're in bounds
  return Math.min(Math.floor(normalizedPosition * scaleFactor), totalBins - 1);
}

export function calculateGameResult(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  options: GameOptions
): ProvablyFairResult {
  // Calculate the path the ball will take
  const path = calculatePath(serverSeed, clientSeed, nonce, options.rows);
  
  // Calculate the final bin
  const finalBin = calculateFinalBin(path);
  
  // Get the multipliers based on risk mode
  const multipliers = MULTIPLIERS[options.riskMode];
  
  // Get final multiplier (ensure we don't go out of bounds)
  const multiplierIndex = Math.min(Math.max(0, finalBin), multipliers.length - 1);
  const finalMultiplier = multipliers[multiplierIndex];
  
  return {
    clientSeed,
    serverSeed,
    hashedServerSeed: hashServerSeed(serverSeed),
    nonce,
    gameResult: finalBin,
    path,
    finalMultiplier
  };
}

// Verify a game result
export function verifyGameResult(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  options: GameOptions,
  reportedResult: ProvablyFairResult
): boolean {
  // Calculate the expected result
  const expectedResult = calculateGameResult(serverSeed, clientSeed, nonce, options);
  
  // Compare with the reported result
  return (
    expectedResult.gameResult === reportedResult.gameResult &&
    expectedResult.finalMultiplier === reportedResult.finalMultiplier &&
    JSON.stringify(expectedResult.path) === JSON.stringify(reportedResult.path)
  );
} 