/* global BigInt */
import { ethers } from 'ethers';

// Import contract data (will be generated after deployment)
let CONTRACT_ADDRESS = null;
let CONTRACT_ABI = null;

// Try to load contract address and ABI
try {
  const addressData = require('../contracts/contractAddress.json');
  CONTRACT_ADDRESS = addressData.contractAddress;
} catch (e) {
  console.log('Contract address not found. Deploy the contract first.');
}

try {
  CONTRACT_ABI = require('../contracts/MarketplaceABI.json');
} catch (e) {
  console.log('Contract ABI not found. Deploy the contract first.');
}

// Hardhat local network config
const HARDHAT_CHAIN_ID = 31337;
const HARDHAT_RPC_URL = 'http://127.0.0.1:8545';

/**
 * Connect to MetaMask and return account + contract instance
 */
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
  }

  try {
    // Request account access
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    });

    if (accounts.length === 0) {
      throw new Error('No accounts found');
    }

    // Check if on correct network (Hardhat local)
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    const currentChainId = parseInt(chainId, 16);

    if (currentChainId !== HARDHAT_CHAIN_ID) {
      // Try to switch to Hardhat network
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${HARDHAT_CHAIN_ID.toString(16)}` }]
        });
      } catch (switchError) {
        // If network doesn't exist, add it
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${HARDHAT_CHAIN_ID.toString(16)}`,
              chainName: 'Hardhat Local',
              nativeCurrency: {
                name: 'Ethereum',
                symbol: 'ETH',
                decimals: 18
              },
              rpcUrls: [HARDHAT_RPC_URL]
            }]
          });
        } else {
          console.warn('Could not switch network:', switchError.message);
        }
      }
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const account = accounts[0];

    // Create contract instance
    let contract = null;
    if (CONTRACT_ADDRESS && CONTRACT_ABI) {
      contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    }

    return { account, provider, signer, contract };
  } catch (error) {
    console.error('Wallet connection error:', error);
    throw error;
  }
}

/**
 * Get contract instance (read-only)
 */
export async function getContract() {
  if (!CONTRACT_ADDRESS || !CONTRACT_ABI) {
    throw new Error('Contract not deployed. Run: cd blockchain && npm run deploy');
  }

  if (window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  }

  // Fallback to JSON-RPC provider
  const provider = new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

/**
 * Format address for display (0x1234...5678)
 */
export function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format ETH value from wei
 */
export function formatEther(wei) {
  try {
    return ethers.formatEther(wei);
  } catch {
    return '0';
  }
}

/**
 * Parse ETH value to wei
 */
export function parseEther(eth) {
  try {
    return ethers.parseEther(eth.toString());
  } catch {
    return BigInt(0);
  }
}

/**
 * Get all files from the marketplace
 */
export async function getAllFiles(contract) {
  if (!contract) return [];

  try {
    const activeFileIds = await contract.getAllActiveFiles();
    const files = [];

    for (const id of activeFileIds) {
      const file = await contract.getFile(id);
      files.push({
        id: Number(id),
        title: file.title,
        description: file.description,
        previewImage: file.previewImage,
        price: file.price,
        seller: file.seller,
        totalSales: Number(file.totalSales),
        isActive: file.isActive
      });
    }

    return files;
  } catch (error) {
    console.error('Error fetching files:', error);
    return [];
  }
}

/**
 * Check if user has access to a file
 */
export async function checkFileAccess(contract, fileId, userAddress) {
  if (!contract || !userAddress) return false;

  try {
    return await contract.checkAccess(fileId, userAddress);
  } catch (error) {
    console.error('Error checking access:', error);
    return false;
  }
}

/**
 * Purchase a file
 */
export async function purchaseFile(contract, fileId, price) {
  if (!contract) throw new Error('Contract not available');

  const tx = await contract.purchaseFile(fileId, { value: price });
  await tx.wait();
  return tx;
}

/**
 * Get file CID after purchase
 */
export async function getFileCID(contract, fileId) {
  if (!contract) throw new Error('Contract not available');
  return await contract.getFileCID(fileId);
}

/**
 * Upload a new file to marketplace
 */
export async function uploadFile(contract, cid, title, description, previewImage, price) {
  if (!contract) throw new Error('Contract not available');

  const priceWei = parseEther(price);
  const tx = await contract.uploadFile(cid, title, description, previewImage, priceWei);
  await tx.wait();
  return tx;
}

/**
 * Sign a message using MetaMask for DRM verification
 */
export async function signMessage(message) {
  if (!window.ethereum) throw new Error('MetaMask not installed');
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return await signer.signMessage(message);
}
