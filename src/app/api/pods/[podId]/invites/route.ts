import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewerSession } from "@/domains/auth/session";
import {
  createInviteForPod,
  PodServiceError,
} from "@/domains/pods/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "adult", "member"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ podId: string }> },
) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Invite management is temporarily unavailable." },
      { status: 503 },
    );
  }

  const viewer = await getViewerSession();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in to manage invites." }, { status: 401 });
  }

  const { podId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsedBody = createInviteSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Enter a valid email address and role." },
      { status: 400 },
    );
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Invite management is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    const invite = await createInviteForPod(adminClient, viewer, {
      podId,
      email: parsedBody.data.email,
      role: parsedBody.data.role,
    });

    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    if (error instanceof PodServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to create that invite right now." },
      { status: 500 },
    );
  }
}
