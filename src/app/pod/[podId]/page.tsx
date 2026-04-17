import { notFound, redirect } from "next/navigation";
import { PodWorkspace } from "@/components/dashboard/pod-workspace";
import { getDashboardData } from "@/domains/pods/repository";
import { isDemoMode } from "@/lib/env";

export default async function PodPage({
  params,
}: {
  params: Promise<{ podId: string }>;
}) {
  const { podId } = await params;

  if (isDemoMode && podId !== "pod-sunrise") {
    notFound();
  }

  const data = await getDashboardData(podId);
  if (!data) {
    redirect(`/sign-in?next=/pod/${podId}`);
  }

  return <PodWorkspace initialData={data} />;
}
