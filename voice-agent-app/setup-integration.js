#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Setting up Voice Agent + Google Calendar MCP Integration\n');

// Check if we're in the right directory
const currentDir = __dirname;
const packageJsonPath = path.join(currentDir, 'package.json');

if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ Error: package.json not found. Please run this script from the voice-agent-app directory.');
  process.exit(1);
}

// Read package.json to verify this is the voice agent app
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageJson.name !== 'voice-agent-app') {
  console.error('❌ Error: This doesn\'t appear to be the voice-agent-app directory.');
  process.exit(1);
}

console.log('✅ Found voice-agent-app directory');

// Check if Google Calendar MCP is available
const googleCalendarMcpPath = path.join(currentDir, '..', 'google-calendar-mcp');
if (!fs.existsSync(googleCalendarMcpPath)) {
  console.error('❌ Error: Google Calendar MCP directory not found at:', googleCalendarMcpPath);
  console.log('Please ensure the google-calendar-mcp directory is in the same parent directory as voice-agent-app');
  process.exit(1);
}

console.log('✅ Found Google Calendar MCP directory');

// Check if Google Calendar MCP is built
const buildPath = path.join(googleCalendarMcpPath, 'build');
if (!fs.existsSync(buildPath)) {
  console.log('🔨 Building Google Calendar MCP...');
  try {
    execSync('npm run build', { cwd: googleCalendarMcpPath, stdio: 'inherit' });
    console.log('✅ Google Calendar MCP built successfully');
  } catch (error) {
    console.error('❌ Error building Google Calendar MCP:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Google Calendar MCP already built');
}

// Install MCP SDK dependency
console.log('📦 Installing MCP SDK dependency...');
try {
  execSync('npm install @modelcontextprotocol/sdk', { cwd: currentDir, stdio: 'inherit' });
  console.log('✅ MCP SDK installed successfully');
} catch (error) {
  console.error('❌ Error installing MCP SDK:', error.message);
  process.exit(1);
}

// Check for Google credentials
const credentialsPath = path.join(currentDir, 'public', 'google-credentials.json');
if (!fs.existsSync(credentialsPath)) {
  console.log('⚠️  Warning: Google credentials not found at:', credentialsPath);
  console.log('Please ensure you have a valid google-credentials.json file in the public directory.');
  console.log('You can get this from the Google Cloud Console after setting up OAuth 2.0 credentials.');
} else {
  console.log('✅ Google credentials found');
}

// Create environment file template
const envTemplate = `# Voice Agent + Google Calendar MCP Integration
# Copy this to .env.local and fill in your values

# OpenAI API Key for voice agent
VITE_OPENAI_API_KEY=your_openai_api_key_here

# Google Calendar MCP Configuration
# The MCP server will use the credentials from public/google-credentials.json
`;

const envPath = path.join(currentDir, '.env.template');
fs.writeFileSync(envPath, envTemplate);
console.log('✅ Created .env.template file');

// Create README for integration
const readmeContent = `# Voice Agent + Google Calendar MCP Integration

This integration combines the voice agent with the Google Calendar MCP server to provide voice-controlled calendar management.

## Setup Instructions

1. **Install Dependencies**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure Google Calendar MCP**
   - Ensure the Google Calendar MCP server is built and configured
   - Place your \`google-credentials.json\` file in the \`public/\` directory
   - The MCP client will automatically connect to the Google Calendar MCP server

3. **Set Environment Variables**
   - Copy \`.env.template\` to \`.env.local\`
   - Add your OpenAI API key

4. **Start the Application**
   \`\`\`bash
   npm run dev
   \`\`\`

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
`;

const readmePath = path.join(currentDir, 'INTEGRATION-README.md');
fs.writeFileSync(readmePath, readmeContent);
console.log('✅ Created INTEGRATION-README.md');

console.log('\n🎉 Setup complete!');
console.log('\nNext steps:');
console.log('1. Copy .env.template to .env.local and add your OpenAI API key');
console.log('2. Ensure google-credentials.json is in the public/ directory');
console.log('3. Run "npm run dev" to start the application');
console.log('4. Click "Connect MCP" to connect to Google Calendar');
console.log('5. Start using voice commands to manage your calendar!');
console.log('\nFor detailed instructions, see INTEGRATION-README.md');
