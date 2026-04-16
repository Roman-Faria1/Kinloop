import { listUpcomingAgenda } from "@/domains/events/service";
import { createDemoDashboardData } from "@/lib/demo/data";

describe("agenda assembly", () => {
  it("includes birthdays generated from profiles", () => {
    const agenda = listUpcomingAgenda(
      createDemoDashboardData(),
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(agenda.some((item) => item.eventKind === "birthday")).toBe(true);
  });

  it("keeps quick plans in the agenda", () => {
    const agenda = listUpcomingAgenda(
      createDemoDashboardData(),
      new Date("2026-04-16T00:00:00.000Z"),
    );

    expect(
      agenda.some((item) => item.title === "Ice cream after soccer?"),
    ).toBe(true);
  });
});
