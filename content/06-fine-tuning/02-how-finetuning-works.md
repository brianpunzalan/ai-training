# How Fine-Tuning Works: Full FT, LoRA, QLoRA

> **What you'll learn:** what actually happens to the weights during supervised fine-tuning, why full fine-tuning is memory-hungry, how LoRA's low-rank adapters cut that cost by orders of magnitude, what QLoRA adds, and the knobs (r, alpha, target modules) you'll set in the next lesson.

## The training loop, briefly

Supervised fine-tuning (SFT) is the same mechanism as pre-training, pointed at your data: show the model a sequence, have it predict each next token, compute the loss (how wrong its probabilities were), and nudge the weights downhill via gradient descent. For chat-style SFT, examples are full conversations rendered in the model's chat template, and typically only the **assistant tokens** are scored — you want the model to learn to *produce* good responses, not to imitate user messages.

The differences from pre-training are scale and intent: thousands of examples instead of trillions of tokens, a few epochs instead of one giant pass, and a small learning rate — you're sculpting behavior on top of existing capability, not building capability.

## Full fine-tuning: powerful, expensive, risky

Full fine-tuning updates **every parameter**. The capability ceiling is highest, but the costs are brutal. Training memory isn't just the weights — for each parameter you hold, with the standard AdamW optimizer:

| Component | Bytes/param (mixed precision) |
|---|---|
| Weights (bf16) | 2 |
| Gradients (bf16) | 2 |
| Optimizer states (fp32 momentum + variance, often fp32 master weights) | 8–12 |

That's roughly **12–16 bytes per parameter** before activations: a 7–8B model needs on the order of 100+ GB of GPU memory to fully fine-tune — multi-GPU territory. You also produce a full copy of the model per task (16 GB of weights each) and maximize exposure to **catastrophic forgetting**: gradient descent on a narrow dataset happily overwrites the broad capabilities pre-training paid for. A model fine-tuned hard on SQL generation can quietly get worse at following general instructions — which is why lesson 5 insists on regression checks, and why aggressive learning rates or too many epochs are the usual culprits.

## LoRA: train a small correction, not the model

**LoRA (Low-Rank Adaptation)** starts from an empirical observation: the weight *change* needed to adapt a pre-trained model to a task has low intrinsic rank — it's a small, structured correction, not an arbitrary one. So instead of updating a weight matrix `W` (say 4096×4096 ≈ 16.8M params), LoRA freezes `W` and learns the update as a product of two thin matrices:

```
W' = W + (alpha / r) · B·A      # A: r×4096, B: 4096×r, r << 4096
```

With rank `r = 16`, `A` and `B` together hold ~131K parameters — **less than 1%** of the original matrix. Only `A` and `B` get gradients and optimizer states; the frozen base needs just its weights in memory. Consequences:

- **Memory drops dramatically** — a 7–8B model becomes trainable on a single 24 GB GPU.
- **Adapters are tiny artifacts** — tens to hundreds of MB. You can keep one base model and swap task-specific adapters, or serve many adapters off one base (some inference servers hot-swap them per request).
- **Forgetting is bounded** — the base is untouched; delete the adapter and the original model is back. (LoRA reduces but does not eliminate behavioral regressions — the adapted outputs can still drift.)
- **At inference, `B·A` can be merged into `W`** — a fine-tuned LoRA model runs at exactly base-model speed.

The knobs you'll actually set:

- **`r` (rank):** capacity of the adapter. 8–16 covers most style/format tasks; 32–64 for harder behavioral shifts. Higher r = more trainable params, more memory, more overfitting risk.
- **`lora_alpha`:** scaling numerator; the effective adapter strength is `alpha/r`. Common convention: `alpha = r` or `alpha = 2r`. Tune learning rate before you tune alpha.
- **`target_modules`:** which matrices get adapters. Early practice targeted only attention projections (`q_proj`, `v_proj`); current standard practice — backed by the QLoRA paper's ablations — is **all linear layers**: `q_proj, k_proj, v_proj, o_proj` plus the MLP's `gate_proj, up_proj, down_proj`. Targeting all of them at modest r usually beats high r on attention alone.

## QLoRA: quantize the frozen part

LoRA's remaining memory cost is holding the frozen base in 16-bit. **QLoRA**'s move: since those weights are frozen anyway, store them in **4-bit NF4** (NormalFloat-4, a data type optimized for normally-distributed weights), with **double quantization** to also compress the quantization constants. Activations and the LoRA adapters stay in 16-bit — the 4-bit weights are dequantized on the fly for each matrix multiply — so gradients flow through *frozen 4-bit weights* into *trainable 16-bit adapters*. A paged optimizer absorbs memory spikes.

Net effect: a 7–8B model fine-tunes in roughly 6–10 GB of GPU memory — i.e., on a free Colab T4 or a gaming GPU — at quality the QLoRA paper showed is essentially indistinguishable from 16-bit LoRA. The trade-off is speed: dequantize-on-the-fly makes training somewhat slower, and you should evaluate the model the way you'll serve it, since serving the merged model in 16-bit vs serving quantized can differ subtly.

## Choosing between them

| | Full FT | LoRA | QLoRA |
|---|---|---|---|
| Trainable params (8B model) | 8B | ~10–80M | ~10–80M |
| GPU memory (8B, typical) | 100+ GB (multi-GPU) | ~20–24 GB | ~6–10 GB |
| Artifact size | full model copy | ~50–500 MB adapter | ~50–500 MB adapter |
| Forgetting risk | highest | lower (base frozen) | lower |
| When | frontier labs, deep domain shifts with big data | default for app teams | same, on commodity/free GPUs |

For the style/format/narrow-task wins from lesson 1, LoRA or QLoRA is the default answer; the walkthrough in lesson 4 uses exactly this stack.

## Key takeaways

- SFT = next-token prediction on your examples with loss on assistant tokens; small learning rates and few epochs sculpt behavior without rebuilding capability.
- Full fine-tuning costs ~12–16 bytes of GPU memory per parameter (weights + gradients + optimizer states) and maximizes catastrophic-forgetting risk.
- LoRA freezes the base and learns low-rank updates `(alpha/r)·B·A`; <1% trainable params, tiny swappable adapters, mergeable to zero inference overhead.
- Key LoRA knobs: rank `r` (8–32 typical), `alpha` (≈ r or 2r), and `target_modules` — target all attention + MLP linear layers, not just q/v.
- QLoRA stores the frozen base in 4-bit NF4 so an 8B model trains in under 10 GB — free-tier Colab territory — at near-identical quality, slightly slower.
- Catastrophic forgetting is real: keep epochs low, learning rates small, and run regression evals (lesson 5, Module 7) on general capability.
