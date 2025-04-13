'use client';

import { io, Socket } from 'socket.io-client';

export interface GameState {
  clientSeed: string;
  hashedServerSeed: string;
  serverSeed?: string;
  balance: number;
  isPlaying: boolean;
  nonce?: number;
  gameHistory: GameResult[];
}

export interface GameOptions {
  betAmount: number;
  riskMode: 'low' | 'medium' | 'high';
  rows: number;
  isAuto: boolean;
}

export interface GameResult {
  clientSeed: string;
  serverSeed: string;
  hashedServerSeed: string;
  nonce: number;
  gameResult: number;
  path: number[];
  finalMultiplier: number;
  betAmount: number;
  winAmount: number;
  balance: number;
  timestamp?: number;
  riskMode: 'low' | 'medium' | 'high';
  rows: number;
}

export const MULTIPLIERS = {
  low: [1.5, 1.2, 1.1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.5],
  medium: [5, 3, 2, 1.5, 1, 0.5, 0.3, 0.2, 0.1, 0.2, 0.3, 0.5, 1, 1.5, 2, 3, 5],
  high: [110, 41, 10, 5, 3, 2, 1.5, 0.5, 0.3, 0.5, 1.5, 2, 3, 5, 10, 41, 110]
};

export class PlinkoService {
  private socket: Socket | null = null;
  private serverUrl: string;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();
  
  constructor(serverUrl: string = 'http://localhost:3333') {
    this.serverUrl = serverUrl;
  }
  
  // Connect to the server
  connect(): Promise<GameState> {
    return new Promise((resolve, reject) => {
      try {
        console.log('Attempting to connect to Plinko server at:', this.serverUrl);
        this.socket = io(this.serverUrl);
        
        // Set up event listeners
        this.socket.on('connect', () => {
          console.log('Connected to Plinko server, socket ID:', this.socket?.id);
        });
        
        this.socket.on('disconnect', () => {
          console.log('Disconnected from Plinko server');
          this.notifyListeners('disconnect', {});
        });
        
        this.socket.on('connect_error', (error) => {
          console.error('Connection error to Plinko server:', error);
          reject(error);
        });
        
        // Handle game initialization
        this.socket.on('game:init', (data) => {
          console.log('Game initialized with data:', data);
          const gameState: GameState = {
            clientSeed: data.clientSeed,
            hashedServerSeed: data.hashedServerSeed,
            balance: data.balance,
            isPlaying: false,
            gameHistory: []
          };
          
          resolve(gameState);
          this.notifyListeners('game:init', gameState);
        });
        
        // Handle game results
        this.socket.on('game:result', (data) => {
          console.log('Game result received:', data);
          this.notifyListeners('game:result', data);
        });
        
        // Handle errors
        this.socket.on('game:error', (data) => {
          console.error('Game error from server:', data);
          this.notifyListeners('game:error', data);
        });
        
        // Handle seed changes
        this.socket.on('game:new-seed', (data) => {
          console.log('New seed received:', data);
          this.notifyListeners('game:new-seed', data);
        });
        
        this.socket.on('game:reveal-seed', (data) => {
          console.log('Revealed seed received:', data);
          this.notifyListeners('game:reveal-seed', data);
        });
      } catch (error) {
        console.error('Exception during socket connection:', error);
        reject(error);
      }
    });
  }
  
  // Disconnect from the server
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
  
  // Play a game
  play(options: GameOptions): void {
    if (!this.socket) {
      console.error('Not connected to server, cannot play');
      throw new Error('Not connected to the Plinko server');
    }
    
    console.log('Emitting game:play event with options:', options);
    this.socket.emit('game:play', options);
  }
  
  // Request a new server seed
  requestNewServerSeed(): void {
    if (!this.socket) {
      throw new Error('Not connected to the Plinko server');
    }
    
    this.socket.emit('game:new-server-seed');
  }
  
  // Update the client seed
  updateClientSeed(clientSeed: string): void {
    if (!this.socket) {
      throw new Error('Not connected to the Plinko server');
    }
    
    this.socket.emit('game:new-client-seed', { clientSeed });
  }
  
  // Add an event listener
  on(event: string, callback: (data: any) => void): void {
    const callbacks = this.listeners.get(event) || [];
    callbacks.push(callback);
    this.listeners.set(event, callbacks);
  }
  
  // Remove an event listener
  off(event: string, callback: (data: any) => void): void {
    const callbacks = this.listeners.get(event) || [];
    const index = callbacks.indexOf(callback);
    
    if (index !== -1) {
      callbacks.splice(index, 1);
      this.listeners.set(event, callbacks);
    }
  }
  
  // Notify all listeners for an event
  private notifyListeners(event: string, data: any): void {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => callback(data));
  }
  
  // Verify a game result (client-side verification)
  async verifyGameResult(result: GameResult): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/api/verify?serverSeed=${result.serverSeed}&clientSeed=${result.clientSeed}&nonce=${result.nonce}&riskMode=${result.riskMode}&rows=${result.rows}&result=${encodeURIComponent(JSON.stringify(result))}`);
      
      if (!response.ok) {
        throw new Error('Failed to verify game result');
      }
      
      const data = await response.json();
      return data.verified;
    } catch (error) {
      console.error('Error verifying game result:', error);
      return false;
    }
  }
} 