import { getSafeRedirectPath } from "@/domains/auth/session";

describe("auth session helpers", () => {
  it("keeps safe relative redirect paths", () => {
    expect(getSafeRedirectPath("/pod/pod-sunrise")).toBe("/pod/pod-sunrise");
  });

  it("rejects external redirect targets", () => {
    expect(getSafeRedirectPath("https://example.com", "/sign-in")).toBe(
      "/sign-in",
    );
  });

  it("rejects protocol-relative redirect targets", () => {
    expect(getSafeRedirectPath("//evil.example", "/sign-in")).toBe("/sign-in");
  });
});
