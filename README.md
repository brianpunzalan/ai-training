# 🧠 AI Engineering Training

A full-spectrum, self-paced **AI Engineering course** delivered as a zero-build static
website — from LLM fundamentals through prompting, structured outputs, RAG, agents &
harness engineering, fine-tuning, evaluation, and production LLMOps.

Built on evidence-based learning science: every lesson has a **retrieval-practice quiz**
with instant feedback and explanations, missed questions return on **spaced intervals**
(1 → 3 → 7 → 14 days), and every major topic has a **hands-on lab** in both **Python
and TypeScript**.

## 📚 Curriculum

| # | Module | Level | Lab |
|---|--------|-------|-----|
| 1 | Foundations of LLMs | Beginner | Lab 01 — First API Call |
| 2 | Prompt & Context Engineering | Beginner | Lab 03 — Prompt-Eval Harness |
| 3 | Structured Outputs & Tool Calling | Intermediate | Lab 02 — Streaming + Structured Output |
| 4 | Retrieval-Augmented Generation | Intermediate | Lab 04 — RAG From Scratch |
| 5 | AI Agents & Harness Engineering | Intermediate | Labs 05 & 06 — Agent Loop, MCP Server |
| 6 | Fine-Tuning & Model Customization | Advanced | Guided LoRA/Colab walkthrough |
| 7 | Evaluation & Observability | Advanced | Lab 07 — LLM-as-Judge |
| 8 | Production & LLMOps | Advanced | Lab 08 — Prompt-Injection Guardrail |

~46 lessons, ~190 quiz questions, 8 bilingual labs, and curated reference reading per module.

## 🚀 Run it locally

No build step, no dependencies — just serve the repo root (browsers block `fetch()`
on `file://`, so use any static server):

```bash
git clone https://github.com/brianpunzalan/ai-training.git
cd ai-training
python3 -m http.server 8000
# open http://localhost:8000
```

Progress (completed lessons, quiz scores, review queue, theme) is stored in your
browser's localStorage. Use **Export progress** on the dashboard to move it between
browsers/devices.

## 🌐 Deploy to GitHub Pages (access it anytime)

1. Merge this content into your default branch (e.g. `main`) and push.
2. On GitHub: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)**
3. Your course goes live at:
   **https://brianpunzalan.github.io/ai-training/**

The site is pure static HTML/CSS/JS (markdown rendered client-side with `marked`,
highlighting via `highlight.js`, both pinned CDN versions) with hash-based routing,
so no CI workflow or base-path configuration is needed.

## 🧪 Labs

Each lab in `labs/` ships `INSTRUCTIONS.md` (also rendered in the site), plus
`python/` and `typescript/` starter + solution files. All labs run against **any
provider** — Anthropic, OpenAI, or free local models via Ollama — through the shared
client in `labs/_shared/`. See [`labs/README.md`](labs/README.md) for setup.

## 🗂 Project structure

```
index.html          # single-page app shell
css/ js/            # styling + vanilla-JS app (router, quiz, progress, search, review)
data/manifest.json  # single source of truth: modules → lessons → quizzes → labs → references
content/            # lesson markdown + quiz.json per module
labs/               # 8 hands-on labs (python + typescript)
```

## ✍️ Extending the course

Add a lesson: drop a markdown file in the module's `content/` folder and register it
in `data/manifest.json` (`lessons` array). Add quiz questions under the lesson's id in
the module's `quiz.json`. The sidebar, search index, progress tracking, and review
queue pick it up automatically.
