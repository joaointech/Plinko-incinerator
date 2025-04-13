import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { 
  generateServerSeed, 
  generateClientSeed, 
  hashServerSeed, 
  calculateGameResult, 
  verifyGameResult,
  GameOptions
} from './utils/provableFairness';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store user state
interface UserState {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  balance: number;
}

const userStates = new Map<string, UserState>();

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Plinko server is running' });
});

// Provable fairness API
app.get('/api/verify', (req, res) => {
  const { serverSeed, clientSeed, nonce, riskMode, rows, result } = req.query;
  
  if (!serverSeed || !clientSeed || !nonce || !riskMode || !rows || !result) {
    return res.status(400).json({ status: 'error', message: 'Missing parameters' });
  }
  
  try {
    const options: GameOptions = {
      rows: parseInt(rows as string),
      riskMode: riskMode as 'low' | 'medium' | 'high'
    };
    
    const verified = verifyGameResult(
      serverSeed as string,
      clientSeed as string,
      parseInt(nonce as string),
      options,
      JSON.parse(result as string)
    );
    
    res.status(200).json({ status: 'ok', verified });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Verification failed', error: String(error) });
  }
});

// Socket events
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  // Initialize user state with a server seed and client seed
  const serverSeed = generateServerSeed();
  const clientSeed = generateClientSeed();
  
  userStates.set(socket.id, {
    serverSeed,
    clientSeed,
    nonce: 0,
    balance: 1000 // Default starting balance
  });
  
  // Send initial seed data to client
  socket.emit('game:init', {
    hashedServerSeed: hashServerSeed(serverSeed),
    clientSeed,
    balance: 1000
  });
  
  // Handle client requesting a new server seed
  socket.on('game:new-server-seed', () => {
    const userState = userStates.get(socket.id);
    
    if (userState) {
      // Reveal the old server seed
      socket.emit('game:reveal-seed', {
        serverSeed: userState.serverSeed
      });
      
      // Generate a new server seed
      const newServerSeed = generateServerSeed();
      userState.serverSeed = newServerSeed;
      userState.nonce = 0;
      
      userStates.set(socket.id, userState);
      
      // Send the new hashed server seed
      socket.emit('game:new-seed', {
        hashedServerSeed: hashServerSeed(newServerSeed)
      });
    }
  });
  
  // Handle client requesting a new client seed
  socket.on('game:new-client-seed', (data) => {
    const userState = userStates.get(socket.id);
    
    if (userState) {
      // Update the client seed
      userState.clientSeed = data.clientSeed || generateClientSeed();
      userState.nonce = 0;
      
      userStates.set(socket.id, userState);
      
      // Confirm new client seed
      socket.emit('game:new-seed', {
        clientSeed: userState.clientSeed
      });
    }
  });
  
  // Handle game play request
  socket.on('game:play', (data) => {
    const userState = userStates.get(socket.id);
    
    if (!userState) {
      socket.emit('game:error', { message: 'User state not found' });
      return;
    }
    
    const { betAmount, riskMode, rows } = data;
    
    // Validate bet amount and balance
    if (betAmount <= 0 || betAmount > userState.balance) {
      socket.emit('game:error', { message: 'Invalid bet amount or insufficient balance' });
      return;
    }
    
    // Calculate the game result
    const gameOptions: GameOptions = {
      rows: rows || 16,
      riskMode: riskMode || 'medium'
    };
    
    const result = calculateGameResult(
      userState.serverSeed,
      userState.clientSeed,
      userState.nonce,
      gameOptions
    );
    
    // Update balance
    const winAmount = betAmount * result.finalMultiplier;
    userState.balance = userState.balance - betAmount + winAmount;
    userState.nonce++;
    
    userStates.set(socket.id, userState);
    
    // Send result to client
    socket.emit('game:result', {
      ...result,
      betAmount,
      winAmount,
      balance: userState.balance
    });
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    userStates.delete(socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3333;
server.listen(PORT, () => {
  console.log(`Plinko game server running on port ${PORT}`);
}); 