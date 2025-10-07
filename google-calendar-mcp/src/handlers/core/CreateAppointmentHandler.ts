import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { BaseToolHandler } from "./BaseToolHandler.js";
import { calendar_v3 } from "googleapis";
import { createTimeObject } from "../utils/datetime.js";
import { appendFileSync } from "fs";

interface CreateAppointmentInput {
  calendarId: string;
  patientName: string;
  dob: string; // YYYY-MM-DD
  reason: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  durationMins?: number;
  provider?: string;
  location?: string;
  notes?: string;
  contactPhone?: string;
  contactEmail?: string;
  timeZone?: string;
}

function toIsoLocal(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  const hours = String(dt.getHours()).padStart(2, "0");
  const minutes = String(dt.getMinutes()).padStart(2, "0");
  const seconds = "00";
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export class CreateAppointmentHandler extends BaseToolHandler {
  async runTool(args: any, oauth2Client: OAuth2Client): Promise<CallToolResult> {
    const input = args as CreateAppointmentInput;

    const duration = Math.max(15, Math.min(480, input.durationMins || 30));
    const startNaive = toIsoLocal(input.date, input.time);
    const startTz = input.timeZone || (await this.getCalendarTimezone(oauth2Client, input.calendarId));

    const startObj = createTimeObject(startNaive, startTz);

    const startDate = new Date(`${startNaive}${startObj.timeZone ? '' : 'Z'}`);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    const endNaive = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}:00`;
    const endObj = createTimeObject(endNaive, startTz);

    const summaryParts = ["Appointment", input.patientName];
    if (input.provider) summaryParts.push(`with ${input.provider}`);
    const summary = summaryParts.join(" ");

    const notesLines = [
      `Patient: ${input.patientName}`,
      `DOB: ${input.dob}`,
      `Reason: ${input.reason}`,
      input.provider ? `Provider: ${input.provider}` : undefined,
      input.location ? `Location: ${input.location}` : undefined,
      input.contactPhone ? `Phone: ${input.contactPhone}` : undefined,
      input.contactEmail ? `Email: ${input.contactEmail}` : undefined,
      input.notes ? `Notes: ${input.notes}` : undefined
    ].filter(Boolean) as string[];

    const description = notesLines.join("\n");

    const calendar = this.getCalendar(oauth2Client);
    const requestBody: calendar_v3.Schema$Event = {
      summary,
      description,
      start: startObj,
      end: endObj,
      location: input.location,
      extendedProperties: {
        private: {
          patientName: input.patientName,
          dob: input.dob,
          reason: input.reason,
          provider: input.provider || "",
          contactPhone: input.contactPhone || "",
          contactEmail: input.contactEmail || ""
        }
      }
    };

    const response = await calendar.events.insert({
      calendarId: input.calendarId,
      requestBody
    });

    if (!response.data) {
      throw new Error("Failed to create appointment - no data returned");
    }

    try {
      const logLine = JSON.stringify({
        ts: new Date().toISOString(),
        patientName: input.patientName,
        dob: input.dob,
        reason: input.reason,
        provider: input.provider,
        location: input.location,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        notes: input.notes,
        calendarId: input.calendarId,
        start: startObj.dateTime || startObj.date,
        end: endObj.dateTime || endObj.date,
        eventId: response.data.id,
        htmlLink: response.data.htmlLink
      });
      appendFileSync("appointments.log.jsonl", logLine + "\n");
    } catch {}

    const link = response.data.htmlLink || "";
    const text = `✅ Appointment created:\n${summary}\n${input.date} ${input.time} (${duration} mins)\n${input.location || ""}\n${link}`.trim();
    return { content: [{ type: "text", text }] };
  }
}


