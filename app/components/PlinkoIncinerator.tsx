"use client";

import { useEffect, useState, useRef } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { incinerateTokens, getTokenAccounts, batchGetTokenMetadata, FetchProgressCallback } from "../utils/incinerator";
import { Config } from "../config/solana";

// Types for token data
interface FormattedTokenAccount {
  pubkey: string;
  mint: string;
  owner: string;
  amount: number;
  decimals: number;
  uiAmount: number;
  symbol?: string;
  name?: string;
  logoUrl?: string;
  isSelected?: boolean;
  isEligible?: boolean;
  potentialValue?: number;
}

// Game states
type GameState = 'idle' | 'scanning' | 'ready' | 'playing' | 'finished';

export default function PlinkoIncinerator() {
  const { primaryWallet } = useDynamicContext();
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [tokenAccounts, setTokenAccounts] = useState<FormattedTokenAccount[]>([]);
  const [showTokenList, setShowTokenList] = useState<boolean>(false);
  const [gameBalance, setGameBalance] = useState(0);
  const [incineratedValue, setIncineratedValue] = useState(0);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [scanTimeout, setScanTimeout] = useState<NodeJS.Timeout | null>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [plinkoResult, setPlinkoResult] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showGameOptions, setShowGameOptions] = useState(false);
  const [selectedBet, setSelectedBet] = useState(0.0001);
  const [animationRunning, setAnimationRunning] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [scannedMints, setScannedMints] = useState<string[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const [scanStage, setScanStage] = useState<'init' | 'accounts' | 'metadata' | 'done'>('init');

  // Function to add debug messages
  const addDebugMessage = (message: string) => {
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (scanTimeout) {
        clearTimeout(scanTimeout);
      }
    };
  }, [scanTimeout]);

  // Reset states when wallet changes
  useEffect(() => {
    if (primaryWallet && primaryWallet.address) {
      setLoading(true);
      setGameState('scanning');
      setLoadingMessage('Scanning for tokens...');
      addDebugMessage(`Wallet connected: ${primaryWallet.address}`);
      setTokenAccounts([]);
      
      // Clear any existing timeout
      if (scanTimeout) {
        clearTimeout(scanTimeout);
      }
      
      console.log('fetching token accounts');
      fetchTokenAccounts();
    } else {
      addDebugMessage('Wallet disconnected');
      setTokenAccounts([]);
      setLoadingMessage('');
      setLoading(false);
      setGameState('idle');
      
      // Clear timeout if wallet disconnects
      if (scanTimeout) {
        clearTimeout(scanTimeout);
        setScanTimeout(null);
      }
    }
  }, [primaryWallet]);

  const fetchTokenAccounts = async () => {
    if (!primaryWallet || !Config.solWallet.publicKey) return;
    
    console.log('fetching token accounts');

    try {
      addDebugMessage('Fetching token accounts...');
      setLoading(true);
      setLoadingMessage('Scanning for token accounts...');
      setScanStage('accounts');
      setScanProgress(10); // Starting progress
      
      // Create progress callback to update UI state
      const progressCallback: FetchProgressCallback = (stage, progress, message) => {
        setScanProgress(progress);
        if (message) {
          setLoadingMessage(message);
          addDebugMessage(message);
        }
        
        if (stage === 'accounts') {
          setScanStage('accounts');
        } else if (stage === 'metadata') {
          setScanStage('metadata');
        } else if (stage === 'error') {
          // Only update message, keep current stage
          addDebugMessage(`Error: ${message}`);
        }
      };
      
      // Directly await the token accounts without a timeout
      const accounts = await getTokenAccounts(progressCallback);
      
      setScanProgress(75);
      
      // Clear the scan timeout since we have a response
      if (scanTimeout) {
        clearTimeout(scanTimeout);
        setScanTimeout(null);
      }
      
      addDebugMessage(`Found ${accounts.length} token accounts`);
      
      if (accounts.length === 0) {
        addDebugMessage('No token accounts found, but scan completed successfully');
        setLoading(false);
        setLoadingMessage('No token accounts found');
        setScanProgress(100);
        setScanStage('done');
        setGameState('ready');
        return;
      }
      
      // Format and filter token accounts
      const formattedAccounts = accounts
        .map((account: any) => {
          try {
            const data = account.account.data.parsed.info;
            const isEligible = data.tokenAmount.amount === "0";
            const mintAddress = data.mint;
            
            // Track scanned mints
            setScannedMints(prev => [...prev, mintAddress]);
            
            return {
              pubkey: account.pubkey.toString(),
              mint: mintAddress,
              owner: data.owner,
              amount: parseInt(data.tokenAmount.amount),
              decimals: data.tokenAmount.decimals,
              uiAmount: data.tokenAmount.uiAmount,
              isEligible,
              isSelected: isEligible, // Auto-select eligible tokens
              potentialValue: isEligible ? 0.00001 : 0 // Placeholder value
            };
          } catch (err) {
            // Skip malformed accounts
            addDebugMessage(`Error parsing account: ${err}`);
            return null;
          }
        })
        .filter(Boolean) as FormattedTokenAccount[];
        
      setTokenAccounts(formattedAccounts);
      setScanProgress(85);
      
      // Update selected tokens
      const eligibleTokenPubkeys = formattedAccounts
        .filter(account => account.isEligible)
        .map(account => account.pubkey);
      setSelectedTokens(eligibleTokenPubkeys);
      
      // Calculate potential value
      const potentialValue = formattedAccounts
        .filter((account: any) => account.isEligible)
        .reduce((total: number, account: any) => total + (account.potentialValue || 0), 0);
        
      addDebugMessage(`Potential value from eligible tokens: ${potentialValue} SOL`);
      
      // Fetch token metadata
      setLoadingMessage('Fetching token metadata...');
      setScanStage('metadata');
      await fetchTokenMetadata(formattedAccounts);
      
      setScanProgress(100);
      setScanStage('done');
      setGameState('ready');
    } catch (error) {
      // Clear the scan timeout
      if (scanTimeout) {
        clearTimeout(scanTimeout);
        setScanTimeout(null);
      }
      
      addDebugMessage(`Error fetching token accounts: ${error}`);
      console.error('Error fetching token accounts:', error);
      
      // Show a retry button by setting specific state
      if (String(error).includes('timeout') || String(error).includes('Timeout')) {
        setLoadingMessage('Connection timeout. The Solana network may be experiencing high load.');
      } else {
        setLoadingMessage('Failed to fetch token accounts. The Solana RPC may be unavailable.');
      }
      setGameState('idle');
      setScanProgress(0);
      setScanStage('init');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to fetch token metadata
  const fetchTokenMetadata = async (accounts: FormattedTokenAccount[]) => {
    try {
      if (accounts.length === 0) return;
      
      const mintAddresses = accounts.map(account => account.mint);
      const metadata = await batchGetTokenMetadata(mintAddresses);
      
      // Update accounts with metadata
      const updatedAccounts = accounts.map(account => ({
        ...account,
        name: metadata[account.mint]?.name || `Token ${account.mint.slice(0, 6)}...${account.mint.slice(-4)}`,
        symbol: metadata[account.mint]?.symbol || account.mint.slice(0, 4).toUpperCase(),
        logoUrl: metadata[account.mint]?.image || '',
      }));
      
      setTokenAccounts(updatedAccounts);
      addDebugMessage('Token metadata updated');
    } catch (error) {
      addDebugMessage(`Error fetching token metadata: ${error}`);
      console.error('Error fetching token metadata:', error);
    }
  };

  const handleIncinerate = async () => {
    if (!primaryWallet || !Config.solWallet.publicKey) return;
    
    try {
      setLoading(true);
      setLoadingMessage('Incinerating tokens...');
      addDebugMessage('Starting token incineration...');
      
      const selectedTokens = tokenAccounts
        .filter(account => account.isEligible)
        .map(account => account.pubkey);
      
      if (selectedTokens.length === 0) {
        addDebugMessage('No eligible tokens to incinerate');
        setLoadingMessage('No eligible tokens found');
        setTimeout(() => setLoadingMessage(''), 2000);
        setLoading(false);
        return;
      }
      
      // In a real implementation, this would call the actual burn function
      const result = await incinerateTokens(selectedTokens);
      
      if (result.success) {
        // For demo purposes, calculate the "value" gained from incineration
        const value = selectedTokens.length * 0.00001;
        
        addDebugMessage(`Incinerated ${selectedTokens.length} tokens for ${value} SOL`);
        setIncineratedValue(prev => prev + value);
        setGameBalance(prev => prev + value);
        
        // Remove the incinerated tokens from the list
        setTokenAccounts(prev => prev.filter(account => !account.isEligible));
        
        // Success message
        setLoadingMessage('Tokens successfully incinerated!');
        setTimeout(() => setLoadingMessage(''), 2000);
        
        // Show game options
        setShowGameOptions(true);
      } else {
        addDebugMessage(`Incineration failed: ${result.message}`);
        setLoadingMessage(`Failed: ${result.message}`);
        setTimeout(() => setLoadingMessage(''), 3000);
      }
    } catch (error) {
      addDebugMessage(`Error during incineration: ${error}`);
      console.error('Error during incineration:', error);
      setLoadingMessage('Failed to incinerate tokens');
      setTimeout(() => setLoadingMessage(''), 2000);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPlinko = () => {
    if (gameBalance < selectedBet) return;
    
    // Deduct bet from balance
    setGameBalance(prev => prev - selectedBet);
    
    // Set game state to playing
    setGameState('playing');
    
    // Set up the Plinko game
    runPlinkoAnimation();
  };

  const runPlinkoAnimation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    setAnimationRunning(true);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas dimensions
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    
    // Game parameters
    const pegRadius = 6;
    const ballRadius = 8;
    const rows = 10;
    const cols = 15;
    const width = canvas.width;
    const height = canvas.height;
    const pegSpacing = width / (cols + 1);
    const verticalSpacing = (height - 100) / (rows + 1);
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw pegs
    ctx.fillStyle = '#BB9AF7';
    for (let i = 0; i < rows; i++) {
      const numPegs = i % 2 === 0 ? cols - 1 : cols;
      const offsetX = i % 2 === 0 ? pegSpacing / 2 : 0;
      
      for (let j = 0; j < numPegs; j++) {
        ctx.beginPath();
        ctx.arc(offsetX + pegSpacing * (j + 1), 50 + verticalSpacing * (i + 1), pegRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Draw slots at the bottom
    const slotWidth = width / 11;
    
    for (let i = 0; i < 11; i++) {
      ctx.fillStyle = getMultiplierColor(i);
      ctx.fillRect(i * slotWidth, height - 50, slotWidth, 50);
      
      // Draw multiplier text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${getMultiplier(i)}x`, i * slotWidth + slotWidth / 2, height - 25);
    }
    
    // Animate ball
    const ball = {
      x: width / 2,
      y: 20,
      vx: 0,
      vy: 0,
      path: [] as {x: number, y: number}[]
    };
    
    // Generate path ahead of time for deterministic animation
    const finalSlot = Math.floor(Math.random() * 11);
    const finalX = finalSlot * slotWidth + slotWidth / 2;
    const turns: number[] = [];
    
    // Calculate required turns to get to the final slot
    let currentX = width / 2;
    let currentLevel = 0;
    
    while (currentLevel < rows) {
      const direction = finalX > currentX ? 1 : -1;
      turns.push(direction);
      currentX += direction * (pegSpacing / 2);
      currentLevel++;
    }
    
    // Add some randomness to the path
    for (let i = 0; i < turns.length; i++) {
      if (Math.random() > 0.7) {
        turns[i] *= -1;
      }
    }
    
    // Animation frames
    let animationId: number;
    let frameCount = 0;
    
    function animate() {
      if (!ctx) return;
      
      frameCount++;
      ctx.clearRect(0, 0, width, height);
      
      // Draw pegs
      ctx.fillStyle = '#BB9AF7';
      for (let i = 0; i < rows; i++) {
        const numPegs = i % 2 === 0 ? cols - 1 : cols;
        const offsetX = i % 2 === 0 ? pegSpacing / 2 : 0;
        
        for (let j = 0; j < numPegs; j++) {
          ctx.beginPath();
          ctx.arc(offsetX + pegSpacing * (j + 1), 50 + verticalSpacing * (i + 1), pegRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Draw slots
      for (let i = 0; i < 11; i++) {
        ctx.fillStyle = getMultiplierColor(i);
        ctx.fillRect(i * slotWidth, height - 50, slotWidth, 50);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${getMultiplier(i)}x`, i * slotWidth + slotWidth / 2, height - 25);
      }
      
      // Update ball position
      if (frameCount % 5 === 0 && ball.y < height - 60) {
        const level = Math.floor((ball.y - 50) / verticalSpacing);
        
        if (level >= 0 && level < turns.length) {
          ball.vx = turns[level] * 2;
        } else {
          ball.vx = 0;
        }
        
        ball.vy = 3;
        ball.x += ball.vx;
        ball.y += ball.vy;
      } else if (ball.y >= height - 60) {
        // Move to final position
        const targetX = finalSlot * slotWidth + slotWidth / 2;
        ball.x = ball.x * 0.9 + targetX * 0.1;
        ball.y = Math.min(ball.y + 1, height - ballRadius - 5);
        
        if (Math.abs(ball.x - targetX) < 1 && ball.y > height - ballRadius - 10) {
          // Animation complete, show result
          cancelAnimationFrame(animationId);
          const multiplier = getMultiplier(finalSlot);
          const winnings = selectedBet * multiplier;
          setPlinkoResult(winnings);
          setGameBalance(prev => prev + winnings);
          setGameState('finished');
          setAnimationRunning(false);
          return;
        }
      } else {
        ball.y += 1;
      }
      
      // Draw ball
      ctx.fillStyle = '#F7768E';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
      ctx.fill();
      
      animationId = requestAnimationFrame(animate);
    }
    
    animationId = requestAnimationFrame(animate);
  };

  const getMultiplier = (slot: number): number => {
    const multipliers = [0.1, 0.2, 0.5, 0.8, 1, 1.5, 2, 3, 5, 10, 25];
    return multipliers[slot];
  };
  
  const getMultiplierColor = (slot: number): string => {
    const colors = [
      '#F7768E', // Red (low)
      '#FF9E64', // Orange
      '#E0AF68', // Yellow-orange
      '#9ECE6A', // Green
      '#73DACA', // Teal
      '#B4F9F8', // Light blue
      '#2AC3DE', // Sky blue
      '#7AA2F7', // Blue
      '#BB9AF7', // Purple
      '#9D7CD8', // Violet
      '#C33EFF'  // Bright purple (high)
    ];
    return colors[slot];
  };

  const handleWithdraw = () => {
    if (gameBalance <= 0) return;
    
    addDebugMessage(`Withdrawing ${gameBalance} SOL to wallet`);
    setLoadingMessage('SOL withdrawn to your wallet!');
    setTimeout(() => setLoadingMessage(''), 2000);
    setGameBalance(0);
    setShowGameOptions(false);
  };

  const refreshTokens = () => {
    if (!primaryWallet || !Config.solWallet.publicKey) return;
    addDebugMessage('Manually refreshing token accounts');
    setTokenAccounts([]);
    setScannedMints([]);
    setSelectedTokens([]);
    setScanProgress(0);
    setScanStage('init');
    fetchTokenAccounts();
  };

  // Filter eligible tokens
  const eligibleTokens = tokenAccounts.filter(account => account.isEligible);
  
  // Calculate potential SOL from burning tokens
  const potentialSol = eligibleTokens.length * 0.00001;

  return (
    <div className="space-y-6">
      {/* Wallet Status */}
      <div className="bg-gray-800 bg-opacity-40 p-6 rounded-lg border border-gray-700">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-purple-300">Wallet Status</h2>
          <div>
            {gameBalance > 0 && (
              <span className="text-accent-green font-bold mr-4">
                Balance: {gameBalance.toFixed(6)} SOL
              </span>
            )}
            {primaryWallet && (
              <button 
                onClick={refreshTokens}
                disabled={loading}
                className="retro-button-small"
              >
                {loading ? "Scanning..." : "Refresh Tokens"}
              </button>
            )}
          </div>
        </div>
        
        {loading && (
          <div className="mt-4 text-center">
            <div className="animate-spin mb-3 h-8 w-8 border-t-2 border-b-2 border-purple-500 rounded-full mx-auto"></div>
            <p className="text-lg text-purple-300 font-medium">{loadingMessage || "Loading..."}</p>
            
            {/* Progress bar */}
            <div className="mt-3 w-full max-w-md mx-auto bg-gray-700 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-purple-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${scanProgress}%` }}
              ></div>
            </div>
            
            <div className="mt-2 text-sm text-gray-400 max-w-md mx-auto">
              <p>
                {scanStage === 'init' && 'Preparing scan...'}
                {scanStage === 'accounts' && (
                  <>Scanning token accounts: {Math.round(scanProgress)}%</>
                )}
                {scanStage === 'metadata' && (
                  <>Fetching token metadata: {scannedMints.length} accounts found</>
                )}
              </p>
              
              {scanProgress > 0 && scanProgress < 100 && scanStage === 'accounts' && (
                <p className="mt-1 text-xs text-gray-500">
                  This process can take up to 20 seconds during high network activity
                </p>
              )}
              
              {scanTimeout && (
                <div className="mt-3 p-2 bg-yellow-900 bg-opacity-30 border border-yellow-800 rounded text-yellow-200 text-xs">
                  <p className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>The operation is taking longer than expected.</span>
                  </p>
                  <p className="mt-1">Solana RPC connections can be slow during high network activity.</p>
                  <button
                    onClick={() => {
                      if (scanTimeout) {
                        clearTimeout(scanTimeout);
                        setScanTimeout(null);
                      }
                      refreshTokens();
                    }}
                    className="mt-2 px-2 py-1 bg-yellow-800 hover:bg-yellow-700 text-yellow-100 rounded text-xs"
                  >
                    Cancel and Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        
        {!loading && !primaryWallet && (
          <div className="text-center py-10">
            <p className="text-gray-400 mb-4">Connect your wallet to start burning tokens</p>
          </div>
        )}
        
        {!loading && primaryWallet && gameState === 'idle' && (
          <div className="flex flex-col items-center justify-center p-4 gap-4">
            <p className="text-center text-red-400">
              {loadingMessage || 'Connection issues. Please try again.'}
            </p>
            <button
              onClick={() => fetchTokenAccounts()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry Token Scan
            </button>
          </div>
        )}
        
        {!loading && primaryWallet && gameState === 'ready' && (
          <div className="mt-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 p-4 bg-gray-900 bg-opacity-60 rounded-lg">
              <div>
                <p className="text-sm text-gray-300 mb-1">Empty Token Accounts Found:</p>
                <p className="text-xl font-bold text-accent-green">{eligibleTokens.length} accounts</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-300 mb-1">Potential Value:</p>
                <p className="text-xl font-bold text-accent-blue">{potentialSol.toFixed(6)} SOL</p>
              </div>
              
              <button
                onClick={handleIncinerate}
                disabled={eligibleTokens.length === 0 || loading}
                className={`retro-button py-2 px-6 ${eligibleTokens.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="text-accent-red font-bold">INCINERATE TOKENS</span>
              </button>
            </div>
            
            {eligibleTokens.length > 0 && (
              <div className="mt-4">
                <button 
                  onClick={() => setShowTokenList(!showTokenList)}
                  className="text-accent-blue text-sm underline hover:text-accent-purple"
                >
                  {showTokenList ? "Hide Token List" : "Show Token List"}
                </button>
                
                {showTokenList && (
                  <div className="mt-4 max-h-96 overflow-y-auto p-4 bg-gray-900 bg-opacity-70 rounded-lg border border-gray-800">
                    <div className="mb-3 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-purple-300">Eligible Tokens</h3>
                      <span className="bg-gray-800 rounded-full px-3 py-1 text-xs">
                        {eligibleTokens.length} tokens found
                      </span>
                    </div>
                    
                    <div className="mb-4 p-3 bg-blue-900 bg-opacity-30 border border-blue-800 rounded-md text-sm">
                      <div className="flex items-start">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-blue-200 mb-1">These are empty token accounts with zero balance that still occupy space on the blockchain.</p>
                          <p className="text-gray-400">Burning them releases approximately 0.00001 SOL per account back to your wallet while cleaning up your wallet.</p>
                        </div>
                      </div>
                    </div>
                    
                    {eligibleTokens.length > 5 && (
                      <div className="mb-4">
                        <div className="relative">
                          <input
                            type="text"
                            value={tokenSearch}
                            onChange={(e) => setTokenSearch(e.target.value)}
                            placeholder="Search tokens..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 pl-10 pr-4 text-sm focus:border-purple-500 focus:outline-none"
                          />
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            className="h-5 w-5 absolute left-3 top-2.5 text-gray-400" 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2} 
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
                            />
                          </svg>
                          {tokenSearch && (
                            <button 
                              onClick={() => setTokenSearch('')}
                              className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
                            >
                              <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                className="h-5 w-5" 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                              >
                                <path 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round" 
                                  strokeWidth={2} 
                                  d="M6 18L18 6M6 6l12 12" 
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {eligibleTokens
                        .filter(token => 
                          tokenSearch === '' || 
                          token.name?.toLowerCase().includes(tokenSearch.toLowerCase()) || 
                          token.symbol?.toLowerCase().includes(tokenSearch.toLowerCase())
                        )
                        .map((token, index) => (
                          <div 
                            key={token.pubkey} 
                            className="bg-gray-800 bg-opacity-60 rounded-lg p-3 border border-gray-700 hover:border-purple-500 transition-all"
                          >
                            <div className="flex items-center mb-2">
                              <div className="flex-shrink-0 w-8 h-8 mr-3 bg-gray-700 rounded-full flex items-center justify-center">
                                {token.logoUrl ? (
                                  <img 
                                    src={token.logoUrl} 
                                    alt={token.symbol} 
                                    className="w-7 h-7 rounded-full"
                                    onError={(e) => {
                                      (e.currentTarget.style.display = 'none');
                                      (e.currentTarget.nextSibling as HTMLElement).style.display = 'block';
                                    }}
                                  />
                                ) : null}
                                <span 
                                  className="text-xs font-bold text-white" 
                                  style={{display: token.logoUrl ? 'none' : 'block'}}
                                >
                                  {token.symbol?.substring(0, 2) || "??"}
                                </span>
                              </div>
                              <div>
                                <div className="font-medium text-white truncate max-w-[180px]" title={token.name}>
                                  {token.name}
                                </div>
                                <div className="text-xs text-gray-400 flex items-center">
                                  <span className="mr-1">{token.symbol}</span>
                                  <span className="inline-flex items-center justify-center bg-purple-900 bg-opacity-40 rounded-sm px-1">
                                    <span className="mr-1 w-2 h-2 rounded-full bg-accent-green"></span>
                                    <span className="text-[10px]">Empty</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-700">
                              <div className="text-xs text-gray-400">Token account</div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-accent-green">0.00001 SOL</div>
                                <div className="text-[10px] text-gray-500 font-mono">
                                  {token.pubkey.substring(0, 6)}...{token.pubkey.substring(token.pubkey.length - 4)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                    
                    {eligibleTokens.length > 6 && (
                      <div className="mt-4 text-center">
                        <button 
                          onClick={() => setShowTokenList(false)} 
                          className="text-xs text-gray-400 hover:text-white"
                        >
                          Close Token List
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Game Interface */}
      {showGameOptions && (
        <div className="bg-gray-800 bg-opacity-50 p-6 rounded-lg border border-gray-700">
          <h2 className="text-xl font-bold text-purple-300 mb-4">Choose Your Option</h2>
          
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 p-4 bg-gray-900 bg-opacity-80 rounded-lg border border-blue-900 hover:border-blue-500 transition-colors">
              <h3 className="text-lg font-bold text-accent-blue mb-2">Play Plinko</h3>
              <p className="text-sm text-gray-300 mb-4">
                Take a risk and multiply your earnings with Plinko. Choose your bet amount and try your luck!
              </p>
              
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Select Bet Amount</label>
                <select 
                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                  value={selectedBet}
                  onChange={(e) => setSelectedBet(parseFloat(e.target.value))}
                  disabled={animationRunning}
                >
                  <option value={0.0001}>0.0001 SOL (Min)</option>
                  <option value={0.001}>0.001 SOL</option>
                  <option value={0.005}>0.005 SOL</option>
                  <option value={gameBalance}>ALL IN ({gameBalance.toFixed(6)} SOL)</option>
                </select>
              </div>
              
              <button
                onClick={handlePlayPlinko}
                disabled={gameBalance < selectedBet || animationRunning}
                className={`w-full retro-button py-2 ${gameBalance < selectedBet || animationRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span>PLAY PLINKO</span>
              </button>
            </div>
            
            <div className="flex-1 p-4 bg-gray-900 bg-opacity-80 rounded-lg border border-green-900 hover:border-green-500 transition-colors">
              <h3 className="text-lg font-bold text-accent-green mb-2">Withdraw SOL</h3>
              <p className="text-sm text-gray-300 mb-4">
                Play it safe and withdraw your SOL directly to your wallet.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Amount to Withdraw</label>
                <div className="bg-gray-800 border border-gray-700 rounded p-2 text-white">
                  {gameBalance.toFixed(6)} SOL
                </div>
              </div>
              
              <button
                onClick={handleWithdraw}
                disabled={gameBalance <= 0 || animationRunning}
                className={`w-full retro-button py-2 ${gameBalance <= 0 || animationRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span>WITHDRAW SOL</span>
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Plinko Game Board */}
      {gameState === 'playing' || gameState === 'finished' ? (
        <div className="bg-gray-800 bg-opacity-50 p-6 rounded-lg border border-gray-700">
          <h2 className="text-xl font-bold text-purple-300 mb-4">
            {gameState === 'playing' ? 'Plinko Game In Progress' : 'Game Results'}
          </h2>
          
          <div className="relative">
            <canvas 
              ref={canvasRef} 
              className="w-full h-80 bg-gray-900 rounded-lg"
            ></canvas>
            
            {gameState === 'finished' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 rounded-lg">
                <div className="text-2xl font-bold mb-2">
                  {plinkoResult > selectedBet ? (
                    <span className="text-accent-green">You Won!</span>
                  ) : (
                    <span className="text-accent-red">Better Luck Next Time</span>
                  )}
                </div>
                <div className="text-4xl font-bold mb-4">
                  {plinkoResult.toFixed(6)} SOL
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setGameState('ready');
                      setPlinkoResult(0);
                    }}
                    className="retro-button py-2"
                  >
                    Play Again
                  </button>
                  <button 
                    onClick={handleWithdraw}
                    className="retro-button py-2"
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      
      {/* Debug Panel */}
      <div className="mt-8">
        <button 
          onClick={() => setShowDebug(!showDebug)}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          {showDebug ? "Hide Debug Info" : "Show Debug Info"}
        </button>
        
        {showDebug && (
          <div className="mt-2 p-2 bg-black text-gray-400 text-xs font-mono rounded h-40 overflow-y-auto">
            {debugInfo.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 