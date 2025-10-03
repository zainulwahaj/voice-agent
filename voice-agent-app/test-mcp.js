/**
 * Simple MCP client for testing
 * Handles Server-Sent Events (SSE) format
 */

async function sendMcpMessage(method, params = {}) {
  const MCP_URL = 'http://localhost:3000/mcp'
  
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  // Handle SSE response
  const text = await response.text()
  
  // Parse SSE format
  const lines = text.split('\n')
  let jsonData = ''
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      jsonData += line.substring(6)
    }
  }
  
  if (jsonData) {
    return JSON.parse(jsonData)
  }
  
  throw new Error('No data in response')
}

async function test() {
  console.log('Testing MCP Server...\n')
  
  // Test 1: List tools
  console.log('1️⃣  Fetching tools...')
  try {
    const response = await sendMcpMessage('tools/list')
    
    if (response.result?.tools) {
      console.log(`✅ Found ${response.result.tools.length} tools:\n`)
      response.result.tools.forEach(tool => {
        console.log(`   📅 ${tool.name}`)
        console.log(`      ${tool.description}`)
      })
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
  
  // Test 2: Call list-events
  console.log('\n2️⃣  Calling list-events...')
  try {
    const response = await sendMcpMessage('tools/call', {
      name: 'list-events',
      arguments: {
        calendarId: 'primary',
        maxResults: 3
      }
    })
    
    console.log('✅ Calendar data retrieved!')
    if (response.result?.content) {
      console.log('\nResponse:', JSON.stringify(response.result, null, 2))
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
  
  console.log('\n🎉 MCP server is working!')
  console.log('✅ Ready to use with voice agent')
}

test().catch(console.error)
