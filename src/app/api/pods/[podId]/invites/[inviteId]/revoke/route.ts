import { NextResponse } from "next/server";
import { getViewerSession } from "@/domains/auth/session";
import {
  PodServiceError,
  revokeInviteForPod,
} from "@/domains/pods/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

export async function POST(
  _request: Request,
  context: { params: Promise<{ podId: string; inviteId: string }> },
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

  const { inviteId, podId } = await context.params;
  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Invite management is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    await revokeInviteForPod(adminClient, viewer, { podId, inviteId });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof PodServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to revoke that invite right now." },
      { status: 500 },
    );
  }
}
