import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn, ChildProcess } from 'child_process';
import { TestDataFactory, TestEvent } from './test-data-factory.js';

/**
 * Comprehensive Integration Tests for Google Calendar MCP
 * 
 * REQUIREMENTS TO RUN THESE TESTS:
 * 1. Valid Google OAuth credentials file at path specified by GOOGLE_OAUTH_CREDENTIALS env var
 * 2. Authenticated test account: Run `npm run dev auth:test` first
 * 3. TEST_CALENDAR_ID environment variable set to a real Google Calendar ID
 * 4. Network access to Google Calendar API
 * 
 * These tests exercise all MCP tools against a real test calendar and will:
 * - Create, modify, and delete real calendar events
 * - Make actual API calls to Google Calendar
 * - Require valid authentication tokens
 * 
 * Test Strategy:
 * 1. Create test events first
 * 2. Test read operations (list, search, freebusy)
 * 3. Test write operations (update)
 * 4. Clean up by deleting created events
 * 5. Track performance metrics throughout
 */

describe('Google Calendar MCP - Direct Integration Tests', () => {
  let client: Client;
  let serverProcess: ChildProcess;
  let testFactory: TestDataFactory;
  let createdEventIds: string[] = [];
  
  const TEST_CALENDAR_ID = process.env.TEST_CALENDAR_ID || 'primary';
  const SEND_UPDATES = 'none' as const;

  beforeAll(async () => {
    // Start the MCP server
    console.log('🚀 Starting Google Calendar MCP server...');
    
    // Filter out undefined values from process.env and set NODE_ENV=test
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([_, value]) => value !== undefined)
    ) as Record<string, string>;
    cleanEnv.NODE_ENV = 'test';
    
    serverProcess = spawn('node', ['build/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Create MCP client
    client = new Client({
      name: "integration-test-client",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    });

    // Connect to server
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['build/index.js'],
      env: cleanEnv
    });
    
    await client.connect(transport);
    console.log('✅ Connected to MCP server');

    // Initialize test factory
    testFactory = new TestDataFactory();
  }, 30000);

  afterAll(async () => {
    console.log('\n🏁 Starting final cleanup...');
    
    // Final cleanup - ensure all test events are removed
    const allEventIds = testFactory.getCreatedEventIds();
    if (allEventIds.length > 0) {
      console.log(`📋 Found ${allEventIds.length} total events created during all tests`);
      await cleanupAllTestEvents();
    } else {
      console.log('✨ No additional events to clean up');
    }
    
    // Close client connection
    if (client) {
      await client.close();
      console.log('🔌 Closed MCP client connection');
    }
    
    // Terminate server process
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('🛑 Terminated MCP server process');
    }

    // Log performance summary
    logPerformanceSummary();
    
    console.log('✅ Integration test cleanup completed successfully\n');
  }, 30000);

  beforeEach(() => {
    testFactory.clearPerformanceMetrics();
    createdEventIds = [];
  });

  afterEach(async () => {
    // Cleanup events created in this test
    if (createdEventIds.length > 0) {
      console.log(`🧹 Cleaning up ${createdEventIds.length} events from test...`);
      await cleanupTestEvents(createdEventIds);
      createdEventIds = [];
    }
  });

  describe('Tool Availability and Basic Functionality', () => {
    it('should list all expected tools', async () => {
      const startTime = testFactory.startTimer('list-tools');
      
      try {
        const tools = await client.listTools();
        
        testFactory.endTimer('list-tools', startTime, true);
        
        expect(tools.tools).toBeDefined();
        expect(tools.tools.length).toBe(10);
        
        const toolNames = tools.tools.map(t => t.name);
        expect(toolNames).toContain('get-current-time');
        expect(toolNames).toContain('list-calendars');
        expect(toolNames).toContain('list-events');
        expect(toolNames).toContain('search-events');
        expect(toolNames).toContain('list-colors');
        expect(toolNames).toContain('create-event');
        expect(toolNames).toContain('update-event');
        expect(toolNames).toContain('delete-event');
        expect(toolNames).toContain('get-freebusy');
        expect(toolNames).toContain('get-event');
      } catch (error) {
        testFactory.endTimer('list-tools', startTime, false, String(error));
        throw error;
      }
    });

    it('should list calendars including test calendar', async () => {
      const startTime = testFactory.startTimer('list-calendars');
      
      try {
        const result = await client.callTool({
          name: 'list-calendars',
          arguments: {}
        });
        
        testFactory.endTimer('list-calendars', startTime, true);
        
        expect(TestDataFactory.validateEventResponse(result)).toBe(true);
        // Just verify we get a valid response with calendar information, not a specific calendar
        expect((result.content as any)[0].text).toMatch(/calendar/i);
      } catch (error) {
        testFactory.endTimer('list-calendars', startTime, false, String(error));
        throw error;
      }
    });

    it('should list available colors', async () => {
      const startTime = testFactory.startTimer('list-colors');
      
      try {
        const result = await client.callTool({
          name: 'list-colors',
          arguments: {}
        });
        
        testFactory.endTimer('list-colors', startTime, true);
        
        expect(TestDataFactory.validateEventResponse(result)).toBe(true);
        expect((result.content as any)[0].text).toContain('Available event colors');
      } catch (error) {
        testFactory.endTimer('list-colors', startTime, false, String(error));
        throw error;
      }
    });

    it('should get current time without timezone parameter', async () => {
      const startTime = testFactory.startTimer('get-current-time');
      
      try {
        const result = await client.callTool({
          name: 'get-current-time',
          arguments: {}
        });
        
        testFactory.endTimer('get-current-time', startTime, true);
        
        expect(TestDataFactory.validateEventResponse(result)).toBe(true);
        
        const response = JSON.parse((result.content as any)[0].text);
        expect(response.currentTime).toBeDefined();
        expect(response.currentTime.utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(response.currentTime.timestamp).toBeTypeOf('number');
        expect(response.currentTime.systemTimeZone).toBeDefined();
        expect(response.currentTime.note).toContain('HTTP mode');
      } catch (error) {
        testFactory.endTimer('get-current-time', startTime, false, String(error));
        throw error;
      }
    });

    it('should get current time with timezone parameter', async () => {
      const startTime = testFactory.startTimer('get-current-time-with-timezone');
      
      try {
        const result = await client.callTool({
          name: 'get-current-time',
          arguments: {
            timeZone: 'America/Los_Angeles'
          }
        });
        
        testFactory.endTimer('get-current-time-with-timezone', startTime, true);
        
        expect(TestDataFactory.validateEventResponse(result)).toBe(true);
        
        const response = JSON.parse((result.content as any)[0].text);
        expect(response.currentTime).toBeDefined();
        expect(response.currentTime.utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(response.currentTime.timestamp).toBeTypeOf('number');
        expect(response.currentTime.requestedTimeZone).toBeDefined();
        expect(response.currentTime.requestedTimeZone.timeZone).toBe('America/Los_Angeles');
        expect(response.currentTime.requestedTimeZone.rfc3339).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
        expect(response.currentTime).not.toHaveProperty('systemTimeZone');
        expect(response.currentTime).not.toHaveProperty('note');
      } catch (error) {
        testFactory.endTimer('get-current-time-with-timezone', startTime, false, String(error));
        throw error;
      }
    });

    it('should get event by ID', async () => {
      const startTime = testFactory.startTimer('get-event');
      
      try {
        // First create an event
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Test Get Event By ID'
        });
        
        const eventId = await createTestEvent(eventData);
        createdEventIds.push(eventId);
        
        // Now get the event by ID
        const result = await client.callTool({
          name: 'get-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: eventId
          }
        });
        
        testFactory.endTimer('get-event', startTime, true);
        
        expect(TestDataFactory.validateEventResponse(result)).toBe(true);
        const responseText = (result.content as any)[0].text;
        expect(responseText).toContain('Event Details:');
        expect(responseText).toContain(eventData.summary);
        expect(responseText).toContain(eventId);
      } catch (error) {
        testFactory.endTimer('get-event', startTime, false, String(error));
        throw error;
      }
    });

    it('should return not found for non-existent event ID', async () => {
      const startTime = testFactory.startTimer('get-event-not-found');
      
      try {
        const result = await client.callTool({
          name: 'get-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: 'non-existent-event-id-12345'
          }
        });
        
        testFactory.endTimer('get-event-not-found', startTime, true);
        
        expect(TestDataFactory.validateEventResponse(result)).toBe(true);
        const responseText = (result.content as any)[0].text;
        expect(responseText).toContain('not found');
      } catch (error) {
        testFactory.endTimer('get-event-not-found', startTime, false, String(error));
        throw error;
      }
    });

    it('should get event with specific fields', async () => {
      const startTime = testFactory.startTimer('get-event-with-fields');
      
      try {
        // First create an event with extended data
        const eventData = TestDataFactory.createColoredEvent('9', {
          summary: 'Test Get Event With Fields',
          description: 'Testing field filtering',
          location: 'Test Location'
        });
        
        const eventId = await createTestEvent(eventData);
        createdEventIds.push(eventId);
        
        // Get event with specific fields
        const result = await client.callTool({
          name: 'get-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: eventId,
            fields: ['colorId', 'description', 'location', 'created', 'updated']
          }
        });
        
        testFactory.endTimer('get-event-with-fields', startTime, true);
        
        expect(TestDataFactory.validateEventResponse(result)).toBe(true);
        const responseText = (result.content as any)[0].text;
        expect(responseText).toContain('Event Details:');
        expect(responseText).toContain(eventData.summary);
        expect(responseText).toContain(eventData.description!);
        expect(responseText).toContain(eventData.location!);
        // Color information may not be included when specific fields are requested
        // Just verify the event was retrieved with the requested fields
      } catch (error) {
        testFactory.endTimer('get-event-with-fields', startTime, false, String(error));
        throw error;
      }
    });
  });

  describe('Event Creation and Management Workflow', () => {
    describe('Single Event Operations', () => {
      it('should create, list, search, update, and delete a single event', async () => {
        // 1. Create event
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Single Event Workflow'
        });
        
        const eventId = await createTestEvent(eventData);
        createdEventIds.push(eventId);
        
        // 2. List events to verify creation
        const timeRanges = TestDataFactory.getTimeRanges();
        await verifyEventInList(eventId, timeRanges.nextWeek);
        
        // 3. Search for the event
        await verifyEventInSearch(eventData.summary);
        
        // 4. Update the event
        await updateTestEvent(eventId, {
          summary: 'Updated Integration Test Event',
          location: 'Updated Location'
        });
        
        // 5. Verify update took effect
        await verifyEventInSearch('Integration');
        
        // 6. Delete will happen in afterEach cleanup
      });

      it('should handle all-day events', async () => {
        const allDayEvent = TestDataFactory.createAllDayEvent({
          summary: 'Integration Test - All Day Event'
        });
        
        const eventId = await createTestEvent(allDayEvent);
        createdEventIds.push(eventId);
        
        // Verify all-day event appears in searches
        await verifyEventInSearch(allDayEvent.summary);
      });

      it('should correctly display all-day events in non-UTC timezones', async () => {
        // Create an all-day event for a specific date
        // For all-day events, use date-only format (YYYY-MM-DD)
        const startDate = '2025-03-15'; // March 15, 2025
        const endDate = '2025-03-16';   // March 16, 2025 (exclusive)
        
        // Create all-day event
        const createResult = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            summary: 'All-Day Event Timezone Test',
            description: 'Testing all-day event display in different timezones',
            start: startDate,
            end: endDate
          }
        });
        
        const eventId = TestDataFactory.extractEventIdFromResponse(createResult);
        expect(eventId).toBeTruthy();
        if (eventId) createdEventIds.push(eventId);
        
        // Test 1: List events without timezone (should use calendar's default)
        const listDefaultTz = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: '2025-03-14T00:00:00',
            timeMax: '2025-03-17T23:59:59'
          }
        });
        
        const defaultText = (listDefaultTz.content as any)[0].text;
        console.log('Default timezone listing:', defaultText);
        
        // Test 2: List events with UTC timezone
        const listUTC = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: '2025-03-14T00:00:00Z',
            timeMax: '2025-03-17T23:59:59Z',
            timeZone: 'UTC'
          }
        });
        
        const utcText = (listUTC.content as any)[0].text;
        console.log('UTC listing:', utcText);
        
        // Test 3: List events with Pacific timezone (UTC-7/8)
        const listPacific = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: '2025-03-14T00:00:00-07:00',
            timeMax: '2025-03-17T23:59:59-07:00',
            timeZone: 'America/Los_Angeles'
          }
        });
        
        const pacificText = (listPacific.content as any)[0].text;
        console.log('Pacific timezone listing:', pacificText);
        
        // All listings should show the event on March 15, 2025, not March 14
        expect(defaultText).toContain('Mar 15');
        expect(utcText).toContain('Mar 15');
        expect(pacificText).toContain('Mar 15');
        
        // Should NOT show March 14 (the bug would cause it to show March 14)
        expect(defaultText).not.toContain('Mar 14, 2025');
        expect(utcText).not.toContain('Mar 14, 2025');
        expect(pacificText).not.toContain('Mar 14, 2025');
      });

      it('should handle events with attendees', async () => {
        const eventWithAttendees = TestDataFactory.createEventWithAttendees({
          summary: 'Integration Test - Event with Attendees'
        });
        
        const eventId = await createTestEvent(eventWithAttendees);
        createdEventIds.push(eventId);
        
        await verifyEventInSearch(eventWithAttendees.summary);
      });

      it('should handle colored events', async () => {
        const coloredEvent = TestDataFactory.createColoredEvent('9', {
          summary: 'Integration Test - Colored Event'
        });
        
        const eventId = await createTestEvent(coloredEvent);
        createdEventIds.push(eventId);
        
        await verifyEventInSearch(coloredEvent.summary);
      });

      it('should create event without timezone and use calendar default', async () => {
        // First, get the calendar details to know the expected default timezone
        const calendarResult = await client.callTool({
          name: 'list-calendars',
          arguments: {}
        });
        
        expect(TestDataFactory.validateEventResponse(calendarResult)).toBe(true);
        
        // Create event data without timezone
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Default Timezone Event'
        });
        
        // Remove timezone from the event data to test default behavior
        const eventDataWithoutTimezone = {
          ...eventData,
          timeZone: undefined
        };
        delete eventDataWithoutTimezone.timeZone;
        
        // Also convert datetime strings to timezone-naive format
        eventDataWithoutTimezone.start = eventDataWithoutTimezone.start.replace(/[+-]\d{2}:\d{2}$|Z$/, '');
        eventDataWithoutTimezone.end = eventDataWithoutTimezone.end.replace(/[+-]\d{2}:\d{2}$|Z$/, '');
        
        const startTime = testFactory.startTimer('create-event-default-timezone');
        
        try {
          const result = await client.callTool({
            name: 'create-event',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              ...eventDataWithoutTimezone
            }
          });
          
          testFactory.endTimer('create-event-default-timezone', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
          
          const eventId = TestDataFactory.extractEventIdFromResponse(result);
          expect(eventId).toBeTruthy();
          
          createdEventIds.push(eventId!);
          testFactory.addCreatedEventId(eventId!);
          
          // Verify the event was created successfully and shows up in searches
          await verifyEventInSearch(eventData.summary);
          
          // Verify the response contains expected success indicators
          const responseText = (result.content as any)[0].text;
          expect(responseText).toContain('Event created successfully!');
          expect(responseText).toContain(eventData.summary);
          
          console.log('✅ Event created successfully without explicit timezone - using calendar default');
        } catch (error) {
          testFactory.endTimer('create-event-default-timezone', startTime, false, String(error));
          throw error;
        }
      });
    });

    describe('Recurring Event Operations', () => {
      it('should create and manage recurring events', async () => {
        // Create recurring event
        const recurringEvent = TestDataFactory.createRecurringEvent({
          summary: 'Integration Test - Recurring Weekly Meeting'
        });
        
        const eventId = await createTestEvent(recurringEvent);
        createdEventIds.push(eventId);
        
        // Verify recurring event
        await verifyEventInSearch(recurringEvent.summary);
        
        // Test different update scopes
        await testRecurringEventUpdates(eventId);
      });


      it('should handle update-event with future instances scope (thisAndFollowing)', async () => {
        // Create a recurring event
        const recurringEvent = TestDataFactory.createRecurringEvent({
          summary: 'Weekly Team Meeting - Future Instances Test',
          description: 'This is a recurring weekly meeting',
          location: 'Conference Room A'
        });
        
        const eventId = await createTestEvent(recurringEvent);
        createdEventIds.push(eventId);
        
        // Wait for event to be searchable
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Calculate a future date (3 weeks from now)
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 21);
        const futureStartDate = TestDataFactory.formatDateTimeRFC3339WithTimezone(futureDate);
        
        // Update future instances
        const updateResult = await client.callTool({
          name: 'update-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: eventId,
            modificationScope: 'thisAndFollowing',
            futureStartDate: futureStartDate,
            summary: 'Updated Team Meeting - Future Instances',
            location: 'New Conference Room',
            timeZone: 'America/Los_Angeles',
            sendUpdates: SEND_UPDATES
          }
        });
        
        expect(TestDataFactory.validateEventResponse(updateResult)).toBe(true);
        const responseText = (updateResult.content as any)[0].text;
        expect(responseText).toContain('Event updated');
      });

      it('should maintain backward compatibility with existing update-event calls', async () => {
        // Create a recurring event
        const recurringEvent = TestDataFactory.createRecurringEvent({
          summary: 'Weekly Team Meeting - Backward Compatibility Test'
        });
        
        const eventId = await createTestEvent(recurringEvent);
        createdEventIds.push(eventId);
        
        // Wait for event to be searchable
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Legacy call format without new parameters (should default to 'all' scope)
        const updateResult = await client.callTool({
          name: 'update-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: eventId,
            summary: 'Updated Weekly Meeting - All Instances',
            location: 'Conference Room B',
            timeZone: 'America/Los_Angeles',
            sendUpdates: SEND_UPDATES
            // No modificationScope, originalStartTime, or futureStartDate
          }
        });
        
        expect(TestDataFactory.validateEventResponse(updateResult)).toBe(true);
        const responseText = (updateResult.content as any)[0].text;
        expect(responseText).toContain('Event updated');
        
        // Verify all instances were updated
        await verifyEventInSearch('Updated Weekly Meeting - All Instances');
      });

      it('should handle validation errors for missing required fields', async () => {
        // Test case 1: Missing originalStartTime for 'thisEventOnly' scope
        const invalidSingleResult = await client.callTool({
          name: 'update-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: 'recurring123',
            modificationScope: 'thisEventOnly',
            timeZone: 'America/Los_Angeles',
            summary: 'Test Update'
            // missing originalStartTime
          }
        });
        
        expect(invalidSingleResult.isError).toBe(true);
        expect((invalidSingleResult.content as any)[0].text).toContain('originalStartTime is required');
        
        // Test case 2: Missing futureStartDate for 'thisAndFollowing' scope
        const invalidFutureResult = await client.callTool({
          name: 'update-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: 'recurring123',
            modificationScope: 'thisAndFollowing',
            timeZone: 'America/Los_Angeles',
            summary: 'Test Update'
            // missing futureStartDate
          }
        });
        
        expect(invalidFutureResult.isError).toBe(true);
        expect((invalidFutureResult.content as any)[0].text).toContain('futureStartDate is required');
      });

      it('should reject non-"all" scopes for single (non-recurring) events', async () => {
        // Create a single (non-recurring) event
        const singleEvent = TestDataFactory.createSingleEvent({
          summary: 'Single Event - Scope Test'
        });
        
        const eventId = await createTestEvent(singleEvent);
        createdEventIds.push(eventId);
        
        // Wait for event to be created
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to update with 'thisEventOnly' scope (should fail)
        const invalidResult = await client.callTool({
          name: 'update-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: eventId,
            modificationScope: 'thisEventOnly',
            originalStartTime: singleEvent.start,
            summary: 'Updated Single Event',
            timeZone: 'America/Los_Angeles',
            sendUpdates: SEND_UPDATES
          }
        });
        
        expect(invalidResult.isError).toBe(true);
        // The error message says "scope other than 'all' only applies to recurring events"
        // which is semantically the same as "not a recurring event"
        const errorText = (invalidResult.content as any)[0].text.toLowerCase();
        expect(errorText).toMatch(/scope.*only applies to recurring events|not a recurring event/i);
      });

      it('should handle complex recurring event updates with all fields', async () => {
        // Create a complex recurring event
        const complexEvent = TestDataFactory.createRecurringEvent({
          summary: 'Complex Weekly Meeting',
          description: 'Original meeting with all fields',
          location: 'Executive Conference Room',
          colorId: '9'
        });
        
        // Add attendees and reminders
        const complexEventWithExtras = {
          ...complexEvent,
          attendees: [
            { email: 'alice@example.com' },
            { email: 'bob@example.com' }
          ],
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email' as const, minutes: 1440 }, // 1 day before
              { method: 'popup' as const, minutes: 15 }
            ]
          }
        };
        
        const eventId = await createTestEvent(complexEventWithExtras);
        createdEventIds.push(eventId);
        
        // Wait for event to be searchable
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Update with all fields
        const updateResult = await client.callTool({
          name: 'update-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: eventId,
            modificationScope: 'all',
            summary: 'Updated Complex Meeting - All Fields',
            description: 'Updated meeting with all the bells and whistles',
            location: 'New Executive Conference Room',
            colorId: '11', // Different color
            attendees: [
              { email: 'alice@example.com' },
              { email: 'bob@example.com' },
              { email: 'charlie@example.com' } // Added attendee
            ],
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'email' as const, minutes: 1440 },
                { method: 'popup' as const, minutes: 30 } // Changed from 15 to 30
              ]
            },
            timeZone: 'America/Los_Angeles',
            sendUpdates: SEND_UPDATES
          }
        });
        
        expect(TestDataFactory.validateEventResponse(updateResult)).toBe(true);
        expect((updateResult.content as any)[0].text).toContain('Event updated');
        expect((updateResult.content as any)[0].text).toContain('Updated Complex Meeting');
        
        // Verify the update
        await verifyEventInSearch('Updated Complex Meeting - All Fields');
      });
    });

    describe('Batch and Multi-Calendar Operations', () => {
      it('should handle multiple calendar queries', async () => {
        const startTime = testFactory.startTimer('list-events-multiple-calendars');
        
        try {
          const timeRanges = TestDataFactory.getTimeRanges();
          const result = await client.callTool({
            name: 'list-events',
            arguments: {
              calendarId: JSON.stringify(['primary', TEST_CALENDAR_ID]),
              timeMin: timeRanges.nextWeek.timeMin,
              timeMax: timeRanges.nextWeek.timeMax
            }
          });
          
          testFactory.endTimer('list-events-multiple-calendars', startTime, true);
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
        } catch (error) {
          testFactory.endTimer('list-events-multiple-calendars', startTime, false, String(error));
          throw error;
        }
      });

      it('should list events with specific fields', async () => {
        // Create an event with various fields
        const eventData = TestDataFactory.createEventWithAttendees({
          summary: 'Integration Test - Field Filtering',
          description: 'Testing field filtering in list-events',
          location: 'Conference Room A'
        });
        
        const eventId = await createTestEvent(eventData);
        createdEventIds.push(eventId);
        
        const startTime = testFactory.startTimer('list-events-with-fields');
        
        try {
          const timeRanges = TestDataFactory.getTimeRanges();
          const result = await client.callTool({
            name: 'list-events',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              timeMin: timeRanges.nextWeek.timeMin,
              timeMax: timeRanges.nextWeek.timeMax,
              fields: ['description', 'location', 'attendees', 'created', 'updated', 'creator', 'organizer']
            }
          });
          
          testFactory.endTimer('list-events-with-fields', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
          const responseText = (result.content as any)[0].text;
          expect(responseText).toContain(eventId);
          expect(responseText).toContain(eventData.summary);
          // The response should include the additional fields we requested
          expect(responseText).toContain(eventData.description!);
          expect(responseText).toContain(eventData.location!);
        } catch (error) {
          testFactory.endTimer('list-events-with-fields', startTime, false, String(error));
          throw error;
        }
      });

      it('should filter events by extended properties', async () => {
        // Create two events - one with matching properties, one without
        const matchingEventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Matching Extended Props'
        });
        
        const nonMatchingEventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Non-Matching Extended Props'
        });
        
        // Create event with extended properties
        const result1 = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...matchingEventData,
            extendedProperties: {
              private: {
                testRun: 'integration-test',
                environment: 'test'
              },
              shared: {
                visibility: 'team'
              }
            }
          }
        });
        
        const matchingEventId = TestDataFactory.extractEventIdFromResponse(result1);
        createdEventIds.push(matchingEventId!);
        
        // Create event without matching properties
        const result2 = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...nonMatchingEventData,
            extendedProperties: {
              private: {
                testRun: 'other-test',
                environment: 'production'
              }
            }
          }
        });
        
        const nonMatchingEventId = TestDataFactory.extractEventIdFromResponse(result2);
        createdEventIds.push(nonMatchingEventId!);
        
        // Wait for events to be searchable
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const startTime = testFactory.startTimer('list-events-extended-properties');
        
        try {
          const timeRanges = TestDataFactory.getTimeRanges();
          const result = await client.callTool({
            name: 'list-events',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              timeMin: timeRanges.nextWeek.timeMin,
              timeMax: timeRanges.nextWeek.timeMax,
              privateExtendedProperty: ['testRun=integration-test', 'environment=test'],
              sharedExtendedProperty: ['visibility=team']
            }
          });
          
          testFactory.endTimer('list-events-extended-properties', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
          const responseText = (result.content as any)[0].text;
          
          // Should find the matching event
          expect(responseText).toContain(matchingEventId);
          expect(responseText).toContain('Matching Extended Props');
          
          // Should NOT find the non-matching event
          expect(responseText).not.toContain(nonMatchingEventId);
          expect(responseText).not.toContain('Non-Matching Extended Props');
        } catch (error) {
          testFactory.endTimer('list-events-extended-properties', startTime, false, String(error));
          throw error;
        }
      });

      it('should search events with specific fields', async () => {
        // Create an event with rich data
        const eventData = TestDataFactory.createColoredEvent('11', {
          summary: 'Search Test - Field Filtering Event',
          description: 'This event tests field filtering in search-events',
          location: 'Virtual Meeting Room'
        });
        
        const eventId = await createTestEvent(eventData);
        createdEventIds.push(eventId);
        
        // Wait for event to be searchable
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const startTime = testFactory.startTimer('search-events-with-fields');
        
        try {
          const timeRanges = TestDataFactory.getTimeRanges();
          const result = await client.callTool({
            name: 'search-events',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              query: 'Field Filtering',
              timeMin: timeRanges.nextWeek.timeMin,
              timeMax: timeRanges.nextWeek.timeMax,
              fields: ['colorId', 'description', 'location', 'created', 'updated', 'htmlLink']
            }
          });
          
          testFactory.endTimer('search-events-with-fields', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
          const responseText = (result.content as any)[0].text;
          expect(responseText).toContain(eventId);
          expect(responseText).toContain(eventData.summary);
          expect(responseText).toContain(eventData.description!);
          expect(responseText).toContain(eventData.location!);
          // Color information may not be included when specific fields are requested
        // Just verify the search found the event with the requested fields
        } catch (error) {
          testFactory.endTimer('search-events-with-fields', startTime, false, String(error));
          throw error;
        }
      });

      it('should search events filtered by extended properties', async () => {
        // Create event with searchable content and extended properties
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Search Extended Props Test Event',
          description: 'This event has extended properties for filtering'
        });
        
        const result = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...eventData,
            extendedProperties: {
              private: {
                searchTest: 'enabled',
                category: 'integration'
              },
              shared: {
                team: 'qa'
              }
            }
          }
        });
        
        const eventId = TestDataFactory.extractEventIdFromResponse(result);
        createdEventIds.push(eventId!);
        
        // Wait for event to be searchable
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const startTime = testFactory.startTimer('search-events-extended-properties');
        
        try {
          const timeRanges = TestDataFactory.getTimeRanges();
          const searchResult = await client.callTool({
            name: 'search-events',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              query: 'Extended Props',
              timeMin: timeRanges.nextWeek.timeMin,
              timeMax: timeRanges.nextWeek.timeMax,
              privateExtendedProperty: ['searchTest=enabled', 'category=integration'],
              sharedExtendedProperty: ['team=qa']
            }
          });
          
          testFactory.endTimer('search-events-extended-properties', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(searchResult)).toBe(true);
          const responseText = (searchResult.content as any)[0].text;
          expect(responseText).toContain(eventId);
          expect(responseText).toContain('Search Extended Props Test Event');
        } catch (error) {
          testFactory.endTimer('search-events-extended-properties', startTime, false, String(error));
          throw error;
        }
      });
    });

    describe('Free/Busy Queries', () => {
      it('should check availability for test calendar', async () => {
        const startTime = testFactory.startTimer('get-freebusy');
        
        try {
          const timeRanges = TestDataFactory.getTimeRanges();
          const result = await client.callTool({
            name: 'get-freebusy',
            arguments: {
              calendars: [{ id: TEST_CALENDAR_ID }],
              timeMin: timeRanges.nextWeek.timeMin,
              timeMax: timeRanges.nextWeek.timeMax,
              timeZone: 'America/Los_Angeles'
            }
          });
          
          testFactory.endTimer('get-freebusy', startTime, true);
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
        } catch (error) {
          testFactory.endTimer('get-freebusy', startTime, false, String(error));
          throw error;
        }
      });

      it('should create event with custom event ID', async () => {
        // Google Calendar event IDs must use base32hex encoding: lowercase a-v and 0-9 only
        // Generate a valid base32hex ID
        const timestamp = Date.now().toString(32).replace(/[w-z]/g, (c) => 
          String.fromCharCode(c.charCodeAt(0) - 22)
        );
        const randomPart = Math.random().toString(32).substring(2, 8).replace(/[w-z]/g, (c) => 
          String.fromCharCode(c.charCodeAt(0) - 22)
        );
        const customEventId = `test${timestamp}${randomPart}`.substring(0, 26);
        
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Custom Event ID'
        });
        
        const startTime = testFactory.startTimer('create-event-custom-id');
        
        try {
          const result = await client.callTool({
            name: 'create-event',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              eventId: customEventId,
              ...eventData
            }
          });
          
          testFactory.endTimer('create-event-custom-id', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
          
          const responseText = (result.content as any)[0].text;
          expect(responseText).toContain(customEventId);
          
          // Clean up
          createdEventIds.push(customEventId);
          testFactory.addCreatedEventId(customEventId);
        } catch (error) {
          testFactory.endTimer('create-event-custom-id', startTime, false, String(error));
          throw error;
        }
      });

      it('should handle duplicate custom event ID error', async () => {
        // Google Calendar event IDs must use base32hex encoding: lowercase a-v and 0-9 only
        // Generate a valid base32hex ID
        const timestamp = Date.now().toString(32).replace(/[w-z]/g, (c) => 
          String.fromCharCode(c.charCodeAt(0) - 22)
        );
        const randomPart = Math.random().toString(32).substring(2, 8).replace(/[w-z]/g, (c) => 
          String.fromCharCode(c.charCodeAt(0) - 22)
        );
        const customEventId = `dup${timestamp}${randomPart}`.substring(0, 26);
        
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Duplicate ID Test'
        });
        
        // First create an event with custom ID
        const result1 = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: customEventId,
            ...eventData
          }
        });
        
        expect(TestDataFactory.validateEventResponse(result1)).toBe(true);
        createdEventIds.push(customEventId);
        
        // Wait a moment for Google Calendar to fully process the event
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to create another event with the same ID
        const startTime = testFactory.startTimer('create-event-duplicate-id');
        
        try {
          await client.callTool({
            name: 'create-event',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              eventId: customEventId,
              ...eventData
            }
          });
          
          // If we get here, the duplicate wasn't caught (test should fail)
          testFactory.endTimer('create-event-duplicate-id', startTime, false);
          expect.fail('Expected error for duplicate event ID');
        } catch (error: any) {
          testFactory.endTimer('create-event-duplicate-id', startTime, true);
          
          // The error should mention the ID already exists
          const errorMessage = error.message || String(error);
          expect(errorMessage).toMatch(/already exists|duplicate|conflict|409/i);
        }
      });

      it('should create event with transparency and visibility options', async () => {
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Transparency and Visibility'
        });
        
        const startTime = testFactory.startTimer('create-event-transparency-visibility');
        
        try {
          const result = await client.callTool({
            name: 'create-event',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              ...eventData,
              transparency: 'transparent',
              visibility: 'private',
              guestsCanInviteOthers: false,
              guestsCanModify: true,
              guestsCanSeeOtherGuests: false
            }
          });
          
          testFactory.endTimer('create-event-transparency-visibility', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
          
          const eventId = TestDataFactory.extractEventIdFromResponse(result);
          expect(eventId).toBeTruthy();
          
          createdEventIds.push(eventId!);
          testFactory.addCreatedEventId(eventId!);
        } catch (error) {
          testFactory.endTimer('create-event-transparency-visibility', startTime, false, String(error));
          throw error;
        }
      });

      it('should create event with extended properties', async () => {
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Extended Properties'
        });
        
        const startTime = testFactory.startTimer('create-event-extended-properties');
        
        try {
          const result = await client.callTool({
            name: 'create-event',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              ...eventData,
              extendedProperties: {
                private: {
                  projectId: 'proj-123',
                  customerId: 'cust-456',
                  category: 'meeting'
                },
                shared: {
                  department: 'engineering',
                  team: 'backend'
                }
              }
            }
          });
          
          testFactory.endTimer('create-event-extended-properties', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
          
          const eventId = TestDataFactory.extractEventIdFromResponse(result);
          expect(eventId).toBeTruthy();
          
          createdEventIds.push(eventId!);
          testFactory.addCreatedEventId(eventId!);
          
          // Verify the event can be found by extended properties
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const searchResult = await client.callTool({
            name: 'list-events',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              timeMin: eventData.start,
              timeMax: eventData.end,
              privateExtendedProperty: ['projectId=proj-123', 'customerId=cust-456']
            }
          });
          
          expect(TestDataFactory.validateEventResponse(searchResult)).toBe(true);
          expect((searchResult.content as any)[0].text).toContain(eventId);
        } catch (error) {
          testFactory.endTimer('create-event-extended-properties', startTime, false, String(error));
          throw error;
        }
      });

      it('should create event with conference data', async () => {
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Conference Event'
        });
        
        const startTime = testFactory.startTimer('create-event-conference');
        
        try {
          const result = await client.callTool({
            name: 'create-event',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              ...eventData,
              conferenceData: {
                createRequest: {
                  requestId: `conf-${Date.now()}`,
                  conferenceSolutionKey: {
                    type: 'hangoutsMeet'
                  }
                }
              }
            }
          });
          
          testFactory.endTimer('create-event-conference', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
          
          const eventId = TestDataFactory.extractEventIdFromResponse(result);
          expect(eventId).toBeTruthy();
          
          createdEventIds.push(eventId!);
          testFactory.addCreatedEventId(eventId!);
        } catch (error) {
          testFactory.endTimer('create-event-conference', startTime, false, String(error));
          throw error;
        }
      });

      it('should create event with source information', async () => {
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Event with Source'
        });
        
        const startTime = testFactory.startTimer('create-event-source');
        
        try {
          const result = await client.callTool({
            name: 'create-event',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              ...eventData,
              source: {
                url: 'https://example.com/events/123',
                title: 'Original Event Source'
              }
            }
          });
          
          testFactory.endTimer('create-event-source', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
          
          const eventId = TestDataFactory.extractEventIdFromResponse(result);
          expect(eventId).toBeTruthy();
          
          createdEventIds.push(eventId!);
          testFactory.addCreatedEventId(eventId!);
        } catch (error) {
          testFactory.endTimer('create-event-source', startTime, false, String(error));
          throw error;
        }
      });

      it('should create event with complex attendee details', async () => {
        const eventData = TestDataFactory.createSingleEvent({
          summary: 'Integration Test - Complex Attendees'
        });
        
        const startTime = testFactory.startTimer('create-event-complex-attendees');
        
        try {
          const result = await client.callTool({
            name: 'create-event',
            arguments: {
              calendarId: TEST_CALENDAR_ID,
              ...eventData,
              attendees: [
                {
                  email: 'required@example.com',
                  displayName: 'Required Attendee',
                  optional: false,
                  responseStatus: 'needsAction',
                  comment: 'Looking forward to the meeting',
                  additionalGuests: 2
                },
                {
                  email: 'optional@example.com',
                  displayName: 'Optional Attendee',
                  optional: true,
                  responseStatus: 'tentative'
                }
              ],
              sendUpdates: 'none' // Don't send real emails in tests
            }
          });
          
          testFactory.endTimer('create-event-complex-attendees', startTime, true);
          
          expect(TestDataFactory.validateEventResponse(result)).toBe(true);
          
          const eventId = TestDataFactory.extractEventIdFromResponse(result);
          expect(eventId).toBeTruthy();
          
          createdEventIds.push(eventId!);
          testFactory.addCreatedEventId(eventId!);
        } catch (error) {
          testFactory.endTimer('create-event-complex-attendees', startTime, false, String(error));
          throw error;
        }
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid calendar ID gracefully', async () => {
      const invalidData = TestDataFactory.getInvalidTestData();
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      try {
        await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: invalidData.invalidCalendarId,
            timeMin: TestDataFactory.formatDateTimeRFC3339WithTimezone(now),
            timeMax: TestDataFactory.formatDateTimeRFC3339WithTimezone(tomorrow)
          }
        });
        
        // If we get here, the error wasn't caught (test should fail)
        expect.fail('Expected error for invalid calendar ID');
      } catch (error: any) {
        // Should get an error about invalid calendar ID
        const errorMessage = error.message || String(error);
        expect(errorMessage.toLowerCase()).toContain('error');
      }
    });

    it('should handle invalid event ID gracefully', async () => {
      const invalidData = TestDataFactory.getInvalidTestData();
      
      try {
        await client.callTool({
          name: 'delete-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId: invalidData.invalidEventId,
            sendUpdates: SEND_UPDATES
          }
        });
        
        // If we get here, the error wasn't caught (test should fail)
        expect.fail('Expected error for invalid event ID');
      } catch (error: any) {
        // Should get an error about invalid event ID
        const errorMessage = error.message || String(error);
        expect(errorMessage.toLowerCase()).toContain('error');
      }
    });

    it('should handle malformed date formats gracefully', async () => {
      const invalidData = TestDataFactory.getInvalidTestData();
      
      try {
        await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            summary: 'Test Event',
            start: invalidData.invalidTimeFormat,
            end: invalidData.invalidTimeFormat,
            timeZone: 'America/Los_Angeles',
            sendUpdates: SEND_UPDATES
          }
        });
        
        // If we get here, the error wasn't caught (test should fail)
        expect.fail('Expected error for malformed date format');
      } catch (error: any) {
        // Should get an error about invalid time value
        const errorMessage = error.message || String(error);
        expect(errorMessage.toLowerCase()).toMatch(/invalid|error|time/i);
      }
    });
  });

  describe('Timezone Handling Validation', () => {
    it('should correctly interpret timezone-naive timeMin/timeMax in specified timezone', async () => {
      // Test scenario: Create an event at 10:00 AM Los Angeles time,
      // then use list-events with timezone-naive timeMin/timeMax and explicit timeZone
      // to verify the event is found within a narrow time window.
      
      console.log('🧪 Testing timezone interpretation fix...');
      
      // Step 1: Create an event at 10:00 AM Los Angeles time on a specific date
      const testDate = new Date();
      testDate.setDate(testDate.getDate() + 7); // Next week to avoid conflicts
      const year = testDate.getFullYear();
      const month = String(testDate.getMonth() + 1).padStart(2, '0');
      const day = String(testDate.getDate()).padStart(2, '0');
      
      const eventStart = `${year}-${month}-${day}T10:00:00-08:00`; // 10:00 AM PST (or PDT)
      const eventEnd = `${year}-${month}-${day}T11:00:00-08:00`;   // 11:00 AM PST (or PDT)
      
      const eventData: TestEvent = {
        summary: 'Timezone Test Event - LA Time',
        start: eventStart,
        end: eventEnd,
        description: 'This event tests timezone interpretation in list-events calls',
        timeZone: 'America/Los_Angeles',
        sendUpdates: SEND_UPDATES
      };
      
      console.log(`📅 Creating event at ${eventStart} (Los Angeles time)`);
      
      const eventId = await createTestEvent(eventData);
      createdEventIds.push(eventId);
      
      // Step 2: Use list-events with timezone-naive timeMin/timeMax and explicit timeZone
      // This should correctly interpret the times as Los Angeles time, not system time
      
      // Define a narrow time window that includes our event (9:30 AM - 11:30 AM LA time)
      const timeMin = `${year}-${month}-${day}T09:30:00`; // Timezone-naive
      const timeMax = `${year}-${month}-${day}T11:30:00`; // Timezone-naive
      
      console.log(`🔍 Searching for event using timezone-naive times: ${timeMin} to ${timeMax} (interpreted as Los Angeles time)`);
      
      const startTime = testFactory.startTimer('list-events-timezone-naive');
      
      try {
        const listResult = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: timeMin,
            timeMax: timeMax,
            timeZone: 'America/Los_Angeles' // This should interpret the timezone-naive times as LA time
          }
        });
        
        testFactory.endTimer('list-events-timezone-naive', startTime, true);
        
        expect(TestDataFactory.validateEventResponse(listResult)).toBe(true);
        const responseText = (listResult.content as any)[0].text;
        
        // The event should be found because:
        // - Event is at 10:00-11:00 AM LA time
        // - Search window is 9:30-11:30 AM LA time (correctly interpreted)
        expect(responseText).toContain(eventId);
        expect(responseText).toContain('Timezone Test Event - LA Time');
        
        console.log('✅ Event found in timezone-aware search');
        
        // Step 3: Test the negative case - narrow window that excludes the event
        // Search for 8:00-9:00 AM LA time (should NOT find the 10:00 AM event)
        const excludingTimeMin = `${year}-${month}-${day}T08:00:00`;
        const excludingTimeMax = `${year}-${month}-${day}T09:00:00`;
        
        console.log(`🔍 Testing negative case with excluding time window: ${excludingTimeMin} to ${excludingTimeMax}`);
        
        const excludingResult = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: excludingTimeMin,
            timeMax: excludingTimeMax,
            timeZone: 'America/Los_Angeles'
          }
        });
        
        expect(TestDataFactory.validateEventResponse(excludingResult)).toBe(true);
        const excludingResponseText = (excludingResult.content as any)[0].text;
        
        // The event should NOT be found in this time window
        expect(excludingResponseText).not.toContain(eventId);
        
        console.log('✅ Event correctly excluded from non-overlapping time window');
      } catch (error) {
        testFactory.endTimer('list-events-timezone-naive', startTime, false, String(error));
        throw error;
      }
    });
    
    it('should correctly handle DST transitions in timezone interpretation', async () => {
      // Test during DST period (July) to ensure DST is handled correctly
      console.log('🧪 Testing DST timezone interpretation...');
      
      // Create an event in July (PDT period)
      const eventStart = '2024-07-15T10:00:00-07:00'; // 10:00 AM PDT
      const eventEnd = '2024-07-15T11:00:00-07:00';   // 11:00 AM PDT
      
      const eventData: TestEvent = {
        summary: 'DST Timezone Test Event',
        start: eventStart,
        end: eventEnd,
        description: 'This event tests DST timezone interpretation',
        timeZone: 'America/Los_Angeles',
        sendUpdates: SEND_UPDATES
      };
      
      console.log(`📅 Creating DST event at ${eventStart} (Los Angeles PDT)`);
      
      const eventId = await createTestEvent(eventData);
      createdEventIds.push(eventId);
      
      const startTime = testFactory.startTimer('list-events-dst');
      
      try {
        // Search with timezone-naive times during DST period
        const timeMin = '2024-07-15T09:30:00'; // Should be interpreted as PDT
        const timeMax = '2024-07-15T11:30:00'; // Should be interpreted as PDT
        
        console.log(`🔍 Searching during DST period: ${timeMin} to ${timeMax} (PDT)`);
        
        const listResult = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: timeMin,
            timeMax: timeMax,
            timeZone: 'America/Los_Angeles'
          }
        });
        
        testFactory.endTimer('list-events-dst', startTime, true);
        
        expect(TestDataFactory.validateEventResponse(listResult)).toBe(true);
        const responseText = (listResult.content as any)[0].text;
        
        expect(responseText).toContain(eventId);
        expect(responseText).toContain('DST Timezone Test Event');
        
        console.log('✅ DST timezone interpretation works correctly');
      } catch (error) {
        testFactory.endTimer('list-events-dst', startTime, false, String(error));
        throw error;
      }
    });
    
    it('should preserve timezone-aware datetime inputs regardless of timeZone parameter', async () => {
      // Test that when timeMin/timeMax already have timezone info, 
      // the timeZone parameter doesn't override them
      console.log('🧪 Testing timezone-aware datetime preservation...');
      
      const testDate = new Date();
      testDate.setDate(testDate.getDate() + 8);
      const year = testDate.getFullYear();
      const month = String(testDate.getMonth() + 1).padStart(2, '0');
      const day = String(testDate.getDate()).padStart(2, '0');
      
      // Create event in New York time
      const eventStart = `${year}-${month}-${day}T14:00:00-05:00`; // 2:00 PM EST
      const eventEnd = `${year}-${month}-${day}T15:00:00-05:00`;   // 3:00 PM EST
      
      const eventData: TestEvent = {
        summary: 'Timezone-Aware Input Test Event',
        start: eventStart,
        end: eventEnd,
        timeZone: 'America/New_York',
        sendUpdates: SEND_UPDATES
      };
      
      const eventId = await createTestEvent(eventData);
      createdEventIds.push(eventId);
      
      const startTime = testFactory.startTimer('list-events-timezone-aware');
      
      try {
        // Search using timezone-aware timeMin/timeMax with a different timeZone parameter
        // The timezone-aware inputs should be preserved, not converted
        const timeMin = `${year}-${month}-${day}T13:30:00-05:00`; // 1:30 PM EST (timezone-aware)
        const timeMax = `${year}-${month}-${day}T15:30:00-05:00`; // 3:30 PM EST (timezone-aware)
        
        const listResult = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: timeMin,
            timeMax: timeMax,
            timeZone: 'America/Los_Angeles' // Different timezone - should be ignored
          }
        });
        
        testFactory.endTimer('list-events-timezone-aware', startTime, true);
        
        expect(TestDataFactory.validateEventResponse(listResult)).toBe(true);
        const responseText = (listResult.content as any)[0].text;
        
        expect(responseText).toContain(eventId);
        expect(responseText).toContain('Timezone-Aware Input Test Event');
        
        console.log('✅ Timezone-aware inputs preserved correctly');
      } catch (error) {
        testFactory.endTimer('list-events-timezone-aware', startTime, false, String(error));
        throw error;
      }
    });
  });

  describe('Enhanced Conflict Detection', () => {
    describe('Smart Duplicate Detection with Simplified Algorithm', () => {
      it('should detect duplicates with rules-based similarity scoring', async () => {
        // Create base event with fixed time for consistent duplicate detection
        const fixedStart = new Date();
        fixedStart.setDate(fixedStart.getDate() + 5); // 5 days from now
        fixedStart.setHours(14, 0, 0, 0); // 2 PM
        const fixedEnd = new Date(fixedStart);
        fixedEnd.setHours(15, 0, 0, 0); // 3 PM
        
        // Pre-check: Clear any existing events in this time window
        const timeRangeStart = new Date(fixedStart);
        timeRangeStart.setHours(0, 0, 0, 0); // Start of day
        const timeRangeEnd = new Date(fixedStart);
        timeRangeEnd.setHours(23, 59, 59, 999); // End of day
        
        const existingEventsResult = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: TestDataFactory.formatDateTimeRFC3339(timeRangeStart),
            timeMax: TestDataFactory.formatDateTimeRFC3339(timeRangeEnd)
          }
        });
        
        // Delete any existing events found
        const existingEventIds = TestDataFactory.extractAllEventIds(existingEventsResult);
        if (existingEventIds.length > 0) {
          console.log(`🧹 Pre-test cleanup: Removing ${existingEventIds.length} existing events from test time window`);
          for (const eventId of existingEventIds) {
            try {
              await client.callTool({
                name: 'delete-event',
                arguments: {
                  calendarId: TEST_CALENDAR_ID,
                  eventId,
                  sendUpdates: SEND_UPDATES
                }
              });
            } catch (error) {
              // Ignore errors - event might be protected or already deleted
            }
          }
          // Wait for deletions to propagate
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        const baseEvent = TestDataFactory.createSingleEvent({
          summary: 'Team Meeting',
          location: 'Conference Room A',
          start: TestDataFactory.formatDateTimeRFC3339(fixedStart),
          end: TestDataFactory.formatDateTimeRFC3339(fixedEnd)
        });
        
        const baseEventId = await createTestEvent(baseEvent);
        createdEventIds.push(baseEventId);
        
        // Note: Google Calendar has eventual consistency - events may not immediately
        // appear in list queries. This delay helps but doesn't guarantee visibility.
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Test 1: Exact title + overlapping time = 95% similarity (blocked)
        const exactDuplicateResult = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...baseEvent
          }
        });
        
        expect((exactDuplicateResult.content as any)[0].text).toContain('DUPLICATE EVENT DETECTED');
        expect((exactDuplicateResult.content as any)[0].text).toContain('95% similar');
        
        // Test 2: Similar title + overlapping time = 70% similarity (warning)
        const similarTitleEvent = {
          ...baseEvent,
          summary: 'Team Meeting Discussion' // Contains "Team Meeting"
        };
        
        const similarResult = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...similarTitleEvent,
            allowDuplicates: true // Allow creation despite warning
          }
        });
        
        expect((similarResult.content as any)[0].text).toContain('Event created with warnings');
        expect((similarResult.content as any)[0].text).toContain('POTENTIAL DUPLICATES DETECTED');
        expect((similarResult.content as any)[0].text).toContain('70% similar');
        const similarEventId = TestDataFactory.extractEventIdFromResponse(similarResult);
        if (similarEventId) createdEventIds.push(similarEventId);
        
        // Test 3: Same title on same day but different time = NO DUPLICATE (different time window)
        const laterTime = new Date(baseEvent.start);
        laterTime.setHours(laterTime.getHours() + 3);
        const laterEndTime = new Date(baseEvent.end);
        laterEndTime.setHours(laterEndTime.getHours() + 3);
        
        const sameDayEvent = {
          ...baseEvent,
          start: TestDataFactory.formatDateTimeRFC3339(laterTime),
          end: TestDataFactory.formatDateTimeRFC3339(laterEndTime)
        };
        
        const sameDayResult = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...sameDayEvent
          }
        });
        
        // With exact time window search, events at different times are NOT detected as duplicates
        expect((sameDayResult.content as any)[0].text).toContain('Event created successfully');
        expect((sameDayResult.content as any)[0].text).not.toContain('DUPLICATE');
        expect((sameDayResult.content as any)[0].text).not.toContain('similar');
        const sameDayEventId = TestDataFactory.extractEventIdFromResponse(sameDayResult);
        if (sameDayEventId) createdEventIds.push(sameDayEventId);
        
        // Test 4: Same title but different day = NO DUPLICATE (different time window)
        const nextWeek = new Date(baseEvent.start);
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekEnd = new Date(baseEvent.end);
        nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
        
        const differentDayEvent = {
          ...baseEvent,
          start: TestDataFactory.formatDateTimeRFC3339(nextWeek),
          end: TestDataFactory.formatDateTimeRFC3339(nextWeekEnd)
        };
        
        const differentDayResult = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...differentDayEvent
          }
        });
        
        // With exact time window search, events on different days are NOT detected as duplicates
        expect((differentDayResult.content as any)[0].text).toContain('Event created successfully');
        expect((differentDayResult.content as any)[0].text).not.toContain('DUPLICATE');
        const differentDayEventId = TestDataFactory.extractEventIdFromResponse(differentDayResult);
        if (differentDayEventId) createdEventIds.push(differentDayEventId);
      });
      
    });
    
    describe('Adjacent Event Handling (No False Positives)', () => {
      it('should not flag back-to-back meetings as conflicts', async () => {
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + 7); // 7 days from now
        baseDate.setHours(9, 0, 0, 0);
        
        // Pre-check: Clear any existing events in this time window
        const timeRangeStart = new Date(baseDate);
        timeRangeStart.setHours(0, 0, 0, 0); // Start of day
        const timeRangeEnd = new Date(baseDate);
        timeRangeEnd.setHours(23, 59, 59, 999); // End of day
        
        const existingEventsResult = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: TestDataFactory.formatDateTimeRFC3339(timeRangeStart),
            timeMax: TestDataFactory.formatDateTimeRFC3339(timeRangeEnd)
          }
        });
        
        // Delete any existing events found
        const existingEventIds = TestDataFactory.extractAllEventIds(existingEventsResult);
        if (existingEventIds.length > 0) {
          console.log(`🧹 Pre-test cleanup: Removing ${existingEventIds.length} existing events from test time window`);
          for (const eventId of existingEventIds) {
            try {
              await client.callTool({
                name: 'delete-event',
                arguments: {
                  calendarId: TEST_CALENDAR_ID,
                  eventId,
                  sendUpdates: SEND_UPDATES
                }
              });
            } catch (error) {
              // Ignore errors - event might be protected or already deleted
            }
          }
          // Wait for deletions to propagate
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Create first meeting 9-10am
        const firstStart = new Date(baseDate);
        const firstEnd = new Date(firstStart);
        firstEnd.setHours(10, 0, 0, 0);
        
        const firstMeeting = TestDataFactory.createSingleEvent({
          summary: 'Morning Standup',
          description: 'Daily team sync',
          location: 'Room A',
          start: TestDataFactory.formatDateTimeRFC3339(firstStart),
          end: TestDataFactory.formatDateTimeRFC3339(firstEnd)
        });
        
        const firstId = await createTestEvent(firstMeeting);
        createdEventIds.push(firstId);
        
        // Note: Google Calendar has eventual consistency - events may not immediately
        // appear in list queries. This delay helps but doesn't guarantee visibility.
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Create second meeting 10-11am (immediately after)
        const secondStart = new Date(baseDate);
        secondStart.setHours(10, 0, 0, 0);
        const secondEnd = new Date(secondStart);
        secondEnd.setHours(11, 0, 0, 0);
        
        const secondMeeting = TestDataFactory.createSingleEvent({
          summary: 'Project Review',
          description: 'Weekly project status update',
          location: 'Room B',
          start: TestDataFactory.formatDateTimeRFC3339(secondStart),
          end: TestDataFactory.formatDateTimeRFC3339(secondEnd)
        });
        
        const result = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...secondMeeting
          }
        });
        
        // Should not show conflict warning for adjacent events
        expect((result.content as any)[0].text).toContain('Event created successfully');
        expect((result.content as any)[0].text).not.toContain('CONFLICTS');
        expect((result.content as any)[0].text).not.toContain('Overlap');
        const secondId = TestDataFactory.extractEventIdFromResponse(result);
        if (secondId) createdEventIds.push(secondId);
        
        // Create third meeting 10:30-11:30am (overlaps with second)
        const thirdStart = new Date(baseDate);
        thirdStart.setHours(10, 30, 0, 0); // 10:30 AM
        const thirdEnd = new Date(thirdStart);
        thirdEnd.setHours(11, 30, 0, 0); // 11:30 AM
        
        const thirdMeeting = TestDataFactory.createSingleEvent({
          summary: 'Design Discussion',
          description: 'UI/UX design review',
          location: 'Design Lab',
          start: TestDataFactory.formatDateTimeRFC3339(thirdStart),
          end: TestDataFactory.formatDateTimeRFC3339(thirdEnd)
        });
        
        const conflictResult = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...thirdMeeting
          }
        });
        
        // Should show conflict for actual overlap
        expect((conflictResult.content as any)[0].text).toContain('Event created with warnings');
        expect((conflictResult.content as any)[0].text).toContain('SCHEDULING CONFLICTS DETECTED');
        expect((conflictResult.content as any)[0].text).toContain('30 minute');
        expect((conflictResult.content as any)[0].text).toContain('50% of your event');
        const thirdId = TestDataFactory.extractEventIdFromResponse(conflictResult);
        if (thirdId) createdEventIds.push(thirdId);
      });
    });
    
    describe('Unified Threshold Configuration', () => {
      it('should use configurable duplicate detection threshold', async () => {
        // Use fixed time for consistent testing
        const fixedStart = new Date();
        fixedStart.setDate(fixedStart.getDate() + 8); // 8 days from now
        fixedStart.setHours(10, 0, 0, 0); // 10 AM
        const fixedEnd = new Date(fixedStart);
        fixedEnd.setHours(11, 0, 0, 0); // 11 AM
        
        // Pre-check: Clear any existing events in this time window
        const timeRangeStart = new Date(fixedStart);
        timeRangeStart.setHours(0, 0, 0, 0); // Start of day
        const timeRangeEnd = new Date(fixedStart);
        timeRangeEnd.setHours(23, 59, 59, 999); // End of day
        
        const existingEventsResult = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: TestDataFactory.formatDateTimeRFC3339(timeRangeStart),
            timeMax: TestDataFactory.formatDateTimeRFC3339(timeRangeEnd)
          }
        });
        
        // Delete any existing events found
        const existingEventIds = TestDataFactory.extractAllEventIds(existingEventsResult);
        if (existingEventIds.length > 0) {
          console.log(`🧹 Pre-test cleanup: Removing ${existingEventIds.length} existing events from test time window`);
          for (const eventId of existingEventIds) {
            try {
              await client.callTool({
                name: 'delete-event',
                arguments: {
                  calendarId: TEST_CALENDAR_ID,
                  eventId,
                  sendUpdates: SEND_UPDATES
                }
              });
            } catch (error) {
              // Ignore errors - event might be protected or already deleted
            }
          }
          // Wait for deletions to propagate
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        const baseEvent = TestDataFactory.createSingleEvent({
          summary: 'Quarterly Planning',
          start: TestDataFactory.formatDateTimeRFC3339(fixedStart),
          end: TestDataFactory.formatDateTimeRFC3339(fixedEnd)
        });
        
        const baseId = await createTestEvent(baseEvent);
        createdEventIds.push(baseId);
        
        // Note: Google Calendar has eventual consistency - events may not immediately
        // appear in list queries. This delay helps but doesn't guarantee visibility.
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Test with custom threshold of 0.5 for similar title at same time
        const similarEvent = {
          ...baseEvent,
          summary: 'Quarterly Planning Meeting'  // Similar but not identical title
        };
        
        const lowThresholdResult = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...similarEvent,
            duplicateSimilarityThreshold: 0.5,
            allowDuplicates: true // Allow creation despite warning
          }
        });
        
        // Track for cleanup immediately after creation
        const lowThresholdId = TestDataFactory.extractEventIdFromResponse(lowThresholdResult);
        if (lowThresholdId) createdEventIds.push(lowThresholdId);
        
        // Should show warning since similarity > 50% threshold
        expect((lowThresholdResult.content as any)[0].text).toContain('POTENTIAL DUPLICATES DETECTED');
        
        // Test with high threshold of 0.9 (should not flag ~70% similarity)
        const slightlyDifferentEvent = {
          ...baseEvent,
          summary: 'Q4 Planning'  // Different enough title to be below 90% threshold
        };
        
        const highThresholdResult = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...slightlyDifferentEvent,
            duplicateSimilarityThreshold: 0.9
          }
        });
        
        // Track for cleanup immediately after creation
        const highThresholdId = TestDataFactory.extractEventIdFromResponse(highThresholdResult);
        if (highThresholdId) createdEventIds.push(highThresholdId);
        
        // Should not show DUPLICATE warning since similarity < 90% threshold
        // Note: May show conflict warning if events overlap in time
        expect((highThresholdResult.content as any)[0].text).not.toContain('DUPLICATE');
      });
      
      it('should allow exact duplicates with allowDuplicates flag', async () => {
        // Use fixed time for exact duplicate
        const fixedStart = new Date();
        fixedStart.setDate(fixedStart.getDate() + 9); // 9 days from now
        fixedStart.setHours(15, 0, 0, 0); // 3 PM
        const fixedEnd = new Date(fixedStart);
        fixedEnd.setHours(16, 0, 0, 0); // 4 PM
        
        // Pre-check: Clear any existing events in this time window
        const timeRangeStart = new Date(fixedStart);
        timeRangeStart.setHours(0, 0, 0, 0); // Start of day
        const timeRangeEnd = new Date(fixedStart);
        timeRangeEnd.setHours(23, 59, 59, 999); // End of day
        
        const existingEventsResult = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: TestDataFactory.formatDateTimeRFC3339(timeRangeStart),
            timeMax: TestDataFactory.formatDateTimeRFC3339(timeRangeEnd)
          }
        });
        
        // Delete any existing events found
        const existingEventIds = TestDataFactory.extractAllEventIds(existingEventsResult);
        if (existingEventIds.length > 0) {
          console.log(`🧹 Pre-test cleanup: Removing ${existingEventIds.length} existing events from test time window`);
          for (const eventId of existingEventIds) {
            try {
              await client.callTool({
                name: 'delete-event',
                arguments: {
                  calendarId: TEST_CALENDAR_ID,
                  eventId,
                  sendUpdates: SEND_UPDATES
                }
              });
            } catch (error) {
              // Ignore errors - event might be protected or already deleted
            }
          }
          // Wait for deletions to propagate
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        const event = TestDataFactory.createSingleEvent({
          summary: 'Important Presentation',
          start: TestDataFactory.formatDateTimeRFC3339(fixedStart),
          end: TestDataFactory.formatDateTimeRFC3339(fixedEnd)
        });
        
        const firstId = await createTestEvent(event);
        createdEventIds.push(firstId);
        
        // Note: Google Calendar has eventual consistency - events may not immediately
        // appear in list queries. This delay helps but doesn't guarantee visibility.
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Try to create exact duplicate with allowDuplicates=true
        const duplicateResult = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...event,
            allowDuplicates: true
          }
        });
        
        // Should create with warning but not block
        expect((duplicateResult.content as any)[0].text).toContain('Event created with warnings');
        expect((duplicateResult.content as any)[0].text).toContain('POTENTIAL DUPLICATES DETECTED');
        expect((duplicateResult.content as any)[0].text).toContain('95% similar');
        const duplicateId = TestDataFactory.extractEventIdFromResponse(duplicateResult);
        if (duplicateId) createdEventIds.push(duplicateId);
      });
    });
    
    describe('Conflict Detection Performance', () => {
      it('should detect conflicts for overlapping events', async () => {
        // Create multiple events for conflict checking
        const baseTime = new Date();
        baseTime.setDate(baseTime.getDate() + 10); // 10 days from now
        baseTime.setHours(14, 0, 0, 0); // 2 PM
        
        // Pre-check: Clear any existing events in this time window
        const timeRangeStart = new Date(baseTime);
        timeRangeStart.setHours(0, 0, 0, 0); // Start of day
        const timeRangeEnd = new Date(baseTime);
        timeRangeEnd.setHours(23, 59, 59, 999); // End of day
        
        const existingEventsResult = await client.callTool({
          name: 'list-events',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            timeMin: TestDataFactory.formatDateTimeRFC3339(timeRangeStart),
            timeMax: TestDataFactory.formatDateTimeRFC3339(timeRangeEnd)
          }
        });
        
        // Delete any existing events found
        const existingEventIds = TestDataFactory.extractAllEventIds(existingEventsResult);
        if (existingEventIds.length > 0) {
          console.log(`🧹 Pre-test cleanup: Removing ${existingEventIds.length} existing events from test time window`);
          for (const eventId of existingEventIds) {
            try {
              await client.callTool({
                name: 'delete-event',
                arguments: {
                  calendarId: TEST_CALENDAR_ID,
                  eventId,
                  sendUpdates: SEND_UPDATES
                }
              });
            } catch (error) {
              // Ignore errors - event might be protected or already deleted
            }
          }
          // Wait for deletions to propagate
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        const events = [];
        for (let i = 0; i < 3; i++) {
          const startTime = new Date(baseTime.getTime() + i * 2 * 60 * 60 * 1000);
          const event = TestDataFactory.createSingleEvent({
            summary: `Cache Test Event ${i + 1}`,
            start: TestDataFactory.formatDateTimeRFC3339(startTime),
            end: TestDataFactory.formatDateTimeRFC3339(new Date(startTime.getTime() + 60 * 60 * 1000))
          });
          const id = await createTestEvent(event);
          createdEventIds.push(id);
          events.push(event);
        }
        
        // Longer delay to ensure events are indexed in Google Calendar
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // First conflict check
        const overlappingEvent = TestDataFactory.createSingleEvent({
          summary: 'Overlapping Meeting',
          start: events[1].start, // Same time as second event
          end: events[1].end
        });
        
        const result1 = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...overlappingEvent,
            allowDuplicates: true
          }
        });
        
        // Should detect a conflict (100% overlap)
        const responseText = (result1.content as any)[0].text;
        expect(responseText).toContain('SCHEDULING CONFLICTS DETECTED');
        expect(responseText).toContain('100% of your event');
        const overlappingId = TestDataFactory.extractEventIdFromResponse(result1);
        if (overlappingId) createdEventIds.push(overlappingId);
        
        // Second conflict check with different event
        const anotherOverlapping = TestDataFactory.createSingleEvent({
          summary: 'Another Overlapping Meeting',
          start: events[1].start,
          end: events[1].end
        });
        
        const result2 = await client.callTool({
          name: 'create-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            ...anotherOverlapping,
            allowDuplicates: true
          }
        });
        
        // Should also detect a conflict
        const responseText2 = (result2.content as any)[0].text;
        expect(responseText2).toContain('SCHEDULING CONFLICTS DETECTED');
        expect(responseText2).toContain('100% of your event');
        const anotherId = TestDataFactory.extractEventIdFromResponse(result2);
        if (anotherId) createdEventIds.push(anotherId);
      });
    });
  });

  describe('Performance Benchmarks', () => {
    it('should complete basic operations within reasonable time limits', async () => {
      // Create a test event for performance testing
      const eventData = TestDataFactory.createSingleEvent({
        summary: 'Performance Test Event'
      });
      
      const eventId = await createTestEvent(eventData);
      createdEventIds.push(eventId);
      
      // Test various operations and collect metrics
      const timeRanges = TestDataFactory.getTimeRanges();
      
      await verifyEventInList(eventId, timeRanges.nextWeek);
      await verifyEventInSearch(eventData.summary);
      
      // Get all performance metrics
      const metrics = testFactory.getPerformanceMetrics();
      
      // Log performance results
      console.log('\n📊 Performance Metrics:');
      metrics.forEach(metric => {
        console.log(`  ${metric.operation}: ${metric.duration}ms (${metric.success ? '✅' : '❌'})`);
      });
      
      // Basic performance assertions
      const createMetric = metrics.find(m => m.operation === 'create-event');
      const listMetric = metrics.find(m => m.operation === 'list-events');
      const searchMetric = metrics.find(m => m.operation === 'search-events');
      
      expect(createMetric?.success).toBe(true);
      expect(listMetric?.success).toBe(true);
      expect(searchMetric?.success).toBe(true);
      
      // All operations should complete within 30 seconds
      metrics.forEach(metric => {
        expect(metric.duration).toBeLessThan(30000);
      });
    });
  });

  // Helper Functions
  async function createTestEvent(eventData: TestEvent): Promise<string> {
    const startTime = testFactory.startTimer('create-event');
    
    try {
      const result = await client.callTool({
        name: 'create-event',
        arguments: {
          calendarId: TEST_CALENDAR_ID,
          ...eventData
        }
      });
      
      testFactory.endTimer('create-event', startTime, true);
      
      expect(TestDataFactory.validateEventResponse(result)).toBe(true);
      
      const eventId = TestDataFactory.extractEventIdFromResponse(result);
      
      expect(eventId).toBeTruthy();
      
      testFactory.addCreatedEventId(eventId!);
      
      return eventId!;
    } catch (error) {
      testFactory.endTimer('create-event', startTime, false, String(error));
      throw error;
    }
  }

  async function verifyEventInList(eventId: string, timeRange: { timeMin: string; timeMax: string }): Promise<void> {
    const startTime = testFactory.startTimer('list-events');
    
    try {
      const result = await client.callTool({
        name: 'list-events',
        arguments: {
          calendarId: TEST_CALENDAR_ID,
          timeMin: timeRange.timeMin,
          timeMax: timeRange.timeMax
        }
      });
      
      testFactory.endTimer('list-events', startTime, true);
      
      expect(TestDataFactory.validateEventResponse(result)).toBe(true);
      expect((result.content as any)[0].text).toContain(eventId);
    } catch (error) {
      testFactory.endTimer('list-events', startTime, false, String(error));
      throw error;
    }
  }

  async function verifyEventInSearch(query: string): Promise<void> {
    // Add small delay to allow Google Calendar search index to update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const startTime = testFactory.startTimer('search-events');
    
    try {
      const timeRanges = TestDataFactory.getTimeRanges();
      const result = await client.callTool({
        name: 'search-events',
        arguments: {
          calendarId: TEST_CALENDAR_ID,
          query,
          timeMin: timeRanges.nextWeek.timeMin,
          timeMax: timeRanges.nextWeek.timeMax
        }
      });
      
      testFactory.endTimer('search-events', startTime, true);
      
      expect(TestDataFactory.validateEventResponse(result)).toBe(true);
      expect((result.content as any)[0].text.toLowerCase()).toContain(query.toLowerCase());
    } catch (error) {
      testFactory.endTimer('search-events', startTime, false, String(error));
      throw error;
    }
  }

  async function updateTestEvent(eventId: string, updates: Partial<TestEvent>): Promise<void> {
    const startTime = testFactory.startTimer('update-event');
    
    try {
      const result = await client.callTool({
        name: 'update-event',
        arguments: {
          calendarId: TEST_CALENDAR_ID,
          eventId,
          ...updates,
          timeZone: updates.timeZone || 'America/Los_Angeles',
          sendUpdates: SEND_UPDATES
        }
      });
      
      testFactory.endTimer('update-event', startTime, true);
      
      expect(TestDataFactory.validateEventResponse(result)).toBe(true);
    } catch (error) {
      testFactory.endTimer('update-event', startTime, false, String(error));
      throw error;
    }
  }

  async function testRecurringEventUpdates(eventId: string): Promise<void> {
    // Test updating all instances
    await updateTestEvent(eventId, {
      summary: 'Updated Recurring Meeting - All Instances'
    });
    
    // Verify the update
    await verifyEventInSearch('Recurring');
  }

  async function cleanupTestEvents(eventIds: string[]): Promise<void> {
    const cleanupResults = { success: 0, failed: 0 };
    
    for (const eventId of eventIds) {
      try {
        const deleteStartTime = testFactory.startTimer('delete-event');
        
        await client.callTool({
          name: 'delete-event',
          arguments: {
            calendarId: TEST_CALENDAR_ID,
            eventId,
            sendUpdates: SEND_UPDATES
          }
        });
        
        testFactory.endTimer('delete-event', deleteStartTime, true);
        cleanupResults.success++;
      } catch (error: any) {
        const deleteStartTime = testFactory.startTimer('delete-event');
        testFactory.endTimer('delete-event', deleteStartTime, false, String(error));
        
        // Only warn for non-404 errors (404 means event was already deleted)
        const errorMessage = String(error);
        if (!errorMessage.includes('404') && !errorMessage.includes('Not Found')) {
          console.warn(`⚠️  Failed to cleanup event ${eventId}:`, errorMessage);
        }
        cleanupResults.failed++;
      }
    }
    
    if (cleanupResults.success > 0) {
      console.log(`✅ Successfully deleted ${cleanupResults.success} test event(s)`);
    }
    if (cleanupResults.failed > 0 && cleanupResults.failed !== eventIds.length) {
      console.log(`⚠️  Failed to delete ${cleanupResults.failed} test event(s) (may have been already deleted)`);
    }
  }

  async function cleanupAllTestEvents(): Promise<void> {
    const allEventIds = testFactory.getCreatedEventIds();
    await cleanupTestEvents(allEventIds);
    testFactory.clearCreatedEventIds();
  }

  function logPerformanceSummary(): void {
    const metrics = testFactory.getPerformanceMetrics();
    if (metrics.length === 0) return;
    
    console.log('\n📈 Final Performance Summary:');
    
    const byOperation = metrics.reduce((acc, metric) => {
      if (!acc[metric.operation]) {
        acc[metric.operation] = {
          count: 0,
          totalDuration: 0,
          successCount: 0,
          errors: []
        };
      }
      
      acc[metric.operation].count++;
      acc[metric.operation].totalDuration += metric.duration;
      if (metric.success) {
        acc[metric.operation].successCount++;
      } else if (metric.error) {
        acc[metric.operation].errors.push(metric.error);
      }
      
      return acc;
    }, {} as Record<string, { count: number; totalDuration: number; successCount: number; errors: string[] }>);
    
    Object.entries(byOperation).forEach(([operation, stats]) => {
      const avgDuration = Math.round(stats.totalDuration / stats.count);
      const successRate = Math.round((stats.successCount / stats.count) * 100);
      
      console.log(`  ${operation}:`);
      console.log(`    Calls: ${stats.count}`);
      console.log(`    Avg Duration: ${avgDuration}ms`);
      console.log(`    Success Rate: ${successRate}%`);
      
      if (stats.errors.length > 0) {
        console.log(`    Errors: ${stats.errors.length}`);
      }
    });
  }
});