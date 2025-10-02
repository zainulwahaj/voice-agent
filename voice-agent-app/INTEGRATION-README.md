# Voice Agent + Google Calendar MCP Integration

This integration combines the voice agent with the Google Calendar MCP server to provide voice-controlled calendar management.

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Google Calendar MCP**
   - Ensure the Google Calendar MCP server is built and configured
   - Place your `google-credentials.json` file in the `public/` directory
   - The MCP client will automatically connect to the Google Calendar MCP server

3. **Set Environment Variables**
   - Copy `.env.template` to `.env.local`
   - Add your OpenAI API key

4. **Start the Application**
   ```bash
   npm run dev
   ```

## Usage

1. **Connect to OpenAI**: Enter your OpenAI API key and click "Connect"
2. **Connect to MCP**: Click "Connect MCP" to establish connection with Google Calendar
3. **Start Speaking**: Once both connections are established, you can use voice commands to manage your calendar

## Voice Commands

- "What's on my calendar today?"
- "Show me my schedule for tomorrow"
- "Create a meeting with John at 3 PM tomorrow"
- "Am I free on Friday at 2 PM?"
- "Show me all my events this week"

## Architecture

The integration works as follows:
- Voice Agent (OpenAI Realtime API) handles speech-to-text and text-to-speech
- MCP Client communicates with Google Calendar MCP Server
- Google Calendar MCP Server handles all Google Calendar API operations
- All calendar operations are performed through the MCP protocol

## Troubleshooting

- Ensure Google Calendar MCP server is running and accessible
- Check that google-credentials.json is properly configured
- Verify OpenAI API key is valid and has Realtime API access
- Check browser console for detailed error messages
