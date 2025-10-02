#!/usr/bin/env node

import http from 'http';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Testing Voice Agent + Google Calendar MCP Integration\n');

// Test 1: Check if Google Calendar MCP server is running
async function testMcpServer() {
  console.log('1. Testing Google Calendar MCP Server...');
  
  try {
    const response = await fetch('http://localhost:3000/health');
    if (response.ok) {
      console.log('   ✅ MCP Server is running and accessible');
      return true;
    } else {
      console.log('   ❌ MCP Server returned error:', response.status);
      return false;
    }
  } catch (error) {
    console.log('   ❌ MCP Server is not accessible:', error.message);
    console.log('   💡 Start the server with: cd ../google-calendar-mcp && npm run start:http');
    return false;
  }
}

// Test 2: Check if voice agent dependencies are installed
function testDependencies() {
  console.log('2. Testing Voice Agent Dependencies...');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const requiredDeps = ['@openai/agents-realtime', '@modelcontextprotocol/sdk'];
    
    let allInstalled = true;
    for (const dep of requiredDeps) {
      try {
        // Try to import the module
        import(dep).then(() => {
          console.log(`   ✅ ${dep} is installed`);
        }).catch(() => {
          console.log(`   ❌ ${dep} is missing`);
          allInstalled = false;
        });
      } catch (error) {
        console.log(`   ❌ ${dep} is missing`);
        allInstalled = false;
      }
    }
    
    return allInstalled;
  } catch (error) {
    console.log('   ❌ Error checking dependencies:', error.message);
    return false;
  }
}

// Test 3: Check if Google credentials file exists
function testGoogleCredentials() {
  console.log('3. Testing Google Credentials...');
  
  const credentialsPath = path.join(__dirname, 'public', 'google-credentials.json');
  
  if (fs.existsSync(credentialsPath)) {
    try {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      if (credentials.web && credentials.web.client_id) {
        console.log('   ✅ Google credentials file is valid');
        return true;
      } else {
        console.log('   ❌ Google credentials file is invalid (missing client_id)');
        return false;
      }
    } catch (error) {
      console.log('   ❌ Google credentials file is corrupted:', error.message);
      return false;
    }
  } else {
    console.log('   ❌ Google credentials file not found at:', credentialsPath);
    console.log('   💡 Place your google-credentials.json file in the public/ directory');
    return false;
  }
}

// Test 4: Check if environment variables are set
function testEnvironment() {
  console.log('4. Testing Environment Variables...');
  
  const envPath = path.join(__dirname, '.env.local');
  
  if (fs.existsSync(envPath)) {
    console.log('   ✅ .env.local file exists');
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('VITE_OPENAI_API_KEY')) {
      console.log('   ✅ OpenAI API key is configured');
      return true;
    } else {
      console.log('   ❌ OpenAI API key not found in .env.local');
      return false;
    }
  } else {
    console.log('   ❌ .env.local file not found');
    console.log('   💡 Copy .env.template to .env.local and add your OpenAI API key');
    return false;
  }
}

// Test 5: Check if Google Calendar MCP is built
function testMcpBuild() {
  console.log('5. Testing Google Calendar MCP Build...');
  
  const buildPath = path.join(__dirname, '..', 'google-calendar-mcp', 'build');
  
  if (fs.existsSync(buildPath)) {
    console.log('   ✅ Google Calendar MCP is built');
    return true;
  } else {
    console.log('   ❌ Google Calendar MCP is not built');
    console.log('   💡 Build it with: cd ../google-calendar-mcp && npm run build');
    return false;
  }
}

// Run all tests
async function runTests() {
  const tests = [
    testMcpServer,
    testDependencies,
    testGoogleCredentials,
    testEnvironment,
    testMcpBuild
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    const result = await test();
    if (result) passed++;
    console.log('');
  }
  
  console.log('📊 Test Results:');
  console.log(`   Passed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('   🎉 All tests passed! Your integration is ready to use.');
    console.log('\n🚀 Next steps:');
    console.log('   1. Run: npm run dev');
    console.log('   2. Open: http://localhost:5173');
    console.log('   3. Enter your OpenAI API key');
    console.log('   4. Click "Connect MCP"');
    console.log('   5. Start speaking to manage your calendar!');
  } else {
    console.log('   ⚠️  Some tests failed. Please fix the issues above before running the integration.');
  }
}

// Run the tests
runTests().catch(console.error);
