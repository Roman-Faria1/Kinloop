import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/env";

export interface ViewerSession {
  userId: string;
  email: string | null;
}

export function getSafeRedirectPath(
  requestedPath: string | null | undefined,
  fallback = "/",
) {
  if (!requestedPath) return fallback;
  if (!requestedPath.startsWith("/")) return fallback;
  if (requestedPath.startsWith("//")) return fallback;
  return requestedPath;
}

export async function getViewerSession(): Promise<ViewerSession | null> {
  if (isDemoMode) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
  };
}
