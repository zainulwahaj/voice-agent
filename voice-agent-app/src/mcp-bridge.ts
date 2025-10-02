// MCP Bridge for Browser Environment
// This provides a simplified interface to communicate with the Google Calendar MCP server

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

export class GoogleCalendarMcpBridge {
  private isConnected = false;
  private baseUrl = 'http://localhost:3000'; // Default MCP HTTP server URL

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    }
  }

  async connect(): Promise<boolean> {
    try {
      if (this.isConnected) {
        return true;
      }

      // Test connection to MCP server
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        this.isConnected = true;
        console.log('✅ Connected to Google Calendar MCP server via HTTP');
        return true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Failed to connect to Google Calendar MCP server:', error);
      console.log('Make sure the Google Calendar MCP server is running with HTTP transport:');
      console.log('cd ../google-calendar-mcp && npm run start:http');
      this.isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    console.log('Disconnected from Google Calendar MCP server');
  }

  async listCalendars(): Promise<CalendarListResponse> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const response = await fetch(`${this.baseUrl}/mcp/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: 'list-calendars',
            arguments: {}
          },
          id: 1
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      
      // Handle SSE format
      if (responseText.startsWith('event: ')) {
        const lines = responseText.split('\n');
        let jsonData = null;
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              jsonData = JSON.parse(line.substring(6));
              break;
            } catch (e) {
              // Continue looking for valid JSON
            }
          }
        }
        if (jsonData && jsonData.result) {
          const textContent = jsonData.result.content?.[0]?.text;
          if (textContent) {
            try {
              // Try to parse as JSON first
              const parsedCalendars = JSON.parse(textContent);
              return { calendars: parsedCalendars };
            } catch (e) {
              // If it's not JSON, treat as plain text and create a calendar entry
              console.log('Calendar data is plain text, not JSON:', textContent.substring(0, 100));
              return {
                calendars: [{
                  id: 'plain-text-calendar',
                  summary: 'Calendar data received as plain text',
                  description: textContent.substring(0, 200) + '...'
                }]
              };
            }
          }
          return { calendars: [] };
        }
      }
      
      // Handle regular JSON response
      try {
        const result = JSON.parse(responseText);
        const textContent = result.result?.content?.[0]?.text;
        if (textContent) {
          try {
            // Try to parse the text content as JSON
            const parsedCalendars = JSON.parse(textContent);
            return { calendars: parsedCalendars };
          } catch (e) {
            // If it's not JSON, treat as plain text
            console.log('Calendar data is plain text, not JSON:', textContent.substring(0, 100));
            return {
              calendars: [{
                id: 'plain-text-calendar',
                summary: 'Calendar data received as plain text',
                description: textContent.substring(0, 200) + '...'
              }]
            };
          }
        }
        return { calendars: [] };
      } catch (parseError) {
        // If it's not JSON, it might be plain text response
        console.log('Response is not JSON, treating as plain text:', responseText);
        return {
          calendars: [{
            id: 'plain-text-response',
            summary: 'Calendar data received as plain text',
            description: responseText.substring(0, 200) + '...'
          }]
        };
      }
    } catch (error) {
      console.error('Error listing calendars:', error);
      throw error;
    }
  }

  async listEvents(timeMin?: string, timeMax?: string, calendarId?: string): Promise<EventListResponse> {
    console.log('🔗 MCP Bridge: listEvents called')
    console.log('🔗 Parameters:', { timeMin, timeMax, calendarId })
    console.log('🔗 Connection status:', this.isConnected)
    
    if (!this.isConnected) {
      console.log('❌ MCP Bridge: Not connected to MCP server')
      throw new Error('Not connected to MCP server');
    }

    try {
      // Format dates to remove milliseconds and ensure proper format
      const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
      };

      const args: any = {
        calendarId: calendarId || 'primary' // Required parameter
      };
      
      if (timeMin) args.timeMin = formatDate(timeMin);
      if (timeMax) args.timeMax = formatDate(timeMax);
      
      console.log('🔗 MCP Bridge: Prepared arguments:', args)

      const requestBody = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: 'list-events',
          arguments: args
        },
        id: 2
      };
      
      console.log('🔗 MCP Bridge: Making HTTP request to:', `${this.baseUrl}/mcp/tools/call`)
      console.log('🔗 MCP Bridge: Request body:', JSON.stringify(requestBody, null, 2))
      
      const response = await fetch(`${this.baseUrl}/mcp/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('🔗 MCP Bridge: HTTP Response status:', response.status)
      console.log('🔗 MCP Bridge: HTTP Response headers:', Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        console.log('❌ MCP Bridge: HTTP Error:', response.status, response.statusText)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      console.log('🔗 MCP Bridge: Raw response text length:', responseText.length)
      console.log('🔗 MCP Bridge: Raw response preview:', responseText.substring(0, 200) + '...')
      
      // Handle SSE format
      if (responseText.startsWith('event: ')) {
        console.log('🔗 MCP Bridge: Detected SSE format response')
        const lines = responseText.split('\n');
        let jsonData = null;
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              jsonData = JSON.parse(line.substring(6));
              console.log('🔗 MCP Bridge: Parsed SSE data:', jsonData)
              break;
            } catch (e) {
              console.log('🔗 MCP Bridge: Failed to parse SSE line:', line)
              // Continue looking for valid JSON
            }
          }
        }
        if (jsonData && jsonData.result) {
          console.log('🔗 MCP Bridge: Returning SSE parsed events')
          const textContent = jsonData.result.content?.[0]?.text;
          if (textContent) {
            try {
              // Try to parse as JSON first
              const parsedEvents = JSON.parse(textContent);
              console.log('🔗 MCP Bridge: Parsed JSON events:', parsedEvents);
              return { events: parsedEvents };
            } catch (e) {
              // If it's not JSON, it's plain text with event data
              console.log('🔗 MCP Bridge: Events data is plain text, parsing manually');
              console.log('🔗 MCP Bridge: Plain text preview:', textContent.substring(0, 200));
              
              // Parse the plain text format
              const events = this.parsePlainTextEvents(textContent);
              console.log('🔗 MCP Bridge: Parsed plain text events:', events);
              return { events };
            }
          }
          return { events: [] };
        }
      }
      
      // Handle regular JSON response
      try {
        console.log('🔗 MCP Bridge: Attempting to parse as JSON')
        const result = JSON.parse(responseText);
        console.log('🔗 MCP Bridge: Parsed JSON result:', result)
        
        const events = result.result?.content?.[0]?.text ? JSON.parse(result.result.content[0].text) : [];
        console.log('🔗 MCP Bridge: Final events array:', events)
        console.log('🔗 MCP Bridge: Number of events:', events.length)
        
        return { events };
      } catch (parseError) {
        // If it's not JSON, it might be plain text response
        console.log('🔗 MCP Bridge: JSON parse failed, treating as plain text:', responseText.substring(0, 100));
        const fallbackEvents = [{
          id: 'plain-text-event',
          title: 'Event data received as plain text',
          start: new Date().toISOString(),
          end: new Date(Date.now() + 3600000).toISOString(),
          description: responseText.substring(0, 200) + '...'
        }];
        console.log('🔗 MCP Bridge: Returning fallback events:', fallbackEvents)
        return { events: fallbackEvents };
      }
    } catch (error) {
      console.error('Error listing events:', error);
      throw error;
    }
  }

  private parsePlainTextEvents(textContent: string): any[] {
    console.log('🔗 MCP Bridge: Parsing plain text events');
    
    // Split by event blocks (look for "Event:" pattern)
    const eventBlocks = textContent.split(/(?=Event:)/);
    const events: any[] = [];
    
    for (let i = 0; i < eventBlocks.length; i++) {
      const block = eventBlocks[i].trim();
      if (!block || !block.includes('Event:')) continue;
      
      try {
        // Extract event details using regex
        const eventMatch = block.match(/Event: (.+?)(?:\n|$)/);
        const idMatch = block.match(/Event ID: (.+?)(?:\n|$)/);
        const startMatch = block.match(/Start: (.+?)(?:\n|$)/);
        const endMatch = block.match(/End: (.+?)(?:\n|$)/);
        
        if (eventMatch) {
          const event = {
            id: idMatch ? idMatch[1] : `event-${i}`,
            title: eventMatch[1],
            start: startMatch ? this.parseEventDate(startMatch[1]) : new Date().toISOString(),
            end: endMatch ? this.parseEventDate(endMatch[1]) : new Date(Date.now() + 3600000).toISOString(),
            description: block.substring(0, 200) + '...'
          };
          events.push(event);
        }
      } catch (e) {
        console.log('🔗 MCP Bridge: Failed to parse event block:', block.substring(0, 100));
      }
    }
    
    console.log(`🔗 MCP Bridge: Parsed ${events.length} events from plain text`);
    return events;
  }

  private parseEventDate(dateStr: string): string {
    try {
      // Try to parse various date formats
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return new Date().toISOString();
      }
      return date.toISOString();
    } catch (e) {
      return new Date().toISOString();
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

      const response = await fetch(`${this.baseUrl}/mcp/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: 'search-events',
            arguments: args
          },
          id: 3
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
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
      const response = await fetch(`${this.baseUrl}/mcp/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: 'create-event',
            arguments: eventData
          },
          id: 4
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
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
      const response = await fetch(`${this.baseUrl}/mcp/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: 'update-event',
            arguments: {
              eventId,
              ...eventData
            }
          },
          id: 5
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
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
      const response = await fetch(`${this.baseUrl}/mcp/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: 'delete-event',
            arguments: { eventId }
          },
          id: 6
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
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

      const response = await fetch(`${this.baseUrl}/mcp/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: 'get-freebusy',
            arguments: args
          },
          id: 7
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
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
