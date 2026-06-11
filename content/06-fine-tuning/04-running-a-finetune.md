# Running a Fine-Tune (LoRA Walkthrough)

> **What you'll learn:** an end-to-end LoRA fine-tune you can actually run — free-tier Colab is enough — covering data formatting, training configuration, the hyperparameters that matter, monitoring for overfitting, and getting the trained adapter into inference.

## The plan

We'll fine-tune a small open-weight model (a 3B–8B instruct variant of Llama or Qwen works well) to a specific behavior using QLoRA — the 4-bit base + adapters technique from Lesson 2 — with Hugging Face's TRL library. The walkthrough assumes the decision discipline from Lessons 1–3: you're tuning a *behavior* (style, format, domain dialect), you have a curated dataset of a few hundred to a few thousand examples, and your eval set is already built and quarantined.

This lesson is a guided walkthrough rather than a separate lab: run it top-to-bottom in a Colab notebook with a T4 GPU (free tier), or locally on any 12GB+ GPU. [Unsloth](https://docs.unsloth.ai/) offers the same flow ~2× faster and smaller if Colab memory gets tight.

## Step 1 — Data in, chat format

TRL's `SFTTrainer` accepts datasets in the standard chat-messages format — the same shape you've used all course:

```python
# train.jsonl — one example per line
{"messages": [
  {"role": "system", "content": "You are SupportBot for Acme. Answer in <=3 sentences, cite a doc slug."},
  {"role": "user", "content": "How do I rotate my API key?"},
  {"role": "assistant", "content": "Go to Settings → API Keys and click Rotate. The old key keeps working for 24h. [docs:api-keys]"}
]}
```

Critical (Lesson 3 in practice): the system prompt in training **must match the one you'll use at inference**. Train with one persona and deploy with another, and you've taught the model a lesson you'll never benefit from.

```python
from datasets import load_dataset

dataset = load_dataset("json", data_files={"train": "train.jsonl", "eval": "eval.jsonl"})
```

## Step 2 — Load the model in 4-bit, attach adapters

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig

model_id = "meta-llama/Llama-3.2-3B-Instruct"

bnb = BitsAndBytesConfig(                      # QLoRA: frozen base in 4-bit NF4
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)
model = AutoModelForCausalLM.from_pretrained(model_id, quantization_config=bnb, device_map="auto")
tokenizer = AutoTokenizer.from_pretrained(model_id)

lora = LoraConfig(                             # the knobs from Lesson 2
    r=16, lora_alpha=32, lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],   # attention + MLP
    task_type="CAUSAL_LM",
)
```

A 3B model in 4-bit plus adapters fits comfortably in a T4's 16GB; an 8B model fits in under 10GB with shorter sequences.

## Step 3 — Train

```python
from trl import SFTTrainer, SFTConfig

config = SFTConfig(
    output_dir="supportbot-lora",
    num_train_epochs=2,                  # start low — forgetting risk grows per epoch
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,       # effective batch = 16
    learning_rate=2e-4,                  # typical for LoRA (10–100x full-FT rates)
    lr_scheduler_type="cosine", warmup_ratio=0.03,
    max_length=1024,
    eval_strategy="steps", eval_steps=50, logging_steps=10,
    bf16=True,
)
trainer = SFTTrainer(model=model, args=config, peft_config=lora,
                     train_dataset=dataset["train"], eval_dataset=dataset["eval"],
                     processing_class=tokenizer)
trainer.train()
trainer.save_model("supportbot-lora/final")   # saves the adapter (~tens of MB), not the base
```

On a T4, ~1,000 examples × 2 epochs finishes in well under an hour.

**Hyperparameters, in order of how much they matter:**

| Knob | Start at | Symptoms when wrong |
|---|---|---|
| Learning rate | `2e-4` | too high: eval loss spikes, garbled output; too low: nothing changes |
| Epochs | 1–2 | too many: eval loss rises while train loss falls — memorization |
| LoRA `r` / `alpha` | 16 / 32 | too small: behavior doesn't stick; bigger r mostly costs memory |
| Effective batch size | 16 | mostly affects stability; use gradient accumulation, not bigger GPUs |

**Watch the eval loss curve.** Train loss falling is guaranteed; the question is whether *eval* loss follows. The moment eval loss turns upward, you're memorizing the training set — stop there (this is why `eval_steps` is frequent). And before celebrating any curve: loss is a proxy. The real test is Lesson 5's behavioral evaluation.

## Step 4 — Inference

Load the base and apply the adapter, or merge for deployment:

```python
from peft import PeftModel

base = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype=torch.bfloat16, device_map="auto")
tuned = PeftModel.from_pretrained(base, "supportbot-lora/final")

merged = tuned.merge_and_unload()        # bake adapters into the weights
merged.save_pretrained("supportbot-merged")   # → serve with vLLM (Module 8)
```

Merged, the model serves like any open-weight model (vLLM, Ollama). Unmerged, one base can host many adapters — vLLM can serve multiple LoRAs simultaneously, which is the cheap way to run per-customer or per-task variants.

Quick smoke test — same system prompt as training:

```python
from transformers import pipeline

pipe = pipeline("text-generation", model=merged, tokenizer=tokenizer)
out = pipe([{"role": "system", "content": "You are SupportBot for Acme. Answer in <=3 sentences, cite a doc slug."},
            {"role": "user", "content": "Can I get a refund after 30 days?"}], max_new_tokens=128)
print(out[0]["generated_text"][-1]["content"])
```

If the format, tone, and citation habit you trained for show up here — and on inputs *unlike* the training set — proceed to real evaluation (Lesson 5). If not, suspect data first (Lesson 3), hyperparameters second.

## Key takeaways

- QLoRA on a small instruct model with TRL's `SFTTrainer` is a free-tier-Colab task: 4-bit base, LoRA adapters on attention + MLP modules, chat-formatted JSONL in.
- Match the training system prompt to the inference system prompt — mismatches train behavior you'll never use.
- The hyperparameters that matter most: learning rate (~2e-4), epochs (1–2; watch for eval loss rising), then r/alpha (16/32).
- Eval loss diverging upward from train loss = memorization; stop training there. Loss is only a proxy — behavioral evals (Lesson 5) are the real verdict.
- Save adapters (tiny, swappable, multi-tenant) or merge for drop-in serving with vLLM/Ollama (Module 8).
