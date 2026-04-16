import { inngest } from "@/lib/inngest";
import {
  buildReminderSchedule,
  createDeliveryDedupeKey,
} from "@/domains/reminders/service";

export const scheduleEventReminders = inngest.createFunction(
  {
    id: "schedule-event-reminders",
    name: "Schedule Event Reminders",
    triggers: [{ event: "famplan/events.created" }],
  },
  async ({ event }) => {
    const schedules = buildReminderSchedule(event.data.event);

    return schedules.map((schedule) => ({
      dedupeKey: createDeliveryDedupeKey({
        eventId: event.data.event.id,
        membershipId: event.data.membershipId,
        channel: event.data.channel,
        scheduledFor: schedule.scheduledFor.toISOString(),
      }),
      scheduledFor: schedule.scheduledFor.toISOString(),
    }));
  },
);
