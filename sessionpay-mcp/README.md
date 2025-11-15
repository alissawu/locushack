# SessionPay MCP Server

MCP server for querying Base blockchain transactions for SessionPay wallets.

## Tools

1. `get_wallet_balance` - Get current USDC balance
2. `get_wallet_transactions` - Get transaction history (last ~5.5 hours)
3. `get_transaction_by_hash` - Get specific transaction details by hash

## Setup

```bash
cd sessionpay-mcp
npm install
cp .env.example .env
npm run build
```

## Run

```bash
npm run dev    # Development
npm start      # Production
```

## Usage with Claude Agent SDK

```typescript
const agent = new Agent({
  mcpServers: {
    sessionpay: {
      command: 'node',
      args: ['./sessionpay-mcp/build/index.js']
    }
  }
});
```

## Test

```bash
node test-wallet.js  # Test with your Locus wallet
```

## How It Works

- Connects to Base blockchain RPC
- Queries USDC contract (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
- Returns transaction data for specified wallets

## Limitations

- Free RPC limited to 10,000 blocks per query (~5.5 hours)
- For full history, use BaseScan API or store transactions in Convex

## Architecture

```
Agent
├── Locus MCP (send payments)
└── SessionPay MCP (balances + history)
```
