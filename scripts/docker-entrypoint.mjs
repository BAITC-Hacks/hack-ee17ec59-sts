// Bridge the current analyze route's legacy names without changing AI-owned code.
// Future agent routes read LLM_* directly. Keys are supplied only at runtime.
for (const [legacy, current] of [
  ["OPENAI_API_KEY", "LLM_API_KEY"],
  ["OPENAI_BASE_URL", "LLM_BASE_URL"],
  ["OPENAI_MODEL", "LLM_MODEL"],
]) {
  if (!process.env[legacy] && process.env[current]) process.env[legacy] = process.env[current];
}
await import("./server.js");
