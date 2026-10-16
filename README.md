# TelEmbedding-CloudFlare

# Telegram Semantic Archive & Vector Engine ▣
> High-performance Telegram semantic search engine and file archiver running natively on Cloudflare Workers, powered by D1 SQL, Vectorize, and Workers AI.

---

## 🏗 Architecture & Core Features

* Zero External Dependencies: Built entirely with native Cloudflare Web APIs and ES Modules.
* Hybrid RRF Search Engine: Combines Cloudflare Vectorize (Cosine similarity) with D1 Lexical SQL matching for high-precision information retrieval.
* Smart File Parsers (Edge): Native zero-dependency extractors for PDF (FlateDecode, text streams), DOCX & EPUB (ZIP container XML decompression), plain text, code, and structured data.
* Vision & Audio AI: Automatic image description generation (@cf/unum/uform-gen2-qwen-500m) and voice-to-text transcription (@cf/openai/whisper).
* Infinite Channels & Groups Ingestion: Automatically archives messages, forwarded posts, and media from unlimited Telegram channels and groups.
* Inline Mode (<40ms): Query your entire archive from any chat using @your_bot <query> with native photo and document rendering.
* RAG Question Answering: Use ?your question in inline mode or /ask in private chat to synthesize answers directly from your stored notes.
* Dynamic UI Customizer & Mini App (TMA): Fully customizable bot texts, graphical buttons, and access controls managed via an embedded single-page Telegram Mini App (/app) and D1 database settings.

---

## ⚙️ Cloudflare Bindings Required

Configure the following bindings in your Cloudflare Worker (Settings -> Bindings):

1. `DB`: Cloudflare D1 SQL Database
2. `VECTORIZE`: Cloudflare Vectorize Index (1024 dimensions for bge-m3 or 384 for bge-small)
3. `AI`: Cloudflare Workers AI

---

## 🚀 Quick Setup Guide

1. Create the Worker: Paste the code into a Cloudflare Worker project and deploy.
2. Configure Credentials: Set your BOT_TOKEN and ADMIN_IDS in the CONFIG object at the top of the worker file.
3. Bind Resources: Attach your D1 database (DB) and Workers AI (AI) bindings in the Cloudflare dashboard.
4. Initialize Webhook: Open your worker URL in the browser with the /setup endpoint to register the Telegram webhook automatically:
   ```text
   [https://your-worker.your-subdomain.workers.dev/setup](https://your-worker.your-subdomain.workers.dev/setup)
