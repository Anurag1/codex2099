const defaults = {
  openai: process.env.OPENAI_DEFAULT_MODEL || "gpt-4o-mini",
  anthropic: process.env.ANTHROPIC_DEFAULT_MODEL || "claude-3-5-haiku-latest",
  gemini: process.env.GEMINI_DEFAULT_MODEL || "gemini-2.0-flash"
};
const keys = {
  openai: () => process.env.OPENAI_API_KEY,
  anthropic: () => process.env.ANTHROPIC_API_KEY,
  gemini: () => process.env.GEMINI_API_KEY
};

export function providerStatus() {
  return Object.keys(keys).map(provider => ({ provider, configured: Boolean(keys[provider]()), default_model: defaults[provider] }));
}
const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 60000);

async function requestJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `Provider returned HTTP ${response.status}`;
      throw new Error(message.slice(0, 500));
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Provider request timed out after ${timeoutMs} ms.`);
    throw error;
  } finally { clearTimeout(timer); }
}

export async function callProvider({ provider, model, prompt, input, temperature = 0.2, maxTokens = 1200 }) {
  const apiKey = keys[provider]?.();
  if (!apiKey) throw new Error(`${provider} is not configured on the server. Add its API key to the server environment.`);
  const started = Date.now();
  let text = "", usage = null, requestId = null;

  if (provider === "openai") {
    const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const data = await requestJson(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: prompt }, { role: "user", content: input }], temperature, max_tokens: maxTokens })
    });
    text = data.choices?.[0]?.message?.content ?? "";
    usage = data.usage ? { input_tokens: data.usage.prompt_tokens ?? null, output_tokens: data.usage.completion_tokens ?? null } : null;
    requestId = data.id ?? null;
  } else if (provider === "anthropic") {
    const data = await requestJson("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, system: prompt, messages: [{ role: "user", content: input }], temperature, max_tokens: maxTokens })
    });
    text = (data.content || []).filter(x => x.type === "text").map(x => x.text).join("\n");
    usage = data.usage ? { input_tokens: data.usage.input_tokens ?? null, output_tokens: data.usage.output_tokens ?? null } : null;
    requestId = data.id ?? null;
  } else if (provider === "gemini") {
    const modelId = encodeURIComponent(model);
    const data = await requestJson(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: "user", parts: [{ text: input }] }], generationConfig: { temperature, maxOutputTokens: maxTokens } })
    });
    text = (data.candidates?.[0]?.content?.parts || []).map(x => x.text || "").join("\n");
    usage = data.usageMetadata ? { input_tokens: data.usageMetadata.promptTokenCount ?? null, output_tokens: data.usageMetadata.candidatesTokenCount ?? null } : null;
    requestId = null;
  } else {
    throw new Error("Unsupported provider.");
  }

  return { output: text, latency_ms: Date.now() - started, usage, provider_request_id: requestId };
}
