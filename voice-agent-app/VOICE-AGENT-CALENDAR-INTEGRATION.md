# Voice Agent + Google Calendar MCP Integration

This project integrates a voice-controlled AI assistant with Google Calendar through the Model Context Protocol (MCP), enabling natural language calendar management through speech.

## 🎯 Features

- **Voice-Controlled Calendar Management**: Use natural speech to manage your Google Calendar
- **Real-time Speech Processing**: Powered by OpenAI's Realtime API
- **Google Calendar Integration**: Full calendar operations through MCP protocol
- **Modern Web Interface**: Beautiful, responsive UI with real-time conversation display
- **Cross-Platform**: Works in any modern web browser

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Voice Agent   │    │   MCP Bridge     │    │ Google Calendar MCP │
│   (Browser)     │◄──►│   (HTTP Client)  │◄──►│     Server          │
│                 │    │                  │    │                     │
│ • OpenAI Realtime│    │ • HTTP Transport │    │ • Google Calendar   │
│ • Speech I/O    │    │ • MCP Protocol   │    │   API Integration   │
│ • UI Controls   │    │ • Error Handling │    │ • OAuth2 Auth       │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

1. **Node.js** (v18 or higher)
2. **Google Cloud Project** with Calendar API enabled
3. **OpenAI API Key** with Realtime API access
4. **Google OAuth2 Credentials** (Desktop app type)

### Installation

1. **Clone and Setup Voice Agent**
   ```bash
   cd voice-agent-app
   npm install
   npm run setup-integration
   ```

2. **Setup Google Calendar MCP Server**
   ```bash
   cd ../google-calendar-mcp
   npm install
   npm run build
   ```

3. **Configure Google OAuth2**
   - Place your `google-credentials.json` in `voice-agent-app/public/`
   - Ensure it's configured for Desktop app type

4. **Set Environment Variables**
   ```bash
   cp .env.template .env.local
   # Edit .env.local and add your OpenAI API key
   ```

### Running the Application

1. **Start Google Calendar MCP Server** (Terminal 1)
   ```bash
   cd google-calendar-mcp
   npm run start:http
   ```

2. **Start Voice Agent** (Terminal 2)
   ```bash
   cd voice-agent-app
   npm run dev
   ```

3. **Open Browser**
   - Navigate to `http://localhost:5173`
   - Enter your OpenAI API key
   - Click "Connect MCP" to connect to Google Calendar
   - Start speaking to manage your calendar!

## 🎤 Voice Commands

### Calendar Queries
- "What's on my calendar today?"
- "Show me my schedule for tomorrow"
- "What events do I have this week?"
- "Am I free on Friday at 2 PM?"

### Event Management
- "Create a meeting with John at 3 PM tomorrow"
- "Schedule a dentist appointment for next Tuesday"
- "Move my 2 PM meeting to 4 PM"
- "Cancel my meeting with Sarah"
- "What's the location of my 10 AM meeting?"

### Availability Checking
- "Am I available on Monday morning?"
- "When am I free this week?"
- "Check my availability for next Friday"

## 🔧 Configuration

### Google Calendar MCP Server

The MCP server runs on HTTP transport mode to enable browser communication:

```bash
# Start with HTTP transport
npm run start:http

# Start with public access (for remote connections)
npm run start:http:public
```

### Voice Agent Configuration

Environment variables in `.env.local`:

```env
# OpenAI API Key for voice processing
VITE_OPENAI_API_KEY=your_openai_api_key_here

# MCP Server URL (optional, defaults to localhost:3000)
VITE_MCP_SERVER_URL=http://localhost:3000
```

## 🛠️ Development

### Project Structure

```
voice-agent-app/
├── src/
│   ├── main.ts              # Main voice agent application
│   ├── mcp-bridge.ts        # HTTP bridge to MCP server
│   ├── mcp-client.ts        # Direct MCP client (unused in browser)
│   └── style.css            # Application styles
├── public/
│   └── google-credentials.json  # Google OAuth2 credentials
├── setup-integration.js     # Setup script
└── package.json
```

### Key Components

#### MCP Bridge (`mcp-bridge.ts`)
- HTTP client for communicating with Google Calendar MCP server
- Handles all calendar operations through REST API calls
- Provides error handling and connection management

#### Voice Agent (`main.ts`)
- OpenAI Realtime API integration
- Speech-to-text and text-to-speech processing
- Natural language calendar query handling
- Real-time conversation UI

### Adding New Voice Commands

1. **Update Query Handler** in `main.ts`:
   ```typescript
   // Add new query pattern
   if (lowerQuery.includes('your_pattern')) {
     // Handle the query
     return "Response message";
   }
   ```

2. **Add MCP Bridge Method** if needed:
   ```typescript
   async newCalendarOperation(): Promise<ResultType> {
     // Implementation
   }
   ```

## 🔒 Security

- **OAuth2 Authentication**: All Google Calendar operations require user consent
- **Local Token Storage**: Authentication tokens stored securely on user's machine
- **HTTPS Communication**: All API calls use secure protocols
- **No Data Persistence**: Voice conversations are not stored

## 🐛 Troubleshooting

### Common Issues

1. **MCP Connection Failed**
   - Ensure Google Calendar MCP server is running: `npm run start:http`
   - Check server logs for authentication errors
   - Verify `google-credentials.json` is properly configured

2. **Voice Not Working**
   - Check browser microphone permissions
   - Verify OpenAI API key has Realtime API access
   - Test microphone with "Test Mic" button

3. **Calendar Operations Failing**
   - Ensure Google OAuth2 authentication completed
   - Check Google Cloud Console for API quotas
   - Verify calendar permissions in OAuth2 scopes

### Debug Mode

Enable detailed logging in browser console:
```javascript
// In browser console
localStorage.setItem('debug', 'true');
```

## 📚 API Reference

### MCP Bridge Methods

```typescript
// Connection
await mcpBridge.connect(): Promise<boolean>
await mcpBridge.disconnect(): Promise<void>

// Calendar Operations
await mcpBridge.listCalendars(): Promise<CalendarListResponse>
await mcpBridge.listEvents(timeMin?, timeMax?, calendarId?): Promise<EventListResponse>
await mcpBridge.searchEvents(query, timeMin?, timeMax?): Promise<EventListResponse>
await mcpBridge.createEvent(eventData): Promise<CalendarEvent>
await mcpBridge.updateEvent(eventId, eventData): Promise<CalendarEvent>
await mcpBridge.deleteEvent(eventId): Promise<boolean>
await mcpBridge.getFreeBusy(timeMin, timeMax, calendarIds?): Promise<FreeBusyResponse>
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) for voice processing
- [Google Calendar MCP Server](https://github.com/nspady/google-calendar-mcp) for calendar integration
- [Model Context Protocol](https://modelcontextprotocol.io/) for standardized AI tool integration

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/voice-agent-app/issues)
- **Documentation**: [Integration README](INTEGRATION-README.md)
- **Google Calendar MCP**: [MCP Documentation](https://github.com/nspady/google-calendar-mcp)

---

**Happy Voice-Controlled Calendar Management! 🎉**

