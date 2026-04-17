import {
  getClientIp,
  hashIdentifier,
  isMagicLinkRateLimited,
  normalizeEmail,
} from "@/domains/auth/magic-links";

describe("magic link helpers", () => {
  it("normalizes emails before comparisons", () => {
    expect(normalizeEmail("  Person@Example.com ")).toBe("person@example.com");
  });

  it("hashes identifiers deterministically", () => {
    expect(hashIdentifier("person@example.com")).toBe(
      hashIdentifier("person@example.com"),
    );
  });

  it("detects rate limiting thresholds", () => {
    expect(
      isMagicLinkRateLimited({ emailAttempts: 4, ipAttempts: 0 }),
    ).toBe(true);
    expect(
      isMagicLinkRateLimited({ emailAttempts: 0, ipAttempts: 3 }),
    ).toBe(false);
  });

  it("extracts the first forwarded ip", () => {
    const headers = new Headers({
      "x-forwarded-for": "10.0.0.1, 10.0.0.2",
    });

    expect(getClientIp(headers)).toBe("10.0.0.1");
  });
});
