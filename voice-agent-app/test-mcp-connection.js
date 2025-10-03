// Test MCP protocol communication
async function testMcp() {
  const MCP_URL = 'http://localhost:3000/mcp'
  
  console.log('Testing MCP Protocol...\n')
  
  // Test 1: List tools
  console.log('1. Fetching tools list...')
  try {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      })
    })
    
    const data = await response.json()
    console.log('✅ Response:', JSON.stringify(data, null, 2))
    
    if (data.result?.tools) {
      console.log(`\n✅ Found ${data.result.tools.length} tools:`)
      data.result.tools.forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.description}`)
      })
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
  
  // Test 2: Call a tool
  console.log('\n2. Calling list-events tool...')
  try {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'list-events',
          arguments: {
            calendarId: 'primary',
            maxResults: 5
          }
        }
      })
    })
    
    const data = await response.json()
    console.log('✅ Calendar data retrieved!')
    console.log('Response:', JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

testMcp().catch(console.error)
