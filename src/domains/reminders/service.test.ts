import {
  buildReminderSchedule,
  computeReminderTimestamp,
  createDeliveryDedupeKey,
  isDuplicateDelivery,
  reminderOffsetToMs,
} from "@/domains/reminders/service";

describe("reminder service", () => {
  it("converts reminder offsets to milliseconds", () => {
    expect(reminderOffsetToMs(15)).toBe(900000);
  });

  it("computes reminder timestamps from event start times", () => {
    expect(
      computeReminderTimestamp("2026-04-20T18:00:00.000Z", 60).toISOString(),
    ).toBe("2026-04-20T17:00:00.000Z");
  });

  it("builds a schedule for every reminder rule", () => {
    const schedule = buildReminderSchedule({
      startsAt: "2026-04-20T18:00:00.000Z",
      reminderRules: [
        { id: "one", offsetMinutes: 15 },
        { id: "two", offsetMinutes: 1440 },
      ],
    });

    expect(schedule).toHaveLength(2);
    expect(schedule[0].scheduledFor.toISOString()).toBe(
      "2026-04-20T17:45:00.000Z",
    );
  });

  it("dedupes notification deliveries", () => {
    const key = createDeliveryDedupeKey({
      eventId: "event-1",
      membershipId: "membership-1",
      channel: "push",
      scheduledFor: "2026-04-20T17:45:00.000Z",
    });

    expect(
      isDuplicateDelivery(key, [{ dedupeKey: key }, { dedupeKey: "other-key" }]),
    ).toBe(true);
  });
});
