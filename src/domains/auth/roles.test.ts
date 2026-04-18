import {
  canCreateEvents,
  canEditEvent,
  canInviteRole,
  canManageMembership,
} from "@/domains/auth/roles";

describe("role checks", () => {
  it("lets owners manage every membership", () => {
    expect(canManageMembership({ role: "owner" }, { role: "adult" })).toBe(true);
  });

  it("prevents adults from managing owners", () => {
    expect(canManageMembership({ role: "adult" }, { role: "owner" })).toBe(
      false,
    );
  });

  it("allows adults to create events", () => {
    expect(canCreateEvents({ role: "adult" })).toBe(true);
  });

  it("prevents adults from inviting another owner", () => {
    expect(canInviteRole({ role: "adult" }, "owner")).toBe(false);
  });

  it("lets owners invite adults", () => {
    expect(canInviteRole({ role: "owner" }, "adult")).toBe(true);
  });

  it("prevents adults from editing birthday events created by others", () => {
    expect(
      canEditEvent(
        { id: "membership-a", role: "adult" },
        { creatorMembershipId: "membership-b", eventKind: "birthday" },
      ),
    ).toBe(false);
  });
});
