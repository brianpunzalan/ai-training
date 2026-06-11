/**
 * Provider-agnostic LLM client used by every lab (TypeScript).
 *
 * Configure via environment variables:
 *
 *   LLM_PROVIDER   anthropic | openai | openai-compatible   (default: openai-compatible)
 *   LLM_API_KEY    API key (optional for local servers like Ollama)
 *   LLM_BASE_URL   override base URL (e.g. Ollama: http://localhost:11434/v1)
 *   LLM_MODEL      model name (e.g. claude-sonnet-4-6, gpt-4o-mini, llama3.2)
 *
 * Zero runtime dependencies — uses global fetch (Node 18+).
 * Run labs with:  npx tsx <file>.ts
 */

export type Role = "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: Role;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatOptions {
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDef[];
}

export interface ToolCallResponse {
  toolCalls: ToolCall[];
  content: string;
}

export type ChatResponse = string | ToolCallResponse;

const PROVIDER = process.env.LLM_PROVIDER ?? "openai-compatible";
const API_KEY =
  process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.LLM_MODEL ?? "llama3.2";

const DEFAULT_BASE_URLS: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  "openai-compatible": "http://localhost:11434/v1", // Ollama default
};
const BASE_URL = (process.env.LLM_BASE_URL ?? DEFAULT_BASE_URLS[PROVIDER] ?? DEFAULT_BASE_URLS["openai-compatible"]).replace(/\/$/, "");

export function isToolCallResponse(r: ChatResponse): r is ToolCallResponse {
  return typeof r !== "string";
}

export async function chat(messages: Message[], opts: ChatOptions = {}): Promise<ChatResponse> {
  if (PROVIDER === "anthropic") return anthropicChat(messages, opts);
  return openaiChat(messages, opts);
}

export async function* chatStream(
  messages: Message[],
  opts: ChatOptions = {},
): AsyncGenerator<string> {
  if (PROVIDER === "anthropic") yield* anthropicStream(messages, opts);
  else yield* openaiStream(messages, opts);
}

// ---------------------------------------------------------------------------
// OpenAI / OpenAI-compatible (incl. Ollama)
// ---------------------------------------------------------------------------

function openaiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  return headers;
}

function openaiPayload(messages: Message[], opts: ChatOptions, stream: boolean) {
  const msgs = messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", content: m.content, tool_call_id: m.tool_call_id };
    }
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });

  return {
    model: opts.model ?? MODEL,
    messages: opts.system ? [{ role: "system", content: opts.system }, ...msgs] : msgs,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1024,
    tools: opts.tools,
    stream,
  };
}

async function openaiChat(messages: Message[], opts: ChatOptions): Promise<ChatResponse> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: openaiHeaders(),
    body: JSON.stringify(openaiPayload(messages, opts, false)),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  const msg = data.choices[0].message;
  if (msg.tool_calls?.length) {
    return {
      toolCalls: msg.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || "{}"),
      })),
      content: msg.content ?? "",
    };
  }
  return msg.content ?? "";
}

async function* openaiStream(messages: Message[], opts: ChatOptions): AsyncGenerator<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: openaiHeaders(),
    body: JSON.stringify(openaiPayload(messages, opts, true)),
  });
  if (!res.ok || !res.body) throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);

  for await (const data of sseEvents(res.body)) {
    if (data === "[DONE]") return;
    const chunk = JSON.parse(data);
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) yield delta.content;
  }
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

function anthropicHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
  };
}

function anthropicPayload(messages: Message[], opts: ChatOptions, stream: boolean) {
  const msgs = messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: m.content }],
      };
    }
    if (m.role === "assistant" && m.tool_calls) {
      const blocks: any[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
      }
      return { role: "assistant", content: blocks };
    }
    return { role: m.role, content: m.content };
  });

  return {
    model: opts.model ?? MODEL,
    messages: msgs,
    system: opts.system,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1024,
    tools: opts.tools?.map((t) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      input_schema: t.function.parameters ?? { type: "object", properties: {} },
    })),
    stream,
  };
}

async function anthropicChat(messages: Message[], opts: ChatOptions): Promise<ChatResponse> {
  const res = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify(anthropicPayload(messages, opts, false)),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;

  const toolCalls: ToolCall[] = data.content
    .filter((b: any) => b.type === "tool_use")
    .map((b: any) => ({ id: b.id, name: b.name, arguments: b.input }));
  const text = data.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  if (toolCalls.length) return { toolCalls, content: text };
  return text;
}

async function* anthropicStream(messages: Message[], opts: ChatOptions): AsyncGenerator<string> {
  const res = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify(anthropicPayload(messages, opts, true)),
  });
  if (!res.ok || !res.body) throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);

  for await (const data of sseEvents(res.body)) {
    let event: any;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

// ---------------------------------------------------------------------------
// Embeddings (OpenAI-compatible; for Ollama: ollama pull nomic-embed-text)
// ---------------------------------------------------------------------------

export async function embed(texts: string[], model?: string): Promise<number[][]> {
  const embedModel = model ?? process.env.LLM_EMBED_MODEL ?? "nomic-embed-text";
  const base = (
    process.env.LLM_EMBED_BASE_URL ??
    (PROVIDER !== "anthropic" ? BASE_URL : "http://localhost:11434/v1")
  ).replace(/\/$/, "");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY && PROVIDER !== "anthropic") headers.Authorization = `Bearer ${API_KEY}`;

  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: embedModel, input: texts }),
  });
  if (!res.ok) throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  return data.data
    .sort((a: any, b: any) => a.index - b.index)
    .map((d: any) => d.embedding);
}

// ---------------------------------------------------------------------------
// SSE parsing helper
// ---------------------------------------------------------------------------

async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) yield line.slice("data: ".length).trim();
    }
  }
}
