# Function & Tool Calling Fundamentals

> **What you'll learn:** the tool-calling loop that lets a text model act on the world, who actually executes the code (you do), parallel tool calls, and the schema-design craft that determines whether the model uses your tools well.

## The big idea — and the big misconception

A model can't query your database, check the weather, or send an email. Tool calling doesn't change that. What it adds is a protocol: you describe functions to the model, and instead of answering in prose, the model can reply with a **structured request to call one** — a function name plus JSON arguments conforming to the schema you declared. It's lesson 2's structured output machinery pointed at actions instead of extraction.

The misconception to kill early: **the model never executes anything.** It emits intent; *your code* runs the function and sends the result back. Every security and reliability property of a tool-using system lives on your side of that line. The model can ask to `delete_user`; whether anything is deleted is entirely your decision — which is why production systems gate destructive tools behind allowlists or human confirmation.

## The loop

Tool calling is a multi-turn conversation with a fixed rhythm:

1. You send messages **plus tool definitions** (name, description, JSON Schema for parameters).
2. The model decides a tool would help and responds with a `tool_use` block (Anthropic) / `tool_calls` (OpenAI) — note `stop_reason: "tool_use"`, the same field you learned to check in Module 1.
3. **You execute** the function with the supplied arguments — after validating them.
4. You append a `tool_result` message carrying the output (matched by `tool_use_id`) and call the model again.
5. The model either answers in text or requests another tool. Repeat until it stops.

```python
import anthropic, json
client = anthropic.Anthropic()

tools = [{
    "name": "get_weather",
    "description": "Get current weather for a city. Use when the user asks about present conditions.",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string", "description": "City name, e.g. 'Tokyo'"}},
        "required": ["city"],
    },
}]

messages = [{"role": "user", "content": "Should I bring an umbrella in Osaka today?"}]
while True:
    resp = client.messages.create(model="claude-sonnet-4-6", max_tokens=1024,
                                  tools=tools, messages=messages)
    if resp.stop_reason != "tool_use":
        break
    messages.append({"role": "assistant", "content": resp.content})
    results = []
    for block in resp.content:
        if block.type == "tool_use":
            output = get_weather(**block.input)          # YOUR code runs here
            results.append({"type": "tool_result", "tool_use_id": block.id,
                            "content": json.dumps(output)})
    messages.append({"role": "user", "content": results})
print(resp.content[0].text)
```

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const tools: Anthropic.Tool[] = [{
  name: "get_weather",
  description: "Get current weather for a city. Use when the user asks about present conditions.",
  input_schema: {
    type: "object",
    properties: { city: { type: "string", description: "City name, e.g. 'Tokyo'" } },
    required: ["city"],
  },
}];

const messages: Anthropic.MessageParam[] = [
  { role: "user", content: "Should I bring an umbrella in Osaka today?" },
];
let resp = await client.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1024, tools, messages });
while (resp.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: resp.content });
  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const block of resp.content) {
    if (block.type === "tool_use") {
      const output = await getWeather(block.input as { city: string }); // YOUR code runs here
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output) });
    }
  }
  messages.push({ role: "user", content: results });
  resp = await client.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1024, tools, messages });
}
console.log(resp.content.find((b) => b.type === "text"));
```

That `while` loop *is* an agent in embryo. Module 5 takes exactly this skeleton and adds planning, memory, and a harness around it — if the loop above is clear to you, agents will hold no mysteries.

Three production details: **validate arguments** before executing (the model can produce a city of `""` or an ID that doesn't exist — Pydantic/Zod again); **return errors as tool results** (`"error": "city not found"`) rather than crashing, because models routinely self-correct when shown the failure; and **`tool_choice`** lets you force a specific tool (`{"type": "tool", "name": ...}`), require some tool (`any`), or leave it to the model (`auto`).

## Parallel tool calls

Models can request several independent calls in one turn — ask to compare weather in three cities and you may get three `tool_use` blocks together. Execute them concurrently (`asyncio.gather` / `Promise.all`) and return **all results in a single user message**, each tagged with its `tool_use_id`. Returning them one-per-message is a common bug that breaks the conversation structure. Parallel calls cut round trips dramatically, but only fire for *independent* operations — when call B needs A's output, the model must (and will) sequence them.

## Schema design: the craft

The model chooses and fills tools using *only* your names, descriptions, and schemas — they are prompts wearing a JSON costume, and they deserve the same care as your system prompt (Module 2):

| Practice | Weak | Strong |
|---|---|---|
| Specific names | `do_thing`, `api_call` | `search_orders_by_customer` |
| Descriptions say *when* | "Searches orders" | "Search orders by customer email. Use when the user asks about order status or history." |
| Describe every parameter | `"q": {"type": "string"}` | `"query": {"type": "string", "description": "Customer email, exact match"}` |
| Constrain with enums | free-text `status` | `"enum": ["pending", "shipped", "delivered"]` |
| Few, distinct tools | 40 overlapping endpoints | A curated handful with crisp, non-overlapping purposes |

Overlapping tools (`search_orders` *and* `find_orders`?) measurably degrade selection accuracy, and every tool definition costs prompt tokens on **every call**. Don't mirror your REST API one-to-one; design the toolset around the model's decisions. And because "does the model pick the right tool with the right arguments?" is an empirical question, tool selection belongs in your eval suite (Module 7) from day one.

## Key takeaways

- Tool calling is structured output aimed at actions: the model emits a function name + schema-conformant JSON arguments; **your code** executes and returns a `tool_result`.
- The loop — send tools → `tool_use` → execute → `tool_result` → repeat — is the skeleton that Module 5 grows into full agents.
- Validate arguments before executing, return execution errors as tool results so the model can recover, and gate destructive tools behind confirmation.
- Parallel tool calls batch independent operations into one turn; run them concurrently and return all results in a single message.
- Tool schemas are prompts: specific names, when-to-use descriptions, per-parameter docs, enums — and eval tool selection like any other model behavior (Module 7).
