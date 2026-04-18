import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewerSession } from "@/domains/auth/session";
import {
  createPodForViewer,
  PodServiceError,
} from "@/domains/pods/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

const createPodSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
});

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Pod management is temporarily unavailable." },
      { status: 503 },
    );
  }

  const viewer = await getViewerSession();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in to create a pod." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = createPodSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Enter a pod name and timezone to continue." },
      { status: 400 },
    );
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Pod management is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    const podId = await createPodForViewer(adminClient, viewer, parsedBody.data);
    return NextResponse.json({ destination: `/pod/${podId}` }, { status: 201 });
  } catch (error) {
    if (error instanceof PodServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to create your pod right now." },
      { status: 500 },
    );
  }
}
