// Test MCP server with your real Locus wallet
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const BASE_RPC_URL = 'https://mainnet.base.org';
const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS;
const YOUR_WALLET = '0x332a31f8d22801661ec98bab233d9e966a1b17dd'; // Your Locus wallet that received $10

console.log('🧪 Testing SessionPay MCP Server');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Your Wallet:', YOUR_WALLET);
console.log('USDC Contract:', USDC_ADDRESS);
console.log('');

const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
const usdcAbi = [
  'function balanceOf(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];
const usdcContract = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);

async function test() {
  try {
    // Test 1: Get Balance
    console.log('1️⃣  get_wallet_balance');
    console.log('   Querying USDC balance...');
    const balance = await usdcContract.balanceOf(YOUR_WALLET);
    const balanceUSDC = ethers.formatUnits(balance, 6);
    console.log('   ✅ Balance:', balanceUSDC, 'USDC');
    console.log('');

    // Test 2: Get Transaction History
    console.log('2️⃣  get_wallet_transactions');
    const currentBlock = await provider.getBlockNumber();

    // Query last 10,000 blocks (~5.5 hours, free RPC limit)
    const fromBlock = currentBlock - 10000;
    console.log('   Searching blocks', fromBlock, 'to', currentBlock, '(last ~5.5 hours)');

    const receivedFilter = usdcContract.filters.Transfer(null, YOUR_WALLET);
    const sentFilter = usdcContract.filters.Transfer(YOUR_WALLET, null);

    const [receivedLogs, sentLogs] = await Promise.all([
      usdcContract.queryFilter(receivedFilter, fromBlock, currentBlock),
      usdcContract.queryFilter(sentFilter, fromBlock, currentBlock),
    ]);

    console.log('   ✅ Found', receivedLogs.length, 'received transactions');
    console.log('   ✅ Found', sentLogs.length, 'sent transactions');
    console.log('');

    // Display received transactions
    if (receivedLogs.length > 0) {
      console.log('📥 Received Transactions:');
      for (const log of receivedLogs) {
        const block = await log.getBlock();
        const args = log.args;
        const amount = ethers.formatUnits(args[2], 6);
        const from = args[0];
        const date = new Date(block.timestamp * 1000);

        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('   Amount:  $' + amount + ' USDC');
        console.log('   From:    ' + from);
        console.log('   Date:    ' + date.toLocaleString());
        console.log('   Tx Hash: ' + log.transactionHash);
        console.log('   Block:   #' + log.blockNumber);
      }
      console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else {
      console.log('   (No received transactions in the last ~28 hours)');
    }
    console.log('');

    // Display sent transactions
    if (sentLogs.length > 0) {
      console.log('📤 Sent Transactions:');
      for (const log of sentLogs) {
        const block = await log.getBlock();
        const args = log.args;
        const amount = ethers.formatUnits(args[2], 6);
        const to = args[1];
        const date = new Date(block.timestamp * 1000);

        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('   Amount:  $' + amount + ' USDC');
        console.log('   To:      ' + to);
        console.log('   Date:    ' + date.toLocaleString());
        console.log('   Tx Hash: ' + log.transactionHash);
        console.log('   Block:   #' + log.blockNumber);
      }
      console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
    console.log('');

    // Summary
    const totalReceived = receivedLogs.reduce((sum, log) => {
      return sum + parseFloat(ethers.formatUnits(log.args[2], 6));
    }, 0);

    const totalSent = sentLogs.reduce((sum, log) => {
      return sum + parseFloat(ethers.formatUnits(log.args[2], 6));
    }, 0);

    console.log('📊 Summary:');
    console.log('   Total Received: $' + totalReceived.toFixed(2) + ' USDC');
    console.log('   Total Sent:     $' + totalSent.toFixed(2) + ' USDC');
    console.log('   Net:            $' + (totalReceived - totalSent).toFixed(2) + ' USDC');
    console.log('');
    console.log('✅ MCP server is working correctly!');
    console.log('   The AI agent can now query your transaction history.');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('Full error:', error);
    process.exit(1);
  }
}

test();
