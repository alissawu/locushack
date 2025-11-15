#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// File logger (since stdout is used for MCP protocol)
const LOG_FILE = path.resolve(__dirname, '../sessionpay-mcp.log');
function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logLine = data
    ? `${timestamp} - ${message} ${JSON.stringify(data)}\n`
    : `${timestamp} - ${message}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
}

// Load env vars regardless of where the process is spawned from
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

// Base RPC provider (with fallback defaults)
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || '';
const BASESCAN_API_URL = 'https://api.etherscan.io/v2/api'; // V2 unified endpoint
const BASE_CHAIN_ID = '8453'; // Base Mainnet

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
            'Get complete USDC transaction history for a wallet address on Base blockchain. Returns all transfers going back a specified time period (defaults to last 5 hours = 18000 seconds). Useful for checking what a user has spent or received.',
          inputSchema: {
            type: 'object',
            properties: {
              wallet_address: {
                type: 'string',
                description: 'The Ethereum wallet address (0x...)',
              },
              lookback_seconds: {
                type: 'number',
                description: 'How many seconds to look back in time. Defaults to 18000 (5 hours). Examples: 1 hour = 3600, 1 day = 86400, 1 week = 604800.',
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

  private async getBlockNumberForTimestamp(
    timestamp: number,
    closest: 'before' | 'after' = 'before'
  ): Promise<number> {
    const params = new URLSearchParams({
      chainid: BASE_CHAIN_ID,
      module: 'block',
      action: 'getblocknobytime',
      timestamp: Math.floor(timestamp).toString(),
      closest,
      apikey: BASESCAN_API_KEY,
    });

    const response = await fetch(`${BASESCAN_API_URL}?${params.toString()}`);
    const data = await response.json();

    if (data.status !== '1') {
      const errorMsg = data.result || data.message || 'API error';
      throw new Error(`Failed to resolve block number for timestamp ${timestamp}: ${errorMsg}`);
    }

    const result = data.result;
    if (typeof result === 'object' && result !== null) {
      const value =
        (result as any).blockNumber ??
        (result as any).BlockNumber ??
        (result as any).number ??
        (result as any).result;
      if (value) {
        return parseInt(value, 10);
      }
    }

    return parseInt(result as string, 10);
  }

  private async getWalletTransactions(args: any) {
    const { wallet_address, lookback_seconds = 18000, limit = 50 } = args; // Default: 5 hours

    if (!ethers.isAddress(wallet_address)) {
      throw new Error('Invalid wallet address');
    }

    // Calculate timestamps
    const now = new Date();
    const endTimestamp = now.getTime() / 1000;
    const startTimestamp = endTimestamp - lookback_seconds;

    // Try BaseScan API first (fast, indexed)
    if (BASESCAN_API_KEY) {
      try {
        // Query ALL transactions for this wallet (no block range filtering)
        // BaseScan's pre-indexed database can handle this efficiently
        const fetchSize = Math.min(Math.max(limit * 2, 100), 10000);

        log(`[SessionPay MCP] 🌐 BaseScan query for ${wallet_address} (all time, will filter by timestamp)`);
        const params = new URLSearchParams({
          chainid: BASE_CHAIN_ID,
          module: 'account',
          action: 'tokentx',
          contractaddress: USDC_ADDRESS,
          address: wallet_address,
          page: '1',
          offset: fetchSize.toString(),
          sort: 'desc',
          apikey: BASESCAN_API_KEY,
        });

        const url = `${BASESCAN_API_URL}?${params.toString()}`;
        const response = await fetch(url);
        const data = await response.json();

        log(`[SessionPay MCP] 📡 BaseScan API response:`, {
          status: data.status,
          message: data.message,
          resultCount: Array.isArray(data.result) ? data.result.length : 'N/A'
        });

        if (data.status === '1') {
          // BaseScan API succeeded - use it
          log(`[SessionPay MCP] ✅ BaseScan API succeeded - using indexed data`);
          return await this.processBaseScanTransactions(data.result, wallet_address, startTimestamp, endTimestamp, limit);
        } else {
          log(`[SessionPay MCP] ⚠️  BaseScan API failed:`, {
            message: data.message,
            result: data.result
          });
        }
      } catch (error) {
        log(`[SessionPay MCP] ❌ BaseScan API exception:`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      log('[SessionPay MCP] ⚠️  No BASESCAN_API_KEY configured, using RPC');
    }

    // Fallback to RPC provider (slower but reliable)
    log('[SessionPay MCP] 🔄 Using RPC fallback for transaction history (limited to recent blocks)');
    return await this.getTransactionsViaRPC(wallet_address, startTimestamp, endTimestamp, limit);
  }

  private async processBaseScanTransactions(
    results: any[],
    wallet_address: string,
    startTimestamp: number,
    endTimestamp: number,
    limit: number
  ) {
    const transactions: Transaction[] = [];

    for (const tx of results) {
      const timestamp = parseInt(tx.timeStamp);

      // Filter by date range
      if (timestamp < startTimestamp || timestamp > endTimestamp) {
        continue;
      }

      const isReceived = tx.to.toLowerCase() === wallet_address.toLowerCase();

      transactions.push({
        hash: tx.hash,
        from: ethers.getAddress(tx.from),
        to: ethers.getAddress(tx.to),
        value: tx.value,
        valueUSDC: ethers.formatUnits(tx.value, 6),
        timestamp,
        date: new Date(timestamp * 1000).toISOString(),
        blockNumber: parseInt(tx.blockNumber),
        type: isReceived ? 'received' : 'sent',
      });
    }

    return this.formatTransactionResponse(wallet_address, transactions, startTimestamp, endTimestamp, limit);
  }

  private async getTransactionsViaRPC(
    wallet_address: string,
    startTimestamp: number,
    endTimestamp: number,
    limit: number
  ) {
    // Query recent blocks only (last 100,000 blocks = ~2 weeks on Base)
    const currentBlock = await this.provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 100000);

    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const addressTopic = ethers.zeroPadValue(wallet_address.toLowerCase(), 32);

    // Query logs for transfers involving this wallet
    const [sentLogs, receivedLogs] = await Promise.all([
      // Transfers FROM this wallet
      this.provider.getLogs({
        address: USDC_ADDRESS,
        topics: [transferTopic, addressTopic, null],
        fromBlock,
        toBlock: 'latest',
      }),
      // Transfers TO this wallet
      this.provider.getLogs({
        address: USDC_ADDRESS,
        topics: [transferTopic, null, addressTopic],
        fromBlock,
        toBlock: 'latest',
      }),
    ]);

    const transactions: Transaction[] = [];
    const processedHashes = new Set<string>();

    // Process all logs
    for (const log of [...sentLogs, ...receivedLogs]) {
      if (processedHashes.has(log.transactionHash)) continue;
      processedHashes.add(log.transactionHash);

      const block = await this.provider.getBlock(log.blockNumber);
      if (!block) continue;

      const timestamp = block.timestamp;
      if (timestamp < startTimestamp || timestamp > endTimestamp) continue;

      const from = ethers.getAddress('0x' + log.topics[1].slice(26));
      const to = ethers.getAddress('0x' + log.topics[2].slice(26));
      const value = ethers.toBigInt(log.data);
      const valueUSDC = ethers.formatUnits(value, 6);

      const isReceived = to.toLowerCase() === wallet_address.toLowerCase();

      transactions.push({
        hash: log.transactionHash,
        from,
        to,
        value: value.toString(),
        valueUSDC,
        timestamp,
        date: new Date(timestamp * 1000).toISOString(),
        blockNumber: log.blockNumber,
        type: isReceived ? 'received' : 'sent',
      });
    }

    // Sort by block number descending
    transactions.sort((a, b) => b.blockNumber - a.blockNumber);

    return this.formatTransactionResponse(wallet_address, transactions, startTimestamp, endTimestamp, limit, true);
  }

  private formatTransactionResponse(
    wallet_address: string,
    transactions: Transaction[],
    startTimestamp: number,
    endTimestamp: number,
    limit: number,
    isRPCFallback: boolean = false
  ) {
    const limitedTransactions = transactions.slice(0, limit);

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
              note: isRPCFallback ? 'Data retrieved via RPC (recent blocks only due to API rate limits)' : undefined,
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
