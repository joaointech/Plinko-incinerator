import { Config } from "../config/solana";
import {
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  PublicKey,
} from "@solana/web3.js";
import {
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";

// Types for token metadata
export interface TokenMetadata {
  name: string;
  symbol: string;
  image: string;
  mint: string;
}

// Cache for token metadata to avoid repeated API calls
const tokenMetadataCache: Record<string, TokenMetadata> = {};

// Fetch token metadata from DexScreener API
export async function getTokenMetadata(mintAddress: string): Promise<TokenMetadata> {
  // Return from cache if available
  if (tokenMetadataCache[mintAddress]) {
    return tokenMetadataCache[mintAddress];
  }
  
  try {
    // Use DexScreener API to get token metadata
    const url = `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`;
    console.log(`Fetching metadata for ${mintAddress} from DexScreener`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch token metadata: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data || !data.pairs || data.pairs.length === 0) {
      console.log(`No DexScreener data found for ${mintAddress}`);
      throw new Error("No metadata found");
    }
    
    // Get the first pair data which contains token info
    const tokenData = data.pairs[0];
    
    // Use the image URL from the info section if available
    let imageUrl = '';
    if (tokenData.info && tokenData.info.imageUrl) {
      imageUrl = tokenData.info.imageUrl;
    } else {
      // Fallback to generic source
      imageUrl = `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mintAddress}/logo.png`;
    }
    
    const result: TokenMetadata = {
      name: tokenData.baseToken.name || 'Unknown Token',
      symbol: tokenData.baseToken.symbol || '???',
      image: imageUrl,
      mint: mintAddress,
    };
    
    // Cache the result
    tokenMetadataCache[mintAddress] = result;
    console.log(`Cached metadata for ${mintAddress}:`, result);
    return result;
  } catch (error) {
    console.error(`Error fetching metadata for ${mintAddress}:`, error);
    
    // Try Jupiter token list API as a fallback
    try {
      const jupiterUrl = `https://token.jup.ag/strict/${mintAddress}`;
      const jupiterResponse = await fetch(jupiterUrl);
      
      if (jupiterResponse.ok) {
        const tokenInfo = await jupiterResponse.json();
        
        if (tokenInfo) {
          const result: TokenMetadata = {
            name: tokenInfo.name || `Token ${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`,
            symbol: tokenInfo.symbol || '???',
            image: tokenInfo.logoURI || '',
            mint: mintAddress,
          };
          
          // Cache the result
          tokenMetadataCache[mintAddress] = result;
          console.log(`Cached Jupiter metadata for ${mintAddress}:`, result);
          return result;
        }
      }
    } catch (jupiterError) {
      console.error(`Jupiter fallback failed for ${mintAddress}:`, jupiterError);
    }
    
    // Fallback to basic metadata
    const fallbackMetadata: TokenMetadata = {
      name: `Token ${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`,
      symbol: '???',
      image: '',
      mint: mintAddress,
    };
    
    // Cache the fallback result
    tokenMetadataCache[mintAddress] = fallbackMetadata;
    return fallbackMetadata;
  }
}

// Batch fetch token metadata for multiple tokens
export async function batchGetTokenMetadata(mintAddresses: string[]): Promise<Record<string, TokenMetadata>> {
  // Using a map to track promises for each address
  const metadataPromises: Record<string, Promise<TokenMetadata>> = {};
  
  // Filter out mints we already have in cache
  for (const mint of mintAddresses) {
    if (tokenMetadataCache[mint]) {
      continue; // Skip if already in cache
    }
    
    // Create a promise for each token's metadata
    metadataPromises[mint] = getTokenMetadata(mint);
  }
  
  // Wait for all promises to resolve
  if (Object.keys(metadataPromises).length > 0) {
    try {
      const mintAddressesArray = Object.keys(metadataPromises);
      const promisesArray = Object.values(metadataPromises);
      
      console.log(`Fetching metadata for ${mintAddressesArray.length} tokens`);
      
      // Resolve all promises
      const results = await Promise.allSettled(promisesArray);
      
      // Process results
      results.forEach((result, index) => {
        const mintAddress = mintAddressesArray[index];
        
        if (result.status === 'fulfilled') {
          // Successful result is already cached in getTokenMetadata
        } else {
          console.error(`Failed to fetch metadata for ${mintAddress}:`, result.reason);
          // Create fallback for failures
          tokenMetadataCache[mintAddress] = {
            name: `Token ${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`,
            symbol: '???',
            image: '',
            mint: mintAddress,
          };
        }
      });
    } catch (error) {
      console.error("Error batch fetching token metadata:", error);
    }
  }
  
  // Return metadata for all requested mints from cache
  return mintAddresses.reduce((acc, mint) => {
    acc[mint] = tokenMetadataCache[mint] || {
      name: `Token ${mint.slice(0, 4)}...${mint.slice(-4)}`,
      symbol: '???',
      image: '',
      mint: mint,
    };
    return acc;
  }, {} as Record<string, TokenMetadata>);
}

// Tokens that should not be incinerated
export const blacklist = [
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // Example: USDC
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Example: USDT
];

export interface TokenAccountData {
  info: {
    isNative: boolean;
    mint: string;
    owner: string;
    state: string;
    tokenAmount: {
      amount: string;
      decimals: number;
      uiAmount: number;
      uiAmountString: string;
    };
  };
}

export interface TokenAccount {
  pubkey: PublicKey;
  account: {
    data: {
      parsed: TokenAccountData;
    };
  };
}

// For tracking the progress of token account fetching
export type FetchProgressCallback = (stage: string, progress: number, message?: string) => void;

export async function getTokenAccounts(progressCallback?: FetchProgressCallback): Promise<TokenAccount[]> {
  if (!Config.solWallet.publicKey) {
    return [];
  }
  
  // Notify progress if callback provided
  const notifyProgress = (stage: string, progress: number, message?: string) => {
    if (progressCallback) {
      progressCallback(stage, progress, message);
    }
  };
  
  console.log("Fetching token accounts for wallet:", Config.solWallet.publicKey.toString());
  console.log("Using RPC URL:", (Config.connection as any)._rpcEndpoint);
  
  // Create a timeout promise that rejects after the specified duration
  const createTimeoutPromise = (ms: number, method: string) => {
    return new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`RPC timeout after ${ms/1000}s while executing ${method}`));
      }, ms);
    });
  };
  
  // Try multiple methods to get token accounts, with fallbacks
  let accounts: TokenAccount[] = [];
  
  notifyProgress('init', 10, 'Initializing token account scan');
  
  // Attempt 1: Use getParsedTokenAccountsByOwner with spl-token programId filter
  try {
    console.log("Attempt 1: Using getParsedTokenAccountsByOwner with TOKEN_PROGRAM_ID filter");
    notifyProgress('accounts', 20, 'Attempting primary scan method');
    
    try {
      // Increase timeout to 30 seconds to allow more time for RPC response
      const atas = await Promise.race([
        Config.connection.getParsedTokenAccountsByOwner(
          Config.solWallet.publicKey,
          { programId: TOKEN_PROGRAM_ID }
        ) as any,
        createTimeoutPromise(30000, 'getParsedTokenAccountsByOwner')
      ]);
      
      if (atas?.value?.length > 0) {
        console.log(`Found ${atas.value.length} token accounts with attempt 1`);
        notifyProgress('accounts', 70, `Found ${atas.value.length} token accounts`);
        accounts = atas.value;
        return accounts;
      } else {
        notifyProgress('accounts', 30, 'No accounts found, trying fallback method');
      }
    } catch (error) {
      // Check for specific RPC errors and provide more helpful messages
      const errorMessage = String(error);
      if (errorMessage.includes('timeout')) {
        console.error("RPC timeout on first attempt - network congestion");
        notifyProgress('error', 30, 'Network congestion - trying fallback method');
      } else if (errorMessage.includes('429')) {
        console.error("RPC rate limit exceeded");
        notifyProgress('error', 30, 'Rate limit exceeded - trying fallback method');
      } else if (errorMessage.includes('503')) {
        console.error("RPC service unavailable");
        notifyProgress('error', 30, 'Service unavailable - trying fallback method');
      } else {
        console.error("Error with attempt 1:", error);
        notifyProgress('error', 30, 'Connection error - trying fallback method');
      }
    }
  } catch (err) {
    console.error("General error with attempt 1:", err);
    notifyProgress('error', 30, 'Error in primary scan - trying fallback method');
  }
  
  // Attempt 2: Using getTokenAccountsByOwner
  try {
    console.log("Attempt 2: Using getTokenAccountsByOwner");
    notifyProgress('accounts', 40, 'Trying alternative method (1/3)');
    
    try {
      // Using 25 seconds timeout for second attempt
      const response = await Promise.race([
        Config.connection.getTokenAccountsByOwner(
          Config.solWallet.publicKey,
          { programId: TOKEN_PROGRAM_ID }
        ) as any,
        createTimeoutPromise(25000, 'getTokenAccountsByOwner')
      ]);
      
      if (response?.value?.length > 0) {
        console.log(`Found ${response.value.length} token accounts with attempt 2`);
        notifyProgress('accounts', 70, `Found ${response.value.length} token accounts`);
        
        // Convert to the expected format
        accounts = response.value.map((item: any) => {
          const accountInfo = item.account;
          return {
            pubkey: item.pubkey,
            account: {
              data: {
                parsed: {
                  info: {
                    mint: new PublicKey(accountInfo.data.slice(0, 32)).toString(),
                    owner: Config.solWallet.publicKey!.toString(),
                    tokenAmount: {
                      amount: "0",
                      decimals: 0,
                      uiAmount: 0,
                      uiAmountString: "0"
                    }
                  }
                }
              }
            }
          } as any;
        });
        
        return accounts;
      } else {
        notifyProgress('accounts', 50, 'No accounts found, trying next method');
      }
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('timeout')) {
        console.error("RPC timeout on second attempt");
        notifyProgress('error', 50, 'Network congestion persists - trying final methods');
      } else {
        console.error("Error with attempt 2:", error);
        notifyProgress('error', 50, 'Error in second scan - trying final methods');
      }
    }
  } catch (err) {
    console.error("General error with attempt 2:", err);
    notifyProgress('error', 50, 'Error in fallback scan - trying final method');
  }
  
  // Attempt 3: Using getProgramAccounts with memcmp filter
  try {
    console.log("Attempt 3: Using getProgramAccounts with memcmp filter");
    notifyProgress('accounts', 60, 'Trying fallback method (2/3)');
    
    try {
      // Using 20 seconds timeout for third attempt
      const programAccounts = await Promise.race([
        Config.connection.getProgramAccounts(
          TOKEN_PROGRAM_ID,
          {
            filters: [
              { dataSize: 165 }, // Size of token account data
              {
                memcmp: {
                  offset: 32, // Owner offset in token account data
                  bytes: Config.solWallet.publicKey.toBase58(),
                },
              },
            ],
          }
        ) as any,
        createTimeoutPromise(20000, 'getProgramAccounts with memcmp')
      ]);
      
      if (programAccounts?.length > 0) {
        console.log(`Found ${programAccounts.length} token accounts with attempt 3`);
        notifyProgress('accounts', 80, `Found ${programAccounts.length} token accounts`);
        
        // Convert the raw account data to our format
        accounts = programAccounts.map((account: any) => {
          const data = account.account.data;
          // Basic parsing of SPL token data
          return {
            pubkey: account.pubkey,
            account: {
              data: {
                parsed: {
                  info: {
                    mint: new PublicKey(data.slice(0, 32)).toString(),
                    owner: Config.solWallet.publicKey!.toString(),
                    tokenAmount: {
                      amount: "0", // We're going to assume it's an empty account
                      decimals: 0,
                      uiAmount: 0,
                      uiAmountString: "0"
                    }
                  }
                }
              }
            }
          } as any;
        });
        
        return accounts;
      } else {
        notifyProgress('accounts', 65, 'No accounts found, trying final method');
      }
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('timeout')) {
        notifyProgress('error', 65, 'Network congestion continues - trying final method');
      } else {
        notifyProgress('error', 65, 'Error in third scan - one more method to try');
      }
    }
  } catch (err) {
    console.error("General error with attempt 3:", err);
    notifyProgress('error', 65, 'Error in third scan - trying final method');
  }
  
  // Attempt 4: Using getProgramAccounts with only dataSize filter
  try {
    console.log("Attempt 4: Using getProgramAccounts with only dataSize filter");
    notifyProgress('accounts', 75, 'Trying final fallback method (3/3)');
    
    try {
      // Using 15 seconds timeout for last attempt - more limited approach
      const programAccounts = await Promise.race([
        Config.connection.getProgramAccounts(
          TOKEN_PROGRAM_ID,
          {
            filters: [
              { dataSize: 165 }, // Size of token account data
            ],
            commitment: 'confirmed',
          }
        ) as any,
        createTimeoutPromise(15000, 'getProgramAccounts basic')
      ]);
      
      if (programAccounts?.length > 0) {
        console.log(`Found ${programAccounts.length} token accounts with attempt 4`);
        notifyProgress('accounts', 85, `Found ${programAccounts.length} potential accounts, filtering...`);
        
        // Filter for accounts owned by the wallet
        const filteredAccounts = programAccounts.filter((account: any) => {
          try {
            const data = account.account.data;
            const ownerAddress = new PublicKey(data.slice(32, 64)).toString();
            return ownerAddress === Config.solWallet.publicKey!.toString();
          } catch (err) {
            return false;
          }
        });
        
        console.log(`After filtering, found ${filteredAccounts.length} accounts owned by wallet`);
        notifyProgress('accounts', 90, `Found ${filteredAccounts.length} token accounts after filtering`);
        
        if (filteredAccounts.length > 0) {
          // Convert the raw account data to our format
          accounts = filteredAccounts.map((account: any) => {
            const data = account.account.data;
            // Basic parsing of SPL token data
            return {
              pubkey: account.pubkey,
              account: {
                data: {
                  parsed: {
                    info: {
                      mint: new PublicKey(data.slice(0, 32)).toString(),
                      owner: Config.solWallet.publicKey!.toString(),
                      tokenAmount: {
                        amount: "0", // We're going to assume it's an empty account
                        decimals: 0,
                        uiAmount: 0,
                        uiAmountString: "0"
                      }
                    }
                  }
                }
              }
            } as any;
          });
          
          return accounts;
        } else {
          notifyProgress('accounts', 95, 'No matching accounts found after filtering');
        }
      } else {
        notifyProgress('accounts', 95, 'No token accounts found with any method');
      }
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('timeout')) {
        notifyProgress('error', 95, 'Network connection issues during final scan attempt');
      } else {
        notifyProgress('error', 95, 'Error in final scan method');
      }
    }
  } catch (err) {
    console.error("Error with attempt 4:", err);
    notifyProgress('error', 95, 'All scan methods failed');
  }
  
  console.warn("All attempts to fetch token accounts failed");
  notifyProgress('error', 100, 'Unable to scan token accounts. Network may be congested.');
  
  // For development/demo purposes: Generate mock data when all RPC calls fail
  // This is useful for testing the UI when RPC endpoints are down or rate-limited
  if (process.env.NODE_ENV !== 'production' || window.location.hostname === 'localhost') {
    console.log("Generating mock data for development/demo purposes");
    notifyProgress('accounts', 100, 'Using mock data for development purposes');
    
    // Create 5 mock token accounts
    const mockAccounts = Array.from({ length: 5 }, (_, i) => {
      const randomMint = `${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
      const randomPubkey = `${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
      
      return {
        pubkey: {
          toString: () => randomPubkey
        },
        account: {
          data: {
            parsed: {
              info: {
                mint: randomMint,
                owner: Config.solWallet.publicKey!.toString(),
                tokenAmount: {
                  amount: "0",
                  decimals: 0,
                  uiAmount: 0,
                  uiAmountString: "0"
                }
              }
            }
          }
        }
      } as any;
    });
    
    return mockAccounts;
  }
  
  return [];
}

export async function incinerateTokens(selectedTokens?: string[]): Promise<{
  success: boolean;
  message: string;
  signature?: string;
}> {
  try {
    if (!Config.solWallet.publicKey) {
      return {
        success: false,
        message: "Wallet not connected",
      };
    }

    // When using wallet with external wallets, we don't have direct access to the keypair
    // This will be handled differently in production with a proper wallet adapter
    if (!Config.solWallet.payer) {
      return {
        success: false,
        message: "This demo requires a wallet adapter to sign transactions. In a real implementation, you would use the wallet's signTransaction method.",
      };
    }

    const atas = await Config.connection.getParsedTokenAccountsByOwner(
      Config.solWallet.publicKey,
      {
        programId: TOKEN_PROGRAM_ID,
      }
    );

    // Initialize the instructions array with the compute budget instructions
    const instructions = [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 45000 }),
    ];

    // Filter accounts based on selectedTokens if provided
    let accountsToProcess = atas.value;
    if (selectedTokens && selectedTokens.length > 0) {
      // If specific tokens are selected, only process those
      accountsToProcess = atas.value.filter(ata => {
        const data = (ata.account.data.parsed as TokenAccountData).info;
        return selectedTokens.includes(ata.pubkey.toString());
      });
    }

    // Calculate approximate SOL return (0.00203928 SOL per token account closed)
    const expectedReturnPerAccount = 0.00203928;
    const accountsToClose = Math.min(accountsToProcess.length, 15);
    
    if (accountsToClose === 0) {
      return {
        success: false,
        message: "No token accounts available to incinerate",
      };
    }

    const expectedReturn = expectedReturnPerAccount * accountsToClose;
    const feeAmount = expectedReturn * Config.FEE_PERCENTAGE;
    
    // Only add fee transfer if the amount is significant
    if (feeAmount > 0.00001) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: Config.solWallet.publicKey,
          toPubkey: Config.FEE_WALLET,
          lamports: Math.floor(feeAmount * 1_000_000_000), // Convert SOL to lamports
        })
      );
    }

    const block = await Config.connection.getLatestBlockhash({
      commitment: "processed",
    });
    
    let closedCount = 0;
    
    // Process selected token accounts (up to 15)
    for (const ata of accountsToProcess.slice(0, 15)) {
      const data = (ata.account.data.parsed as TokenAccountData).info;
      
      // Skip blacklisted tokens
      if (blacklist.includes(data.mint)) continue;
      
      // Skip accounts with non-zero balance
      if (data.tokenAmount.amount !== "0") {
        console.log("Skipping", data.mint);
        continue;
      }
      
      console.log("Incinerating token:", data.mint);
      closedCount++;

      instructions.push(
        createCloseAccountInstruction(
          ata.pubkey,
          Config.solWallet.publicKey,
          Config.solWallet.publicKey
        )
      );
    }
    
    if (closedCount === 0) {
      return {
        success: false,
        message: "No eligible token accounts to incinerate",
      };
    }

    const txn = new VersionedTransaction(
      new TransactionMessage({
        instructions,
        payerKey: Config.solWallet.publicKey,
        recentBlockhash: block.blockhash,
      }).compileToV0Message()
    );
    
    // Sign the transaction with the wallet
    txn.sign([Config.solWallet.payer]);
    let signature = bs58.encode(txn.signatures[0]);

    await Config.connection.sendTransaction(txn, {
      preflightCommitment: "processed",
      skipPreflight: false,
      maxRetries: 10,
    });

    let res = await Config.connection.confirmTransaction(
      {
        ...block,
        signature,
      },
      "processed"
    );
    
    if (!res.value.err) {
      return {
        success: true,
        message: `${closedCount} token accounts successfully incinerated`,
        signature,
      };
    } else {
      return {
        success: false,
        message: `Transaction failed: ${res.value.err}`,
        signature,
      };
    }
  } catch (error: any) {
    console.error("Incineration error:", error);
    return {
      success: false,
      message: `Error: ${error.message || "Unknown error"}`,
    };
  }
} 