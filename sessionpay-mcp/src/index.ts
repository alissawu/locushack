#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Base RPC provider (with fallback defaults)
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// USDC ABI - functions and events we need
const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  valueUSDC: string;
  timestamp: number;
  date: string;
  blockNumber: number;
  type: 'sent' | 'received';
}

class SessionPayMCPServer {
  private server: Server;
  private provider: ethers.JsonRpcProvider;
  private usdcContract: ethers.Contract;

  constructor() {
    this.server = new Server(
      {
        name: 'sessionpay-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize ethers provider
    this.provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    this.usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, this.provider);

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_wallet_transactions',
          description:
            'Get USDC transaction history for a wallet address on Base blockchain. Returns transfers within a specified date range (defaults to last 5 hours). Useful for checking what a user has spent or received in a session.',
          inputSchema: {
            type: 'object',
            properties: {
              wallet_address: {
                type: 'string',
                description: 'The Ethereum wallet address (0x...)',
              },
              start_date: {
                type: 'string',
                description: 'Start date in YYYY-MM-DD format (optional, defaults to 5 hours ago)',
              },
              end_date: {
                type: 'string',
                description: 'End date in YYYY-MM-DD format (optional, defaults to today)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of transactions to return (optional, default 50)',
              },
            },
            required: ['wallet_address'],
          },
        },
        {
          name: 'get_wallet_balance',
          description: 'Get current USDC balance for a wallet address on Base blockchain.',
          inputSchema: {
            type: 'object',
            properties: {
              wallet_address: {
                type: 'string',
                description: 'The Ethereum wallet address (0x...)',
              },
            },
            required: ['wallet_address'],
          },
        },
        {
          name: 'get_transaction_by_hash',
          description: 'Get detailed information about a specific USDC transaction using its transaction hash. Returns sender, recipient, amount, timestamp, and status.',
          inputSchema: {
            type: 'object',
            properties: {
              transaction_hash: {
                type: 'string',
                description: 'The transaction hash (0x...)',
              },
            },
            required: ['transaction_hash'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === 'get_wallet_transactions') {
          return await this.getWalletTransactions(args);
        } else if (name === 'get_wallet_balance') {
          return await this.getWalletBalance(args);
        } else if (name === 'get_transaction_by_hash') {
          return await this.getTransactionByHash(args);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    });
  }

  private async getWalletBalance(args: any) {
    const { wallet_address } = args;

    if (!ethers.isAddress(wallet_address)) {
      throw new Error('Invalid wallet address');
    }

    // Get USDC balance (6 decimals)
    const balance = await this.usdcContract.balanceOf(wallet_address);
    const balanceUSDC = ethers.formatUnits(balance, 6);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              wallet_address,
              balance_usdc: balanceUSDC,
              balance_raw: balance.toString(),
              currency: 'USDC',
              network: 'Base Mainnet',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async getTransactionByHash(args: any) {
    const { transaction_hash } = args;

    // Validate transaction hash format
    if (!transaction_hash || !transaction_hash.startsWith('0x') || transaction_hash.length !== 66) {
      throw new Error('Invalid transaction hash format');
    }

    // Get transaction receipt
    const receipt = await this.provider.getTransactionReceipt(transaction_hash);

    if (!receipt) {
      throw new Error('Transaction not found');
    }

    // Get block details for timestamp
    const block = await this.provider.getBlock(receipt.blockNumber);

    if (!block) {
      throw new Error('Block not found');
    }

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

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              transaction_hash,
              block_number: receipt.blockNumber,
              timestamp: block.timestamp,
              date: new Date(block.timestamp * 1000).toISOString(),
              status: receipt.status === 1 ? 'success' : 'failed',
              from: receipt.from,
              to: receipt.to,
              gas_used: receipt.gasUsed.toString(),
              usdc_transfers: usdcTransfers,
              network: 'Base Mainnet',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async getWalletTransactions(args: any) {
    const { wallet_address, start_date, end_date, limit = 50 } = args;

    if (!ethers.isAddress(wallet_address)) {
      throw new Error('Invalid wallet address');
    }

    // Parse dates
    const now = new Date();
    const endTimestamp = end_date
      ? new Date(end_date).getTime() / 1000
      : now.getTime() / 1000;
    const startTimestamp = start_date
      ? new Date(start_date).getTime() / 1000
      : (now.getTime() - 5 * 60 * 60 * 1000) / 1000; // 5 hours ago (9000 blocks, under 10k limit)

    // Get current block
    const currentBlock = await this.provider.getBlockNumber();

    // Estimate blocks (Base: ~2 second block time)
    const blocksPerDay = (24 * 60 * 60) / 2;
    const daysBack = (now.getTime() / 1000 - startTimestamp) / (24 * 60 * 60);
    const fromBlock = Math.max(0, currentBlock - Math.ceil(daysBack * blocksPerDay));

    // Query Transfer events
    const sentFilter = this.usdcContract.filters.Transfer(wallet_address, null);
    const receivedFilter = this.usdcContract.filters.Transfer(null, wallet_address);

    const [sentLogs, receivedLogs] = await Promise.all([
      this.usdcContract.queryFilter(sentFilter, fromBlock, currentBlock),
      this.usdcContract.queryFilter(receivedFilter, fromBlock, currentBlock),
    ]);

    // Process transactions
    const transactions: Transaction[] = [];

    for (const log of sentLogs) {
      const block = await log.getBlock();
      if (block.timestamp >= startTimestamp && block.timestamp <= endTimestamp) {
        if ('args' in log) {
          const args = log.args as any;
          transactions.push({
            hash: log.transactionHash,
            from: args[0],
            to: args[1],
            value: args[2].toString(),
            valueUSDC: ethers.formatUnits(args[2], 6),
            timestamp: block.timestamp,
            date: new Date(block.timestamp * 1000).toISOString(),
            blockNumber: log.blockNumber,
            type: 'sent',
          });
        }
      }
    }

    for (const log of receivedLogs) {
      const block = await log.getBlock();
      if (block.timestamp >= startTimestamp && block.timestamp <= endTimestamp) {
        if ('args' in log) {
          const args = log.args as any;
          transactions.push({
            hash: log.transactionHash,
            from: args[0],
            to: args[1],
            value: args[2].toString(),
            valueUSDC: ethers.formatUnits(args[2], 6),
            timestamp: block.timestamp,
            date: new Date(block.timestamp * 1000).toISOString(),
            blockNumber: log.blockNumber,
            type: 'received',
          });
        }
      }
    }

    // Sort by timestamp (newest first) and limit
    transactions.sort((a, b) => b.timestamp - a.timestamp);
    const limitedTransactions = transactions.slice(0, limit);

    // Calculate summary
    const totalSent = transactions
      .filter((tx) => tx.type === 'sent')
      .reduce((sum, tx) => sum + parseFloat(tx.valueUSDC), 0);

    const totalReceived = transactions
      .filter((tx) => tx.type === 'received')
      .reduce((sum, tx) => sum + parseFloat(tx.valueUSDC), 0);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              wallet_address,
              date_range: {
                start: new Date(startTimestamp * 1000).toISOString(),
                end: new Date(endTimestamp * 1000).toISOString(),
              },
              summary: {
                total_transactions: transactions.length,
                total_sent_usdc: totalSent.toFixed(2),
                total_received_usdc: totalReceived.toFixed(2),
                net_usdc: (totalReceived - totalSent).toFixed(2),
              },
              transactions: limitedTransactions,
              network: 'Base Mainnet',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SessionPay MCP server running on stdio');
  }
}

const server = new SessionPayMCPServer();
server.run().catch(console.error);
