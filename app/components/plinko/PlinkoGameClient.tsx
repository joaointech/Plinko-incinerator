'use client';

import React, { useEffect, useState, useCallback } from 'react';
import PlinkoBoard from './PlinkoBoard';
import PlinkoControls, { PlayOptions } from './PlinkoControls';
import PlinkoResult from './PlinkoResult';
import { 
  PlinkoService, 
  GameState, 
  GameResult, 
  MULTIPLIERS 
} from '../../utils/plinkoService';

interface PlinkoGameClientProps {
  initialBalance: number;
}

export default function PlinkoGameClient({ initialBalance = 1000 }: PlinkoGameClientProps) {
  const [plinkoService] = useState(() => new PlinkoService());
  const [gameState, setGameState] = useState<GameState>({
    clientSeed: '',
    hashedServerSeed: '',
    balance: initialBalance,
    isPlaying: false,
    gameHistory: []
  });
  const [latestResult, setLatestResult] = useState<GameResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [currentPath, setCurrentPath] = useState<number[]>([]);
  const [currentMultipliers, setCurrentMultipliers] = useState<number[]>(MULTIPLIERS.medium);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOptions, setLastOptions] = useState<PlayOptions | null>(null);
  const [pendingBalls, setPendingBalls] = useState<number>(0);
  const [ballId, setBallId] = useState<number>(0);
  
  // Connect to the server on mount
  useEffect(() => {
    const connectToServer = async () => {
      try {
        const initialState = await plinkoService.connect();
        setGameState(initialState);
        setIsConnected(true);
        setError(null);
      } catch (error) {
        console.error('Failed to connect to server:', error);
        setError('Failed to connect to the Plinko server. Please try again later.');
        setIsConnected(false);
      }
    };
    
    connectToServer();
    
    // Set up event listeners
    plinkoService.on('game:result', handleGameResult);
    plinkoService.on('game:error', handleGameError);
    plinkoService.on('game:new-seed', handleNewSeed);
    plinkoService.on('game:reveal-seed', handleRevealSeed);
    plinkoService.on('disconnect', handleDisconnect);
    
    return () => {
      // Clean up
      plinkoService.off('game:result', handleGameResult);
      plinkoService.off('game:error', handleGameError);
      plinkoService.off('game:new-seed', handleNewSeed);
      plinkoService.off('game:reveal-seed', handleRevealSeed);
      plinkoService.off('disconnect', handleDisconnect);
      plinkoService.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Handle game result
  const handleGameResult = (result: GameResult) => {
    console.log('Game result received from server:', result);
    
    // Only start the game animation AFTER we have the path data
    if (!result.path || result.path.length === 0) {
      console.error('Received game result with empty path data');
      setError('Invalid game result received - missing path data');
      return;
    }
    
    // First update path and result data and start a new ball
    setCurrentPath(result.path);
    setLatestResult(result);
    
    // Increment ball ID for next request
    setBallId(prevId => prevId + 1);
    
    // Decrement pendingBalls if we have any
    setPendingBalls(prevBalls => Math.max(0, prevBalls - 1));
    
    // Update game state and history
    setGameState(prev => ({
      ...prev,
      balance: result.balance,
      isPlaying: true,
      // Limit game history to last 100 entries for better performance
      gameHistory: [...prev.gameHistory.slice(-99), { ...result, timestamp: Date.now() }]
    }));
  };
  
  // Handle game error
  const handleGameError = (error: { message: string }) => {
    setError(error.message);
    setGameState(prev => ({ ...prev, isPlaying: false }));
    setPendingBalls(0); // Clear any pending balls on error
  };
  
  // Handle new seed
  const handleNewSeed = (data: { hashedServerSeed?: string, clientSeed?: string }) => {
    setGameState(prev => ({
      ...prev,
      hashedServerSeed: data.hashedServerSeed || prev.hashedServerSeed,
      clientSeed: data.clientSeed || prev.clientSeed
    }));
  };
  
  // Handle reveal seed
  const handleRevealSeed = (data: { serverSeed: string }) => {
    setGameState(prev => ({
      ...prev,
      serverSeed: data.serverSeed
    }));
  };
  
  // Handle disconnect
  const handleDisconnect = () => {
    setIsConnected(false);
    setError('Disconnected from the Plinko server.');
  };
  
  // Rate limit the play function to prevent overwhelming the server
  const throttledPlay = useCallback(() => {
    if (!lastOptions || !isConnected) return;
    
    try {
      plinkoService.play({
        ...lastOptions,
        rows: 16
      });
    } catch (error) {
      console.error('Error playing game:', error);
      setError('Failed to play game.');
    }
  }, [plinkoService, lastOptions, isConnected]);
  
  // Handle play button click
  const handlePlay = (options: PlayOptions) => {
    console.log('Play button clicked with options:', options);
    
    // Check if connected
    if (!isConnected) {
      console.error('Not connected to server, cannot play');
      setError('Not connected to the Plinko server.');
      return;
    }
    
    // Store the options for repeated use
    setLastOptions(options);
    
    // Update multipliers based on risk mode
    setCurrentMultipliers(MULTIPLIERS[options.riskMode]);
    
    // Send play request to server
    throttledPlay();
    
    // If this is auto mode, set pending balls
    if (options.isAuto) {
      setPendingBalls(prev => prev + 5); // Queue 5 balls for auto mode
    }
  };
  
  // Handle animation complete
  const handleAnimationComplete = () => {
    // Don't reset isPlaying here to allow multiple balls
    // We'll just update game history and track results
    
    // If we have pending balls, play the next one
    if (pendingBalls > 0 && lastOptions) {
      setTimeout(() => {
        plinkoService.play({
          ...lastOptions,
          rows: 16
        });
      }, 200); // Small delay between balls
    }
  };
  
  // Function to handle adding a new ball from the board
  const handleAddBall = (path: number[]) => {
    // Use throttled play to avoid overloading
    throttledPlay();
  };
  
  // Request a new server seed
  const handleNewServerSeed = () => {
    plinkoService.requestNewServerSeed();
  };
  
  // Update the client seed
  const handleNewClientSeed = (seed: string) => {
    plinkoService.updateClientSeed(seed);
  };
  
  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Error message */}
      {error && (
        <div className="bg-red-500 text-white p-3 rounded-md fixed top-4 right-4 z-50">
          {error}
          <button 
            className="ml-2 font-bold" 
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}
      
      <div className="flex flex-col lg:flex-row gap-6 w-full h-full">
        {/* Game controls */}
        <div className="lg:w-1/4">
          <PlinkoControls
            balance={gameState.balance}
            onPlay={handlePlay}
            disabled={!isConnected}
            onNewServerSeed={handleNewServerSeed}
            onNewClientSeed={handleNewClientSeed}
            clientSeed={gameState.clientSeed}
            hashedServerSeed={gameState.hashedServerSeed}
          />
        </div>
        
        {/* Game board */}
        <div className="flex-1 h-[600px]">
          {/* Non-intrusive last result display */}
          {latestResult && (
            <div className="mb-2 flex items-center justify-between bg-gray-800 rounded-lg p-2 text-white">
              <div className="text-sm">
                Last Bet: <span className="font-bold">${latestResult.betAmount.toFixed(4)}</span>
              </div>
              <div className={`text-sm ${latestResult.winAmount > latestResult.betAmount ? 'text-green-500' : 'text-red-500'} font-bold`}>
                {latestResult.finalMultiplier}x = ${latestResult.winAmount.toFixed(4)}
              </div>
            </div>
          )}
          
          <PlinkoBoard
            rows={16}
            path={currentPath}
            isPlaying={gameState.isPlaying}
            onAnimationComplete={handleAnimationComplete}
            multipliers={currentMultipliers}
            riskMode="medium"
            showPathInitially={true}
            onAddBall={handleAddBall}
          />
        </div>
      </div>
      
      {/* Game History Table */}
      {gameState.gameHistory.length > 0 && (
        <div className="mt-6 bg-gray-800 rounded-lg p-4 text-white overflow-hidden">
          <h3 className="text-lg font-semibold mb-3">Game History</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-full">
              <thead className="border-b border-gray-700">
                <tr>
                  <th className="py-2 px-4 text-left">Time</th>
                  <th className="py-2 px-4 text-left">Bet Amount</th>
                  <th className="py-2 px-4 text-left">Risk</th>
                  <th className="py-2 px-4 text-left">Multiplier</th>
                  <th className="py-2 px-4 text-left">Win Amount</th>
                  <th className="py-2 px-4 text-left">Profit</th>
                </tr>
              </thead>
              <tbody>
                {gameState.gameHistory.slice().reverse().map((game, index) => {
                  const date = new Date(game.timestamp || Date.now());
                  const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  const profit = game.winAmount - game.betAmount;
                  const isWin = profit >= 0;
                  
                  return (
                    <tr key={index} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="py-2 px-4">{formattedTime}</td>
                      <td className="py-2 px-4">${game.betAmount.toFixed(4)}</td>
                      <td className="py-2 px-4 capitalize">{game.riskMode}</td>
                      <td className="py-2 px-4">{game.finalMultiplier}x</td>
                      <td className="py-2 px-4">${game.winAmount.toFixed(4)}</td>
                      <td className={`py-2 px-4 ${isWin ? 'text-green-500' : 'text-red-500'}`}>
                        {isWin ? '+' : ''}{profit.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
} 