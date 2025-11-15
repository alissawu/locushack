// Test: Queries the $10 deposit transaction from code redemption for hackathon
import { ethers } from 'ethers';

const BASE_RPC_URL = 'https://mainnet.base.org';
const YOUR_TX_HASH = '0x210164e493e6b56e85c04e13c7ec6f1f40b132658a450384df5cc02d620115fe';

console.log('🔍 Querying your specific transaction...');
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

    console.log('✅ Transaction found!');
    console.log('');
    console.log('Block Number:', receipt.blockNumber);
    console.log('Status:', receipt.status === 1 ? '✅ Success' : '❌ Failed');
    console.log('From:', receipt.from);
    console.log('To:', receipt.to);
    console.log('');

    // Get block timestamp
    const block = await provider.getBlock(receipt.blockNumber);
    console.log('Timestamp:', new Date(block.timestamp * 1000).toLocaleString());
    console.log('');

    // Parse transfer events
    const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const transferTopic = ethers.id('Transfer(address,address,uint256)');

    console.log('📥 USDC Transfers in this transaction:');
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === usdcAddress.toLowerCase() &&
          log.topics[0] === transferTopic) {
        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        const amount = ethers.formatUnits(log.data, 6);

        console.log('   From:', from);
        console.log('   To:  ', to);
        console.log('   Amount: $' + amount + ' USDC');
        console.log('');
      }
    }

    console.log('✅ Your MCP server can find this transaction!');
    console.log('   It just needs to search blocks around block #' + receipt.blockNumber);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();
