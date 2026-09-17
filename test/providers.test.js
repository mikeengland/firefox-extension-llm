"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PROVIDERS,
  PROVIDER_IDS,
  DEFAULT_PROVIDER,
  ALL_ORIGINS,
  CLAUDE_QUERY_MAX_CHARS,
  providerForUrl,
  normalizeProviderId,
} = require("../providers.js");

test("exposes exactly the three expected providers", () => {
  assert.deepEqual([...PROVIDER_IDS].sort(), ["chatgpt", "claude", "gemini"]);
});

test("every provider has the fields the extension relies on", () => {
  for (const id of PROVIDER_IDS) {
    const p = PROVIDERS[id];
    assert.equal(p.id, id);
    assert.equal(typeof p.label, "string");
    assert.match(p.origin, /^https:\/\/[^/]+\/\*$/);
    assert.equal(typeof p.newChatUrl, "function");
    assert.ok(Array.isArray(p.composerSelectors) && p.composerSelectors.length > 0);
  }
});

test("default provider exists and ALL_ORIGINS mirrors the table", () => {
  assert.ok(PROVIDER_IDS.includes(DEFAULT_PROVIDER));
  assert.deepEqual(ALL_ORIGINS, PROVIDER_IDS.map((id) => PROVIDERS[id].origin));
});

test("claude URL prefills via ?q= with encoding", () => {
  const url = PROVIDERS.claude.newChatUrl("hello world & <tag>\nline 2");
  assert.equal(url, "https://claude.ai/new?q=hello%20world%20%26%20%3Ctag%3E%0Aline%202");
});

test("claude URL drops ?q= for long text and empty text", () => {
  const long = "x".repeat(CLAUDE_QUERY_MAX_CHARS + 1);
  assert.equal(PROVIDERS.claude.newChatUrl(long), "https://claude.ai/new");
  assert.equal(PROVIDERS.claude.newChatUrl(""), "https://claude.ai/new");
  const atLimit = "y".repeat(CLAUDE_QUERY_MAX_CHARS);
  assert.ok(PROVIDERS.claude.newChatUrl(atLimit).startsWith("https://claude.ai/new?q="));
});

test("chatgpt and gemini never put the text in the URL", () => {
  assert.equal(PROVIDERS.chatgpt.newChatUrl("secret"), "https://chatgpt.com/");
  assert.equal(PROVIDERS.gemini.newChatUrl("secret"), "https://gemini.google.com/app");
});

test("providerForUrl matches by host only", () => {
  assert.equal(providerForUrl("https://claude.ai/new?q=hi").id, "claude");
  assert.equal(providerForUrl("https://chatgpt.com/c/abc").id, "chatgpt");
  assert.equal(providerForUrl("https://gemini.google.com/app/123").id, "gemini");
  assert.equal(providerForUrl("https://example.com/"), null);
  assert.equal(providerForUrl("not a url"), null);
});

test("normalizeProviderId falls back to the default", () => {
  assert.equal(normalizeProviderId("gemini"), "gemini");
  assert.equal(normalizeProviderId("nope"), DEFAULT_PROVIDER);
  assert.equal(normalizeProviderId(undefined), DEFAULT_PROVIDER);
});
