# 🚀 Quick Start Guide - Voice Calendar Assistant

## Prerequisites
- Node.js installed
- OpenAI API key with Realtime API access
- Google Calendar OAuth configured

## 5-Minute Setup

### Step 1: Environment Setup
```bash
cd voice-agent-app
echo "VITE_OPENAI_API_KEY=sk-proj-your-key-here" > .env
npm install
```

### Step 2: Start MCP Server
```bash
# In a new terminal
cd google-calendar-mcp
npm run dev:http
```

You should see:
```
🚀 MCP Server running on http://localhost:3000
```

### Step 3: Verify Setup
```bash
# Back in voice-agent-app directory
npm run test-setup
```

Expected output:
```
✅ MCP Server is running
✅ Found 10 tools
✅ Calendar data accessible
```

### Step 4: Start Voice Agent
```bash
npm run dev
```

### Step 5: Open Browser
Navigate to: **http://localhost:5173/index-new.html**

### Step 6: Initialize & Use

1. **Click "Initialize Agent"**
   - Wait for: "Connected with 10 calendar tools" ✅

2. **Click "Start Conversation"**
   - Grant microphone permission
   - Wait for: "Microphone active - speak to me!" ✅

3. **Start Talking**
   - "What's on my calendar today?"
   - "Do I have any meetings tomorrow?"
   - "Create a meeting at 2 PM tomorrow"
   - "When am I free on Friday?"

## Expected Behavior

### Initialization (5-10 seconds)
```
📡 Fetching MCP tools...
✅ Fetched 10 tools from MCP server
🚀 Initializing voice agent...
🔌 Connected to OpenAI Realtime API
✅ Session created
✅ Voice agent initialized with 10 tools
```

### Starting Conversation (2-3 seconds)
```
🎤 Starting conversation...
🎤 Microphone capture started
```

### Voice Interaction
1. **You speak:** "What's on my calendar?"
2. **Console:** `🎤 User started speaking`
3. **Console:** `🎤 User stopped speaking`
4. **Console:** `📝 User said: "What's on my calendar?"`
5. **Console:** `🔧 Function call complete: list-events`
6. **Console:** `✅ MCP tool result: {...}`
7. **Console:** `💬 Assistant said: "You have 3 events..."`
8. **Console:** `🔊 Audio response complete`
9. **You hear:** 🔊 Assistant's voice response

## Troubleshooting

### "MCP Server not accessible"
```bash
cd google-calendar-mcp
npm run dev:http
```
Make sure you see: `🚀 MCP Server running on http://localhost:3000`

### "WebSocket connection failed"
- Check `.env` file has correct `VITE_OPENAI_API_KEY`
- Verify API key has Realtime API access
- Check console for error details

### "Microphone not working"
- Click the lock icon in browser address bar
- Allow microphone access
- Refresh the page and try again

### "No transcription events"
- Check browser console for audio errors
- Verify microphone is working (test in other apps)
- Try using HTTPS instead of HTTP

## Quick Test Commands

### Test MCP Connection Only
```bash
curl http://localhost:3000/mcp/tools
```
Should return JSON with 10 tools.

### Test Calendar Access
```bash
curl -X POST http://localhost:3000/mcp/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "list-events",
      "arguments": {"calendarId": "primary", "maxResults": 5}
    }
  }'
```
Should return calendar events.

### Test OpenAI API Key
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $VITE_OPENAI_API_KEY"
```
Should return list of models (including gpt-4o-realtime-preview).

## UI Buttons Explained

### Initialize Agent
- Fetches tools from MCP
- Connects to OpenAI WebSocket
- Registers tools with session
- **Use once** at startup

### Start Conversation
- Starts microphone capture
- Enables voice interaction
- **Click after** initialization

### Stop
- Stops microphone
- Closes WebSocket
- Cleans up resources

### Test MCP Connection
- Checks if MCP server is running
- Shows available tools
- **Use for debugging**

### Test List Events
- Directly calls list-events tool
- Shows calendar data in console
- **Use for debugging**

## Example Queries

### Simple Queries
- "What's on my calendar today?"
- "Do I have any meetings tomorrow?"
- "Show me next week's events"

### Event Creation
- "Create a meeting tomorrow at 2 PM"
- "Schedule lunch with Sarah on Friday at noon"
- "Add a dentist appointment next Monday at 3"

### Event Search
- "Find my meeting with John"
- "When is my next team standup?"
- "Show me all my meetings this week"

### Free/Busy
- "When am I free today?"
- "Do I have any time available tomorrow afternoon?"
- "Am I busy on Friday?"

## File Locations

| What | Where |
|------|-------|
| Main UI | `index-new.html` |
| WebSocket Client | `src/realtime-api.ts` |
| App Logic | `src/main-realtime.ts` |
| MCP Server | `../google-calendar-mcp/` |
| Environment | `.env` |
| Documentation | `REALTIME-API-README.md` |

## Success Checklist

- [ ] MCP server running (port 3000)
- [ ] .env file created with API key
- [ ] npm install completed
- [ ] test-setup shows all ✅
- [ ] npm run dev started
- [ ] Browser at localhost:5173/index-new.html
- [ ] "Initialize Agent" clicked
- [ ] "Connected with 10 tools" shown
- [ ] "Start Conversation" clicked
- [ ] Microphone permission granted
- [ ] Voice query spoken
- [ ] Assistant response heard

## Support

If you encounter issues:

1. **Check Console Logs** - Most errors are logged with helpful emojis
2. **Test MCP Server** - Click "Test MCP Connection"
3. **Test Calendar** - Click "Test List Events"
4. **Check Network Tab** - Look for WebSocket and MCP requests
5. **Read REALTIME-API-README.md** - Detailed troubleshooting guide

## What's Next?

Once everything works:

1. Try different calendar queries
2. Test event creation
3. Test event updates
4. Test event deletion
5. Try multi-turn conversations
6. Build custom features!

---

**Need help?** Check `REALTIME-API-README.md` for detailed documentation.

**Found a bug?** Check console logs and network tab for clues.

**Want to extend?** Look at `src/main-realtime.ts` for app logic.
