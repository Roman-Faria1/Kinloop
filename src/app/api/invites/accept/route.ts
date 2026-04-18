import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewerSession } from "@/domains/auth/session";
import {
  acceptInviteForViewer,
  PodServiceError,
} from "@/domains/pods/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

const acceptInviteSchema = z.object({
  podId: z.string().uuid(),
  token: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Invite acceptance is temporarily unavailable." },
      { status: 503 },
    );
  }

  const viewer = await getViewerSession();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in to accept an invite." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = acceptInviteSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "That invite link is incomplete." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Invite acceptance is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    const podId = await acceptInviteForViewer(adminClient, viewer, parsedBody.data);
    return NextResponse.json({ destination: `/pod/${podId}` });
  } catch (error) {
    if (error instanceof PodServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to accept that invite right now." },
      { status: 500 },
    );
  }
}
