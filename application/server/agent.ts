import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ChatMessage } from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPayServerPath = path.resolve(__dirname, '../../sessionpay-mcp/build/index.js');

export class LocusAgent {
  private isRunning = false;
  private options: any;

  constructor(
    private locusApiKey: string,
    private anthropicApiKey: string
  ) {
    // Configure MCP options
    this.options = {
      mcpServers: {
        'locus': {
          type: 'http' as const,
          url: 'https://mcp.paywithlocus.com/mcp',
          headers: {
            'Authorization': `Bearer ${this.locusApiKey}`
          }
        },
        'sessionpay': {
          type: 'stdio' as const,
          command: 'node',
          args: [sessionPayServerPath]
        }
      },
      allowedTools: [
        'mcp__locus__*',
        'mcp__sessionpay__*',
        'mcp__list_resources',
        'mcp__read_resource'
      ],
      apiKey: this.anthropicApiKey,
      onToolCall: async (toolName: string) => {
        console.log(`[Agent] 🔧 TOOL INVOKED: ${toolName} at ${new Date().toISOString()}`);
      },
      canUseTool: async (toolName: string, input: any) => {
        if (toolName.startsWith('mcp__locus__') || toolName.startsWith('mcp__sessionpay__') || toolName.startsWith('mcp__')) {
          console.log(`[Agent] ✅ Approving tool: ${toolName}`);
          console.log(`[Agent] 📥 Tool input:`, JSON.stringify(input, null, 2));
          return {
            behavior: 'allow' as const,
            updatedInput: input
          };
        }
        console.log(`[Agent] ❌ Denying tool: ${toolName}`);
        return {
          behavior: 'deny' as const,
          message: 'Only Locus and SessionPay MCP tools are allowed'
        };
      }
    };
  }

  async processMessage(
    userMessage: string,
    chatHistory: ChatMessage[],
    onProgress: (toolName: string, elapsed: number) => void,
    onResponse: (text: string, toolsUsed: string[]) => void,
    roomContext?: {
      roomName: string;
      mode: string;
      participants: any[];
      contacts: Record<string, string>;
      pokerSession?: any;
    }
  ): Promise<void> {
    if (this.isRunning) {
      throw new Error('Agent is already processing a request');
    }

    this.isRunning = true;
    const toolsUsed: string[] = [];

    try {
      // Build system prompt
      let systemPrompt = `You are a helpful assistant that can help with payments and blockchain transactions.
Your internal wallet address is ${process.env.WALLET_ADDR}.
You have access to Locus and SessionPay tools to help users with payments. Be succint in your answers.

IMPORTANT RULES:
- When showing transaction history, ONLY show the transactions - do NOT calculate or show "Net" amounts from partial history
- Transaction history shows activity in a time range, NOT wallet balances
- If the user asks for balance or net position, use the get_wallet_balance tool separately
- Never calculate "net" from a subset of transactions - it's misleading`;

      // Add room context if provided
      if (roomContext) {
        systemPrompt += `\n\nROOM CONTEXT:
- Room: "${roomContext.roomName}" (${roomContext.mode} mode)
- Participants: ${roomContext.participants.map(p => `${p.username}${p.wallet ? ` (${p.wallet})` : ''}`).join(', ')}`;

        if (Object.keys(roomContext.contacts).length > 0) {
          systemPrompt += `\n- Saved Contacts: ${Object.entries(roomContext.contacts).map(([name, wallet]) => `${name}: ${wallet}`).join(', ')}`;
        }

        if (roomContext.pokerSession) {
          systemPrompt += `\n- Poker Session Active:
  Host: ${roomContext.pokerSession.host}
  Pot: $${roomContext.pokerSession.pot}
  Cash Out Ledger: ${roomContext.pokerSession.cashOutLedger.map((entry: any) => `${entry.player}: $${entry.amount}`).join(', ')}`;
        }

        systemPrompt += `\n\nCONTACT MANAGEMENT:
- When users say "I'm [name], my wallet is [address]" or similar, remember this information
- When users say "send to [name]", resolve the name to the wallet address from participants or contacts
- You can naturally learn and store contact information from conversation`;
      }

      // Build context from chat history
      const context = this.buildContext(chatHistory);
      const fullPrompt = context
        ? `${systemPrompt}\n\n${context}\n\nUser: ${userMessage}`
        : `${systemPrompt}\n\nUser: ${userMessage}`;

      console.log('[Agent] Processing message with context:', {
        messageLength: userMessage.length,
        historyItems: chatHistory.length
      });
      console.log('[Agent] MCP Server config:', JSON.stringify(this.options.mcpServers, null, 2));

      // Process agent query
      let responseText = '';
      const responseParts: string[] = [];

      for await (const message of query({ prompt: fullPrompt, options: this.options })) {
        // Log all message types for debugging
        if (message.type === 'system') {
          console.log('[Agent] System message:', JSON.stringify(message, null, 2));

          // Check MCP server status
          if (message.subtype === 'init') {
            const mcpServers = (message as any).mcp_servers;
            if (mcpServers) {
              console.log('[Agent] MCP Servers initialized:', mcpServers.map((s: any) => ({
                name: s.name,
                status: s.status,
                error: s.error
              })));
            }
          }
        } else if (message.type === 'tool_progress') {
          console.log(`[Agent] Tool progress: ${message.tool_name} (${message.elapsed_time_seconds}s)`);
          onProgress(message.tool_name, message.elapsed_time_seconds);
          if (!toolsUsed.includes(message.tool_name)) {
            toolsUsed.push(message.tool_name);
          }
        } else if (message.type === 'assistant') {
          // Extract text response
          const textBlocks = message.message.content.filter((b: any) => b.type === 'text');
          if (textBlocks.length > 0) {
            const text = textBlocks.map((b: any) => (b as any).text).join('\n');
            if (text.trim()) {
              responseParts.push(text);
              console.log(`[Agent] Response part received: ${text.substring(0, 100)}...`);
            }
          }

          // Track and emit tool uses
          const toolBlocks = message.message.content.filter((b: any) => b.type === 'tool_use');
          for (const tool of toolBlocks) {
            const toolName = (tool as any).name;
            console.log(`[Agent] Tool use detected: ${toolName}`);

            // Emit progress event for this tool
            if (!toolsUsed.includes(toolName)) {
              toolsUsed.push(toolName);
              onProgress(toolName, 0);
            }
          }
        } else if (message.type === 'result') {
          if (message.subtype !== 'success') {
            console.error('[Agent] Query failed:', message.errors);
          }
        }
      }

      // Send final response
      responseText = responseParts.join('\n\n');
      console.log(`[Agent] Final response (${responseParts.length} parts):`, responseText.substring(0, 200));
      if (responseText) {
        onResponse(responseText, toolsUsed);
      } else {
        onResponse('I processed your request but have no specific response.', toolsUsed);
      }

    } catch (error) {
      console.error('[Agent] Error:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private buildContext(history: ChatMessage[]): string {
    // Take last 10 messages for context
    const recentHistory = history.slice(-10);

    if (recentHistory.length === 0) {
      return '';
    }

    const context = recentHistory
      .map(msg => `${msg.username}: ${msg.text}`)
      .join('\n');

    return `Previous conversation:\n${context}`;
  }

  isProcessing(): boolean {
    return this.isRunning;
  }
}
