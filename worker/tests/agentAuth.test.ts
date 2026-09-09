import { describe, it, expect } from "vitest";
import { isAuthorizedAgentRequest, isTokenStrongEnough, MIN_AGENT_TOKEN_LENGTH } from "../src/agentAuth";

const SECRET = "s3cret-agent-token-long-enough-x";

describe("isAuthorizedAgentRequest", async () => {
  it("accepts a matching bearer token", async () => {
    expect(await isAuthorizedAgentRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a missing header", async () => {
    expect(await isAuthorizedAgentRequest(null, SECRET)).toBe(false);
  });

  it("rejects a wrong token", async () => {
    expect(await isAuthorizedAgentRequest("Bearer wrong-token", SECRET)).toBe(false);
  });

  it("rejects a token that is a prefix of the secret", async () => {
    expect(await isAuthorizedAgentRequest(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
  });

  it("rejects a non-bearer scheme", async () => {
    expect(await isAuthorizedAgentRequest(`Basic ${SECRET}`, SECRET)).toBe(false);
  });

  it("accepts a lowercase scheme (RFC 7235 makes the scheme case-insensitive)", async () => {
    expect(await isAuthorizedAgentRequest(`bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects everything when the expected secret is empty, so an unconfigured worker never authorizes", async () => {
    expect(await isAuthorizedAgentRequest("Bearer ", "")).toBe(false);
    expect(await isAuthorizedAgentRequest("Bearer anything", "")).toBe(false);
  });

  it("rejects a header with no token after the scheme", async () => {
    expect(await isAuthorizedAgentRequest("Bearer", SECRET)).toBe(false);
  });

  it("rejects a same-length wrong token (the digest compare must not be length-only)", async () => {
    const sameLength = "x".repeat(SECRET.length);
    expect(sameLength).toHaveLength(SECRET.length);
    expect(await isAuthorizedAgentRequest(`Bearer ${sameLength}`, SECRET)).toBe(false);
  });
});

describe("isTokenStrongEnough", async () => {
  it("requires at least MIN_AGENT_TOKEN_LENGTH characters", async () => {
    expect(isTokenStrongEnough("x".repeat(MIN_AGENT_TOKEN_LENGTH))).toBe(true);
    expect(isTokenStrongEnough("x".repeat(MIN_AGENT_TOKEN_LENGTH - 1))).toBe(false);
  });

  it("rejects an empty token", async () => {
    expect(isTokenStrongEnough("")).toBe(false);
  });
});
