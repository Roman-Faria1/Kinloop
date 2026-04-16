import { createDemoDashboardData } from "@/lib/demo/data";
import { isDemoMode } from "@/lib/env";
import type { DashboardData } from "@/lib/types";

export async function getDashboardData(podId = "pod-sunrise"): Promise<DashboardData> {
  void podId;

  if (isDemoMode) {
    return createDemoDashboardData();
  }

  // Real repositories will use Supabase + Drizzle once credentials are configured.
  return createDemoDashboardData();
}
