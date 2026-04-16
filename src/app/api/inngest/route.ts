import { serve } from "inngest/next";
import { scheduleEventReminders } from "@/domains/notifications/workflows";
import { inngest } from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scheduleEventReminders],
});
