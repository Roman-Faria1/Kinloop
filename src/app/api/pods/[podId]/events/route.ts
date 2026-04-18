import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewerSession } from "@/domains/auth/session";
import {
  createEventForPod,
  EventMutationError,
} from "@/domains/events/mutations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  REMINDER_OFFSET_MINUTES,
  type ReminderOffsetMinutes,
} from "@/lib/types";

const createEventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).default(""),
  location: z.string().trim().max(200).optional().nullable(),
  startsAt: z.string().datetime({ offset: true }),
  eventKind: z.enum(["standard", "quick_plan"]),
  reminderOffsetMinutes: z.coerce
    .number()
    .refine((value) => REMINDER_OFFSET_MINUTES.includes(value as (typeof REMINDER_OFFSET_MINUTES)[number])),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ podId: string }> },
) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Event management is temporarily unavailable." },
      { status: 503 },
    );
  }

  const viewer = await getViewerSession();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in to create an event." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = createEventSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Enter a title, start time, and valid reminder." },
      { status: 400 },
    );
  }

  const { podId } = await context.params;
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return NextResponse.json(
      { error: "Event management is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    const eventId = await createEventForPod(adminClient, viewer, {
      podId,
      ...parsedBody.data,
      reminderOffsetMinutes:
        parsedBody.data.reminderOffsetMinutes as ReminderOffsetMinutes,
    });

    return NextResponse.json({ eventId }, { status: 201 });
  } catch (error) {
    if (error instanceof EventMutationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to save that event right now." },
      { status: 500 },
    );
  }
}
