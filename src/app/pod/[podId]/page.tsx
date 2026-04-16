import { notFound } from "next/navigation";
import { PodWorkspace } from "@/components/dashboard/pod-workspace";
import { getDashboardData } from "@/lib/demo/repository";

export default async function PodPage({
  params,
}: {
  params: Promise<{ podId: string }>;
}) {
  const { podId } = await params;

  if (podId !== "pod-sunrise") {
    notFound();
  }

  const data = await getDashboardData(podId);

  return <PodWorkspace initialData={data} />;
}
