describe("magic link helpers", () => {
  const originalSalt = process.env.AUTH_RATE_LIMIT_SALT;

  async function loadMagicLinkHelpers() {
    vi.resetModules();
    process.env.AUTH_RATE_LIMIT_SALT = "test-auth-rate-limit-salt";
    return import("@/domains/auth/magic-links");
  }

  afterEach(() => {
    if (originalSalt === undefined) {
      delete process.env.AUTH_RATE_LIMIT_SALT;
      return;
    }

    process.env.AUTH_RATE_LIMIT_SALT = originalSalt;
  });

  it("normalizes emails before comparisons", async () => {
    const { normalizeEmail } = await loadMagicLinkHelpers();
    expect(normalizeEmail("  Person@Example.com ")).toBe("person@example.com");
  });

  it("hashes identifiers deterministically", async () => {
    const { hashIdentifier } = await loadMagicLinkHelpers();
    expect(hashIdentifier("person@example.com")).toBe(
      hashIdentifier("person@example.com"),
    );
  });

  it("detects rate limiting thresholds", async () => {
    const { isMagicLinkRateLimited } = await loadMagicLinkHelpers();
    expect(
      isMagicLinkRateLimited({ emailAttempts: 4, ipAttempts: 0 }),
    ).toBe(true);
    expect(
      isMagicLinkRateLimited({ emailAttempts: 0, ipAttempts: 3 }),
    ).toBe(false);
  });

  it("extracts the first forwarded ip", async () => {
    const { getClientIp } = await loadMagicLinkHelpers();
    const headers = new Headers({
      "x-forwarded-for": "10.0.0.1, 10.0.0.2",
    });

    expect(getClientIp(headers)).toBe("10.0.0.1");
  });
});
