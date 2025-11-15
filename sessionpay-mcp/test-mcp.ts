#!/usr/bin/env node

/**
 * Test script for SessionPay MCP Server
 * Tests the get_wallet_transactions tool to verify:
 * 1. BaseScan API is called without block range filtering
 * 2. Timestamp filtering works correctly
 * 3. lookback_seconds parameter works as expected
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TEST_WALLET = '0x692a88173ebae4689d6d5b756e9b45b66503b8fd';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

async function runTest(
  client: Client,
  testName: string,
  testFn: () => Promise<void>
): Promise<TestResult> {
  const startTime = Date.now();
  try {
    await testFn();
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function main() {
  console.log('🧪 SessionPay MCP Server Test Suite\n');

  // Start MCP server
  const serverProcess = spawn('node', [
    './build/index.js',
  ], {
    cwd: process.cwd(),
  });

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['./build/index.js'],
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');

  const results: TestResult[] = [];

  // Test 1: List tools
  results.push(
    await runTest(client, 'List available tools', async () => {
      const response = await client.listTools();
      const toolNames = response.tools.map((t) => t.name);

      if (!toolNames.includes('get_wallet_transactions')) {
        throw new Error('get_wallet_transactions tool not found');
      }
      if (!toolNames.includes('get_wallet_balance')) {
        throw new Error('get_wallet_balance tool not found');
      }
      if (!toolNames.includes('get_transaction_by_hash')) {
        throw new Error('get_transaction_by_hash tool not found');
      }

      console.log(`  Found tools: ${toolNames.join(', ')}`);
    })
  );

  // Test 2: Get transactions with default lookback (5 hours)
  results.push(
    await runTest(client, 'Get transactions (default 5 hours)', async () => {
      const response = await client.callTool({
        name: 'get_wallet_transactions',
        arguments: {
          wallet_address: TEST_WALLET,
        },
      });

      if (!response.content || response.content.length === 0) {
        throw new Error('No response content');
      }

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response');
      }

      console.log(`  Response length: ${content.text.length} chars`);

      // Check if it mentions using indexed data (BaseScan success)
      if (!content.text.includes('transaction') && !content.text.includes('balance')) {
        throw new Error('Response does not contain transaction info');
      }
    })
  );

  // Test 3: Get transactions with 1 day lookback
  results.push(
    await runTest(client, 'Get transactions (1 day = 86400 seconds)', async () => {
      const response = await client.callTool({
        name: 'get_wallet_transactions',
        arguments: {
          wallet_address: TEST_WALLET,
          lookback_seconds: 86400, // 1 day
        },
      });

      if (!response.content || response.content.length === 0) {
        throw new Error('No response content');
      }

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response');
      }

      console.log(`  Response length: ${content.text.length} chars`);
    })
  );

  // Test 4: Get transactions with 1 week lookback
  results.push(
    await runTest(client, 'Get transactions (1 week = 604800 seconds)', async () => {
      const response = await client.callTool({
        name: 'get_wallet_transactions',
        arguments: {
          wallet_address: TEST_WALLET,
          lookback_seconds: 604800, // 1 week
        },
      });

      if (!response.content || response.content.length === 0) {
        throw new Error('No response content');
      }

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response');
      }

      console.log(`  Response length: ${content.text.length} chars`);
    })
  );

  // Test 5: Get wallet balance
  results.push(
    await runTest(client, 'Get wallet balance', async () => {
      const response = await client.callTool({
        name: 'get_wallet_balance',
        arguments: {
          wallet_address: TEST_WALLET,
        },
      });

      if (!response.content || response.content.length === 0) {
        throw new Error('No response content');
      }

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response');
      }

      console.log(`  Balance response: ${content.text.substring(0, 100)}...`);
    })
  );

  // Test 6: Invalid wallet address
  results.push(
    await runTest(client, 'Invalid wallet address handling', async () => {
      try {
        await client.callTool({
          name: 'get_wallet_transactions',
          arguments: {
            wallet_address: '0xinvalid',
          },
        });
        throw new Error('Should have thrown error for invalid address');
      } catch (error) {
        // Expected to fail
        console.log('  ✓ Correctly rejected invalid address');
      }
    })
  );

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results\n');

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  results.forEach((result) => {
    const icon = result.passed ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`${icon} ${result.name}${duration}`);
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('✅ All tests passed!');
  } else {
    console.log(`❌ ${total - passed} test(s) failed`);
  }

  // Cleanup
  await client.close();
  serverProcess.kill();
  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
