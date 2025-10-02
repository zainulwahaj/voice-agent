import './style.css'
import { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime'

// Environment variables
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

// Global variables for the voice agent
let agent: RealtimeAgent | null = null
let session: RealtimeSession | null = null
let isConnected = false
let autoScroll = true
let currentTranscript = ''

// Google Calendar variables (now handled by MCP through agent)
let isGoogleAuthenticated = true // MCP is integrated into agent
let calendarEvents: any[] = [] // Fallback demo data

// DOM elements
const statusElement = document.getElementById('status') as HTMLDivElement
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement
const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement
const clearKeyBtn = document.getElementById('clear-key-btn') as HTMLButtonElement
const conversationElement = document.getElementById('conversation') as HTMLDivElement
const testTranscriptBtn = document.getElementById('test-transcript-btn') as HTMLButtonElement
const testMicBtn = document.getElementById('test-mic-btn') as HTMLButtonElement
const clearTranscriptBtn = document.getElementById('clear-transcript-btn') as HTMLButtonElement
const toggleAutoScrollBtn = document.getElementById('toggle-auto-scroll-btn') as HTMLButtonElement
const googleAuthBtn = document.getElementById('google-auth-btn') as HTMLButtonElement
const mcpConnectBtn = document.getElementById('mcp-connect-btn') as HTMLButtonElement

// Fetch available tools from MCP server
async function fetchMcpTools(): Promise<any[]> {
  try {
    console.log('🔧 Fetching available tools from MCP server...')
    
    const response = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
        id: Date.now()
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const responseText = await response.text()
    console.log('🔧 MCP tools response:', responseText)

    // Handle SSE format
    if (responseText.startsWith('event: ')) {
      const lines = responseText.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonData = JSON.parse(line.substring(6))
          if (jsonData.result?.tools) {
            console.log('✅ Found MCP tools:', jsonData.result.tools)
            return jsonData.result.tools
          }
        }
      }
    }

    // Handle regular JSON response
    const result = JSON.parse(responseText)
    if (result.result?.tools) {
      console.log('✅ Found MCP tools:', result.result.tools)
      return result.result.tools
    }

    return []
  } catch (error) {
    console.error('❌ Failed to fetch MCP tools:', error)
    return []
  }
}

// Convert MCP tool schema to OpenAI function format
function convertMcpToolToOpenAIFunction(mcpTool: any): any {
  return {
    name: mcpTool.name,
    description: mcpTool.description || '',
    parameters: mcpTool.inputSchema || { type: 'object', properties: {} }
  }
}

// Initialize the voice agent with MCP tools
async function initializeAgent() {
  // Fetch available tools from MCP server
  const mcpTools = await fetchMcpTools()
  
  // Convert MCP tools to OpenAI function format
  const openAITools = mcpTools.map(convertMcpToolToOpenAIFunction)
  
  console.log('🔧 Registering tools with agent:', openAITools)
  
  agent = new RealtimeAgent({
    name: 'Calendar Assistant',
    instructions: `You are a helpful calendar assistant that can manage Google Calendar events and appointments. 

IMPORTANT INSTRUCTIONS:
- When users ask about calendar, events, schedules, appointments, or meetings, you MUST use the available tools
- Use list-events tool to check what's on the calendar
- Use create-event tool to create new events
- Use search-events tool to find specific events
- Use get-freebusy tool to check availability
- Always provide specific dates and times in ISO 8601 format
- Be conversational and natural since this is a voice interaction
- After calling a tool, explain the results in a friendly way

Current date and time: ${new Date().toISOString()}`,
    tools: openAITools,
  })
  
  console.log('✅ Calendar assistant initialized with', openAITools.length, 'tools')
}

// Function to call MCP server for calendar operations
async function callMcpServer(toolName: string, args: any = {}): Promise<string> {
  try {
    console.log(`🔧 Calling MCP server: ${toolName}`, args)
    
    const response = await fetch('http://localhost:3000/mcp/tools/call', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: toolName, arguments: args },
        id: Date.now()
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const responseText = await response.text()
    console.log(`🔧 MCP response:`, responseText)

    // Handle SSE format
    if (responseText.startsWith('event: ')) {
      const lines = responseText.split('\n')
      let jsonData = null
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            jsonData = JSON.parse(line.substring(6))
            break
          } catch (e) {
            // Continue looking for valid JSON
          }
        }
      }
      if (jsonData && jsonData.result) {
        return jsonData.result.content?.[0]?.text || 'No data received'
      }
    }

    // Handle regular JSON response
    try {
      const result = JSON.parse(responseText)
      return result.result?.content?.[0]?.text || 'No data received'
    } catch (parseError) {
      return responseText || 'No data received'
    }
  } catch (error: any) {
    console.error(`❌ MCP call failed for ${toolName}:`, error)
    return `Error calling calendar service: ${error?.message || 'Unknown error'}`
  }
}

// WebRTC connection for OpenAI Realtime API
let peerConnection: RTCPeerConnection | null = null
let dataChannel: RTCDataChannel | null = null
let audioElement: HTMLAudioElement | null = null

// Set up event listeners for the session (DEPRECATED - using WebRTC now)
function setupSessionEventListeners_OLD() {
  if (!session) return
  
  // Use any type to bypass TypeScript strict checking for event listeners
  const sessionAny = session as any
  
  // List all available event listeners after a short delay
  setTimeout(() => {
    console.log('📋 Session initialized for event listeners')
  }, 2000)
  
  // DEBUG: Listen to ALL session events
  sessionAny.on('*', (eventName: string, ...args: any[]) => {
    console.log('🔍 SESSION EVENT FIRED:', eventName, args)
  })
  
  // Get the actual EventEmitter from initialAgent
  const eventEmitter = sessionAny.initialAgent?.eventEmitter
  if (!eventEmitter) {
    console.log('❌ No eventEmitter found in session.initialAgent')
    return
  }
  
        console.log('✅ Found eventEmitter, setting up voice listeners...')
        
  // DEBUG: Listen to ALL events to see what's actually firing
  if (eventEmitter.on) {
    // Try to listen to all events if supported
    const originalEmit = eventEmitter.emit
    if (originalEmit) {
      eventEmitter.emit = function(event: string, ...args: any[]) {
        console.log('🔍 EVENT FIRED:', event, args.length > 0 ? args[0] : '')
        return originalEmit.apply(this, [event, ...args])
      }
    }
  }        // Handle connection events
  sessionAny.on('session.connected', () => {
    console.log('✅ Session connected successfully!')
    updateStatus('Connected - Start speaking!', 'connected')
    updateConnectionState(true)
    addMessageToConversation('assistant', '🎉 Connected! You can now start speaking. Try saying something and watch for the transcript to appear.')
  })
  
  sessionAny.on('session.disconnected', () => {
    console.log('Session disconnected')
    updateStatus('Disconnected')
    updateConnectionState(false)
  })
  
  // Handle audio events
  sessionAny.on('audio.input_started', () => {
    console.log('Audio input started')
    updateStatus('Listening...', 'listening')
  })
  
  sessionAny.on('audio.input_stopped', () => {
    console.log('Audio input stopped')
    updateStatus('Processing...')
  })
  
  // Handle response events
  sessionAny.on('response.started', () => {
    console.log('Response started')
    updateStatus('Assistant is speaking...')
  })
  
  sessionAny.on('response.completed', () => {
    console.log('Response completed')
    updateStatus('Connected - Start speaking!', 'connected')
  })
  
        // Handle conversation items - just log transcriptions
        eventEmitter.on('conversation.item.input_audio_transcription', async (event: any) => {
          console.log('🎤 User said:', event.transcript)
          addMessageToConversation('user', event.transcript)
        })

  // Add more event listeners to catch voice input
  eventEmitter.on('input_audio_buffer.transcript', async (event: any) => {
    console.log('🎤 INPUT AUDIO BUFFER TRANSCRIPT EVENT FIRED!')
    console.log('🎤 Buffer transcript:', event)
    if (event.transcript) {
      addMessageToConversation('user', event.transcript)
      console.log('🎤 Agent will handle this query using MCP tools')
    }
  })

  // Handle any conversation item
  eventEmitter.on('conversation.item', async (event: any) => {
    console.log('🎤 CONVERSATION ITEM EVENT FIRED!', event)
    if (event.type === 'input_audio_transcription' && event.transcript) {
      console.log('🎤 Processing conversation item transcript:', event.transcript)
    addMessageToConversation('user', event.transcript)
      console.log('🎤 Agent will handle this query using MCP tools')
    }
  })
  
  // Move all voice-related events to the eventEmitter
  eventEmitter.on('conversation.item.assistant_message', (event: any) => {
    console.log('Assistant message:', event)
    addMessageToConversation('assistant', event.message.content)
  })
  
  // Handle speech events with correct names on eventEmitter
  eventEmitter.on('input_audio_buffer.speech_started', () => {
    console.log('Speech started')
    updateStatus('Listening...', 'listening')
  })
  
  eventEmitter.on('input_audio_buffer.speech_stopped', () => {
    console.log('Speech stopped')
    updateStatus('Processing...')
  })
  
  // Handle tool calls from the agent
  console.log('📌 Registering tool call event handlers...')
  
  eventEmitter.on('response.function_call_arguments.delta', (event: any) => {
    console.log('🔧 Function call arguments delta:', event)
  })
  
  eventEmitter.on('response.function_call_arguments.done', async (event: any) => {
    console.log('🔧 Function call ready:', event)
    
    try {
      const functionName = event.name
      const functionArgs = JSON.parse(event.arguments || '{}')
      
      console.log(`🔧 Calling MCP tool: ${functionName}`, functionArgs)
      addMessageToConversation('assistant', `🔄 Calling ${functionName}...`)
      
      // Call the MCP server with the tool
      const result = await callMcpServer(functionName, functionArgs)
      
      console.log(`✅ Tool result:`, result)
      
      // Submit the function result back to the agent
      if (sessionAny.submitFunctionCallResult) {
        await sessionAny.submitFunctionCallResult(event.call_id, result)
      } else {
        // Alternative: add as assistant message
        addMessageToConversation('assistant', result)
      }
    } catch (error: any) {
      console.error('❌ Function call failed:', error)
      addMessageToConversation('assistant', `Error: ${error.message}`)
    }
  })
  
  // Handle response events on eventEmitter
  eventEmitter.on('response.audio_transcript.delta', (event: any) => {
    console.log('Response transcript delta:', event)
    updateTranscript(event.delta, 'assistant')
  })
  
  eventEmitter.on('response.audio_transcript.done', (event: any) => {
    console.log('Response transcript done:', event)
    addMessageToConversation('assistant', event.transcript)
  })
  
  // Handle messages (fallback)
  sessionAny.on('message', (event: any) => {
    console.log('Message received:', event)
    addMessageToConversation('assistant', event.message.content)
  })
  
  // Handle errors
  sessionAny.on('error', (error: any) => {
    console.error('Session error:', error)
    updateStatus(`Error: ${error.message || 'Unknown error'}`)
    updateConnectionState(false)
  })
}

// Update the status display
function updateStatus(message: string, className?: string) {
  statusElement.textContent = message
  statusElement.className = className ? `status ${className}` : 'status'
}

// Update connection state and button states
function updateConnectionState(connected: boolean) {
  isConnected = connected
  connectBtn.disabled = connected
  disconnectBtn.disabled = !connected
  
  if (connected) {
    connectBtn.textContent = 'Connected'
    disconnectBtn.textContent = 'Disconnect'
  } else {
    connectBtn.textContent = 'Connect'
    disconnectBtn.textContent = 'Disconnected'
  }
}

// Update real-time transcript
function updateTranscript(delta: string, sender: 'user' | 'assistant') {
  currentTranscript += delta
  
  // Find or create the current transcript element
  let transcriptElement = document.getElementById(`transcript-${sender}`)
  if (!transcriptElement) {
    transcriptElement = document.createElement('div')
    transcriptElement.id = `transcript-${sender}`
    transcriptElement.className = `conversation-item ${sender} transcript-delta`
    transcriptElement.innerHTML = `
      <div class="message-header">
        <span class="sender">${sender === 'user' ? 'You' : 'Assistant'}</span>
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="message-content"></div>
    `
    conversationElement.appendChild(transcriptElement)
  }
  
  const contentElement = transcriptElement.querySelector('.message-content')
  if (contentElement) {
    contentElement.textContent = currentTranscript
  }
  
  if (autoScroll) {
    conversationElement.scrollTop = conversationElement.scrollHeight
  }
}

// Add message to conversation display
function addMessageToConversation(sender: 'user' | 'assistant', content: string) {
  // Remove any existing transcript element for this sender
  const existingTranscript = document.getElementById(`transcript-${sender}`)
  if (existingTranscript) {
    existingTranscript.remove()
  }
  
  const messageDiv = document.createElement('div')
  messageDiv.className = `conversation-item ${sender}`
  messageDiv.innerHTML = `
    <div class="message-header">
      <span class="sender">${sender === 'user' ? 'You' : 'Assistant'}</span>
      <span class="timestamp">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="message-content">${content}</div>
  `
  conversationElement.appendChild(messageDiv)
  
  if (autoScroll) {
    conversationElement.scrollTop = conversationElement.scrollHeight
  }
}

// Generate ephemeral API key from OpenAI API key
async function generateEphemeralKey(openaiApiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model: 'gpt-realtime'
      }
    })
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Failed to generate ephemeral key: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`)
  }
  
  const data = await response.json()
  if (!data.value) {
    throw new Error('Invalid response from OpenAI API')
  }
  
  return data.value
}

// Connect to the session
async function connect() {
  let openaiApiKey = apiKeyInput.value.trim()
  
  // Use environment variable if available and no input provided
  if (!openaiApiKey && OPENAI_API_KEY) {
    openaiApiKey = OPENAI_API_KEY
    apiKeyInput.value = OPENAI_API_KEY
  }
  
  if (!openaiApiKey) {
    alert('Please enter your OpenAI API key or set VITE_OPENAI_API_KEY in your .env file')
    return
  }
  
  if (!openaiApiKey.startsWith('sk-')) {
    alert('Please enter a valid OpenAI API key (should start with "sk-")')
    return
  }
  
  try {
    updateStatus('Generating secure key...')
    
    // Save API key for future use
    saveApiKey(openaiApiKey)
    
    // Generate ephemeral key
    const ephemeralKey = await generateEphemeralKey(openaiApiKey)
    console.log('Ephemeral key generated successfully')
    
    updateStatus('Connecting...')
    
    // Initialize agent and fetch tools
    if (!agent) {
      await initializeAgent()
    }
    
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    console.log('🎤 Microphone access granted')
    
    // Create peer connection
    peerConnection = new RTCPeerConnection()
    
    // Add microphone audio
    stream.getTracks().forEach(track => peerConnection!.addTrack(track, stream))
    
    // Set up audio playback
    audioElement = new Audio()
    audioElement.autoplay = true
    peerConnection.ontrack = (event) => {
      console.log('📻 Receiving audio')
      audioElement!.srcObject = event.streams[0]
    }
    
    // Create data channel
    dataChannel = peerConnection.createDataChannel('oai-events')
    
    // Fetch tools for session config
    const mcpTools = await fetchMcpTools()
    const tools = mcpTools.map(convertMcpToolToOpenAIFunction)
    
    // Data channel handlers
    dataChannel.addEventListener('open', () => {
      console.log('✅ Data channel opened')
      
      // Configure session with tools
      dataChannel!.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: `You are a calendar assistant. When users ask about their calendar, use the tools to help them. Current time: ${new Date().toISOString()}`,
          voice: 'alloy',
          turn_detection: { type: 'server_vad' },
          tools: tools
        }
      }))
      
      console.log('� Sent session.update with', tools.length, 'tools')
      updateStatus('Connected - Start speaking!', 'connected')
      updateConnectionState(true)
      addMessageToConversation('assistant', '🎉 Connected! Ask about your calendar.')
    })
    
    dataChannel.addEventListener('message', async (event) => {
      const msg = JSON.parse(event.data)
      console.log('📥', msg.type)
      await handleRealtimeEvent(msg)
    })
    
    // Create and send offer
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    
    const res = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp'
      },
      body: offer.sdp
    })
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    
    await peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: await res.text()
    })
    
    console.log('✅ WebRTC connected')
  } catch (error) {
    console.error('Connection failed:', error)
    updateStatus(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    updateConnectionState(false)
  }
}

// Handle incoming Realtime API events
async function handleRealtimeEvent(event: any) {
  switch (event.type) {
    case 'conversation.item.input_audio_transcription.completed':
      console.log('🎤 User said:', event.transcript)
      addMessageToConversation('user', event.transcript)
      break
      
    case 'response.audio_transcript.delta':
      // Accumulate assistant response
      break
      
    case 'response.audio_transcript.done':
      console.log('🤖 Assistant said:', event.transcript)
      addMessageToConversation('assistant', event.transcript)
      break
      
    case 'response.function_call_arguments.done':
      console.log('🔧 Tool call:', event.name, event.arguments)
      await handleToolCall(event)
      break
      
    case 'error':
      console.error('❌ Realtime API error:', event.error)
      updateStatus(`Error: ${event.error.message}`)
      break
  }
}

// Handle tool calls from the agent
async function handleToolCall(event: any) {
  try {
    const functionName = event.name
    const functionArgs = JSON.parse(event.arguments)
    
    console.log(`🔧 Calling ${functionName}...`)
    addMessageToConversation('assistant', `🔄 ${functionName}...`)
    
    // Call MCP server
    const result = await callMcpServer(functionName, functionArgs)
    console.log('✅ Tool result:', result.substring(0, 200))
    
    // Send result back to Realtime API
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: event.call_id,
          output: result
        }
      }))
      
      // Trigger response generation
      dataChannel.send(JSON.stringify({
        type: 'response.create'
      }))
    }
  } catch (error: any) {
    console.error('❌ Tool call failed:', error)
    addMessageToConversation('assistant', `Error: ${error.message}`)
  }
}

// Disconnect from the session
async function disconnect() {
  try {
    if (dataChannel) {
      dataChannel.close()
      dataChannel = null
    }
    if (peerConnection) {
      peerConnection.close()
      peerConnection = null
    }
    if (audioElement) {
      audioElement.pause()
      audioElement.srcObject = null
      audioElement = null
    }
    console.log('Disconnected')
  } catch (error) {
    console.error('Disconnection failed:', error)
  } finally {
    updateConnectionState(false)
  }
}

// Test transcript display through agent
async function testTranscript() {
  addMessageToConversation('user', 'What\'s on my calendar today?')
  
  // Test MCP server directly
  try {
    console.log('🧪 Testing MCP server directly...')
    const events = await callMcpServer('list-events', {
      calendarId: 'primary',
      timeMin: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
      timeMax: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T23:59:59Z'
    })
    
    addMessageToConversation('assistant', `Here's what's on your calendar today: ${events}`)
    console.log('✅ MCP test successful')
  } catch (error) {
    console.error('❌ MCP test failed:', error)
    addMessageToConversation('assistant', 'Sorry, I couldn\'t access your calendar. Please check if the MCP server is running.')
  }
}

// Test calendar query directly through agent
async function testCalendar() {
  console.log('🧪 TEST CALENDAR BUTTON CLICKED')
  addMessageToConversation('user', 'What\'s on my calendar today?')
  
  // Test MCP server directly
  try {
    console.log('🧪 Testing MCP server directly...')
    const events = await callMcpServer('list-events', {
      calendarId: 'primary',
      timeMin: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
      timeMax: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T23:59:59Z'
    })
    
    addMessageToConversation('assistant', `Here's what's on your calendar today: ${events}`)
    console.log('✅ MCP test successful')
  } catch (error) {
    console.error('❌ MCP test failed:', error)
    addMessageToConversation('assistant', 'Sorry, I couldn\'t access your calendar. Please check if the MCP server is running.')
  }
}

// Create a test event at 2 PM today
async function createTestEvent() {
  console.log('🧪 CREATE TEST EVENT BUTTON CLICKED')
  addMessageToConversation('user', 'Create a test event at 2 PM today')
  
  try {
    console.log('🧪 Creating test event...')
    
    // Create event for today at 2 PM
    const today = new Date()
    const startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0, 0) // 2 PM today
    const endTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 0, 0) // 3 PM today
    
    // Format dates properly for MCP server - must be exact ISO 8601 format
    const formatDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`
    }
    
    const eventData = {
      calendarId: 'primary',
      summary: 'Test Event - Voice Agent Demo',
      start: formatDate(startTime),
      end: formatDate(endTime),
      description: 'This is a test event created by the voice agent demo',
      location: 'Virtual Meeting'
    }
    
    console.log('🔧 Creating event with data:', eventData)
    
    const result = await callMcpServer('create-event', eventData)
    
    addMessageToConversation('assistant', `✅ Test event created successfully! ${result}`)
    console.log('✅ Event creation successful')
    
    // Also show the updated calendar
  setTimeout(async () => {
      try {
        const events = await callMcpServer('list-events', {
          calendarId: 'primary',
          timeMin: today.toISOString().split('T')[0] + 'T00:00:00Z',
          timeMax: today.toISOString().split('T')[0] + 'T23:59:59Z'
        })
        addMessageToConversation('assistant', `Updated calendar for today: ${events}`)
      } catch (error) {
        console.error('❌ Failed to refresh calendar:', error)
      }
  }, 1000)
    
  } catch (error) {
    console.error('❌ Event creation failed:', error)
    addMessageToConversation('assistant', `Sorry, I couldn't create the test event: ${error.message}`)
  }
}

// Debug function to list all session events
function debugSessionEvents() {
  if (!session) {
    console.log('❌ No session available for debugging')
    return
  }
  
  console.log('🔍 DEBUG: Analyzing session object...')
  const sessionAny = session as any
  
  console.log('🔍 Session object keys:', Object.keys(sessionAny))
  console.log('🔍 Session type:', typeof sessionAny)
  console.log('🔍 Session constructor:', sessionAny.constructor?.name)
  
  // Check if it has any event-related methods
  const eventMethods = ['on', 'off', 'emit', 'addListener', 'removeListener', 'eventNames', 'listenerCount']
  eventMethods.forEach(method => {
    if (typeof sessionAny[method] === 'function') {
      console.log(`✅ Has ${method} method`)
    } else {
      console.log(`❌ No ${method} method`)
    }
  })
  
  // Check initialAgent and options
  if (sessionAny.initialAgent) {
    console.log('🔍 Initial Agent keys:', Object.keys(sessionAny.initialAgent))
  }
  if (sessionAny.options) {
    console.log('🔍 Options keys:', Object.keys(sessionAny.options))
  }
  
  // Look for any objects that might be EventEmitters
  console.log('🔍 Looking for EventEmitter objects...')
  function findEventEmitters(obj: any, path: string = 'session', depth: number = 0) {
    if (depth > 3) return // Prevent infinite recursion
    
    if (obj && typeof obj === 'object') {
      if (typeof obj.on === 'function' && typeof obj.emit === 'function') {
        console.log(`🎯 Found potential EventEmitter at ${path}:`, Object.keys(obj))
      }
      
      Object.keys(obj).forEach(key => {
        if (obj[key] && typeof obj[key] === 'object') {
          findEventEmitters(obj[key], `${path}.${key}`, depth + 1)
        }
      })
    }
  }
  
  findEventEmitters(sessionAny)
}

// Test all possible voice event names
function testVoiceEvents() {
  if (!session) {
    console.log('❌ No session available for testing')
    return
  }
  
  console.log('🎤 TESTING ALL POSSIBLE VOICE EVENT NAMES...')
  const sessionAny = session as any
  const eventEmitter = sessionAny.initialAgent?.eventEmitter
  
  if (!eventEmitter) {
    console.log('❌ No eventEmitter found')
    return
  }
  
  // List of all possible event names to test
  const possibleEvents = [
    'conversation.item.input_audio_transcription',
    'input_audio_transcription',
    'input_audio_buffer.transcript',
    'input_audio_buffer.speech_started',
    'input_audio_buffer.speech_stopped',
    'conversation.item',
    'audio.input_started',
    'audio.input_stopped',
    'speech_started',
    'speech_stopped',
    'transcript',
    'voice_input',
    'user_speech',
    'audio_transcript'
  ]
  
  // Set up test listeners for all events
  possibleEvents.forEach(eventName => {
    eventEmitter.on(eventName, (event: any) => {
      console.log(`🎤 EVENT FIRED: ${eventName}`, event)
    })
  })
  
  // Also test on session object
  possibleEvents.forEach(eventName => {
    sessionAny.on(eventName, (event: any) => {
      console.log(`🎤 SESSION EVENT FIRED: ${eventName}`, event)
    })
  })
  
  console.log('🎤 All test listeners set up. Now try speaking!')
}

// Test microphone access
async function testMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    console.log('🎤 Microphone access granted:', stream)
    console.log('🎤 Stream tracks:', stream.getTracks())
    console.log('🎤 Audio tracks:', stream.getAudioTracks())
    addMessageToConversation('assistant', 'Microphone test successful! You can now speak.')
    stream.getTracks().forEach(track => track.stop())
  } catch (error) {
    console.error('🎤 Microphone access denied:', error)
    addMessageToConversation('assistant', 'Microphone access denied. Please allow microphone access to use voice features.')
  }
}

// Test if the session is actually processing audio
function testSessionAudio() {
  if (!session) {
    console.log('❌ No session available for audio test')
    return
  }
  
  console.log('🎤 TESTING SESSION AUDIO PROCESSING...')
  const sessionAny = session as any
  
  // Check if session has audio processing methods
  const audioMethods = ['startAudio', 'stopAudio', 'sendAudio', 'processAudio', 'start', 'stop']
  audioMethods.forEach(method => {
    if (typeof sessionAny[method] === 'function') {
      console.log(`✅ Session has ${method} method`)
    } else {
      console.log(`❌ Session missing ${method} method`)
    }
  })
  
  // Try different methods to start/connect the session
  const startMethods = ['start', 'connect', 'open', 'begin', 'initialize']
  startMethods.forEach(method => {
    if (typeof sessionAny[method] === 'function') {
      console.log(`🎤 Attempting to ${method} session...`)
      try {
        sessionAny[method]()
        console.log(`✅ Session ${method}ed successfully`)
      } catch (error) {
        console.log(`❌ Failed to ${method} session:`, error)
      }
    }
  })
  
  // Check if we can manually trigger audio processing
  if (typeof sessionAny.startAudio === 'function') {
    console.log('🎤 Attempting to start audio processing...')
    try {
      sessionAny.startAudio()
      console.log('✅ Audio processing started')
    } catch (error) {
      console.log('❌ Failed to start audio:', error)
    }
  }
  
  // Check session state
  console.log('🎤 Session state:', sessionAny.state)
  console.log('🎤 Session connected:', sessionAny.connected)
  console.log('🎤 Session ready:', sessionAny.ready)
}

// Clear transcript
function clearTranscript() {
  conversationElement.innerHTML = `
    <div class="conversation-item assistant welcome">
      <div class="message-header">
        <span class="sender">Calendar Assistant</span>
        <span class="timestamp" id="welcome-timestamp"></span>
      </div>
      <div class="message-content">Welcome! I'm your calendar assistant. I can help you with:
      <br>• Viewing your calendar events
      <br>• Creating new appointments and meetings
      <br>• Checking your availability
      <br>• Managing your schedule
      <br><br>Connect to Google Calendar and enter your OpenAI API key to start!</div>
    </div>
  `
  currentTranscript = ''
}

// Toggle auto scroll
function toggleAutoScroll() {
  autoScroll = !autoScroll
  toggleAutoScrollBtn.textContent = autoScroll ? 'Auto Scroll' : 'Manual Scroll'
  toggleAutoScrollBtn.classList.toggle('btn-active', autoScroll)
  
  if (autoScroll) {
    conversationElement.scrollTop = conversationElement.scrollHeight
  }
}

// MCP is now integrated directly into the agent - no separate connection needed
async function handleMcpConnection() {
  addMessageToConversation('assistant', 'MCP is now integrated directly into the voice agent! No separate connection needed. The agent will automatically use Google Calendar MCP tools when you speak.')
  mcpConnectBtn.textContent = 'MCP Integrated'
  mcpConnectBtn.classList.add('btn-connected')
  mcpConnectBtn.disabled = false
}

// Google Calendar authentication function (legacy - now redirects to MCP)
async function handleGoogleAuth() {
  addMessageToConversation('assistant', 'Please use the "Connect MCP" button to connect to Google Calendar through the MCP server.')
}

// Set up event listeners for buttons
connectBtn.addEventListener('click', connect)
disconnectBtn.addEventListener('click', disconnect)
clearKeyBtn.addEventListener('click', clearApiKey)
testTranscriptBtn.addEventListener('click', testTranscript)
testMicBtn.addEventListener('click', testMicrophone)
document.getElementById('test-calendar-btn')?.addEventListener('click', testCalendar)
document.getElementById('create-event-btn')?.addEventListener('click', createTestEvent)
document.getElementById('debug-session-btn')?.addEventListener('click', debugSessionEvents)
document.getElementById('test-voice-events-btn')?.addEventListener('click', testVoiceEvents)
document.getElementById('test-session-audio-btn')?.addEventListener('click', testSessionAudio)
clearTranscriptBtn.addEventListener('click', clearTranscript)
toggleAutoScrollBtn.addEventListener('click', toggleAutoScroll)
googleAuthBtn.addEventListener('click', handleGoogleAuth)
mcpConnectBtn.addEventListener('click', handleMcpConnection)

// Load saved API key from localStorage
function loadSavedApiKey() {
  const savedKey = localStorage.getItem('openai-api-key')
  if (savedKey) {
    apiKeyInput.value = savedKey
  }
}

// Save API key to localStorage
function saveApiKey(apiKey: string) {
  localStorage.setItem('openai-api-key', apiKey)
}

// Clear saved API key
function clearApiKey() {
  localStorage.removeItem('openai-api-key')
  apiKeyInput.value = ''
  updateStatus('API key cleared')
}

// Calendar Management Functions

// Load calendar events (demo data for now)
async function loadCalendarEvents() {
  try {
    // For demo purposes, create some sample events
    calendarEvents = [
      {
        id: '1',
        title: 'Team Meeting',
        start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        end: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
        location: 'Conference Room A',
        description: 'Weekly team standup meeting'
      },
      {
        id: '2',
        title: 'Doctor Appointment',
        start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Day after tomorrow
        end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(), // Day after tomorrow + 30 min
        location: 'Medical Center',
        description: 'Annual checkup with Dr. Smith'
      },
      {
        id: '3',
        title: 'Project Deadline',
        start: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Next week
        end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Office',
        description: 'Submit final project report'
      }
    ]
    console.log('Calendar events loaded successfully:', calendarEvents)
  } catch (error) {
    console.error('Error loading calendar events:', error)
    calendarEvents = []
  }
}

// Get events for a specific date
function getEventsForDate(date: Date) {
  const targetDate = date.toDateString()
  return calendarEvents.filter(event => {
    const eventDate = new Date(event.start).toDateString()
    return eventDate === targetDate
  })
}

// Get events for a date range
function getEventsForDateRange(startDate: Date, endDate: Date) {
  return calendarEvents.filter(event => {
    const eventDate = new Date(event.start)
    return eventDate >= startDate && eventDate <= endDate
  })
}

// Check if a time slot is available
function isTimeSlotAvailable(date: Date, startTime: string, endTime: string) {
  const targetDate = date.toDateString()
  const events = getEventsForDate(date)
  
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)
  
  const slotStart = new Date(date)
  slotStart.setHours(startHour, startMin, 0, 0)
  
  const slotEnd = new Date(date)
  slotEnd.setHours(endHour, endMin, 0, 0)
  
  for (const event of events) {
    const eventStart = new Date(event.start)
    const eventEnd = new Date(event.end)
    
    if (slotStart < eventEnd && slotEnd > eventStart) {
      return false
    }
  }
  
  return true
}

// Create a new calendar event
function createCalendarEvent(title: string, startTime: Date, endTime: Date, location: string = '', description: string = '') {
  const event = {
    id: `event_${Date.now()}`,
    title,
    start: startTime.toISOString(),
    end: endTime.toISOString(),
    location,
    description,
    createdAt: new Date().toISOString()
  }
  
  calendarEvents.push(event)
  return { success: true, message: 'Event created successfully', event }
}

// Format event information for display
function formatEventInfo(event: any) {
  const start = new Date(event.start)
  const end = new Date(event.end)
  
  return `${event.title}
Time: ${start.toLocaleString()} - ${end.toLocaleString()}
${event.location ? `Location: ${event.location}` : ''}
${event.description ? `Description: ${event.description}` : ''}`
}

// Calendar query handling is now done by the agent through MCP tools
// No need for manual calendar query processing

// Google Calendar Integration Functions

// Initialize Google Calendar
async function initializeGoogleCalendar() {
  try {
    // Check if we have stored tokens
    const tokens = localStorage.getItem('google-calendar-tokens')
    if (tokens) {
      isGoogleAuthenticated = true
      console.log('Google Calendar authenticated with stored tokens')
      return true
    }
    return false
  } catch (error) {
    console.error('Error initializing Google Calendar:', error)
    return false
  }
}

// Authenticate with Google Calendar using OAuth2
async function authenticateGoogleCalendar() {
  try {
    // Load credentials
    const response = await fetch('/google-credentials.json')
    if (!response.ok) {
      throw new Error('Failed to load Google credentials')
    }
    const credentials = await response.json()
    
    // Create OAuth2 URL
    const clientId = credentials.web.client_id
    const redirectUri = encodeURIComponent('http://localhost:5173/oauth-callback.html')
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar')
    
    const authUrl = `https://accounts.google.com/o/oauth2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${redirectUri}&` +
      `scope=${scope}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `prompt=consent`
    
    // Open authentication window
    const authWindow = window.open(authUrl, 'google-auth', 'width=500,height=600')
    
    return new Promise((resolve, reject) => {
      const checkClosed = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkClosed)
          reject(new Error('Authentication window closed'))
        }
      }, 1000)

      // Listen for the auth code
      window.addEventListener('message', async (event) => {
        if (event.origin !== window.location.origin) return
        
        if (event.data.type === 'GOOGLE_AUTH_CODE') {
          clearInterval(checkClosed)
          authWindow?.close()
          
          try {
            // Exchange code for tokens
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                client_id: credentials.web.client_id,
                client_secret: credentials.web.client_secret,
                code: event.data.code,
                grant_type: 'authorization_code',
                redirect_uri: 'http://localhost:5173/oauth-callback.html'
              })
            })
            
            const tokens = await tokenResponse.json()
            
            if (tokens.error) {
              throw new Error(tokens.error_description || 'Authentication failed')
            }
            
            // Store tokens
            localStorage.setItem('google-calendar-tokens', JSON.stringify(tokens))
            isGoogleAuthenticated = true
            
            console.log('Google Calendar authenticated successfully')
            resolve(true)
          } catch (error) {
            console.error('Error exchanging auth code:', error)
            reject(error)
          }
        }
      })
    })
  } catch (error) {
    console.error('Error authenticating with Google Calendar:', error)
    throw error
  }
}

// Get calendar events from Google Calendar
async function getGoogleCalendarEvents(startDate: string, endDate: string) {
  if (!isGoogleAuthenticated) {
    throw new Error('Google Calendar not authenticated')
  }

  try {
    const tokens = JSON.parse(localStorage.getItem('google-calendar-tokens') || '{}')
    
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${startDate}&` +
      `timeMax=${endDate}&` +
      `singleEvents=true&` +
      `orderBy=startTime`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch calendar events')
    }

    const data = await response.json()
    return data.items || []
  } catch (error) {
    console.error('Error fetching calendar events:', error)
    throw error
  }
}

// Create event in Google Calendar
async function createGoogleCalendarEvent(eventData: any) {
  if (!isGoogleAuthenticated) {
    throw new Error('Google Calendar not authenticated')
  }

  try {
    const tokens = JSON.parse(localStorage.getItem('google-calendar-tokens') || '{}')
    
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    })

    if (!response.ok) {
      throw new Error('Failed to create calendar event')
    }

    return await response.json()
  } catch (error) {
    console.error('Error creating calendar event:', error)
    throw error
  }
}

// Initialize the app
function initializeApp() {
  updateStatus('Ready to connect')
  updateConnectionState(false)
  
  // Load saved API key
  loadSavedApiKey()
  
  // Load calendar events
  loadCalendarEvents()
  
  // Initialize Google Calendar (demo mode)
  initializeGoogleCalendar()
  
  // Set welcome timestamp
  const welcomeTimestamp = document.getElementById('welcome-timestamp')
  if (welcomeTimestamp) {
    welcomeTimestamp.textContent = new Date().toLocaleTimeString()
  }
  
  // Initialize auto scroll button
  toggleAutoScrollBtn.textContent = 'Auto Scroll'
  toggleAutoScrollBtn.classList.add('btn-active')
}

// Start the app
initializeApp()