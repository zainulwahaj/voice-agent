import './style.css'
import { RealtimeClient, type Tool } from './realtime-client'

// Environment variables
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

// Global variables
let realtimeClient: RealtimeClient | null = null
let isConnected = false
let autoScroll = true

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

// Audio playback
let audioContext: AudioContext | null = null
let audioQueue: Int16Array[] = []
let isPlaying = false

// Fetch tools from MCP server
async function fetchMcpTools(): Promise<Tool[]> {
  try {
    console.log('🔧 Fetching MCP tools...')
    
    const response = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: Date.now()
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const responseText = await response.text()
    
    // Parse SSE format
    if (responseText.startsWith('event:')) {
      const lines = responseText.split('\\n')
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = JSON.parse(line.substring(5))
          if (data.result?.tools) {
            console.log('✅ Found', data.result.tools.length, 'MCP tools')
            return data.result.tools.map((t: any) => ({
              name: t.name,
              description: t.description || '',
              parameters: t.inputSchema || { type: 'object', properties: {} }
            }))
          }
        }
      }
    }

    return []
  } catch (error) {
    console.error('❌ Failed to fetch MCP tools:', error)
    return []
  }
}

// Call MCP server tool
async function callMcpTool(toolName: string, args: any): Promise<string> {
  try {
    console.log(`🔧 Calling MCP: ${toolName}`)
    
    const response = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: args },
        id: Date.now()
      })
    })

    const responseText = await response.text()
    
    // Parse SSE format
    if (responseText.startsWith('event:')) {
      const lines = responseText.split('\\n')
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = JSON.parse(line.substring(5))
          if (data.result?.content) {
            return data.result.content[0]?.text || 'No result'
          }
        }
      }
    }

    return 'No result'
  } catch (error: any) {
    console.error('❌ MCP call failed:', error)
    return `Error: ${error.message}`
  }
}

// Audio playback functions
function initAudioPlayback() {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 24000 })
  }
}

function playAudioChunk(pcm16: Int16Array) {
  if (!audioContext) return

  const audioBuffer = audioContext.createBuffer(1, pcm16.length, 24000)
  const channelData = audioBuffer.getChannelData(0)
  
  for (let i = 0; i < pcm16.length; i++) {
    channelData[i] = pcm16[i] / 32768.0
  }

  const source = audioContext.createBufferSource()
  source.buffer = audioBuffer
  source.connect(audioContext.destination)
  source.start()
}

// UI functions
function updateStatus(message: string, className?: string) {
  statusElement.textContent = message
  statusElement.className = className ? `status ${className}` : 'status'
}

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

function addMessageToConversation(sender: 'user' | 'assistant', content: string) {
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

// Connect to OpenAI Realtime API
async function connect() {
  try {
    let apiKey = apiKeyInput.value.trim() || OPENAI_API_KEY
    
    if (!apiKey) {
      alert('Please enter your OpenAI API key')
      return
    }

    if (!apiKey.startsWith('sk-')) {
      alert('Invalid API key format')
      return
    }

    updateStatus('Connecting...')
    saveApiKey(apiKey)

    // Fetch MCP tools
    const tools = await fetchMcpTools()
    console.log('📋 Loaded', tools.length, 'tools')

    // Initialize audio playback
    initAudioPlayback()

    // Create Realtime client
    realtimeClient = new RealtimeClient({
      apiKey,
      onConnect: () => {
        console.log('✅ Connected to OpenAI Realtime API')
        updateStatus('Connected - Start speaking!', 'connected')
        updateConnectionState(true)
        addMessageToConversation('assistant', '🎉 Connected! Ask me about your calendar.')
      },
      onDisconnect: () => {
        console.log('Disconnected')
        updateStatus('Disconnected')
        updateConnectionState(false)
      },
      onError: (error) => {
        console.error('❌ Error:', error)
        updateStatus(`Error: ${error.message || 'Connection failed'}`)
        updateConnectionState(false)
      },
      onTranscript: (text, role) => {
        addMessageToConversation(role, text)
      },
      onAudioData: (audio) => {
        playAudioChunk(audio)
      },
      onFunctionCall: async (name, args, callId) => {
        console.log('🔧 Tool call:', name, args)
        addMessageToConversation('assistant', `🔄 Calling ${name}...`)

        try {
          const argsObj = typeof args === 'string' ? JSON.parse(args) : args
          const result = await callMcpTool(name, argsObj)
          console.log('✅ Tool result:', result.substring(0, 200))
          
          realtimeClient?.submitToolResult(callId, result)
        } catch (error: any) {
          console.error('❌ Tool call failed:', error)
          realtimeClient?.submitToolResult(callId, `Error: ${error.message}`)
        }
      }
    })

    await realtimeClient.connect(tools)

  } catch (error: any) {
    console.error('❌ Connection failed:', error)
    updateStatus(`Failed: ${error.message}`)
    updateConnectionState(false)
  }
}

// Disconnect
async function disconnect() {
  if (realtimeClient) {
    realtimeClient.disconnect()
    realtimeClient = null
  }
  updateConnectionState(false)
}

// Test functions
async function testTranscript() {
  addMessageToConversation('user', 'What\\'s on my calendar today?')
  
  try {
    const result = await callMcpTool('list-events', {
      calendarId: 'primary',
      timeMin: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
      timeMax: new Date(Date.now() + 86400000).toISOString().split('T')[0] + 'T23:59:59Z'
    })
    addMessageToConversation('assistant', result)
  } catch (error: any) {
    addMessageToConversation('assistant', `Error: ${error.message}`)
  }
}

async function testMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    console.log('🎤 Microphone working!')
    addMessageToConversation('assistant', '✅ Microphone test successful')
    stream.getTracks().forEach(t => t.stop())
  } catch (error: any) {
    addMessageToConversation('assistant', '❌ Microphone access denied')
  }
}

function clearTranscript() {
  conversationElement.innerHTML = `
    <div class="conversation-item assistant welcome">
      <div class="message-header">
        <span class="sender">Calendar Assistant</span>
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="message-content">Welcome! Connect to start using voice commands for your calendar.</div>
    </div>
  `
}

function toggleAutoScroll() {
  autoScroll = !autoScroll
  toggleAutoScrollBtn.textContent = autoScroll ? 'Auto Scroll: ON' : 'Auto Scroll: OFF'
  toggleAutoScrollBtn.classList.toggle('btn-active', autoScroll)
}

// API key management
function loadSavedApiKey() {
  const saved = localStorage.getItem('openai-api-key')
  if (saved) apiKeyInput.value = saved
}

function saveApiKey(apiKey: string) {
  localStorage.setItem('openai-api-key', apiKey)
}

function clearApiKey() {
  localStorage.removeItem('openai-api-key')
  apiKeyInput.value = ''
  updateStatus('API key cleared')
}

// Event listeners
connectBtn.addEventListener('click', connect)
disconnectBtn.addEventListener('click', disconnect)
clearKeyBtn.addEventListener('click', clearApiKey)
testTranscriptBtn.addEventListener('click', testTranscript)
testMicBtn.addEventListener('click', testMicrophone)
clearTranscriptBtn.addEventListener('click', clearTranscript)
toggleAutoScrollBtn.addEventListener('click', toggleAutoScroll)

// Initialize
function initializeApp() {
  updateConnectionState(false)
  loadSavedApiKey()
  toggleAutoScrollBtn.textContent = 'Auto Scroll: ON'
  toggleAutoScrollBtn.classList.add('btn-active')
}

initializeApp()
