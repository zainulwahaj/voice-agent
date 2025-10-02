import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
}

export interface CalendarListResponse {
  calendars: Array<{
    id: string;
    summary: string;
    primary?: boolean;
  }>;
}

export interface EventListResponse {
  events: CalendarEvent[];
}

export interface FreeBusyResponse {
  busy: Array<{
    start: string;
    end: string;
  }>;
}

export class GoogleCalendarMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private isConnected = false;
  private mcpProcess: any = null;

  constructor() {
    this.client = new Client(
      {
        name: "voice-agent-calendar-client",
        version: "1.0.0"
      },
      {
        capabilities: {
          roots: {
            listChanged: true
          },
          sampling: {}
        }
      }
    );
  }

  async connect(): Promise<boolean> {
    try {
      if (this.isConnected) {
        return true;
      }

      // For browser environment, we'll use a different approach
      // This is a simplified version that would need to be adapted for actual MCP communication
      // In a real implementation, you'd need to set up a WebSocket or HTTP connection to the MCP server
      
      console.log('⚠️  MCP connection not fully implemented for browser environment');
      console.log('This is a placeholder implementation. In a production setup, you would need to:');
      console.log('1. Set up a WebSocket or HTTP connection to the MCP server');
      console.log('2. Handle the MCP protocol over that connection');
      console.log('3. Implement proper authentication and error handling');
      
      // For now, we'll simulate a successful connection
      this.isConnected = true;
      
      console.log('✅ Simulated connection to Google Calendar MCP server');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Google Calendar MCP server:', error);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.close();
      }
      if (this.transport) {
        await this.transport.close();
      }
      if (this.mcpProcess) {
        this.mcpProcess.kill();
      }
      this.isConnected = false;
      console.log('Disconnected from Google Calendar MCP server');
    } catch (error) {
      console.error('Error disconnecting from MCP server:', error);
    }
  }

  async listCalendars(): Promise<CalendarListResponse> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const result = await this.client!.request(
        {
          method: 'tools/call',
          params: {
            name: 'list-calendars',
            arguments: {}
          }
        },
        { method: 'tools/call' }
      );

      return {
        calendars: result.content?.[0]?.text ? JSON.parse(result.content[0].text) : []
      };
    } catch (error) {
      console.error('Error listing calendars:', error);
      throw error;
    }
  }

  async listEvents(timeMin?: string, timeMax?: string, calendarId?: string): Promise<EventListResponse> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const args: any = {};
      if (timeMin) args.timeMin = timeMin;
      if (timeMax) args.timeMax = timeMax;
      if (calendarId) args.calendarId = calendarId;

      const result = await this.client!.request(
        {
          method: 'tools/call',
          params: {
            name: 'list-events',
            arguments: args
          }
        },
        { method: 'tools/call' }
      );

      const events = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : [];
      return { events };
    } catch (error) {
      console.error('Error listing events:', error);
      throw error;
    }
  }

  async searchEvents(query: string, timeMin?: string, timeMax?: string): Promise<EventListResponse> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const args: any = { query };
      if (timeMin) args.timeMin = timeMin;
      if (timeMax) args.timeMax = timeMax;

      const result = await this.client!.request(
        {
          method: 'tools/call',
          params: {
            name: 'search-events',
            arguments: args
          }
        },
        { method: 'tools/call' }
      );

      const events = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : [];
      return { events };
    } catch (error) {
      console.error('Error searching events:', error);
      throw error;
    }
  }

  async createEvent(eventData: {
    title: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
    attendees?: string[];
  }): Promise<CalendarEvent> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const result = await this.client!.request(
        {
          method: 'tools/call',
          params: {
            name: 'create-event',
            arguments: eventData
          }
        },
        { method: 'tools/call' }
      );

      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : null;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  async updateEvent(eventId: string, eventData: Partial<{
    title: string;
    start: string;
    end: string;
    location: string;
    description: string;
    attendees: string[];
  }>): Promise<CalendarEvent> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const result = await this.client!.request(
        {
          method: 'tools/call',
          params: {
            name: 'update-event',
            arguments: {
              eventId,
              ...eventData
            }
          }
        },
        { method: 'tools/call' }
      );

      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : null;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const result = await this.client!.request(
        {
          method: 'tools/call',
          params: {
            name: 'delete-event',
            arguments: { eventId }
          }
        },
        { method: 'tools/call' }
      );

      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : false;
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }

  async getFreeBusy(timeMin: string, timeMax: string, calendarIds?: string[]): Promise<FreeBusyResponse> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const args: any = { timeMin, timeMax };
      if (calendarIds) args.calendarIds = calendarIds;

      const result = await this.client!.request(
        {
          method: 'tools/call',
          params: {
            name: 'get-freebusy',
            arguments: args
          }
        },
        { method: 'tools/call' }
      );

      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : { busy: [] };
    } catch (error) {
      console.error('Error getting free/busy info:', error);
      throw error;
    }
  }

  isMcpConnected(): boolean {
    return this.isConnected;
  }
}
