"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  type PodRole,
  type ReminderOffsetMinutes,
} from "@/lib/types";
import { buildInviteLink, isInviteExpired } from "@/domains/pods/invites";
import { listUpcomingAgenda } from "@/domains/events/service";
import { canCreateEvents, canEditEvent, canInviteRole } from "@/domains/auth/roles";
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

function sortEvents(events: EventRecord[]) {
  return [...events].sort(
    (left, right) =>
      new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
  );
}

function toDateTimeLocalValue(isoString: string) {
  const value = new Date(isoString);

  if (Number.isNaN(value.getTime())) {
    return "";
  }

  const localValue = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return localValue.toISOString().slice(0, 16);
}

export function PodWorkspace({ initialData }: PodWorkspaceProps) {
  const router = useRouter();
  const [events, setEvents] = useState(initialData.events);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("2026-04-21T17:30");
  const [eventKind, setEventKind] =
    useState<EventRecord["eventKind"]>("quick_plan");
  const [offsetMinutes, setOffsetMinutes] =
    useState<ReminderOffsetMinutes>(15);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [cancellingEventId, setCancellingEventId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<PodRole>("member");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  useEffect(() => {
    setEvents(initialData.events);
  }, [initialData.events]);

  const dashboardData = useMemo(
    () => ({
      ...initialData,
      events,
    }),
    [events, initialData],
  );

  const agenda = useMemo(() => listUpcomingAgenda(dashboardData), [dashboardData]);
  const inviteRoleOptions = useMemo(
    () =>
      (["member", "adult", "owner"] as const).filter((role) =>
        canInviteRole(initialData.currentMembership, role),
      ),
    [initialData.currentMembership],
  );

  const resetEventComposer = () => {
    setEditingEventId(null);
    setTitle("");
    setNotes("");
    setLocation("");
    setStartsAt("2026-04-21T17:30");
    setEventKind("quick_plan");
    setOffsetMinutes(15);
  };

  const addEvent = () => {
    if (!title.trim()) return;

    const start = new Date(startsAt);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const nextEvent: EventRecord = {
      id: editingEventId ?? `local-${crypto.randomUUID()}`,
      podId: initialData.pod.id,
      creatorMembershipId: initialData.currentMembership.id,
      title: title.trim(),
      notes: notes.trim(),
      location: location.trim() || (eventKind === "quick_plan" ? "Shared family alert" : "TBD"),
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
      sortEvents(
        editingEventId
          ? current.map((event) => (event.id === editingEventId ? nextEvent : event))
          : [...current, nextEvent],
      ),
    );

    setEventStatus(
      editingEventId
        ? "Updated the shared agenda item in demo mode."
        : "Added the shared agenda item in demo mode.",
    );
    setEventError(null);
    resetEventComposer();
  };

  const startEditingEvent = (event: EventRecord) => {
    setEditingEventId(event.id);
    setTitle(event.title);
    setNotes(event.notes);
    setLocation(event.location ?? "");
    setStartsAt(toDateTimeLocalValue(event.startsAt));
    setEventKind(event.eventKind === "birthday" ? "standard" : event.eventKind);
    setOffsetMinutes(event.reminderRules[0]?.offsetMinutes ?? 15);
    setEventError(null);
    setEventStatus(null);
  };

  const submitEvent = async () => {
    if (!title.trim()) {
      setEventError("Add a title before saving.");
      return;
    }

    if (initialData.productReadiness.demoMode) {
      addEvent();
      return;
    }

    setEventError(null);
    setEventStatus(null);
    setIsSavingEvent(true);

    const parsedStart = new Date(startsAt);

    if (Number.isNaN(parsedStart.getTime())) {
      setEventError("Choose a valid start time before saving.");
      setIsSavingEvent(false);
      return;
    }

    const payload = {
      title,
      notes,
      location,
      startsAt: parsedStart.toISOString(),
      eventKind,
      reminderOffsetMinutes: offsetMinutes,
    };

    try {
      const response = await fetch(
        editingEventId
          ? `/api/pods/${initialData.pod.id}/events/${editingEventId}`
          : `/api/pods/${initialData.pod.id}/events`,
        {
          method: editingEventId ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(
            editingEventId
              ? {
                  action: "update",
                  ...payload,
                }
              : payload,
          ),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setEventError(result?.error ?? "Unable to save that event.");
        return;
      }

      setEventStatus(
        editingEventId
          ? "Updated the shared agenda item."
          : "Added the shared agenda item to the pod.",
      );
      resetEventComposer();
      router.refresh();
    } catch {
      setEventError("Unable to save that event.");
    } finally {
      setIsSavingEvent(false);
    }
  };

  const cancelEvent = async (eventId: string) => {
    if (initialData.productReadiness.demoMode) {
      setEvents((current) =>
        current.map((event) =>
          event.id === eventId ? { ...event, isCancelled: true } : event,
        ),
      );
      setEventStatus("Cancelled the agenda item in demo mode.");
      return;
    }

    setEventError(null);
    setEventStatus(null);
    setCancellingEventId(eventId);

    try {
      const response = await fetch(`/api/pods/${initialData.pod.id}/events/${eventId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "cancel" }),
      });

      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setEventError(result?.error ?? "Unable to cancel that event.");
        return;
      }

      if (editingEventId === eventId) {
        resetEventComposer();
      }

      setEventStatus("Cancelled the agenda item.");
      router.refresh();
    } catch {
      setEventError("Unable to cancel that event.");
    } finally {
      setCancellingEventId(null);
    }
  };

  const submitInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteError(null);
    setInviteStatus(null);
    setIsSubmittingInvite(true);

    try {
      const response = await fetch(`/api/pods/${initialData.pod.id}/invites`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setInviteError(result?.error ?? "Unable to create that invite.");
        return;
      }

      setInviteEmail("");
      setInviteRole("member");
      setInviteStatus("Invite created. The pending list will refresh now.");
      router.refresh();
    } catch {
      setInviteError("Unable to create that invite.");
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  const copyInviteLink = async (inviteId: string, token: string) => {
    try {
      const inviteLink = buildInviteLink(
        { id: initialData.pod.id },
        token,
        window.location.origin,
      );
      await navigator.clipboard.writeText(inviteLink);
      setCopiedInviteId(inviteId);
      window.setTimeout(() => setCopiedInviteId(null), 2500);
    } catch {
      setInviteError("Unable to copy that invite link right now.");
    }
  };

  const revokeInvite = async (inviteId: string) => {
    setRevokeError(null);
    setRevokingInviteId(inviteId);

    try {
      const response = await fetch(
        `/api/pods/${initialData.pod.id}/invites/${inviteId}/revoke`,
        {
          method: "POST",
        },
      );

      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setRevokeError(result?.error ?? "Unable to revoke that invite.");
        return;
      }

      router.refresh();
    } catch {
      setRevokeError("Unable to revoke that invite.");
    } finally {
      setRevokingInviteId(null);
    }
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

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Location</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Shared family alert, Nana's house, school gym..."
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
              onClick={() => void submitEvent()}
              disabled={
                !canCreateEvents(initialData.currentMembership) || isSavingEvent
              }
            >
              <Plus className="mr-2 size-4" />
              {isSavingEvent
                ? editingEventId
                  ? "Saving changes..."
                  : "Saving event..."
                : editingEventId
                  ? "Save changes"
                  : "Add to shared agenda"}
            </Button>
            {editingEventId ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={resetEventComposer}
              >
                Cancel editing
              </Button>
            ) : null}
            {eventStatus ? (
              <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {eventStatus}
              </p>
            ) : null}
            {eventError ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {eventError}
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
            {agenda.map((item) => {
              const event = events.find((currentEvent) => currentEvent.id === item.id);
              const canManageEvent = event
                ? canEditEvent(initialData.currentMembership, event)
                : false;

              return (
                <div
                  key={item.id}
                  className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
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
                  {event && canManageEvent ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => startEditingEvent(event)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={cancellingEventId === event.id}
                        onClick={() => void cancelEvent(event.id)}
                      >
                        {cancellingEventId === event.id ? "Cancelling..." : "Cancel"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
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
            {!initialData.productReadiness.demoMode &&
            inviteRoleOptions.length > 0 ? (
              <form
                className="space-y-3 rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4"
                onSubmit={submitInvite}
              >
                <p className="font-medium text-slate-900">Invite someone new</p>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">
                    Email address
                  </span>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-emerald-500"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="cousin@example.com"
                    required
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Role</span>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-emerald-500"
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.target.value as typeof inviteRole)
                    }
                  >
                    {inviteRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>

                <Button className="w-full" disabled={isSubmittingInvite}>
                  {isSubmittingInvite ? "Creating invite..." : "Create invite"}
                </Button>

                {inviteStatus ? (
                  <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    {inviteStatus}
                  </p>
                ) : null}

                {inviteError ? (
                  <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    {inviteError}
                  </p>
                ) : null}
              </form>
            ) : null}

            {initialData.invites.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No pending invites yet.
              </div>
            ) : null}

            {initialData.invites.map((invite) => (
              <div
                key={invite.id}
                className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900">{invite.email}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {isInviteExpired(invite)
                        ? "Invite is no longer active"
                        : `Invite expires ${new Date(invite.expiresAt).toLocaleString()}`}
                    </p>
                  </div>
                  <Badge>{invite.role}</Badge>
                </div>
                {!initialData.productReadiness.demoMode && !isInviteExpired(invite) ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void copyInviteLink(invite.id, invite.token)}
                    >
                      {copiedInviteId === invite.id ? "Copied" : "Copy join link"}
                    </Button>
                    {inviteRoleOptions.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={revokingInviteId === invite.id}
                        onClick={() => void revokeInvite(invite.id)}
                      >
                        {revokingInviteId === invite.id
                          ? "Revoking..."
                          : "Revoke invite"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}

            {revokeError ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {revokeError}
              </p>
            ) : null}

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
                <li>Persistent event create, edit, and cancel flows</li>
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
                <li>Reminder delivery orchestration on event writes</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
