// Test the get_transaction_by_hash function
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const BASE_RPC_URL = 'https://mainnet.base.org';
const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS;
// this is the $10 transact
const YOUR_TX_HASH = '0x210164e493e6b56e85c04e13c7ec6f1f40b132658a450384df5cc02d620115fe';

console.log('Testing get_transaction_by_hash function');
console.log('Tx Hash:', YOUR_TX_HASH);
console.log('');

const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);

async function test() {
  try {
    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(YOUR_TX_HASH);

    if (!receipt) {
      console.log('❌ Transaction not found');
      return;
    }

    // Get block details for timestamp
    const block = await provider.getBlock(receipt.blockNumber);

    // Parse USDC Transfer events from logs
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const usdcTransfers = [];

    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
        log.topics[0] === transferTopic
      ) {
        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        const value = ethers.toBigInt(log.data);
        const valueUSDC = ethers.formatUnits(value, 6);

        usdcTransfers.push({
          from,
          to,
          value: value.toString(),
          valueUSDC,
        });
      }
    }

    const result = {
      transaction_hash: YOUR_TX_HASH,
      block_number: receipt.blockNumber,
      timestamp: block.timestamp,
      date: new Date(block.timestamp * 1000).toISOString(),
      status: receipt.status === 1 ? 'success' : 'failed',
      from: receipt.from,
      to: receipt.to,
      gas_used: receipt.gasUsed.toString(),
      usdc_transfers: usdcTransfers,
      network: 'Base Mainnet',
    };

    console.log('✅ Transaction found!');
    console.log('');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    console.log('✅ get_transaction_by_hash is working!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();
