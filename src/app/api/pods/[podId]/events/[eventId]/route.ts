import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewerSession } from "@/domains/auth/session";
import {
  cancelEventForPod,
  EventMutationError,
  updateEventForPod,
} from "@/domains/events/mutations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  REMINDER_OFFSET_MINUTES,
  type ReminderOffsetMinutes,
} from "@/lib/types";

const updateEventSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    title: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(2000).default(""),
    location: z.string().trim().max(200).optional().nullable(),
    startsAt: z.string().datetime({ offset: true }),
    eventKind: z.enum(["standard", "quick_plan"]),
    reminderOffsetMinutes: z.coerce
      .number()
      .refine((value) =>
        REMINDER_OFFSET_MINUTES.includes(
          value as (typeof REMINDER_OFFSET_MINUTES)[number],
        ),
      ),
  }),
  z.object({
    action: z.literal("cancel"),
  }),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ podId: string; eventId: string }> },
) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Event management is temporarily unavailable." },
      { status: 503 },
    );
  }

  const viewer = await getViewerSession();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in to manage events." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = updateEventSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Enter valid event details before saving." },
      { status: 400 },
    );
  }

  const { podId, eventId } = await context.params;
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return NextResponse.json(
      { error: "Event management is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    if (parsedBody.data.action === "cancel") {
      await cancelEventForPod(adminClient, viewer, { podId, eventId });
      return NextResponse.json({ eventId });
    }

    await updateEventForPod(adminClient, viewer, {
      podId,
      eventId,
      title: parsedBody.data.title,
      notes: parsedBody.data.notes,
      location: parsedBody.data.location,
      startsAt: parsedBody.data.startsAt,
      eventKind: parsedBody.data.eventKind,
      reminderOffsetMinutes:
        parsedBody.data.reminderOffsetMinutes as ReminderOffsetMinutes,
    });

    return NextResponse.json({ eventId });
  } catch (error) {
    if (error instanceof EventMutationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to update that event right now." },
      { status: 500 },
    );
  }
}
