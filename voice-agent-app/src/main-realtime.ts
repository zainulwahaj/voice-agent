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
type IntakeStage = 'idle' | 'collecting' | 'confirm' | 'creating'
let intakeStage: IntakeStage = 'idle'
let intakeData: any = {}

function resetIntake() {
  intakeStage = 'idle'
  intakeData = {}
  updateStatus('ready', 'Ready to listen')
}

function showIntakeStatus() {
  const required = ['patientName','dob','reason','date','time']
  const missing = required.filter(k => !intakeData[k])
  const msg = missing.length ? `collecting: missing ${missing.join(', ')}` : 'confirming details'
  addMessage('system', `📝 Intake status → ${msg}`)
}

function askNextMissingField() {
  const order = [
    { key: 'patientName', prompt: 'What is the patient\'s full name?' },
    { key: 'dob', prompt: 'What is the date of birth? Use YYYY-MM-DD.' },
    { key: 'reason', prompt: 'What is the reason for the appointment?' },
    { key: 'date', prompt: 'What date? Use YYYY-MM-DD.' },
    { key: 'time', prompt: 'What time? Use 24h HH:MM.' },
  ]
  for (const f of order) {
    if (!intakeData[f.key]) {
      addMessage('assistant', f.prompt)
      return
    }
  }
  intakeStage = 'confirm'
  const summary = `Confirm appointment:\nPatient: ${intakeData.patientName}\nDOB: ${intakeData.dob}\nReason: ${intakeData.reason}\nWhen: ${intakeData.date} ${intakeData.time}${intakeData.provider ? `\nProvider: ${intakeData.provider}`: ''}${intakeData.location ? `\nLocation: ${intakeData.location}`: ''}`
  addMessage('assistant', `${summary}\nIs this correct? (yes/no)`)
}

function tryFillFieldFromTranscript(text: string) {
  const t = text.trim()
  if (!intakeData.patientName && /name is\s+(.+)/i.test(t)) {
    intakeData.patientName = t.match(/name is\s+(.+)/i)![1].trim()
  } else if (!intakeData.patientName && /my name\s+is\s+(.+)/i.test(t)) {
    intakeData.patientName = t.match(/my name\s+is\s+(.+)/i)![1].trim()
  }
  if (!intakeData.dob && /(\d{4}-\d{2}-\d{2})/.test(t)) {
    intakeData.dob = t.match(/(\d{4}-\d{2}-\d{2})/)![1]
  }
  if (!intakeData.time && /(\d{2}:\d{2})/.test(t)) {
    intakeData.time = t.match(/(\d{2}:\d{2})/)![1]
  }
  if (!intakeData.date && /(\d{4}-\d{2}-\d{2})/.test(t)) {
    // prefer first date-like token as date if dob already set
    const matches = t.match(/(\d{4}-\d{2}-\d{2})/g)
    if (matches) {
      intakeData.date = intakeData.dob && matches[0] === intakeData.dob && matches[1] ? matches[1] : matches[0]
    }
  }
}

function normalizeOptionalShortcuts(text: string) {
  if (/tomorrow/i.test(text)) {
    const d = new Date(Date.now()+24*60*60*1000)
    intakeData.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  if (/today/i.test(text)) {
    const d = new Date()
    intakeData.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
}

async function createAppointmentNow() {
  intakeStage = 'creating'
  updateStatus('processing', 'Creating appointment...')
  const payload = {
    calendarId: 'primary',
    patientName: intakeData.patientName,
    dob: intakeData.dob,
    reason: intakeData.reason,
    date: intakeData.date,
    time: intakeData.time,
    durationMins: intakeData.durationMins || 30,
    provider: intakeData.provider,
    location: intakeData.location,
    notes: intakeData.notes,
    contactPhone: intakeData.contactPhone,
    contactEmail: intakeData.contactEmail
  }
  try {
    const result = await callMcpTool('create-appointment', payload)
    const text = result?.content?.[0]?.text || 'Appointment created.'
    addMessage('assistant', text)
    updateStatus('ready', 'Appointment created')
    resetIntake()
  } catch (e:any) {
    addMessage('assistant', `Failed to create appointment: ${e?.message || e}`)
    updateStatus('error', 'Create failed')
    intakeStage = 'confirm'
  }
}

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
      instructions: `You are a hospital appointment assistant.

GOAL: Schedule patient appointments professionally. Collect and validate required details before creating.

REQUIRED FIELDS:
- patientName (full name)
- dob (YYYY-MM-DD)
- reason (chief complaint/visit reason)
- date (YYYY-MM-DD)
- time (HH:MM 24h)

OPTIONAL FIELDS:
- durationMins (default 30)
- provider, location, notes, contactPhone, contactEmail

BEHAVIOR:
1) If any required fields are missing, ask concise follow-ups to collect them.
2) Validate DOB and date format (YYYY-MM-DD) and time (HH:MM). If invalid, ask again.
3) When all required fields present, read back a short summary and ask for confirmation (yes/no).
4) After confirmation, create the appointment via tool and return the link. Put collected details in the event description.
5) Never hallucinate calendar data; use tools or say you don't know.
6) Keep questions short and one at a time.`,
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
    // Intake handling
    if (/start (appointment|intake)/i.test(transcript) && intakeStage === 'idle') {
      intakeStage = 'collecting'
      addMessage('assistant', 'Okay, let\'s schedule a patient appointment.')
      showIntakeStatus()
      askNextMissingField()
      return
    }

    if (intakeStage === 'collecting') {
      normalizeOptionalShortcuts(transcript)
      tryFillFieldFromTranscript(transcript)
      showIntakeStatus()
      askNextMissingField()
      return
    }

    if (intakeStage === 'confirm') {
      if (/^(yes|yep|correct|confirm)/i.test(transcript)) {
        createAppointmentNow()
        return
      } else if (/^(no|nope|change|edit)/i.test(transcript)) {
        intakeStage = 'collecting'
        addMessage('assistant', 'No problem. Which detail would you like to change? Name, DOB, reason, date, or time?')
        return
      }
    }

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

  // Start intake button
  const startIntake = document.getElementById('start-intake')
  if (startIntake) {
    startIntake.addEventListener('click', () => {
      intakeStage = 'collecting'
      intakeData = {}
      addMessage('assistant', 'Starting hospital appointment intake.')
      showIntakeStatus()
      askNextMissingField()
    })
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
