# Voice Calendar Assistant - Direct OpenAI Realtime API Implementation

This is a **complete rebuild** of the voice agent using the **OpenAI Realtime API directly** via WebSocket, without relying on the unreliable `@openai/agents-realtime` SDK.

## 🎯 Why the Rebuild?

The `@openai/agents-realtime` v0.1.6 SDK was causing issues:
- Voice input not processing correctly
- Agent would start/stop immediately without capturing speech
- No transcription events firing
- Unreliable for production use

## ✨ New Architecture

### Direct WebSocket Connection
- **No SDK dependencies** - we connect directly to OpenAI's Realtime API
- Full control over audio streaming, event handling, and tool calling
- More reliable and predictable behavior

### Key Components

1. **`realtime-api.ts`** - Core WebSocket client
   - Handles WebSocket connection to `wss://api.openai.com/v1/realtime`
   - Manages audio capture from microphone (PCM16 format)
   - Handles audio playback from assistant
   - Event system for all Realtime API events

2. **`main-realtime.ts`** - Application logic
   - Fetches MCP tools from calendar server
   - Registers tools with OpenAI session
   - Handles tool calls (function calling)
   - Calls MCP server and returns results
   - Updates UI with conversation flow

3. **`index-new.html`** - Clean UI
   - Initialize agent
   - Start/stop conversation
   - Test MCP connection
   - View live conversation transcript

## 🚀 Setup

### 1. Install Dependencies

```bash
npm install
```

**Note:** We've removed `@openai/agents-realtime` from package.json

### 2. Set Environment Variables

Create `.env` file:

```bash
VITE_OPENAI_API_KEY=sk-proj-...
```

### 3. Start MCP Server

The Google Calendar MCP server must be running on port 3000:

```bash
cd ../google-calendar-mcp
npm run dev:http
```

### 4. Start Voice Agent

```bash
npm run dev
```

Then open `http://localhost:5173/index-new.html`

## 📋 How It Works

### Initialization Flow

1. **Fetch MCP Tools**
   ```typescript
   GET http://localhost:3000/mcp/tools
   → Returns list of 10 calendar tools with schemas
   ```

2. **Connect to OpenAI**
   ```typescript
   WebSocket → wss://api.openai.com/v1/realtime
   Authentication via WebSocket subprotocol
   ```

3. **Configure Session**
   ```typescript
   send({
     type: 'session.update',
     session: {
       tools: [...mcpTools],  // Register calendar tools
       turn_detection: 'server_vad',
       voice: 'alloy'
     }
   })
   ```

4. **Start Audio Capture**
   ```typescript
   navigator.mediaDevices.getUserMedia({ audio: true })
   → Capture PCM16 audio at 24kHz
   → Send via input_audio_buffer.append
   ```

### Conversation Flow

1. **User speaks** → Microphone captures audio
2. **Audio sent to OpenAI** → Transcription + processing
3. **OpenAI decides** → "User wants calendar info"
4. **Function call** → `response.function_call_arguments.done`
5. **Call MCP server** → Execute `list-events` tool
6. **Return result** → `conversation.item.create` with output
7. **OpenAI responds** → Natural language + audio
8. **Audio played** → User hears assistant's response

### Tool Calling Example

```typescript
// OpenAI decides to call list-events
Event: response.function_call_arguments.done
{
  call_id: "abc123",
  name: "list-events",
  arguments: '{"calendarId":"primary","maxResults":10}'
}

// We call MCP server
POST http://localhost:3000/mcp/call-tool
{
  method: "tools/call",
  params: {
    name: "list-events",
    arguments: { calendarId: "primary", maxResults: 10 }
  }
}

// Return result to OpenAI
send({
  type: 'conversation.item.create',
  item: {
    type: 'function_call_output',
    call_id: 'abc123',
    output: JSON.stringify(calendarEvents)
  }
})

// Request assistant to respond
send({ type: 'response.create' })
```

## 🎤 Audio Pipeline

### Input (Microphone → OpenAI)

1. Capture audio at 24kHz mono
2. Convert Float32 → PCM16
3. Encode to base64
4. Send via `input_audio_buffer.append`

```typescript
const pcm16 = float32ToPCM16(audioData)
const base64 = arrayBufferToBase64(pcm16)

send({
  type: 'input_audio_buffer.append',
  audio: base64
})
```

### Output (OpenAI → Speaker)

1. Receive `response.audio.delta` events
2. Decode base64 → PCM16
3. Convert PCM16 → Float32
4. Create AudioBuffer
5. Play via Web Audio API

```typescript
on('response.audio.delta', (event) => {
  const pcm16 = base64ToArrayBuffer(event.delta)
  const float32 = pcm16ToFloat32(pcm16)
  const audioBuffer = audioContext.createBuffer(...)
  playAudio(audioBuffer)
})
```

## 🛠️ Available Tools

The agent has access to 10 Google Calendar tools:

1. **list-calendars** - Get all calendars
2. **list-events** - List events in date range
3. **search-events** - Search events by query
4. **get-event** - Get specific event details
5. **create-event** - Create new event
6. **update-event** - Update existing event
7. **delete-event** - Delete event
8. **get-freebusy** - Check free/busy times
9. **list-colors** - Get available colors
10. **get-current-time** - Get current time

## 🧪 Testing

### Test MCP Connection
Click "Test MCP Connection" button to verify:
- MCP server is running on port 3000
- Tools are being returned correctly
- HTTP transport is working

### Test List Events
Click "Test List Events" to verify:
- Can call MCP tools directly
- Calendar data is accessible
- OAuth authentication is working

### Voice Testing
1. Click "Initialize Agent"
2. Click "Start Conversation"
3. Grant microphone permission
4. Say: "What's on my calendar today?"
5. Wait for assistant response

## 🐛 Debugging

### Check Console Logs

```
🔌 Connected to OpenAI Realtime API
✅ Session created
🎤 Microphone capture started
🎤 User started speaking
📝 User said: "what's on my calendar today"
🔧 Function call complete: list-events
✅ MCP tool result: {...}
💬 Assistant said: "You have 3 events today..."
🔊 Audio response complete
```

### Common Issues

**"WebSocket connection failed"**
- Check VITE_OPENAI_API_KEY is set correctly
- Verify API key has Realtime API access

**"MCP tools fetch failed"**
- Ensure MCP server is running: `npm run dev:http`
- Check http://localhost:3000/mcp/tools responds

**"Microphone not working"**
- Grant microphone permissions in browser
- Check browser console for getUserMedia errors
- Try HTTPS (required for mic access on some browsers)

## 📊 Event Flow Diagram

```
User speaks
    ↓
Microphone capture (Web Audio API)
    ↓
Float32 → PCM16 → Base64
    ↓
WebSocket: input_audio_buffer.append
    ↓
OpenAI Realtime API
    ↓
Server VAD detects speech end
    ↓
Transcription (Whisper)
    ↓
GPT-4o processes request
    ↓
Decides to call function
    ↓
Event: response.function_call_arguments.done
    ↓
Our handler calls MCP server
    ↓
POST /mcp/call-tool
    ↓
Google Calendar MCP executes
    ↓
Returns calendar data
    ↓
WebSocket: conversation.item.create (result)
    ↓
WebSocket: response.create
    ↓
GPT-4o generates natural response
    ↓
Event: response.audio.delta (base64 audio)
    ↓
Base64 → PCM16 → Float32
    ↓
Web Audio API playback
    ↓
User hears response
```

## 🔄 Differences from SDK Version

### Old (SDK-based)
```typescript
import { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime'

const agent = new RealtimeAgent(config)
await agent.updateTurnDetectionMode('server_vad')
await session.connect()
```

### New (Direct WebSocket)
```typescript
import { RealtimeAPIClient } from './realtime-api'

const client = new RealtimeAPIClient(config)
await client.connect()
client.send({
  type: 'session.update',
  session: { turn_detection: { type: 'server_vad' } }
})
```

**Benefits:**
- ✅ Full control over connection lifecycle
- ✅ Direct access to all Realtime API events
- ✅ No black box - we see exactly what's happening
- ✅ Easier to debug and extend
- ✅ No dependency on potentially buggy SDK

## 📝 Next Steps

1. **Test end-to-end** - Try all calendar operations
2. **Error handling** - Add retry logic for network failures
3. **UI improvements** - Better visual feedback
4. **Conversation history** - Persist chat history
5. **Multi-turn conversations** - Handle complex queries

## 🎉 Success Criteria

- ✅ WebSocket connection established
- ✅ 10 MCP tools fetched and registered
- ✅ Audio capture working
- ✅ Audio playback working
- ✅ Speech detection (VAD) working
- ✅ Transcription events firing
- ✅ Function calling working
- ✅ MCP tool execution working
- ✅ Natural voice responses playing

## 📚 References

- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
