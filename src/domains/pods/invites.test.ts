import { buildInviteLink, isInviteExpired } from "@/domains/pods/invites";

describe("invite rules", () => {
  it("detects expired invites", () => {
    expect(
      isInviteExpired(
        {
          expiresAt: "2026-04-16T09:00:00.000Z",
          revokedAt: null,
        },
        new Date("2026-04-16T10:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("builds invite links from pod id and token", () => {
    expect(
      buildInviteLink({ id: "pod-1" }, "invite-token", "https://famplan.app"),
    ).toBe("https://famplan.app/join/pod-1?token=invite-token");
  });
});
