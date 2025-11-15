# locushack

A Locus-powered application using Anthropic Claude Agent SDK with MCP integration.

## About

This project was created using `create-locus-app` and is configured to use:
- **Claude Agent SDK** for AI interactions with tool support
- **Locus MCP server** integration with API key authentication
- **Full tool calling** capabilities

## Getting Started

Your application is already configured and ready to run!

```bash
# Run the application
npm start

# or with auto-restart on file changes
npm run dev
```

## Project Structure

- `index.ts` - Main application file with MCP and Claude Agent SDK setup
- `.env` - Environment variables (credentials are already configured)
- `.env.example` - Example environment variables for reference
- `package.json` - Project dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## How It Works

1. **MCP Connection**: Connects to Locus MCP server with API key authentication
2. **Tool Discovery**: Automatically discovers and loads tools from Locus
3. **Agent Query**: Uses Claude Agent SDK to process queries with tool access
4. **Tool Execution**: Claude can call Locus tools to complete tasks

## Features

✅ **Fully Integrated:**
- Locus MCP server connection
- All Locus tools available to Claude
- API key authentication (secure, no OAuth needed)
- Automatic tool discovery
- Streaming agent responses

## Customization

### Modify the Prompt

Edit the query prompt in `index.ts`:

```javascript
for await (const message of query({
  prompt: 'Your custom prompt here - can ask Claude to use Locus tools!',
  options
})) {
  // handle messages
}
```

### Add More MCP Servers

You can connect to multiple MCP servers:

```javascript
const mcpServers = {
  'locus': {
    type: 'http',
    url: 'https://mcp.paywithlocus.com/mcp',
    headers: { 'Authorization': `Bearer ${process.env.LOCUS_API_KEY}` }
  },
  'another-server': {
    type: 'sse',
    url: 'https://example.com/mcp',
    headers: { 'X-API-Key': process.env.OTHER_API_KEY }
  }
};
```

### Restrict Tools

Limit which tools Claude can use with `allowedTools`:

```javascript
const options = {
  mcpServers,
  allowedTools: [
    'mcp__locus__specific_tool',  // only allow specific tool
    'mcp__list_resources'
  ],
  apiKey: process.env.ANTHROPIC_API_KEY
};
```

### Handle Different Message Types

Process various message types from the agent:

```javascript
for await (const message of query({ prompt, options })) {
  if (message.type === 'system' && message.subtype === 'init') {
    console.log('MCP servers:', message.mcp_servers);
  } else if (message.type === 'result' && message.subtype === 'success') {
    console.log('Final result:', message.result);
  } else if (message.type === 'error_during_execution') {
    console.error('Error:', message.error);
  }
}
```

## Environment Variables

Your `.env` file contains:
- `LOCUS_API_KEY` - Your Locus API key for MCP server authentication
- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude

**Important**: Never commit your `.env` file to version control!

## Learn More

- [Locus Documentation](https://docs.paywithlocus.com)
- [Claude SDK Documentation](https://docs.anthropic.com)
- [Claude API Reference](https://docs.anthropic.com/en/api)

## Support

For issues or questions:
- Check the [Locus documentation](https://docs.paywithlocus.com)
- Contact Locus support

---

Built with Locus 🎯
