import 'dotenv/config';
import { query, type SDKUserMessage, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import * as readline from 'readline';
import { randomUUID } from 'crypto';

// Interactive chat session with Claude Agent SDK
async function main(): Promise<void> {
  console.log('🎯 Starting Locus Interactive Chat...\n');

  // Configure MCP connection to Locus
  const mcpServers = {
    'locus': {
      type: 'http' as const,
      url: 'https://mcp.paywithlocus.com/mcp',
      headers: {
        'Authorization': `Bearer ${process.env.LOCUS_API_KEY}`
      }
    }
  };

  const options = {
    mcpServers,
    allowedTools: [
      'mcp__locus__*',      // Allow all Locus tools
      'mcp__list_resources',
      'mcp__read_resource'
    ],
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Auto-approve Locus tool usage
    canUseTool: async (toolName: string, input: Record<string, unknown>) => {
      if (toolName.startsWith('mcp__locus__')) {
        return {
          behavior: 'allow' as const,
          updatedInput: input
        };
      }
      return {
        behavior: 'deny' as const,
        message: 'Only Locus tools are allowed'
      };
    }
  };

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n👤 You: '
  });

  const sessionId = randomUUID();

  // Async generator that yields user messages
  async function* userMessageStream(): AsyncIterable<SDKUserMessage> {
    for await (const line of rl) {
      const userInput = line.trim();

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        rl.close();
        return;
      }

      if (!userInput) {
        rl.prompt();
        continue;
      }

      // Yield a user message in SDK format
      yield {
        type: 'user',
        message: {
          role: 'user',
          content: userInput
        },
        parent_tool_use_id: null,
        session_id: sessionId,
        uuid: randomUUID()
      };
    }
  }

  // Start the query with streaming input
  const queryStream = query({
    prompt: userMessageStream(),
    options
  });

  console.log('💬 Chat started! Type your messages below.');
  console.log('   Commands: "exit" or "quit" to end the session\n');

  // Handle agent responses
  try {
    for await (const message of queryStream) {
      await handleMessage(message);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('\n❌ Error:', error.message);
    }
  } finally {
    rl.close();
    console.log('\n👋 Chat session ended. Goodbye!');
  }
}

// Handle different message types from the agent
async function handleMessage(message: SDKMessage): Promise<void> {
  switch (message.type) {
    case 'system':
      // Silently handle system messages
      break;

    case 'assistant':
      // Full assistant message received
      const content = message.message.content;
      for (const block of content) {
        if (block.type === 'text') {
          console.log('\n🤖 Claude:', block.text);
        } else if (block.type === 'tool_use') {
          console.log(`\n🔧 Using tool: ${block.name}`);
        }
      }
      break;

    case 'result':
      if (message.subtype !== 'success') {
        console.error('\n❌ Error:', message.errors?.join(', '));
      }
      // Silently handle success - no cost/turn info
      break;

    case 'tool_progress':
      console.log(`   ⏳ Tool "${message.tool_name}" running... (${message.elapsed_time_seconds}s)`);
      break;

    case 'stream_event':
      // Handle streaming events if needed
      if (message.event.type === 'content_block_delta') {
        if (message.event.delta.type === 'text_delta') {
          process.stdout.write(message.event.delta.text);
        }
      }
      break;
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
