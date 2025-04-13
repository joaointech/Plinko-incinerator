import { Connection, Keypair, PublicKey } from "@solana/web3.js";

// The wallet that will receive the 15% fee
const FEE_WALLET = process.env.NEXT_PUBLIC_FEE_WALLET || "73LRnd4cp6xuh5FtUjvPtuJrL2UTXtPeWkfZoWjkxYVZ";
const FEE_PERCENTAGE = 0.15; // 15%

// Helius RPC URL with API key
const HELIUS_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=c16e81df-e893-4bfb-b42a-a4e807ef65b7";

// Validate that the wallet address is in the correct format
let feeWalletPublicKey: PublicKey;
try {
  feeWalletPublicKey = new PublicKey(FEE_WALLET);
} catch (error) {
  console.error("Invalid fee wallet address, using default address instead:", error);
  // Use a default valid Solana address
  feeWalletPublicKey = new PublicKey("73LRnd4cp6xuh5FtUjvPtuJrL2UTXtPeWkfZoWjkxYVZ");
}

console.log("SOLANA RPC URL:", HELIUS_RPC_URL);

export const Config = {
  connection: new Connection(
    HELIUS_RPC_URL,
    {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
      httpHeaders: {
        "Content-Type": "application/json",
      },
    }
  ),
  solWallet: {
    publicKey: null as PublicKey | null,
    payer: null as Keypair | null,
  },
  FEE_WALLET: feeWalletPublicKey,
  FEE_PERCENTAGE,
};

// Function to update the wallet information
export const updateWallet = (publicKey: PublicKey, keypair: Keypair | null) => {
  Config.solWallet.publicKey = publicKey;
  Config.solWallet.payer = keypair;
}; 