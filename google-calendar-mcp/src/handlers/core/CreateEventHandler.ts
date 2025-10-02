import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { CreateEventInput } from "../../tools/registry.js";
import { BaseToolHandler } from "./BaseToolHandler.js";
import { calendar_v3 } from 'googleapis';
import { createEventResponseWithConflicts, formatConflictWarnings } from "../utils.js";
import { createTimeObject } from "../utils/datetime.js";
import { validateEventId } from "../../utils/event-id-validator.js";
import { ConflictDetectionService } from "../../services/conflict-detection/index.js";
import { CONFLICT_DETECTION_CONFIG } from "../../services/conflict-detection/config.js";

export class CreateEventHandler extends BaseToolHandler {
    private conflictDetectionService: ConflictDetectionService;
    
    constructor() {
        super();
        this.conflictDetectionService = new ConflictDetectionService();
    }
    
    async runTool(args: any, oauth2Client: OAuth2Client): Promise<CallToolResult> {
        const validArgs = args as CreateEventInput;
        
        // Create the event object for conflict checking
        const timezone = args.timeZone || await this.getCalendarTimezone(oauth2Client, validArgs.calendarId);
        const eventToCheck: calendar_v3.Schema$Event = {
            summary: args.summary,
            description: args.description,
            start: createTimeObject(args.start, timezone),
            end: createTimeObject(args.end, timezone),
            attendees: args.attendees,
            location: args.location,
        };
        
        // Check for conflicts and duplicates
        const conflicts = await this.conflictDetectionService.checkConflicts(
            oauth2Client,
            eventToCheck,
            validArgs.calendarId,
            {
                checkDuplicates: true,
                checkConflicts: true,
                calendarsToCheck: validArgs.calendarsToCheck || [validArgs.calendarId],
                duplicateSimilarityThreshold: validArgs.duplicateSimilarityThreshold || CONFLICT_DETECTION_CONFIG.DEFAULT_DUPLICATE_THRESHOLD
            }
        );
        
        // Block creation if exact or near-exact duplicate found
        const exactDuplicate = conflicts.duplicates.find(
            dup => dup.event.similarity >= CONFLICT_DETECTION_CONFIG.DUPLICATE_THRESHOLDS.BLOCKING
        );
        
        if (exactDuplicate && validArgs.allowDuplicates !== true) {
            
            // Format the duplicate details
            const duplicateDetails = formatConflictWarnings({
                hasConflicts: true,
                duplicates: [exactDuplicate],
                conflicts: []
            });
            
            // Remove the "POTENTIAL DUPLICATES DETECTED" header since we're blocking
            const cleanedDetails = duplicateDetails.replace('⚠️ POTENTIAL DUPLICATES DETECTED:', '').trim();
            
            const similarityPercentage = Math.round(exactDuplicate.event.similarity * 100);
            let blockMessage = `⚠️ DUPLICATE EVENT DETECTED (${similarityPercentage}% similar)!\n\n`;
            blockMessage += cleanedDetails;
            blockMessage += `\n\nThis event appears to be a duplicate. To create anyway, set allowDuplicates to true.`;
            
            return {
                content: [{
                    type: "text",
                    text: blockMessage
                }]
            };
        }
        
        // Create the event
        const event = await this.createEvent(oauth2Client, validArgs);
        
        // Generate response with conflict warnings
        const text = createEventResponseWithConflicts(event, validArgs.calendarId, conflicts, "created");
        
        return {
            content: [{
                type: "text",
                text: text
            }]
        };
    }

    private async createEvent(
        client: OAuth2Client,
        args: CreateEventInput
    ): Promise<calendar_v3.Schema$Event> {
        try {
            const calendar = this.getCalendar(client);
            
            // Validate custom event ID if provided
            if (args.eventId) {
                validateEventId(args.eventId);
            }
            
            // Use provided timezone or calendar's default timezone
            const timezone = args.timeZone || await this.getCalendarTimezone(client, args.calendarId);
            
            const requestBody: calendar_v3.Schema$Event = {
                summary: args.summary,
                description: args.description,
                start: createTimeObject(args.start, timezone),
                end: createTimeObject(args.end, timezone),
                attendees: args.attendees,
                location: args.location,
                colorId: args.colorId,
                reminders: args.reminders,
                recurrence: args.recurrence,
                transparency: args.transparency,
                visibility: args.visibility,
                guestsCanInviteOthers: args.guestsCanInviteOthers,
                guestsCanModify: args.guestsCanModify,
                guestsCanSeeOtherGuests: args.guestsCanSeeOtherGuests,
                anyoneCanAddSelf: args.anyoneCanAddSelf,
                conferenceData: args.conferenceData,
                extendedProperties: args.extendedProperties,
                attachments: args.attachments,
                source: args.source,
                ...(args.eventId && { id: args.eventId }) // Include custom ID if provided
            };
            
            // Determine if we need to enable conference data or attachments
            const conferenceDataVersion = args.conferenceData ? 1 : undefined;
            const supportsAttachments = args.attachments ? true : undefined;
            
            const response = await calendar.events.insert({
                calendarId: args.calendarId,
                requestBody: requestBody,
                sendUpdates: args.sendUpdates,
                ...(conferenceDataVersion && { conferenceDataVersion }),
                ...(supportsAttachments && { supportsAttachments })
            });
            
            if (!response.data) throw new Error('Failed to create event, no data returned');
            return response.data;
        } catch (error: any) {
            // Handle ID conflict errors specifically
            if (error?.code === 409 || error?.response?.status === 409) {
                throw new Error(`Event ID '${args.eventId}' already exists. Please use a different ID.`);
            }
            throw this.handleGoogleApiError(error);
        }
    }
}
