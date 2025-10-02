# Voice Agent App

A simple voice agent application built with OpenAI's Realtime API and the Agents SDK.

## Features

- 🎤 **Real-time Voice Conversation** - Seamless speech-to-speech AI interaction
- 📝 **Live Transcript Display** - See conversation in real-time as you speak
- 🎨 **Professional UI** - Modern glassmorphism design with responsive layout
- 🔐 **Secure Authentication** - Automatic ephemeral key generation
- 💾 **Environment Variables** - Support for .env file configuration
- 🧹 **Smart Controls** - Auto-scroll, clear transcript, and key management
- 📱 **Responsive Design** - Works perfectly on desktop and mobile
- ⚡ **Real-time Events** - Live status updates and transcript streaming
- 🎯 **Professional Layout** - Split-panel design for optimal user experience

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```env
VITE_OPENAI_API_KEY=sk-proj-your-api-key-here
```

**Optional configuration:**
```env
# Override default model
VITE_OPENAI_MODEL=gpt-realtime

# Enable debug mode for development
VITE_DEBUG_MODE=true
```

### 3. Start the Development Server

```bash
npm run dev
```

### 4. Use the Voice Agent

1. Open your browser and navigate to `http://localhost:5173`
2. **Option A**: Use environment variable (automatic if set in .env)
3. **Option B**: Enter your OpenAI API key manually in the input field
4. Click "Connect" - the app will automatically generate a secure ephemeral key
5. Allow microphone access when prompted
6. Start talking! You'll see the conversation transcript in real-time

## How It Works

1. **RealtimeAgent**: The core AI agent that handles conversation logic
2. **RealtimeSession**: Manages the WebRTC connection and audio processing
3. **WebRTC**: Provides real-time audio streaming in the browser
4. **Ephemeral Keys**: Secure, short-lived authentication tokens
5. **Real-time Transcripts**: Live display of conversation as it happens
6. **Environment Variables**: Secure configuration management

## New Professional Features

### 🎯 **Split-Panel Layout**
- **Control Panel**: API key management and connection controls
- **Conversation Panel**: Live transcript with professional styling

### 📝 **Real-time Transcript System**
- **Live Updates**: See your words appear as you speak
- **Assistant Responses**: Watch AI responses being generated in real-time
- **Timestamps**: Each message shows when it was sent
- **Auto-scroll**: Automatically follows the conversation (toggleable)

### 🔧 **Smart Controls**
- **Clear Transcript**: Start fresh conversations
- **Auto-scroll Toggle**: Control whether to follow new messages
- **API Key Management**: Save, clear, and manage your keys
- **Status Indicators**: Visual feedback for connection state

### 🛡️ **Professional Security**
- **Environment Variables**: Secure API key storage
- **Automatic Key Generation**: No manual ephemeral key management
- **Local Storage**: Secure client-side key persistence

## Architecture

- **Frontend**: Vanilla TypeScript with Vite
- **Voice Processing**: OpenAI Realtime API via WebRTC
- **AI Model**: GPT Realtime model
- **Styling**: Modern CSS with glassmorphism effects

## Troubleshooting

### Microphone Access
- Make sure to allow microphone access when prompted
- Check your browser's microphone permissions
- Try refreshing the page if audio doesn't work

### Connection Issues
- Verify your ephemeral API key is valid and recent
- Check your internet connection
- Ensure you have access to the Realtime API

### Audio Problems
- Check your system's audio settings
- Try using a different browser
- Ensure your microphone is working in other applications

## Security Notes

- Never commit your actual OpenAI API key to version control
- Ephemeral keys expire after a short time and need to be regenerated
- The app runs entirely in the browser - no server-side processing

## Next Steps

- Add custom tools and capabilities to your agent
- Implement conversation history persistence
- Add custom voice settings and preferences
- Deploy to a hosting service for production use

## Resources

- [OpenAI Agents SDK Documentation](https://openai.github.io/openai-agents-js/)
- [Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [WebRTC Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
