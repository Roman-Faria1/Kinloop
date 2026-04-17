"use client";

import { useMemo, useState } from "react";
import {
  BellRing,
  CalendarDays,
  Clock3,
  Mail,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  REMINDER_OFFSET_MINUTES,
  type DashboardData,
  type EventRecord,
  type ReminderOffsetMinutes,
} from "@/lib/types";
import { listUpcomingAgenda } from "@/domains/events/service";
import { canCreateEvents } from "@/domains/auth/roles";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { formatAddress } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PodWorkspaceProps {
  initialData: DashboardData;
}

const reminderOptions = [...REMINDER_OFFSET_MINUTES];

export function PodWorkspace({ initialData }: PodWorkspaceProps) {
  const [events, setEvents] = useState(initialData.events);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startsAt, setStartsAt] = useState("2026-04-21T17:30");
  const [eventKind, setEventKind] =
    useState<EventRecord["eventKind"]>("quick_plan");
  const [offsetMinutes, setOffsetMinutes] =
    useState<ReminderOffsetMinutes>(15);

  const dashboardData = useMemo(
    () => ({
      ...initialData,
      events,
    }),
    [events, initialData],
  );

  const agenda = useMemo(() => listUpcomingAgenda(dashboardData), [dashboardData]);

  const addEvent = () => {
    if (!initialData.productReadiness.demoMode) return;
    if (!title.trim()) return;

    const start = new Date(startsAt);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const nextEvent: EventRecord = {
      id: `local-${crypto.randomUUID()}`,
      podId: initialData.pod.id,
      creatorMembershipId: initialData.currentMembership.id,
      title: title.trim(),
      notes: notes.trim(),
      location: eventKind === "quick_plan" ? "Shared family alert" : "TBD",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      timezone: initialData.pod.timezone,
      eventKind,
      isCancelled: false,
      reminderRules: [
        {
          id: `local-reminder-${offsetMinutes}`,
          offsetMinutes,
        },
      ],
      assignments: [],
    };

    setEvents((current) =>
      [...current, nextEvent].sort(
        (left, right) =>
          new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
      ),
    );

    setTitle("");
    setNotes("");
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,#11302a_0%,#225f52_45%,#f4f0e8_45%,#f8f6ef_100%)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
            <div className="space-y-5 text-white">
              <Badge variant="success" className="bg-white/15 text-white">
                Family coordination layer
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-xl font-sans text-4xl font-semibold tracking-tight sm:text-5xl">
                  {initialData.pod.name} keeps plans visible before they become
                  forgotten texts.
                </h1>
                <p className="max-w-lg text-base leading-7 text-emerald-50/85">
                  Agenda-first on mobile, shared profile details for real life
                  logistics, and immediate alerts for the quick plans that never
                  make it onto a normal calendar.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <Badge className="bg-white/15 text-white">
                  UTC storage + pod timezone
                </Badge>
                <Badge className="bg-white/15 text-white">
                  RLS-ready data model
                </Badge>
                <Badge className="bg-white/15 text-white">
                  Push + email reminder shape
                </Badge>
              </div>
            </div>

            <div className="rounded-[1.75rem] bg-white/90 p-5 text-slate-900 shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Current pod summary
              </p>
              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">Timezone</dt>
                  <dd className="font-medium">{initialData.pod.timezone}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">Members</dt>
                  <dd className="font-medium">{initialData.memberships.length}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">Upcoming items</dt>
                  <dd className="font-medium">{agenda.length}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">Demo mode</dt>
                  <dd className="font-medium">
                    {initialData.productReadiness.demoMode ? "On" : "Off"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">Viewer</dt>
                  <dd className="font-medium">{initialData.viewer.email ?? "Signed in"}</dd>
                </div>
              </dl>
              <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-4 text-sm text-slate-100">
                <div>
                  <p className="font-medium">Immediate pain solved</p>
                  <p className="mt-1 text-slate-300">
                    One family spot for birthdays, addresses, event ownership,
                    and short-notice activity alerts.
                  </p>
                </div>
                {!initialData.productReadiness.demoMode ? <SignOutButton /> : null}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Quick plan composer</CardTitle>
              <Badge variant="accent">Mobile-first</Badge>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              This is the action FamPlan should make easier than Google Calendar.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Title</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Dinner at Nana's, carpool swap, school pickup..."
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">When</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Type</span>
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500"
                  value={eventKind}
                  onChange={(event) =>
                    setEventKind(event.target.value as EventRecord["eventKind"])
                  }
                >
                  <option value="quick_plan">Quick plan</option>
                  <option value="standard">Standard event</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  Reminder
                </span>
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500"
                  value={offsetMinutes}
                  onChange={(event) =>
                    setOffsetMinutes(
                      Number(event.target.value) as ReminderOffsetMinutes,
                    )
                  }
                >
                  {reminderOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === 1440 ? "1 day before" : `${option} minutes before`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Notes</span>
              <textarea
                className="min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add enough detail so nobody has to chase context in a text thread."
              />
            </label>

            <Button
              className="w-full"
              onClick={addEvent}
              disabled={
                !canCreateEvents(initialData.currentMembership) ||
                !initialData.productReadiness.demoMode
              }
            >
              <Plus className="mr-2 size-4" />
              {initialData.productReadiness.demoMode
                ? "Add to shared agenda"
                : "Event writes land in the next branch"}
            </Button>
            {!initialData.productReadiness.demoMode ? (
              <p className="text-sm text-slate-500">
                This branch wires real authentication and dashboard persistence.
                Event mutations are next so we do not fake successful writes.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Upcoming agenda</CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Agenda is the default mobile view so families can see what
                  matters next without thinking in month grids.
                </p>
              </div>
              <CalendarDays className="size-5 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {agenda.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <Badge
                      variant={
                        item.eventKind === "quick_plan"
                          ? "accent"
                          : item.eventKind === "birthday"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {item.badge}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">{item.subtitle}</p>
                </div>
                <p className="shrink-0 text-xs uppercase tracking-[0.2em] text-slate-400">
                  {formatDistanceToNowStrict(new Date(item.startsAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Reminder pipeline</CardTitle>
              <BellRing className="size-5 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {initialData.deliveries.map((delivery) => {
              const member = initialData.memberships.find(
                (membership) => membership.id === delivery.membershipId,
              );
              const event = events.find(
                (currentEvent) => currentEvent.id === delivery.eventId,
              );

              return (
                <div
                  key={delivery.id}
                  className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-slate-900">{event?.title}</p>
                    <Badge variant={delivery.status === "sent" ? "success" : "neutral"}>
                      {delivery.status}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p>
                      {delivery.channel === "push" ? "Push" : "Email"} to{" "}
                      {member?.profile.displayName}
                    </p>
                    <p>Scheduled for {new Date(delivery.scheduledFor).toLocaleString()}</p>
                    <p className="truncate text-xs text-slate-400">
                      {delivery.dedupeKey}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Family directory</CardTitle>
              <Users className="size-5 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {initialData.memberships.map((membership) => (
              <div
                key={membership.id}
                className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`mt-1 flex size-11 items-center justify-center rounded-full text-sm font-semibold text-white ${membership.profile.avatarColor}`}
                  >
                    {membership.profile.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900">
                        {membership.profile.displayName}
                      </p>
                      <Badge>{membership.role}</Badge>
                    </div>
                    <p className="text-sm text-slate-600">
                      {membership.profile.relationshipLabel} •{" "}
                      {membership.profile.email}
                    </p>
                    <div className="space-y-1 text-sm text-slate-600">
                      <p>Birthday: {membership.profile.birthday ?? "Not added yet"}</p>
                      <p className="flex gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                        <span>{formatAddress(membership.profile.mailingAddress)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Invites and roles</CardTitle>
              <Mail className="size-5 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {initialData.invites.map((invite) => (
              <div
                key={invite.id}
                className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900">{invite.email}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Invite expires {new Date(invite.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge>{invite.role}</Badge>
                </div>
              </div>
            ))}

            <div className="rounded-[1.5rem] bg-slate-950 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Role model for v1</p>
              <p className="mt-2 leading-6 text-slate-300">
                Owners manage the pod. Adults create and edit standard events.
                Members can follow the shared agenda without full admin friction.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Execution checklist</CardTitle>
              <Clock3 className="size-5 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4">
              <p className="font-medium text-emerald-900">Implemented now</p>
              <ul className="mt-2 space-y-2 leading-6">
                <li>Next.js app shell with agenda-first workspace</li>
                <li>Domain model, Drizzle schema, and SQL migration</li>
                <li>Reminder scheduling logic and Inngest endpoint</li>
                <li>Tests for reminder, invite, role, and birthday behavior</li>
              </ul>
            </div>
            <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50 p-4">
              <p className="font-medium text-amber-900">
                Needs real credentials next
              </p>
              <ul className="mt-2 space-y-2 leading-6">
                <li>Supabase project and auth wiring</li>
                <li>Web push subscription storage</li>
                <li>Resend domain verification</li>
                <li>Server actions for persistent event mutations</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
