import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ChatMessage } from '../shared/types';

export class LocusAgent {
  private isRunning = false;
  private isInitialized = false;
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
        }
      },
      allowedTools: [
        'mcp__locus__*',
        'mcp__list_resources',
        'mcp__read_resource'
      ],
      apiKey: this.anthropicApiKey,
      canUseTool: async (toolName: string, input: any) => {
        if (toolName.startsWith('mcp__locus__') || toolName.startsWith('mcp__')) {
          console.log(`[Agent] Approving tool: ${toolName}`);
          return {
            behavior: 'allow' as const,
            updatedInput: input
          };
        }
        return {
          behavior: 'deny' as const,
          message: 'Only Locus MCP tools are allowed'
        };
      }
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[Agent] Already initialized, skipping...');
      return;
    }

    console.log('[Agent] Initializing MCP connection...');

    try {
      // Send a simple query to initialize the connection
      for await (const message of query({
        prompt: 'Initialize connection. Respond with "ready"',
        options: this.options
      })) {
        if (message.type === 'system' && message.subtype === 'init') {
          const mcpServers = (message as any).mcp_servers;
          const mcpInfo = mcpServers?.find((s: any) => s.name === 'locus');

          if (mcpInfo?.status === 'connected') {
            console.log('[Agent] ✓ MCP server initialized and connected');
            this.isInitialized = true;
          } else {
            console.error('[Agent] ⚠️  MCP initialization failed');
            console.error('[Agent] Status:', mcpInfo?.status);
            console.error('[Agent] Error:', mcpInfo?.error);
          }
          break; // Exit after init message
        }
      }
    } catch (error) {
      console.error('[Agent] Initialization error:', error);
      throw error;
    }
  }

  async processMessage(
    userMessage: string,
    chatHistory: ChatMessage[],
    onProgress: (toolName: string, elapsed: number) => void,
    onResponse: (text: string, toolsUsed: string[]) => void
  ): Promise<void> {
    if (this.isRunning) {
      throw new Error('Agent is already processing a request');
    }

    this.isRunning = true;
    const toolsUsed: string[] = [];

    try {
      // Build context from chat history
      const context = this.buildContext(chatHistory);
      const fullPrompt = context ? `${context}\n\nUser: ${userMessage}` : userMessage;

      console.log('[Agent] Processing message with context:', {
        messageLength: userMessage.length,
        historyItems: chatHistory.length
      });

      // Process agent query
      let responseText = '';
      const responseParts: string[] = [];

      for await (const message of query({ prompt: fullPrompt, options: this.options })) {
        if (message.type === 'tool_progress') {
          console.log(`[Agent] Tool progress: ${message.tool_name} (${message.elapsed_time_seconds}s)`);
          onProgress(message.tool_name, message.elapsed_time_seconds);
          if (!toolsUsed.includes(message.tool_name)) {
            toolsUsed.push(message.tool_name);
          }
        } else if (message.type === 'assistant') {
          // Extract text response
          const textBlocks = message.message.content.filter(b => b.type === 'text');
          if (textBlocks.length > 0) {
            const text = textBlocks.map(b => (b as any).text).join('\n');
            if (text.trim()) {
              responseParts.push(text);
              console.log(`[Agent] Response part received: ${text.substring(0, 100)}...`);
            }
          }

          // Track and emit tool uses
          const toolBlocks = message.message.content.filter(b => b.type === 'tool_use');
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
