import Link from "next/link";
import { ArrowRight, BellRing, CalendarDays, MapPinned, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewerSession } from "@/domains/auth/session";
import { getViewerHomePath } from "@/domains/pods/repository";
import { isDemoMode } from "@/lib/env";
import { cn } from "@/lib/utils";

const featureCards = [
  {
    icon: CalendarDays,
    title: "Agenda first",
    body: "Prioritize the next family actions over a month grid that hides what is urgent.",
  },
  {
    icon: BellRing,
    title: "Short-notice alerts",
    body: "Model quick activities as immediate family prompts instead of making them disappear in chat.",
  },
  {
    icon: MapPinned,
    title: "Real-life context",
    body: "Store birthdays and mailing addresses where people actually expect to find them.",
  },
  {
    icon: Users,
    title: "Pod-based roles",
    body: "Keep the product simple for one household today while staying clean enough for future scaling.",
  },
];

export default async function Home() {
  const viewer = await getViewerSession();
  const homePath = viewer ? await getViewerHomePath(viewer) : "/sign-in";

  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_top_left,#e3f7ec,transparent_36%),radial-gradient(circle_at_top_right,#fff0c9,transparent_24%),linear-gradient(180deg,#f8f6ef_0%,#f2efe5_100%)]" />

      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center gap-10 px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-6">
          <Badge variant="success">
            Family coordination
          </Badge>
          <div className="space-y-5">
            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-7xl">
              A family coordination layer for plans that are too important to forget.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              FamPlan is designed around the pain a shared calendar misses:
              short-notice activities, birthdays, mailing addresses, and the
              everyday family logistics that should not require scrolling old
              text threads.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {isDemoMode ? (
              <Link
                href="/pod/pod-sunrise"
                className={cn(buttonVariants(), "px-5")}
              >
                Open the demo pod
                <ArrowRight className="ml-2 size-4" />
              </Link>
            ) : (
              <Link href={homePath} className={cn(buttonVariants(), "px-5")}>
                {viewer ? "Open your pod" : "Sign in with email"}
                <ArrowRight className="ml-2 size-4" />
              </Link>
            )}
            <div className="flex items-center rounded-full bg-white/70 px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
              {isDemoMode
                ? "Running in demo mode until Supabase is configured"
                : viewer
                  ? `Signed in as ${viewer.email ?? "family member"}`
                  : "Live backend configured"}
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {featureCards.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <feature.icon className="size-6 text-emerald-700" />
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-600">{feature.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
