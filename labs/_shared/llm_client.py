"""Provider-agnostic LLM client used by every lab.

Configure via environment variables:

    LLM_PROVIDER   anthropic | openai | openai-compatible   (default: openai-compatible)
    LLM_API_KEY    API key  (optional for local servers like Ollama)
    LLM_BASE_URL   override base URL (required for openai-compatible, e.g. Ollama:
                   http://localhost:11434/v1)
    LLM_MODEL      model name (e.g. claude-sonnet-4-6, gpt-4o-mini, llama3.2)

Uses plain HTTP via `requests` so there are no SDK dependencies to install
beyond:  pip install requests
"""

from __future__ import annotations

import json
import os
from typing import Any, Generator

import requests

PROVIDER = os.environ.get("LLM_PROVIDER", "openai-compatible")
API_KEY = os.environ.get("LLM_API_KEY", os.environ.get("OPENAI_API_KEY", os.environ.get("ANTHROPIC_API_KEY", "")))
MODEL = os.environ.get("LLM_MODEL", "llama3.2")

_DEFAULT_BASE_URLS = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com/v1",
    "openai-compatible": "http://localhost:11434/v1",  # Ollama default
}
BASE_URL = os.environ.get("LLM_BASE_URL", _DEFAULT_BASE_URLS.get(PROVIDER, _DEFAULT_BASE_URLS["openai-compatible"])).rstrip("/")


def chat(
    messages: list[dict[str, Any]],
    *,
    system: str | None = None,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    tools: list[dict[str, Any]] | None = None,
    stream: bool = False,
) -> Any:
    """Send a chat request.

    `messages` uses the OpenAI shape: [{"role": "user"|"assistant"|"tool", "content": ...}].
    `tools` uses the OpenAI function-tool shape; translated for Anthropic automatically.

    Returns:
        - stream=False, no tool call: str (assistant text)
        - stream=False, tool call requested: dict {"tool_calls": [...], "content": str}
        - stream=True: generator of str chunks
    """
    if PROVIDER == "anthropic":
        return _anthropic_chat(messages, system, model, temperature, max_tokens, tools, stream)
    return _openai_chat(messages, system, model, temperature, max_tokens, tools, stream)


# --------------------------------------------------------------------------
# OpenAI / OpenAI-compatible (incl. Ollama)
# --------------------------------------------------------------------------

def _openai_chat(messages, system, model, temperature, max_tokens, tools, stream):
    payload: dict[str, Any] = {
        "model": model or MODEL,
        "messages": ([{"role": "system", "content": system}] if system else []) + messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": stream,
    }
    if tools:
        payload["tools"] = tools

    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"

    resp = requests.post(f"{BASE_URL}/chat/completions", headers=headers, json=payload,
                         stream=stream, timeout=120)
    resp.raise_for_status()

    if stream:
        return _openai_stream(resp)

    data = resp.json()
    msg = data["choices"][0]["message"]
    if msg.get("tool_calls"):
        return {
            "tool_calls": [
                {
                    "id": tc["id"],
                    "name": tc["function"]["name"],
                    "arguments": json.loads(tc["function"]["arguments"] or "{}"),
                }
                for tc in msg["tool_calls"]
            ],
            "content": msg.get("content") or "",
        }
    return msg.get("content") or ""


def _openai_stream(resp) -> Generator[str, None, None]:
    for line in resp.iter_lines():
        if not line:
            continue
        line = line.decode("utf-8")
        if not line.startswith("data: "):
            continue
        data = line[len("data: "):]
        if data == "[DONE]":
            break
        chunk = json.loads(data)
        delta = chunk["choices"][0].get("delta", {})
        if delta.get("content"):
            yield delta["content"]


# --------------------------------------------------------------------------
# Anthropic
# --------------------------------------------------------------------------

def _anthropic_chat(messages, system, model, temperature, max_tokens, tools, stream):
    payload: dict[str, Any] = {
        "model": model or MODEL,
        "messages": _to_anthropic_messages(messages),
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": stream,
    }
    if system:
        payload["system"] = system
    if tools:
        payload["tools"] = [
            {
                "name": t["function"]["name"],
                "description": t["function"].get("description", ""),
                "input_schema": t["function"].get("parameters", {"type": "object", "properties": {}}),
            }
            for t in tools
        ]

    headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
    }
    resp = requests.post(f"{BASE_URL}/v1/messages", headers=headers, json=payload,
                         stream=stream, timeout=120)
    resp.raise_for_status()

    if stream:
        return _anthropic_stream(resp)

    data = resp.json()
    tool_calls = [
        {"id": b["id"], "name": b["name"], "arguments": b["input"]}
        for b in data["content"] if b["type"] == "tool_use"
    ]
    text = "".join(b["text"] for b in data["content"] if b["type"] == "text")
    if tool_calls:
        return {"tool_calls": tool_calls, "content": text}
    return text


def _to_anthropic_messages(messages):
    """Translate OpenAI-shaped history (incl. tool results) to Anthropic's shape."""
    out = []
    for m in messages:
        if m["role"] == "tool":
            out.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": m.get("tool_call_id", ""),
                    "content": str(m["content"]),
                }],
            })
        elif m["role"] == "assistant" and m.get("tool_calls"):
            blocks = []
            if m.get("content"):
                blocks.append({"type": "text", "text": m["content"]})
            for tc in m["tool_calls"]:
                blocks.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["name"],
                    "input": tc["arguments"],
                })
            out.append({"role": "assistant", "content": blocks})
        else:
            out.append({"role": m["role"], "content": m["content"]})
    return out


def _anthropic_stream(resp) -> Generator[str, None, None]:
    for line in resp.iter_lines():
        if not line:
            continue
        line = line.decode("utf-8")
        if not line.startswith("data: "):
            continue
        event = json.loads(line[len("data: "):])
        if event.get("type") == "content_block_delta" and event["delta"].get("type") == "text_delta":
            yield event["delta"]["text"]


# --------------------------------------------------------------------------
# Embeddings (OpenAI-compatible only; Ollama supports /v1/embeddings too)
# --------------------------------------------------------------------------

def embed(texts: list[str], *, model: str | None = None) -> list[list[float]]:
    """Embed a batch of texts. Uses the OpenAI-compatible /embeddings endpoint.

    For Ollama, pull an embedding model first, e.g.:  ollama pull nomic-embed-text
    and set  LLM_EMBED_MODEL=nomic-embed-text
    """
    embed_model = model or os.environ.get("LLM_EMBED_MODEL", "nomic-embed-text")
    base = os.environ.get("LLM_EMBED_BASE_URL", BASE_URL if PROVIDER != "anthropic"
                          else "http://localhost:11434/v1").rstrip("/")
    headers = {"Content-Type": "application/json"}
    if API_KEY and PROVIDER != "anthropic":
        headers["Authorization"] = f"Bearer {API_KEY}"
    resp = requests.post(f"{base}/embeddings", headers=headers,
                         json={"model": embed_model, "input": texts}, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    return [d["embedding"] for d in sorted(data["data"], key=lambda d: d["index"])]


if __name__ == "__main__":
    print(f"provider={PROVIDER} base={BASE_URL} model={MODEL}")
    print(chat([{"role": "user", "content": "Say 'client works' and nothing else."}], max_tokens=20))
