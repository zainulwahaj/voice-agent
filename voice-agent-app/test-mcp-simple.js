// Simple test to verify MCP server and new voice agent setup
const MCP_URL = 'http://localhost:3000/mcp'

async function testMcp() {
  console.log('Testing MCP Server...\n')
  
  try {
    const response = await fetch(`${MCP_URL}/tools`, {
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json'
      }
    })
    
    const data = await response.json()
    console.log('✅ MCP Server is running!')
    console.log(`✅ Found ${data.tools?.length || 0} tools\n`)
    
    if (data.tools) {
      data.tools.forEach(tool => {
        console.log(`   - ${tool.name}`)
      })
    }
    
    console.log('\n🎉 Ready to start voice agent!')
    console.log('Run: npm run dev')
    console.log('Open: http://localhost:5173/index-new.html')
    
  } catch (error) {
    console.error('❌ MCP Server test failed:', error.message)
    console.log('\n💡 Make sure MCP server is running:')
    console.log('   cd ../google-calendar-mcp')
    console.log('   npm run dev:http')
  }
}

testMcp()
