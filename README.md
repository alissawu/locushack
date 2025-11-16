# ChatPay

A real-time multiplayer chat application with AI-powered blockchain payments and poker session management.

## 🚀 Technical Features

### **Claude Agent SDK Integration**
- Multi-agent architecture using **@anthropic-ai/claude-agent-sdk**
- Independent agents per user with isolated API keys
- Real-time tool execution with progress streaming
- Automatic permission handling and tool approval flows

### **Dual MCP Server Architecture**
- **Locus MCP** (HTTP): Blockchain payment operations on Base
  - Send USDC to addresses or contacts
  - Query wallet balances and transaction history
  - Payment context management with policy enforcement
- **SessionPay MCP** (stdio): On-chain analytics
  - USDC transaction history via BaseScan API with RPC fallback
  - Real-time balance queries
  - Transaction lookup by hash

### **Real-Time WebSocket Infrastructure**
- Persistent bidirectional communication (ws://)
- Room-based message routing and history
- Live typing indicators and tool usage notifications
- Automatic message persistence per room

### **Poker Session Management**
- Ledger-based buy-in/cash-out tracking
- Host-controlled settlement with balance validation
- Natural language parsing for poker commands
- Automatic wallet resolution from participants

### **Multi-Mode Room System**
- **Casual Mode**: General-purpose chat with payment support
- **Poker Mode**: Session tracking with settlement flows
- **Trip Mode**: Group expense management (coming soon)

## 🛠️ Tech Stack

**Frontend**
- Next.js 15 (App Router)
- React 19 with TypeScript
- Framer Motion for animations
- WebSocket client with reconnection handling

**Backend**
- Node.js WebSocket server (ws)
- Claude Agent SDK with MCP protocol
- Ethers.js for blockchain interactions
- Express-based MCP servers

**Blockchain**
- Base L2 (Ethereum)
- USDC token transfers
- BaseScan API integration

## 📦 Architecture Highlights

```
┌─────────────────┐
│  Next.js Client │
└────────┬────────┘
         │ WebSocket
         ↓
┌─────────────────┐      ┌──────────────┐
│  WebSocket      │ ───→ │ Claude Agent │
│  Server         │      │ SDK (query)  │
└─────────────────┘      └──────┬───────┘
         │                      │
         │                      ↓
         │               ┌──────────────┐
         │               │  MCP Servers │
         │               ├──────────────┤
         │               │ Locus (HTTP) │
         │               │ SessionPay   │
         └───────────────│ (stdio)      │
                         └──────────────┘
```

## 🎯 Key Innovations

1. **Agent Context Isolation**: Each room maintains independent conversation history for accurate agent responses
2. **Poker Ledger System**: Off-chain tracking with on-chain settlement - only send actual blockchain transactions after game ends
3. **Natural Language Payments**: "send $10 to alice" resolves contacts and executes transactions
4. **Progressive Tool Feedback**: Real-time updates as agent tools execute (e.g., "Using send_to_address...")
5. **Multi-Agent Coordination**: Three independent Claude agents sharing infrastructure but maintaining separate contexts

## 🔧 Setup

```bash
# Install dependencies
cd application && npm install
cd ../sessionpay-mcp && npm install

# Configure environment
cp .env.example .env.local
# Add: ANTHROPIC_API_KEY, LOCUS_API_KEY, SUNNY_LOCUS_API_KEY, BASESCAN_API_KEY

# Build MCP server
cd sessionpay-mcp && npm run build

# Run development servers
cd application
npm run dev          # Next.js on :3000
npm run server       # WebSocket on :4000
```

## 💡 Usage

1. Select API key (Host/Alissa/Sunny) - each uses their own Locus wallet
2. Create or join a room (choose mode: Casual/Poker/Trip)
3. Chat with `@locus` mentions to trigger AI agent
4. Agent automatically uses MCP tools for payments and queries

### Poker Mode Commands
```
@locus I bought in for $100
@locus cash out $150
@locus show the ledger
@locus settle up (host only)
```

## 🏗️ Built With

- [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript) - AI agent orchestration
- [Model Context Protocol](https://modelcontextprotocol.io/) - Standardized tool interface
- [Locus](https://paywithlocus.com/) - Blockchain payment infrastructure
- [Base](https://base.org/) - Ethereum L2 network

---

*Hackathon project demonstrating advanced AI agent capabilities with real-world blockchain integration*
