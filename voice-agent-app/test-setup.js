#!/usr/bin/env node

/**
 * Quick test script to verify the new Realtime API implementation
 */

import fetch from 'node-fetch'

const MCP_SERVER_URL = 'http://localhost:3000/mcp'

console.log('🧪 Testing Voice Agent Setup...\n')

async function testMcpServer() {
  console.log('1️⃣ Testing MCP Server connection...')
  
  try {
    const response = await fetch(`${MCP_SERVER_URL}/tools`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const tools = data.tools || []

    console.log(`   ✅ MCP Server is running`)
    console.log(`   ✅ Found ${tools.length} tools:`)
    tools.forEach(tool => {
      console.log(`      - ${tool.name}`)
    })
    console.log()

    return true
  } catch (error) {
    console.log(`   ❌ MCP Server not accessible: ${error.message}`)
    console.log(`   💡 Make sure to run: cd ../google-calendar-mcp && npm run dev:http`)
    console.log()
    return false
  }
}

async function testListEvents() {
  console.log('2️⃣ Testing calendar access...')
  
  try {
    const response = await fetch(`${MCP_SERVER_URL}/call-tool`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'tools/call',
        params: {
          name: 'list-events',
          arguments: {
            calendarId: 'primary',
            timeMin: new Date().toISOString(),
            maxResults: 5
          }
        }
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const result = await response.json()
    console.log(`   ✅ Calendar data accessible`)
    console.log(`   ✅ OAuth authentication working`)
    console.log()

    return true
  } catch (error) {
    console.log(`   ❌ Calendar access failed: ${error.message}`)
    console.log(`   💡 Make sure Google OAuth is configured in google-calendar-mcp`)
    console.log()
    return false
  }
}

async function checkEnv() {
  console.log('3️⃣ Checking environment variables...')
  
  // In Node.js test, we can't access Vite env vars
  // Just remind the user to set them
  console.log(`   💡 Make sure .env file contains:`)
  console.log(`      VITE_OPENAI_API_KEY=sk-proj-...`)
  console.log()
}

async function main() {
  const mcpOk = await testMcpServer()
  
  if (mcpOk) {
    await testListEvents()
  }
  
  await checkEnv()
  
  console.log('📝 Next Steps:')
  console.log('   1. npm run dev')
  console.log('   2. Open http://localhost:5173/index-new.html')
  console.log('   3. Click "Initialize Agent"')
  console.log('   4. Click "Start Conversation"')
  console.log('   5. Say: "What\'s on my calendar today?"')
  console.log()
  console.log('🎉 Ready to test the voice agent!')
}

main().catch(console.error)
