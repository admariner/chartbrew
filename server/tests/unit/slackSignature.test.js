import {
  afterEach, describe, expect, it, vi
} from "vitest";
import crypto from "crypto";

const { verifySignature } = require("../../apps/slack/utils/slackClient");

function createSignedRequest(body, signingSecret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;

  return {
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": `${timestamp}`,
      "x-slack-signature": signature,
    },
    rawBody: body,
    body: JSON.parse(body),
  };
}

describe("Slack signature verification", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects requests when the signing secret is not configured", () => {
    vi.stubEnv("CB_SLACK_SIGNING_SECRET", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(verifySignature({ headers: {}, body: {} })).toBe(false);
  });

  it("rejects requests without Slack signature headers", () => {
    vi.stubEnv("CB_SLACK_SIGNING_SECRET", "signing-secret");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(verifySignature({ headers: {}, body: { type: "event_callback" } })).toBe(false);
  });

  it("accepts a valid signature over the raw request body", () => {
    const signingSecret = "signing-secret";
    vi.stubEnv("CB_SLACK_SIGNING_SECRET", signingSecret);
    const request = createSignedRequest(
      JSON.stringify({ type: "event_callback", event: { type: "app_mention" } }),
      signingSecret
    );

    expect(verifySignature(request)).toBe(true);
  });

  it("rejects invalid signatures even outside production", () => {
    vi.stubEnv("CB_SLACK_SIGNING_SECRET", "signing-secret");
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = createSignedRequest(
      JSON.stringify({ type: "event_callback", event: { type: "app_mention" } }),
      "wrong-secret"
    );

    expect(verifySignature(request)).toBe(false);
  });

  it("rejects expired signatures", () => {
    const signingSecret = "signing-secret";
    vi.stubEnv("CB_SLACK_SIGNING_SECRET", signingSecret);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = createSignedRequest("{}", signingSecret, Math.floor(Date.now() / 1000) - 301);

    expect(verifySignature(request)).toBe(false);
  });

  it("rejects malformed signature timestamps", () => {
    vi.stubEnv("CB_SLACK_SIGNING_SECRET", "signing-secret");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(verifySignature({
      headers: {
        "x-slack-request-timestamp": "not-a-timestamp",
        "x-slack-signature": "v0=invalid",
      },
      rawBody: "{}",
      body: {},
    })).toBe(false);
  });
});
