'use client';

import PlinkoIncinerator from './components/PlinkoIncinerator';
import PlinkoGameClient from './components/plinko/PlinkoGameClient';
import WalletConnectButton from './components/WalletConnectButton';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-black bg-opacity-50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <div className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
              Plinko Incinerator
            </div>
            <span className="ml-2 text-xs bg-purple-900 text-purple-200 px-2 py-0.5 rounded-full">BETA</span>
          </div>
          <WalletConnectButton />
        </div>
      </header>
      
      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-orange-400 to-pink-600 bg-clip-text text-transparent mb-4">
            Incinerate Empty Token Accounts
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto">
            Clean up your wallet by burning dust accounts and play Plinko with the rewards.
            Each empty token account is worth 0.00001 SOL.
          </p>
        </div>
        
        <PlinkoIncinerator />
        
        {/* New Plinko Game with server-side probability */}
        <div className="mt-12 mb-6">
          <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent mb-4 text-center">
            Provably Fair Plinko Game
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto text-center mb-8">
            Try our new server-verified Plinko game with proper casino mathematics and provable fairness.
          </p>
          
          <PlinkoGameClient initialBalance={1000} />
        </div>
      </main>
      
      {/* Footer */}
      <footer className="mt-16 border-t border-gray-800 py-6 text-center text-sm text-gray-600">
        <p>This is an experimental application. Use at your own risk.</p>
        <p className="mt-2">
          <a href="https://solana.com" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors">
            Built on Solana
          </a>
          <span className="mx-2">•</span>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors">
            View on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
} 