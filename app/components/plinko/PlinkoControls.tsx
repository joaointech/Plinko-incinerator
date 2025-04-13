'use client';

import React, { useState } from 'react';

interface PlinkoControlsProps {
  balance: number;
  onPlay: (options: PlayOptions) => void;
  disabled: boolean;
  onNewServerSeed: () => void;
  onNewClientSeed: (seed: string) => void;
  clientSeed: string;
  hashedServerSeed: string;
}

export interface PlayOptions {
  betAmount: number;
  riskMode: 'low' | 'medium' | 'high';
  rows: number;
  isAuto: boolean;
}

export default function PlinkoControls({
  balance,
  onPlay,
  disabled,
  onNewServerSeed,
  onNewClientSeed,
  clientSeed,
  hashedServerSeed
}: PlinkoControlsProps) {
  const [betAmount, setBetAmount] = useState<number>(0.001);
  const [riskMode, setRiskMode] = useState<'low' | 'medium' | 'high'>('medium');
  const [rows, setRows] = useState<number>(16);
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const [showSeedOptions, setShowSeedOptions] = useState<boolean>(false);
  const [newClientSeed, setNewClientSeed] = useState<string>(clientSeed);
  
  // Handle bet amount changes
  const handleBetAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      setBetAmount(value);
    }
  };
  
  // Handle half and double buttons
  const halfBet = () => {
    setBetAmount(prev => Math.max(prev / 2, 0.0001));
  };
  
  const doubleBet = () => {
    setBetAmount(prev => Math.min(prev * 2, balance));
  };
  
  // Handle play button click
  const handlePlay = () => {
    onPlay({
      betAmount,
      riskMode,
      rows,
      isAuto
    });
  };
  
  // Handle client seed update
  const handleClientSeedUpdate = () => {
    onNewClientSeed(newClientSeed);
    setShowSeedOptions(false);
  };
  
  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-800 rounded-lg text-white">
      {/* Manual/Auto switch */}
      <div className="flex gap-2 rounded-lg overflow-hidden">
        <button 
          className={`flex-1 py-2 ${!isAuto ? 'bg-blue-600' : 'bg-gray-700'}`}
          onClick={() => setIsAuto(false)}
        >
          Manual
        </button>
        <button 
          className={`flex-1 py-2 ${isAuto ? 'bg-blue-600' : 'bg-gray-700'}`}
          onClick={() => setIsAuto(true)}
        >
          Automático
        </button>
      </div>
      
      {/* Bet Amount */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-gray-400">Valor da Aposta</label>
        <div className="flex items-center">
          <div className="text-xs bg-gray-700 px-2 py-1 rounded-l">US$</div>
          <input
            type="number"
            value={betAmount}
            onChange={handleBetAmountChange}
            className="flex-1 bg-gray-700 py-2 px-3 text-white focus:outline-none"
            step={0.0001}
            min={0.0001}
            max={balance}
          />
          <div className="flex">
            <button 
              onClick={halfBet}
              className="bg-gray-700 px-3 py-2 text-sm"
            >
              ½
            </button>
            <button 
              onClick={doubleBet}
              className="bg-gray-700 px-3 py-2 text-sm rounded-r"
            >
              2×
            </button>
          </div>
        </div>
      </div>
      
      {/* Risk Level */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-gray-400">Risco</label>
        <select
          value={riskMode}
          onChange={(e) => setRiskMode(e.target.value as 'low' | 'medium' | 'high')}
          className="bg-gray-700 py-2 px-3 rounded text-white focus:outline-none"
        >
          <option value="low">Baixo</option>
          <option value="medium">Médio</option>
          <option value="high">Alto</option>
        </select>
      </div>
      
      {/* Number of rows */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-gray-400">Linhas</label>
        <select
          value={rows}
          onChange={(e) => setRows(parseInt(e.target.value))}
          className="bg-gray-700 py-2 px-3 rounded text-white focus:outline-none"
        >
          <option value="8">8</option>
          <option value="12">12</option>
          <option value="16">16</option>
        </select>
      </div>
      
      {/* Play Button */}
      <button
        onClick={handlePlay}
        disabled={disabled || betAmount <= 0 || betAmount > balance}
        className="bg-green-500 hover:bg-green-600 disabled:bg-green-800 disabled:opacity-50 py-3 rounded-lg font-medium text-center"
      >
        Aposta
      </button>
      
      {/* Fairness Section */}
      <div className="mt-4">
        <button
          onClick={() => setShowSeedOptions(!showSeedOptions)}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Provably Fair Options
        </button>
        
        {showSeedOptions && (
          <div className="mt-2 p-3 bg-gray-900 rounded-lg text-xs space-y-3">
            <div>
              <div className="text-gray-400 mb-1">Server Seed (hashed)</div>
              <div className="bg-gray-800 p-2 rounded break-all">
                {hashedServerSeed}
              </div>
            </div>
            
            <div>
              <div className="text-gray-400 mb-1">Client Seed</div>
              <input
                type="text"
                value={newClientSeed}
                onChange={(e) => setNewClientSeed(e.target.value)}
                className="w-full bg-gray-800 p-2 rounded text-white focus:outline-none"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={onNewServerSeed}
                className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded text-xs"
              >
                New Server Seed
              </button>
              <button
                onClick={handleClientSeedUpdate}
                className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded text-xs"
              >
                Update Client Seed
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 