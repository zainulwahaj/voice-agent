/**
 * Voice Agent with Direct OpenAI Realtime API + MCP Integration
 * Rebuilding without @openai/agents-realtime SDK
 */

import { RealtimeAPIClient } from './realtime-api'

// MCP Server Configuration
const MCP_SERVER_URL = 'http://localhost:3000/mcp'

// OpenAI API Key
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''

// Global state
let realtimeClient: RealtimeAPIClient | null = null
let mcpTools: any[] = []
let isConnected = false

/**
 * Fetch available tools from MCP server using proper MCP protocol
 * Handles Server-Sent Events (SSE) format response
 */
async function fetchMcpTools(): Promise<any[]> {
  try {
    console.log('📡 Fetching MCP tools via MCP protocol...')
    
    // Send MCP protocol message to list tools
    const response = await fetch(MCP_SERVER_URL, {
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

    if (!response.ok) {
      throw new Error(`MCP tools fetch failed: ${response.status} ${response.statusText}`)
    }

    // Get response as text to handle SSE format
    const text = await response.text()
    
    // Parse SSE format: "data: {...}\n\n"
    let jsonData = ''
    const lines = text.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        jsonData += line.substring(6)
      }
    }
    
    if (!jsonData) {
      throw new Error('No data in SSE response')
    }
    
    const data = JSON.parse(jsonData)
    const tools = data.result?.tools || []

    console.log(`✅ Fetched ${tools.length} tools from MCP server`)
    
    // Convert MCP tools to OpenAI function format
    return tools.map((tool: any) => ({
      type: 'function',
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema || { type: 'object', properties: {} }
    }))
  } catch (error) {
    console.error('❌ Failed to fetch MCP tools:', error)
    return []
  }
}

/**
 * Call MCP server to execute a tool using proper MCP protocol
 * Handles Server-Sent Events (SSE) format response
 */
async function callMcpTool(toolName: string, args: any): Promise<any> {
  try {
    console.log(`🔧 Calling MCP tool: ${toolName}`, args)

    const response = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      })
    })

    if (!response.ok) {
      throw new Error(`MCP tool call failed: ${response.status}`)
    }

    // Get response as text to handle SSE format
    const text = await response.text()
    console.log('📡 Raw SSE response:', text.substring(0, 500)) // Show first 500 chars
    
    // Parse SSE format: "data: {...}\n\n"
    let jsonData = ''
    const lines = text.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        jsonData += line.substring(6)
      }
    }
    
    if (!jsonData) {
      throw new Error('No data in SSE response')
    }
    
    console.log('📋 Extracted JSON data:', jsonData.substring(0, 500))
    const data = JSON.parse(jsonData)
    console.log('📦 Parsed data object:', data)
    const result = data.result
    
    console.log(`✅ MCP tool result:`, result)

    return result
  } catch (error) {
    console.error(`❌ MCP tool call failed:`, error)
    throw error
  }
}

/**
 * Initialize the voice agent
 */
async function initializeAgent() {
  try {
    console.log('🚀 Initializing voice agent...')

    // Validate API key
    if (!OPENAI_API_KEY) {
      throw new Error('VITE_OPENAI_API_KEY not found in environment')
    }

    // Fetch MCP tools first
    mcpTools = await fetchMcpTools()
    
    if (mcpTools.length === 0) {
      console.warn('⚠️ No MCP tools available. Make sure MCP server is running on port 3000.')
    }

    // Create Realtime API client
    realtimeClient = new RealtimeAPIClient({
      apiKey: OPENAI_API_KEY,
      model: 'gpt-4o-realtime-preview-2024-10-01',
      voice: 'alloy',
      instructions: `You are a helpful voice assistant with access to Google Calendar.

You can help users with their calendar by:
- Viewing upcoming events
- Creating new events
- Updating existing events
- Deleting events
- Checking free/busy times
- Searching for specific events

When users ask about their calendar, use the available tools to help them.
Be conversational and natural. Confirm actions before making changes.`,
      tools: mcpTools
    })

    // Set up event handlers
    setupEventHandlers()

    // Connect to OpenAI
    await realtimeClient.connect()

    console.log('✅ Voice agent initialized with', mcpTools.length, 'tools')
    updateStatus('ready', `Connected with ${mcpTools.length} calendar tools`)
    
    isConnected = true

  } catch (error) {
    console.error('❌ Failed to initialize agent:', error)
    updateStatus('error', `Initialization failed: ${error}`)
    throw error
  }
}

/**
 * Set up event handlers for Realtime API
 */
function setupEventHandlers() {
  if (!realtimeClient) return

  // Session events
  realtimeClient.on('session.created', (event: any) => {
    console.log('✅ Session created:', event.session)
  })

  realtimeClient.on('session.updated', (event: any) => {
    console.log('✅ Session updated:', event.session)
  })

  // Input audio events
  realtimeClient.on('input_audio_buffer.speech_started', () => {
    console.log('🎤 User started speaking')
    updateStatus('listening', 'Listening...')
  })

  realtimeClient.on('input_audio_buffer.speech_stopped', () => {
    console.log('🎤 User stopped speaking')
    updateStatus('processing', 'Processing...')
  })

  // Transcription events
  realtimeClient.on('conversation.item.input_audio_transcription.completed', (event: any) => {
    const transcript = event.transcript
    console.log('📝 User said:', transcript)
    addMessage('user', transcript)
    updateStatus('processing', 'Thinking...')
  })

  // Response events
  realtimeClient.on('response.created', (event: any) => {
    console.log('💬 Response created:', event.response.id)
  })

  realtimeClient.on('response.output_item.added', (event: any) => {
    console.log('📤 Output item added:', event.item)
  })

  realtimeClient.on('response.text.delta', (event: any) => {
    // Real-time text streaming (optional to display)
    console.log('💬 Text delta:', event.delta)
  })

  realtimeClient.on('response.text.done', (event: any) => {
    const text = event.text
    console.log('💬 Assistant said:', text)
    addMessage('assistant', text)
  })

  realtimeClient.on('response.audio.delta', () => {
    // Audio is handled internally by RealtimeAPIClient
  })

  realtimeClient.on('response.audio.done', () => {
    console.log('🔊 Audio response complete')
    updateStatus('ready', 'Ready to listen')
  })

  // Function calling events
  realtimeClient.on('response.function_call_arguments.delta', (event: any) => {
    console.log('🔧 Function call delta:', event)
  })

  realtimeClient.on('response.function_call_arguments.done', async (event: any) => {
    const { call_id, name, arguments: argsString } = event
    
    console.log('🔧 Function call complete:', name)
    console.log('📋 Arguments:', argsString)
    updateStatus('processing', `Calling ${name}...`)
    
    // Show in UI that we're calling a tool
    addMessage('system', `🔧 Calling tool: ${name}`)

    try {
      // Parse arguments
      const args = JSON.parse(argsString)
      console.log('📋 Parsed arguments:', args)
      
      // Fix date formats - MCP requires ISO 8601 without milliseconds (YYYY-MM-DDTHH:MM:SS)
      const fixedArgs = { ...args }
      
      // Helper function to convert date to MCP format
      const fixDateFormat = (dateStr: string): string => {
        if (!dateStr) return dateStr
        // Remove milliseconds if present (.###) and remove timezone (Z or +00:00)
        return dateStr
          .replace(/\.\d+Z?$/, '')  // Remove .123Z or .123
          .replace(/Z$/, '')         // Remove trailing Z
          .replace(/[+-]\d{2}:\d{2}$/, '') // Remove timezone like +05:00
      }
      
      if (fixedArgs.timeMin) {
        fixedArgs.timeMin = fixDateFormat(fixedArgs.timeMin)
      }
      if (fixedArgs.timeMax) {
        fixedArgs.timeMax = fixDateFormat(fixedArgs.timeMax)
      }
      if (fixedArgs.start && typeof fixedArgs.start === 'object' && fixedArgs.start.dateTime) {
        fixedArgs.start.dateTime = fixDateFormat(fixedArgs.start.dateTime)
      }
      if (fixedArgs.end && typeof fixedArgs.end === 'object' && fixedArgs.end.dateTime) {
        fixedArgs.end.dateTime = fixDateFormat(fixedArgs.end.dateTime)
      }
      console.log('🔧 Fixed arguments for MCP:', fixedArgs)
      
      // Call MCP server
      const result = await callMcpTool(name, fixedArgs)
      console.log('📦 MCP Result:', result)
      
      // Show tool result in UI
      addMessage('system', `✅ Tool ${name} completed`)
      
      // Send result back to OpenAI
      realtimeClient!.send({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call_id,
          output: JSON.stringify(result)
        }
      })

      // Request assistant to respond with the result
      realtimeClient!.send({
        type: 'response.create'
      })

      console.log('✅ Function result sent back to assistant')
      
    } catch (error) {
      console.error('❌ Function call failed:', error)
      
      // Send error to assistant
      realtimeClient!.send({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call_id,
          output: JSON.stringify({ error: String(error) })
        }
      })

      realtimeClient!.send({
        type: 'response.create'
      })
    }
  })

  // Error events
  realtimeClient.on('error', (event: any) => {
    console.error('❌ Error:', event.error)
    updateStatus('error', `Error: ${event.error.message || 'Unknown error'}`)
  })

  // Audio capture started
  realtimeClient.on('audio_capture_started', () => {
    updateStatus('ready', 'Microphone active - speak to me!')
  })
}

/**
 * Start the voice conversation
 */
async function startConversation() {
  if (!realtimeClient || !isConnected) {
    console.error('Agent not initialized')
    return
  }

  try {
    console.log('🎤 Starting conversation...')
    
    // Start capturing microphone audio
    await realtimeClient.startAudioCapture()
    
    updateStatus('ready', 'Listening... speak to me about your calendar!')
    
  } catch (error) {
    console.error('❌ Failed to start conversation:', error)
    updateStatus('error', `Failed to start: ${error}`)
  }
}

/**
 * Stop the voice conversation
 */
function stopConversation() {
  if (!realtimeClient) return

  console.log('🛑 Stopping conversation...')
  realtimeClient.disconnect()
  isConnected = false
  updateStatus('disconnected', 'Disconnected')
}

/**
 * Update UI status
 */
function updateStatus(state: string, message: string) {
  const statusDiv = document.getElementById('status')
  if (statusDiv) {
    statusDiv.className = `status ${state}`
    statusDiv.textContent = message
  }
}

/**
 * Add message to conversation UI
 */
function addMessage(role: 'user' | 'assistant' | 'system', content: string) {
  const messagesDiv = document.getElementById('messages')
  if (!messagesDiv) return

  const messageEl = document.createElement('div')
  messageEl.className = `message ${role}`
  
  const roleEl = document.createElement('strong')
  roleEl.textContent = role === 'user' ? 'You: ' : role === 'assistant' ? 'Assistant: ' : 'System: '
  
  const contentEl = document.createElement('span')
  contentEl.textContent = content
  
  messageEl.appendChild(roleEl)
  messageEl.appendChild(contentEl)
  
  messagesDiv.appendChild(messageEl)
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

/**
 * Test MCP connection
 */
async function testMcpConnection() {
  try {
    updateStatus('testing', 'Testing MCP connection...')
    
    const tools = await fetchMcpTools()
    
    if (tools.length > 0) {
      const toolList = tools.map(t => `- ${t.name}`).join('\n')
      alert(`✅ MCP Server Connected!\n\nFound ${tools.length} tools:\n${toolList}`)
      updateStatus('ready', `MCP server OK (${tools.length} tools)`)
    } else {
      alert('⚠️ MCP server responded but returned no tools')
      updateStatus('warning', 'MCP server has no tools')
    }
  } catch (error) {
    alert(`❌ MCP Connection Failed:\n${error}`)
    updateStatus('error', 'MCP connection failed')
  }
}

/**
 * Test list events using proper MCP protocol
 */
async function testListEvents() {
  try {
    updateStatus('testing', 'Fetching calendar events...')
    
    // Fix date format for MCP (remove milliseconds and timezone)
    const now = new Date().toISOString()
      .replace(/\.\d+Z?$/, '')  // Remove .123Z or .123
      .replace(/Z$/, '')         // Remove trailing Z
    
    const result = await callMcpTool('list-events', {
      calendarId: 'primary',
      timeMin: now,
      maxResults: 10
    })

    console.log('Calendar events:', result)
    
    const eventCount = result.content?.[0]?.text ? 'See console for results' : 'No events found'
    alert(`✅ Calendar Events Retrieved!\n\n${eventCount}`)
    updateStatus('ready', 'Test complete')
  } catch (error) {
    alert(`❌ Failed to list events:\n${error}`)
    updateStatus('error', 'Test failed')
  }
}

/**
 * Initialize UI
 */
function setupUI() {
  // Initialize button
  const initButton = document.getElementById('init-button')
  if (initButton) {
    initButton.addEventListener('click', async () => {
      initButton.setAttribute('disabled', 'true')
      try {
        await initializeAgent()
      } catch (error) {
        console.error('Initialization failed:', error)
        initButton.removeAttribute('disabled')
      }
    })
  }

  // Start button
  const startButton = document.getElementById('start-button')
  if (startButton) {
    startButton.addEventListener('click', startConversation)
  }

  // Stop button
  const stopButton = document.getElementById('stop-button')
  if (stopButton) {
    stopButton.addEventListener('click', stopConversation)
  }

  // Test MCP button
  const testMcpButton = document.getElementById('test-mcp')
  if (testMcpButton) {
    testMcpButton.addEventListener('click', testMcpConnection)
  }

  // Test list events button
  const testListButton = document.getElementById('test-list')
  if (testListButton) {
    testListButton.addEventListener('click', testListEvents)
  }

  updateStatus('idle', 'Click "Initialize Agent" to begin')
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupUI)
} else {
  setupUI()
}
