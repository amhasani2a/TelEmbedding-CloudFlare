/**
 * ============================================================================
 * TELEGRAM SEMANTIC ARCHIVE & VECTOR ENGINE (CLOUDFLARE WORKER - SINGLE FILE)
 * Architecture: Cloudflare Workers + D1 + Vectorize + Workers AI + Mini App
 * Style: Dry Systems Engineering Persona | Zero External Dependencies
 * PART 1 OF 2
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. CORE CONFIGURATION & HARDCODED CREDENTIALS
// ----------------------------------------------------------------------------
const CONFIG = {
  // توکن ربات تلگرام (از BotFather)
  BOT_TOKEN: "Token bot",

  // لیست آیدی‌های عددی ادمین‌های اصلی سیستم
  ADMIN_IDS: [123456789, 12345678],

  // کلید امنیتی وب‌هوک (فقط حروف انگلیسی، اعداد و خط تیره)
  WEBHOOK_SECRET: "SYS_VEC_KERNEL_9948102_SEC",

  // مدل‌های هوش مصنوعی کلودفلر (قابل تغییر زنده از داخل پنل ادمین)
  MODELS: {
    // مدل چندزبانه bge-m3 بهترین دقت را برای فارسی و انگلیسی دارد (ابعاد: 1024)
    // اگر ایندکس Vectorize را 384 بعدی ساخته‌اید، از @cf/baai/bge-small-en-v1.5 استفاده کنید
    EMBEDDING: "@cf/baai/bge-m3",
    LLM: "@cf/meta/llama-3.1-8b-instruct",
    VISION: "@cf/unum/uform-gen2-qwen-500m",
    WHISPER: "@cf/openai/whisper",
  },

  // پارامترهای پردازش برداری و متن
  CHUNK_SIZE: 900,
  CHUNK_OVERLAP: 150,
  TOP_K: 15,
  INLINE_CACHE_TIME: 2,
  RATE_LIMIT_PER_MIN: 25,
  MAX_FILE_BYTES: 18 * 1024 * 1024, // 18 MB safe worker memory ceiling
};

// ----------------------------------------------------------------------------
// 2. DEFAULT UI STRINGS & GRAPHICAL BUTTON LABELS (DRY ENGINEER PERSONA)
// تمام این مقادیر از داخل پنل ادمین و مینی‌اپ بدون تغییر کد قابل ویرایش هستند
// ----------------------------------------------------------------------------
const DEFAULT_STRINGS = {
  // متون سیستم
  sys_boot: "▣ هسته آرشیو معنایی آماده به کار است.\nوضعیت ارتباط با D1 و Vectorize: پایدار.\nهرگونه پیام، سند، تصویر یا صوت ارسالی پس از استخراج ویژگی، برداری‌سازی و در ماتریس ذخیره می‌شود.",
  sys_locked: "⛔ دسترسی مسدود است. این نود در حالت خصوصی (فقط ادمین) قرار دارد.",
  sys_rate_limit: "⚠ تعداد درخواست‌ها بیش از حد مجاز در دقیقه است. چند ثانیه صبر کنید.",
  sys_indexed_ok: "⛁ رکورد در ماتریس ثبت شد.",
  sys_indexed_dup: "◈ هش داده تکراری است. رکورد قبلی بروزرسانی شد.",
  sys_deleted_ok: "🗑 رکورد و بردارهای وابسته از هسته حذف شدند.",
  sys_empty_query: "پارامتر جستجو خالی است. عبارت یا مفهوم مورد نظر را وارد کنید.",
  sys_no_results: "هیچ رکوردی با فاصله کسینوسی قابل قبول یافت نشد.",
  sys_admin_header: "⚙ کنسول مدیریت هسته و پیکربندی سیستم",
  sys_ask_prompt: "در حال استخراج بردارهای مرتبط و سنتز پاسخ از روی آرشیو...",
  sys_custom_prompt: "کلید و مقدار جدید را با فرمت زیر ارسال کنید:\n`KEY = متن جدید`\n\nبرای مشاهده کلیدها از دکمه لیست کلیدها استفاده کنید.",

  // لیبل دکمه‌های گرافیکی (واسط کاربری خشک و فنی)
  btn_inline_search: "⌗ جستجوی معنایی (Inline)",
  btn_mini_app: "▣ کنسول گرافیکی (Mini App)",
  btn_stats: "⛁ وضعیت مخزن و آمار",
  btn_starred: "★ رکوردهای نشان‌دار",
  btn_recent: "◷ آخرین ورودی‌ها",
  btn_help: "ℹ راهنمای سینتکس و عملگرها",
  btn_admin_panel: "⚙ پنل مهندسی سیستم",
  btn_jump_msg: "⎋ پرش به پیام مرجع",
  btn_similar: "◈ یافتن بردارهای همسایه",
  btn_star_toggle: "★ تغییر وضعیت نشان",
  btn_delete_node: "✕ حذف از ایندکس",
  btn_copy_text: "⎘ کپی متن خام",
  btn_adm_toggle_pub: "⛨ تغییر سطح دسترسی عمومی",
  btn_adm_chats: "📡 مدیریت کانال‌ها و گروه‌ها",
  btn_adm_strings: "✎ ویرایش متون و دکمه‌ها",
  btn_adm_models: "⚡ پیکربندی مدل‌های AI",
  btn_adm_export: "⬇ خروجی کامل دیتابیس (JSONL)",
  btn_adm_logs: "⚠ لاگ خطاهای هسته",
  btn_adm_reindex: "↻ بازسازی بردارها (Re-Index)",
  btn_adm_whitelist: "🔑 مدیریت لیست سفید",
  btn_back: "◂ بازگشت به سطح قبل",
};

// ----------------------------------------------------------------------------
// 3. DATABASE SCHEMA INITIALIZATION & SETTINGS ENGINE (D1)
// ----------------------------------------------------------------------------
let SCHEMA_INITIALIZED = false;

async function ensureSchema(env) {
  if (SCHEMA_INITIALIZED || !env.DB) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      sender_name TEXT,
      sender_username TEXT,
      chat_id INTEGER NOT NULL,
      chat_title TEXT,
      chat_type TEXT,
      message_id INTEGER,
      media_type TEXT DEFAULT 'text',
      file_id TEXT,
      file_unique_id TEXT,
      file_name TEXT,
      mime_type TEXT,
      raw_text TEXT NOT NULL,
      summary TEXT,
      tags TEXT,
      source_url TEXT,
      deep_link TEXT,
      content_hash TEXT,
      is_starred INTEGER DEFAULT 0,
      chunk_index INTEGER DEFAULT 0,
      parent_id TEXT,
      embedding_json TEXT,
      expires_at INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_notes_chat ON notes(chat_id, message_id);`,
    `CREATE INDEX IF NOT EXISTS idx_notes_hash ON notes(content_hash);`,
    `CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(media_type);`,
    `CREATE INDEX IF NOT EXISTS idx_notes_star ON notes(is_starred);`,
    `CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);`,
    `CREATE TABLE IF NOT EXISTS chats (
      chat_id INTEGER PRIMARY KEY,
      chat_title TEXT,
      chat_type TEXT,
      chat_username TEXT,
      is_enabled INTEGER DEFAULT 1,
      indexed_count INTEGER DEFAULT 0,
      last_sync INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      is_whitelisted INTEGER DEFAULT 0,
       is_banned INTEGER DEFAULT 0,
      req_count INTEGER DEFAULT 0,
      window_start INTEGER DEFAULT 0,
      created_at INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context TEXT,
      error_msg TEXT,
      created_at INTEGER
    );`
  ];

  try {
    const batch = statements.map((sql) => env.DB.prepare(sql));
    await env.DB.batch(batch);
    SCHEMA_INITIALIZED = true;
  } catch (err) {
    console.error("Schema Init Error:", err);
  }
}

async function logKernelError(env, context, err) {
  try {
    const msg = err instanceof Error ? `${err.message}\n${err.stack || ""}` : String(err);
    console.error(`[${context}]`, msg);
    if (!env.DB) return;
    await env.DB.prepare(
      `INSERT INTO error_logs (context, error_msg, created_at) VALUES (?1, ?2, ?3)`
    ).bind(context, msg.slice(0, 1500), Date.now()).run();
  } catch (_) {}
}

class RuntimeConfig {
  constructor(env) {
    this.env = env;
    this.map = new Map();
    this.loaded = false;
  }

  async load() {
    if (this.loaded || !this.env.DB) return;
    try {
      const { results } = await this.env.DB.prepare(`SELECT key, value FROM settings`).all();
      for (const row of results || []) {
        this.map.set(row.key, row.value);
      }
      this.loaded = true;
    } catch (e) {
      await logKernelError(this.env, "RuntimeConfig.load", e);
    }
  }

  get(key, fallback = "") {
    if (this.map.has(key)) return this.map.get(key);
    if (key in DEFAULT_STRINGS) return DEFAULT_STRINGS[key];
    return fallback;
  }

  async set(key, value) {
    this.map.set(key, String(value));
    if (!this.env.DB) return;
    await this.env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(key, String(value), Date.now()).run();
  }

  async delete(key) {
    this.map.delete(key);
    if (!this.env.DB) return;
    await this.env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(key).run();
  }

  getAccessMode() {
    // 'public' | 'admin' | 'whitelist'
    return this.get("sys_access_mode", "admin");
  }

  getEmbedModel() {
    return this.get("model_embedding", CONFIG.MODELS.EMBEDDING);
  }

  getLlmModel() {
    return this.get("model_llm", CONFIG.MODELS.LLM);
  }

  getVisionModel() {
    return this.get("model_vision", CONFIG.MODELS.VISION);
  }

  getWhisperModel() {
    return this.get("model_whisper", CONFIG.MODELS.WHISPER);
  }

  isAutoTagEnabled() {
    return this.get("feature_autotag", "1") === "1";
  }

  isUrlScrapeEnabled() {
    return this.get("feature_url_scrape", "1") === "1";
  }
}

// ----------------------------------------------------------------------------
// 4. CRYPTOGRAPHIC, ACCESS CONTROL & UTILITY HELPERS
// ----------------------------------------------------------------------------
function getBotToken(env) {
  return (env && env.BOT_TOKEN) ? env.BOT_TOKEN : CONFIG.BOT_TOKEN;
}

function isAdmin(userId, env) {
  if (!userId) return false;
  const numId = Number(userId);
  if (CONFIG.ADMIN_IDS.includes(numId)) return true;
  if (env && env.ADMIN_IDS) {
    const extra = String(env.ADMIN_IDS).split(",").map((x) => Number(x.trim()));
    if (extra.includes(numId)) return true;
  }
  return false;
}

async function checkUserAccess(env, cfg, user) {
  if (!user || !user.id) return false;
  if (isAdmin(user.id, env)) return true;

  const mode = cfg.getAccessMode();
  if (mode === "admin") return false;

  const now = Date.now();
  const row = await env.DB.prepare(`SELECT * FROM users WHERE user_id = ?1`).bind(user.id).first();

  if (!row) {
    await env.DB.prepare(
      `INSERT INTO users (user_id, username, first_name, is_whitelisted, is_banned, req_count, window_start, created_at)
       VALUES (?1, ?2, ?3, 0, 0, 1, ?4, ?4)`
    ).bind(user.id, user.username || "", user.first_name || "", now).run();
    return mode === "public";
  }

  if (row.is_banned === 1) return false;
  if (mode === "whitelist" && row.is_whitelisted !== 1) return false;

  // Rate limiting check
  let reqCount = row.req_count || 0;
  let winStart = row.window_start || now;
  if (now - winStart > 60000) {
    reqCount = 1;
    winStart = now;
  } else {
    reqCount += 1;
  }
  await env.DB.prepare(
    `UPDATE users SET req_count = ?1, window_start = ?2, username = ?3, first_name = ?4 WHERE user_id = ?5`
  ).bind(reqCount, winStart, user.username || "", user.first_name || "", user.id).run();

  if (reqCount > CONFIG.RATE_LIMIT_PER_MIN) {
    return "RATE_LIMITED";
  }
  return true;
}

async function sha256Hex(input) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validates Telegram Mini App initData using WebCrypto HMAC-SHA256
 */
async function verifyTelegramWebAppInitData(initDataRaw, botToken) {
  try {
    if (!initDataRaw) return null;
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    const sortedKeys = Array.from(params.keys()).sort();
    const dataCheckString = sortedKeys.map((k) => `${k}=${params.get(k)}`).join("\n");

    const enc = new TextEncoder();
    const secretKeyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const secretKeyBuf = await crypto.subtle.sign("HMAC", secretKeyMaterial, enc.encode(botToken));

    const validationKey = await crypto.subtle.importKey(
      "raw",
      secretKeyBuf,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", validationKey, enc.encode(dataCheckString));
    const calculatedHash = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (calculatedHash !== hash.toLowerCase()) return null;
    const userStr = params.get("user");
    return userStr ? JSON.parse(userStr) : { id: 0 };
  } catch (_) {
    return null;
  }
}

function buildDeepLink(chat, messageId) {
  if (!chat || !messageId) return "";
  if (chat.username) {
    return `https://t.me/${chat.username}/${messageId}`;
  }
  const idStr = String(chat.id);
  if (idStr.startsWith("-100")) {
    const cleanId = idStr.slice(4);
    return `https://t.me/c/${cleanId}/${messageId}`;
  }
  if (chat.id > 0) {
    return `tg://openmessage?user_id=${chat.id}&message_id=${messageId}`;
  }
  return "";
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chunkTextSliding(text, maxLen = CONFIG.CHUNK_SIZE, overlap = CONFIG.CHUNK_OVERLAP) {
  const clean = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + maxLen, clean.length);
    if (end < clean.length) {
      const nl = clean.lastIndexOf("\n", end);
      const sp = clean.lastIndexOf(" ", end);
      if (nl > start + maxLen * 0.5) end = nl;
      else if (sp > start + maxLen * 0.5) end = sp;
    }
    const slice = clean.slice(start, end).trim();
    if (slice) chunks.push(slice);
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks.slice(0, 25); // حداکثر ۲۵ قطعه برای هر فایل بزرگ جهت جلوگیری از سرریز CPU
}

// ----------------------------------------------------------------------------
// 5. ZERO-DEPENDENCY FILE & BINARY DOCUMENT PARSERS (PDF, DOCX, EPUB, WEB)
// ----------------------------------------------------------------------------

async function decompressDeflateRaw(uint8SubArray) {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(uint8SubArray);
  writer.close();
  const outBuf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(outBuf);
}

async function decompressZlibFlate(uint8SubArray) {
  for (const format of ["deflate", "deflate-raw"]) {
    try {
      const ds = new DecompressionStream(format);
      const writer = ds.writable.getWriter();
      writer.write(uint8SubArray);
      writer.close();
      const outBuf = await new Response(ds.readable).arrayBuffer();
      return new Uint8Array(outBuf);
    } catch (_) {}
  }
  return null;
}

/**
 * Native ZIP Container Extractor for DOCX (word/document.xml) & EPUB (.xhtml/.html/.opf)
 */
async function extractZipXmlDocuments(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const extractedTexts = [];
  let offset = 0;

  while (offset + 30 < bytes.length) {
    // Local file header signature = 0x04034b50
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) {
      offset++;
      continue;
    }

    const bitFlag = view.getUint16(offset + 6, true);
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);

    const nameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLen);
    const fileName = new TextDecoder("utf-8").decode(nameBytes);
    const dataStart = offset + 30 + fileNameLen + extraLen;

    // اگر سایز در هدر صفر باشد (Data Descriptor)، تا امضای بعدی جستجو می‌کنیم
    let actualCompSize = compressedSize;
    if ((bitFlag & 0x0008) !== 0 && actualCompSize === 0) {
      let scan = dataStart;
      while (scan + 4 < bytes.length) {
        const nextSig = view.getUint32(scan, true);
        if (nextSig === 0x04034b50 || nextSig === 0x02014b50 || nextSig === 0x08074b50) break;
        scan++;
      }
      actualCompSize = scan - dataStart;
    }

    const isTargetXml =
      fileName === "word/document.xml" ||
      fileName.endsWith(".xhtml") ||
      fileName.endsWith(".html") ||
      fileName.endsWith(".htm") ||
      fileName.endsWith(".opf") ||
      fileName === "content.xml"; // ODT support

    if (isTargetXml && dataStart + actualCompSize <= bytes.length && actualCompSize > 0) {
      try {
        const slice = bytes.subarray(dataStart, dataStart + actualCompSize);
        let rawBytes = null;
        if (compression === 0) {
          rawBytes = slice;
        } else if (compression === 8) {
          rawBytes = await decompressDeflateRaw(slice);
        }
        if (rawBytes) {
          const xmlText = new TextDecoder("utf-8", { fatal: false }).decode(rawBytes);
          const clean = xmlText
            .replace(/<\/w:p>/g, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
          if (clean.length > 5) extractedTexts.push(clean);
        }
      } catch (_) {}
    }

    offset = dataStart + Math.max(1, actualCompSize);
  }

  return extractedTexts.join("\n\n").trim();
}

/**
 * Native Edge PDF Text Stream Parser (supports FlateDecode streams, Tj, TJ, and UTF-16BE Hex)
 */
async function extractPdfTextNative(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const latin = new TextDecoder("latin1").decode(bytes);
  const chunks = [];

  function parsePdfTextOperators(contentStr) {
    const out = [];
    // Literal strings (...) Tj / TJ
    const parenRegex = /\((?:\\.|[^\\()])*\)/g;
    let m;
    while ((m = parenRegex.exec(contentStr)) !== null) {
      let inner = m[0].slice(1, -1);
      inner = inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, " ")
        .replace(/\\t/g, " ")
        .replace(/\\\(/g, "(") .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (inner.trim().length > 1) out.push(inner);
    }

    // Hex strings <FEFF...> (UTF-16BE)
    const hexRegex = /<([0-9A-Fa-f]{4,})>/g;
    while ((m = hexRegex.exec(contentStr)) !== null) {
      const hex = m[1];
      if (hex.length % 4 === 0) {
        let decoded = "";
        for (let i = 0; i < hex.length; i += 4) {
          const code = parseInt(hex.slice(i, i + 4), 16);
          if (code > 31 && code !== 0xfeff) decoded += String.fromCharCode(code);
        }
        if (decoded.trim().length > 1) out.push(decoded);
      }
    }
    return out.join(" ");
  }

  // استخراج استریم‌های فشرده‌شده داخل PDF
  let searchPos = 0;
  let streamCount = 0;
  while (searchPos < latin.length && streamCount < 120) {
    const sIdx = latin.indexOf("stream", searchPos);
    if (sIdx === -1) break;
    const eIdx = latin.indexOf("endstream", sIdx);
    if (eIdx === -1) break;

    let dataStart = sIdx + 6;
    if (bytes[dataStart] === 13 && bytes[dataStart + 1] === 10) dataStart += 2;
    else if (bytes[dataStart] === 10 || bytes[dataStart] === 13) dataStart += 1;

    let dataEnd = eIdx;
    if (bytes[dataEnd - 2] === 13 && bytes[dataEnd - 1] === 10) dataEnd -= 2;
    else if (bytes[dataEnd - 1] === 10 || bytes[dataEnd - 1] === 13) dataEnd -= 1;

    if (dataEnd > dataStart && dataEnd - dataStart < 2 * 1024 * 1024) {
      const rawSlice = bytes.subarray(dataStart, dataEnd);
      const decompressed = await decompressZlibFlate(rawSlice);
      const targetStr = decompressed
        ? new TextDecoder("latin1").decode(decompressed)
        : latin.slice(dataStart, dataEnd);

      if (targetStr.includes("BT") || targetStr.includes("Tj") || targetStr.includes("TJ")) {
        const parsed = parsePdfTextOperators(targetStr);
        if (parsed.trim()) chunks.push(parsed.trim());
      }
      streamCount++;
    }
    searchPos = eIdx + 9;
  }

  if (chunks.length === 0) {
    const fallback = parsePdfTextOperators(latin);
    if (fallback.trim()) chunks.push(fallback.trim());
  }

  return chunks.join("\n").replace(/\s+/g, " ").trim();
}

/**
 * Universal File Buffer Dispatcher (TXT, MD, JSON, CSV, HTML, DOCX, EPUB, PDF)
 */
async function extractTextFromFileBuffer(arrayBuffer, fileName = "", mimeType = "") {
  const lowerName = (fileName || "").toLowerCase();
  const lowerMime = (mimeType || "").toLowerCase();

  // 1. DOCX / EPUB / ODT (ZIP-based XML containers)
  if (
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".epub") ||
    lowerName.endsWith(".odt") ||
    lowerMime.includes("officedocument.wordprocessingml") ||
    lowerMime.includes("epub")
  ) {
    const zipText = await extractZipXmlDocuments(arrayBuffer);
    if (zipText) return zipText;
  }

  // 2. PDF Documents
  if (lowerName.endsWith(".pdf") || lowerMime.includes("pdf")) {
    const pdfText = await extractPdfTextNative(arrayBuffer);
    if (pdfText) return pdfText;
  }

  // 3. Plain Text / Code / Markdown / CSV / JSON / XML / HTML
  const rawText = new TextDecoder("utf-8", { fatal: false }).decode(arrayBuffer);
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm") || lowerMime.includes("html")) {
    return rawText
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // حذف کاراکترهای باینری ناخوانا در فرمت‌های ناشناخته
  return rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ").trim();
}

/**
 * Webpage Scraper & Semantic Content Extractor
 */
async function scrapeWebUrl(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5500);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SemanticArchiveEngine/2.0; +https://workers.cloudflare.com)",
        "Accept": "text/html,application/xhtml+xml,text/plain",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/") && !ct.includes("json") && !ct.includes("xml")) return null;

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);

    if (!bodyText && !title) return null;
    return `[عنوان وب‌سایت: ${title}]\n[آدرس: ${url}]\n${bodyText}`;
  } catch (_) {
    return null;
  }
}

// ----------------------------------------------------------------------------
// 6. WORKERS AI & HYBRID VECTORIZE ENGINE (BGE-M3 + VISION + WHISPER + LLM)
// ----------------------------------------------------------------------------

async function generateEmbeddingVector(env, cfg, text) {
  if (!env.AI) throw new Error("Workers AI binding (env.AI) is not connected.");
  const clean = String(text || "").slice(0, 3500).trim();
  if (!clean) return null;

  const model = cfg.getEmbedModel();
  const response = await env.AI.run(model, { text: [clean] });
  if (response && response.data && Array.isArray(response.data[0])) {
    return response.data[0];
  }
  throw new Error("Invalid embedding output from Workers AI.");
}

async function analyzeImageWithVisionAI(env, cfg, arrayBuffer) {
  if (!env.AI) return "تصویر ثبت‌شده (موتور بینایی غیرفعال)";
  try {
    const uint8 = Array.from(new Uint8Array(arrayBuffer));
    const model = cfg.getVisionModel();
    const res = await env.AI.run(model, {
      image: uint8,
      prompt: "Describe this image in detail, including any visible text, objects, diagrams, and technical context.",
      max_tokens: 256,
    });
    const desc = res?.description || res?.response || "";
    return desc.trim() || "تصویر گرافیکی ثبت‌شده در آرشیو";
  } catch (e) {
    await logKernelError(env, "analyzeImageWithVisionAI", e);
    return "تصویر آرشیوشده (بدون متادیتای بینایی)";
  }
}

async function transcribeAudioWithWhisper(env, cfg, arrayBuffer) {
  if (!env.AI) return "";
  try {
    const uint8 = Array.from(new Uint8Array(arrayBuffer));
    const model = cfg.getWhisperModel();
    const res = await env.AI.run(model, { audio: uint8 });
    return (res?.text || "").trim();
  } catch (e) {
    await logKernelError(env, "transcribeAudioWithWhisper", e);
    return "";
  }
}

async function generateTagsAndSummary(env, cfg, text) {
  if (!env.AI || !cfg.isAutoTagEnabled() || text.length < 35) {
    return { summary: text.slice(0, 140), tags: "" };
  }
  try {
    const model = cfg.getLlmModel();
    const res = await env.AI.run(model, {
      messages: [
        {
          role: "system",
          content:
            "You are an indexing engine. Output ONLY a JSON object with keys: \"summary\" (1 concise sentence in Persian) and \"tags\" (comma-separated technical tags in Persian or English, max 4 tags). No markdown.",
        },
        { role: "user", content: text.slice(0, 1800) },
      ],
      max_tokens: 150,
      temperature: 0.1,
    });
    const raw = (res?.response || "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: String(parsed.summary || text.slice(0, 140)).slice(0, 280),
        tags: String(parsed.tags || "").slice(0, 150),
      };
    }
  } catch (_) {}
  return { summary: text.slice(0, 140), tags: "" };
}

async function synthesizeRagAnswer(env, cfg, question, matchedNotes) {
  if (!env.AI || matchedNotes.length === 0) return null;
  try {
    const contextBlock = matchedNotes
      .slice(0, 6)
      .map(
        (n, idx) =>
          `[سند #${idx + 1} | منبع: ${n.chat_title || "آرشیو"} | تاریخ: ${new Date(n.created_at).toISOString().slice(0, 10)}]\n${n.raw_text.slice(0, 900)}`
      )
      .join("\n\n---\n\n");

    const res = await env.AI.run(cfg.getLlmModel(), {
      messages: [
        {
          role: "system",
          content:
            "تو یک مهندس سیستم و موتور بازیابی اطلاعات خشک و دقیق هستی. فقط بر اساس اسناد داده‌شده به سوال کاربر به زبان فارسی پاسخ فنی، کوتاه و مستند بده و به شماره سند مثل [سند #1] ارجاع بده.",
        },
        {
          role: "user",
          content: `اسناد بازیابی‌شده:\n${contextBlock}\n\nسوال کاربر: ${question}`,
        },
      ],
      max_tokens: 450,
      temperature: 0.15,
    });
    return (res?.response || "").trim();
  } catch (e) {
    await logKernelError(env, "synthesizeRagAnswer", e);
    return null;
  }
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Parses Inline & Search DSL Filters:
 * e.g. "type:photo chat:channel from:ali star:1 کوبرنتیز"
 */
function parseSearchQueryDsl(rawQuery) {
  let q = String(rawQuery || "").trim();
  const filters = {
    mediaType: null,
    chatType: null,
    sender: null,
    tag: null,
    starredOnly: false,
    isRagQuestion: false,
  };

  if (q.startsWith("?") || q.startsWith("؟")) {
    filters.isRagQuestion = true;
    q = q.slice(1).trim();
  }

  const tokenRegex = /\b(type|chat|from|tag|star):([^\s]+)/gi;
  q = q.replace(tokenRegex, (_, key, val) => {
    const k = key.toLowerCase();
    const v = val.toLowerCase();
    if (k === "type") filters.mediaType = v;
    if (k === "chat") filters.chatType = v;
    if (k === "from") filters.sender = v.replace(/^@/, "");
    if (k === "tag") filters.tag = v;
    if (k === "star") filters.starredOnly = v === "1" || v === "true";
    return "";
  });

  return { cleanQuery: q.replace(/\s+/g, " ").trim(), filters };
}

/**
 * Hybrid Semantic + Lexical RRF Search Engine
 * Combines Cloudflare Vectorize + D1 Cosine Fallback + D1 SQL Keyword Matching
 */
async function executeHybridSearch(env, cfg, rawQuery, options = {}) {
  const startTime = Date.now();
  const { cleanQuery, filters } = parseSearchQueryDsl(rawQuery);
  const topK = options.topK || CONFIG.TOP_K;

  // اگر کوئری متنی خالی بود ولی فیلتر داشتیم (یا نمایش آخرین رکوردها در اینلاین خالی)
  if (!cleanQuery) {
    let sql = `SELECT * FROM notes WHERE chunk_index = 0`;
    const binds = [];
    if (filters.mediaType) {
      binds.push(filters.mediaType);
      sql += ` AND media_type = ?${binds.length}`;
    }
    if (filters.chatType) {
      binds.push(filters.chatType);
      sql += ` AND chat_type = ?${binds.length}`;
    }
    if (filters.starredOnly) {
      sql += ` AND is_starred = 1`;
    }
    sql += ` ORDER BY is_starred DESC, created_at DESC LIMIT ${Number(topK)}`;
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return {
      results: (results || []).map((r) => ({ ...r, score: 1.0 })),
      latencyMs: Date.now() - startTime,
      filters,
      cleanQuery,
    };
  }

  const rrfScores = new Map(); // noteId -> combined RRF score
  const vectorScores = new Map(); // noteId -> cosine score
  let queryVector = null;

  // 1. Vector Search (Cloudflare Vectorize + D1 Fallback)
  try {
    queryVector = await generateEmbeddingVector(env, cfg, cleanQuery);
    if (queryVector && env.VECTORIZE) {
      const vecMatches = await env.VECTORIZE.query(queryVector, {
        topK: topK * 2,
        returnMetadata: "all",
      });
      (vecMatches?.matches || []).forEach((m, rank) => {
        const baseId = m.metadata?.parent_id || m.id;
        const prevScore = rrfScores.get(baseId) || 0;
        rrfScores.set(baseId, prevScore + 1 / (40 + rank + 1));
        if (!vectorScores.has(baseId) || m.score > vectorScores.get(baseId)) {
          vectorScores.set(baseId, m.score);
        }
      });
    }
  } catch (e) {
    await logKernelError(env, "executeHybridSearch.vectorize", e);
  }

  // 2. Lexical / Keyword Search on D1
  const likeTerm = `%${cleanQuery}%`;
  const { results: lexRows } = await env.DB.prepare(
    `SELECT * FROM notes
     WHERE raw_text LIKE ?1 OR summary LIKE ?1 OR tags LIKE ?1 OR file_name LIKE ?1 OR sender_name LIKE ?1
     ORDER BY is_starred DESC, created_at DESC LIMIT 30`
  ).bind(likeTerm).all();

  const rowCache = new Map();
  (lexRows || []).forEach((row, rank) => {
    const baseId = row.parent_id || row.id;
    rowCache.set(baseId, row);
    const prev = rrfScores.get(baseId) || 0;
    rrfScores.set(baseId, prev + 1.15 / (40 + rank + 1));
  });

  // 3. D1 In-Memory Cosine Fallback (اگر Vectorize نتیجه‌ای نداد یا متصل نبود)
  if (queryVector && vectorScores.size === 0) {
    const { results: recentVecRows } = await env.DB.prepare(
      `SELECT * FROM notes WHERE embedding_json IS NOT NULL ORDER BY created_at DESC LIMIT 200`
    ).all();

    const scoredFallback = [];
    for (const r of recentVecRows || []) {
      try {
        const vec = JSON.parse(r.embedding_json);
        const sim = cosineSimilarity(queryVector, vec);
        if (sim > 0.25) {
          scoredFallback.push({ row: r, sim });
        }
      } catch (_) {}
    }
    scoredFallback.sort((a, b) => b.sim - a.sim);
    scoredFallback.slice(0, topK * 2).forEach((item, rank) => {
      const baseId = item.row.parent_id || item.row.id;
      rowCache.set(baseId, item.row);
      const prev = rrfScores.get(baseId) || 0;
      rrfScores.set(baseId, prev + 1 / (40 + rank + 1));
      vectorScores.set(baseId, item.sim);
    });
  }

  // 4. Hydrate Missing Rows from D1
  const candidateIds = Array.from(rrfScores.keys());
  const missingIds = candidateIds.filter((id) => !rowCache.has(id));
  if (missingIds.length > 0) {
    const placeholders = missingIds.map((_, i) => `?${i + 1}`).join(",");
    const { results: hydrated } = await env.DB.prepare(
      `SELECT * FROM notes WHERE id IN (${placeholders})`
    ).bind(...missingIds).all();
    for (const h of hydrated || []) {
      rowCache.set(h.id, h);
    }
  }

  // 5. Apply DSL Filters & Rank Final Output
  let finalItems = [];
  for (const [id, rrf] of rrfScores.entries()) {
    const note = rowCache.get(id);
    if (!note) continue;

    if (filters.mediaType && !note.media_type.toLowerCase().includes(filters.mediaType)) continue;
    if (filters.chatType && !(note.chat_type || "").toLowerCase().includes(filters.chatType)) continue;
    if (
      filters.sender &&
      !(note.sender_username || "").toLowerCase().includes(filters.sender) &&
      !(note.sender_name || "").toLowerCase().includes(filters.sender)
    ) {
      continue;
    }
    if (filters.tag && !(note.tags || "").toLowerCase().includes(filters.tag)) continue;
    if (filters.starredOnly && note.is_starred !== 1) continue;

    const cosSim = vectorScores.get(id) || 0.78;
    const starBoost = note.is_starred === 1 ? 0.08 : 0;
    finalItems.push({
      ...note,
      score: Math.min(0.99, cosSim + starBoost),
      rrfScore: rrf + starBoost,
    });
  }

  finalItems.sort((a, b) => b.rrfScore - a.rrfScore);
  finalItems = finalItems.slice(0, topK);

  return {
    results: finalItems,
    latencyMs: Date.now() - startTime,
    filters,
    cleanQuery,
  };
}

/**
 * Nearest-Neighbor Graph Lookup (یافتن رکوردهای هم‌مفهوم با یک رکورد خاص)
 */
async function findNearestNeighbors(env, cfg, noteId, topK = 6) {
  const target = await env.DB.prepare(`SELECT * FROM notes WHERE id = ?1`).bind(noteId).first();
  if (!target) return [];
  const res = await executeHybridSearch(env, cfg, target.raw_text.slice(0, 600), { topK: topK + 2 });
  return res.results.filter((r) => r.id !== noteId && r.parent_id !== noteId).slice(0, topK);
}

// ----------------------------------------------------------------------------
// 7. TELEGRAM BOT API CLIENT & GRAPHICAL KEYBOARD ENGINE
// ----------------------------------------------------------------------------

async function tgApi(env, method, payload = {}) {
  const token = getBotToken(env);
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  if (!data.ok) {
    console.warn(`TG API Warning [${method}]:`, JSON.stringify(data));
  }
  return data;
}

async function downloadTelegramFile(env, fileId) {
  const token = getBotToken(env);
  const info = await tgApi(env, "getFile", { file_id: fileId });
  if (!info.ok || !info.result?.file_path) {
    throw new Error("امکان دریافت مسیر فایل از سرور تلگرام وجود ندارد.");
  }
  const fileSize = info.result.file_size || 0;
  if (fileSize > CONFIG.MAX_FILE_BYTES) {
    throw new Error(`حجم فایل (${(fileSize / 1048576).toFixed(1)}MB) بیش از سقف پردازش حافظه ورکر است.`);
  }
  const fileUrl = `https://api.telegram.org/file/bot${token}/${info.result.file_path}`;
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error("خطا در دانلود باینری فایل از تلگرام.");
  return {
    buffer: await res.arrayBuffer(),
    filePath: info.result.file_path,
    fileSize,
  };
}

function buildMainDashboardKeyboard(cfg, workerOrigin, userIsAdmin) {
  const rows = [
    [
      {
        text: cfg.get("btn_inline_search"),
        switch_inline_query_current_chat: "",
      },
      {
        text: cfg.get("btn_mini_app"),
        web_app: { url: `${workerOrigin}/app` },
      },
    ],
    [
      { text: cfg.get("btn_stats"), callback_data: "act:stats" },
      { text: cfg.get("btn_starred"), callback_data: "act:starred:0" },
    ],
    [
      { text: cfg.get("btn_recent"), callback_data: "act:recent:0" },
      { text: cfg.get("btn_help"), callback_data: "act:help" },
    ],
  ];

  if (userIsAdmin) {
    rows.push([{ text: cfg.get("btn_admin_panel"), callback_data: "adm:home" }]);
  }

  return { inline_keyboard: rows };
}

function buildNoteActionKeyboard(cfg, note) {
  const rows = [];
  const topRow = [];

  if (note.deep_link && note.deep_link.startsWith("http")) {
    topRow.push({ text: cfg.get("btn_jump_msg"), url: note.deep_link });
  }
  topRow.push({
    text: cfg.get("btn_copy_text"),
    copy_text: { text: (note.raw_text || "").slice(0, 250) },
  });
  if (topRow.length > 0) rows.push(topRow);

  rows.push([
    {
      text: `${note.is_starred ? "★ نشان‌دار" : cfg.get("btn_star_toggle")}`,
      callback_data: `node:star:${note.id}`,
    },
    {
      text: cfg.get("btn_similar"),
      callback_data: `node:sim:${note.id}`,
    },
  ]);

  rows.push([
    {
      text: cfg.get("btn_delete_node"),
      callback_data: `node:del:${note.id}`,
    },
  ]);

  return { inline_keyboard: rows };
}

function formatNoteTechnicalCard(note, latencyMs = null) {
  const dateStr = new Date(note.created_at).toISOString().replace("T", " ").slice(0, 19);
  const scorePct = note.score ? `${(note.score * 100).toFixed(1)}%` : "100%";
  const mediaBadge = (note.media_type || "text").toUpperCase();
  const chatLabel = escapeHtml(note.chat_title || "چت خصوصی / Saved");
  const senderLabel = escapeHtml(
    note.sender_name
      ? `${note.sender_name}${note.sender_username ? ` (@${note.sender_username})` : ""}`
      : "سیستم"
  );

  let header = `<b>▣ شناسه نود:</b> <code>${note.id}</code> ${note.is_starred ? "★" : ""}\n`;
  header += `<b>├─ نوع داده:</b> <code>${mediaBadge}</code> | <b>تطابق:</b> <code>${scorePct}</code>\n`;
  header += `<b>├─ مبدا:</b> ${chatLabel}\n`;
  header += `<b>├─ فرستنده:</b> ${senderLabel}\n`;
  if (note.file_name) {
    header += `<b>├─ فایل:</b> <code>${escapeHtml(note.file_name)}</code>\n`;
  }
  if (note.tags) {
    header += `<b>├─ تگ‌ها:</b> <code>${escapeHtml(note.tags)}</code>\n`;
  }
  header += `<b>└─ زمان ثبت:</b> <code>${dateStr} UTC</code>`;
  if (latencyMs !== null) {
    header += ` | <code>${latencyMs}ms</code>`;
  }

  const snippet = escapeHtml((note.raw_text || "").slice(0, 1400));
  let body = `\n\n<blockquote expandable>${snippet}${(note.raw_text || "").length > 1400 ? "..." : ""}</blockquote>`;

  if (note.deep_link && note.deep_link.startsWith("http")) {
    body += `\n\n🔗 <a href="${note.deep_link}">لینک مستقیم به محل پیام در تلگرام</a>`;
  }

  return header + body;
}

// === END OF PART 1 - PASTE PART 2 IMMEDIATELY BELOW THIS LINE ===
// === START OF PART 2 - PASTE IMMEDIATELY BELOW PART 1 ===

// ----------------------------------------------------------------------------
// 8. UNIVERSAL INGESTION PIPELINE (CHANNELS, GROUPS, PRIVATE, FILES, MEDIA)
// ----------------------------------------------------------------------------

async function sendDocumentBlob(env, chatId, fileName, contentString, caption = "") {
  const token = getBotToken(env);
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  const blob = new Blob([contentString], { type: "application/jsonl;charset=utf-8" });
  form.append("document", blob, fileName);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });
  return res.json().catch(() => ({ ok: false }));
}

async function syncChatRegistry(env, chat, incrementIndexed = 0) {
  if (!chat || !chat.id) return true;
  const now = Date.now();
  const title =
    chat.title ||
    [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
    chat.username ||
    `Chat_${chat.id}`;
  const type = chat.type || "private";
  const username = chat.username || "";

  const existing = await env.DB.prepare(`SELECT is_enabled FROM chats WHERE chat_id = ?1`)
    .bind(chat.id)
    .first();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO chats (chat_id, chat_title, chat_type, chat_username, is_enabled, indexed_count, last_sync)
       VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)`
    ).bind(chat.id, title, type, username, incrementIndexed, now).run();
    return true;
  }

  if (existing.is_enabled === 0) {
    return false; // این کانال یا گروه توسط ادمین غیرفعال شده است
  }

  if (incrementIndexed > 0) {
    await env.DB.prepare(
      `UPDATE chats SET chat_title = ?1, chat_username = ?2, indexed_count = indexed_count + ?3, last_sync = ?4 WHERE chat_id = ?5`
    ).bind(title, username, incrementIndexed, now, chat.id).run();
  } else {
    await env.DB.prepare(
      `UPDATE chats SET chat_title = ?1, chat_username = ?2, last_sync = ?3 WHERE chat_id = ?4`
    ).bind(title, username, now, chat.id).run();
  }
  return true;
}

function extractSenderMetadata(msg) {
  let userId = msg.from?.id || msg.sender_chat?.id || msg.chat?.id || 0;
  let senderName = "";
  let senderUsername = "";

  if (msg.from) {
    senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ");
    senderUsername = msg.from.username || "";
  } else if (msg.sender_chat) {
    senderName = msg.sender_chat.title || "Channel";
    senderUsername = msg.sender_chat.username || "";
  } else if (msg.chat) {
    senderName = msg.chat.title || "Channel";
    senderUsername = msg.chat.username || "";
  }

  // اگر پیام فوروارد شده باشد، اطلاعات منبع اصلی را هم به متادیتا اضافه می‌کنیم
  let forwardContext = "";
  if (msg.forward_origin) {
    const fo = msg.forward_origin;
    if (fo.type === "channel" && fo.chat) {
      forwardContext = `[فوروارد شده از کانال: ${fo.chat.title || ""}${fo.chat.username ? ` (@${fo.chat.username})` : ""}]`;
    } else if (fo.type === "user" && fo.sender_user) {
      const fn = [fo.sender_user.first_name, fo.sender_user.last_name].filter(Boolean).join(" ");
      forwardContext = `[فوروارد شده از کاربر: ${fn}]`;
    } else if (fo.sender_user_name) {
      forwardContext = `[فوروارد شده از: ${fo.sender_user_name}]`;
    }
  } else if (msg.forward_from_chat) {
    forwardContext = `[فوروارد شده از: ${msg.forward_from_chat.title || ""}]`;
  } else if (msg.forward_from) {
    const fn = [msg.forward_from.first_name, msg.forward_from.last_name].filter(Boolean).join(" ");
    forwardContext = `[فوروارد شده از: ${fn}]`;
  }

  return { userId, senderName, senderUsername, forwardContext };
}

/**
 * Extracts semantic text + media descriptors from ANY Telegram message format
 */
async function extractUniversalMessagePayload(env, cfg, msg) {
  let mediaType = "text";
  let fileId = "";
  let fileUniqueId = "";
  let fileName = "";
  let mimeType = "text/plain";
  const textParts = [];

  const { userId, senderName, senderUsername, forwardContext } = extractSenderMetadata(msg);
  if (forwardContext) textParts.push(forwardContext);

  const baseCaption = (msg.text || msg.caption || "").trim();
  if (baseCaption) textParts.push(baseCaption);

  // 1. Photo (تحلیل با مدل بینایی ماشین + ذخیره file_id برای رندر گالری در اینلاین)
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    mediaType = "photo";
    const bestPhoto = msg.photo[msg.photo.length - 1];
    fileId = bestPhoto.file_id;
    fileUniqueId = bestPhoto.file_unique_id || "";
    mimeType = "image/jpeg";
    try {
      const dl = await downloadTelegramFile(env, fileId);
      const visionDesc = await analyzeImageWithVisionAI(env, cfg, dl.buffer);
      if (visionDesc) textParts.push(`[توصیف بصری تصویر (Vision AI): ${visionDesc}]`);
    } catch (e) {
      await logKernelError(env, "ingest.photo", e);
    }
  }

  // 2. Voice / Audio (پیاده‌سازی صوت به متن با مدل Whisper)
  else if (msg.voice || msg.audio) {
    const mediaObj = msg.voice || msg.audio;
    mediaType = msg.voice ? "voice" : "audio";
    fileId = mediaObj.file_id;
    fileUniqueId = mediaObj.file_unique_id || "";
    fileName = mediaObj.file_name || (msg.voice ? "voice_message.ogg" : "audio_track.mp3");
    mimeType = mediaObj.mime_type || "audio/ogg";
    if (mediaObj.title || mediaObj.performer) {
      textParts.push(`[متادیتای صوتی: ${mediaObj.performer || ""} - ${mediaObj.title || ""}]`);
    }
    try {
      const dl = await downloadTelegramFile(env, fileId);
      const transcript = await transcribeAudioWithWhisper(env, cfg, dl.buffer);
      if (transcript) textParts.push(`[متن استخراج‌شده از صوت (Whisper ASR): ${transcript}]`);
    } catch (e) {
      await logKernelError(env, "ingest.audio", e);
    }
  }

  // 3. Document (PDF, DOCX, EPUB, TXT, CSV, JSON, Code, Images sent as file, etc.)
  else if (msg.document) {
    const doc = msg.document;
    mediaType = "doc";
    fileId = doc.file_id;
    fileUniqueId = doc.file_unique_id || "";
    fileName = doc.file_name || "document.bin";
    mimeType = doc.mime_type || "application/octet-stream";
    textParts.push(`[نام فایل: ${fileName} | فرمت: ${mimeType}]`);

    try {
      const dl = await downloadTelegramFile(env, fileId);
      if (mimeType.startsWith("image/")) {
        const visionDesc = await analyzeImageWithVisionAI(env, cfg, dl.buffer);
        if (visionDesc) textParts.push(`[تحلیل تصویر سندی: ${visionDesc}]`);
      } else {
        const docText = await extractTextFromFileBuffer(dl.buffer, fileName, mimeType);
        if (docText && docText.length > 2) {
          textParts.push(`[محتوای استخراج‌شده از سند:\n${docText}]`);
        }
      }
    } catch (e) {
      await logKernelError(env, "ingest.document", e);
    }
  }

  // 4. Video / VideoNote / Animation / Sticker
  else if (msg.video || msg.video_note || msg.animation || msg.sticker) {
    const v = msg.video || msg.video_note || msg.animation || msg.sticker;
    mediaType = msg.sticker ? "sticker" : "video";
    fileId = v.file_id;
    fileUniqueId = v.file_unique_id || "";
    fileName = v.file_name || (msg.sticker ? `sticker_${v.emoji || ""}.webp` : "video_media.mp4");
    mimeType = v.mime_type || "video/mp4";
    if (msg.sticker) {
      textParts.push(`[استیکر تلگرام | ایموجی: ${msg.sticker.emoji || ""} | پک: ${msg.sticker.set_name || ""}]`);
    } else {
      textParts.push(`[فایل ویدیویی: ${fileName} | مدت: ${v.duration || 0}s]`);
    }
  }

  // 5. Poll / Location / Contact
  else if (msg.poll) {
    mediaType = "poll";
    const opts = (msg.poll.options || []).map((o) => `- ${o.text}`).join("\n");
    textParts.push(`[نظرسنجی: ${msg.poll.question}]\nگزینه‌ها:\n${opts}`);
  } else if (msg.location || msg.venue) {
    mediaType = "location";
    const loc = msg.location || msg.venue?.location;
    const venueTitle = msg.venue ? `${msg.venue.title} - ${msg.venue.address}` : "";
    textParts.push(`[موقعیت جغرافیایی: ${venueTitle} | مختصات: ${loc?.latitude}, ${loc?.longitude}]`);
  } else if (msg.contact) {
    mediaType = "contact";
    textParts.push(
      `[مخاطب: ${msg.contact.first_name || ""} ${msg.contact.last_name || ""} | تلفن: ${msg.contact.phone_number || ""}]`
    );
  }

  // 6. URL Extraction & Webpage Scraping
  let sourceUrl = "";
  const urlMatch = baseCaption.match(/https?:\/\/[^\s<>"]+/i);
  if (urlMatch) {
    sourceUrl = urlMatch[0];
    if (cfg.isUrlScrapeEnabled() && mediaType === "text") {
      const scraped = await scrapeWebUrl(sourceUrl);
      if (scraped) textParts.push(scraped);
    }
  }

  const combinedText = textParts.join("\n\n").trim();
  return {
    userId,
    senderName,
    senderUsername,
    mediaType,
    fileId,
    fileUniqueId,
    fileName,
    mimeType,
    sourceUrl,
    rawText: combinedText,
  };
}

/**
 * Stores or updates message + chunks into D1 and Vectorize
 */
async function ingestTelegramMessage(env, cfg, msg, options = {}) {
  const chat = msg.chat;
  if (!chat) return null;

  const isChatAllowed = await syncChatRegistry(env, chat, 0);
  if (!isChatAllowed) return { skipped: true, reason: "chat_disabled" };

  const payload = await extractUniversalMessagePayload(env, cfg, msg);
  if (!payload.rawText || payload.rawText.length < 2) {
    return { skipped: true, reason: "empty_payload" };
  }

  const now = Date.now();
  const expiresAt = options.ttlMinutes ? now + options.ttlMinutes * 60 * 1000 : 0;
  const deepLink = buildDeepLink(chat, msg.message_id);
  const contentHash = await sha256Hex(`${chat.id}:${payload.fileUniqueId}:${payload.rawText}`);

  // اگر پیام ویرایش شده است، رکوردهای قبلی همین پیام را پاک می‌کنیم تا بردار جدید جایگزین شود
  if (options.isEdit && msg.message_id) {
    const { results: oldRows } = await env.DB.prepare(
      `SELECT id FROM notes WHERE chat_id = ?1 AND message_id = ?2`
    ).bind(chat.id, msg.message_id).all();
    if (oldRows && oldRows.length > 0) {
      const oldIds = oldRows.map((r) => r.id);
      await deleteNoteAndVectors(env, oldIds);
    }
  } else {
    // بررسی تکرار با هش SHA-256
    const dup = await env.DB.prepare(`SELECT id FROM notes WHERE content_hash = ?1 LIMIT 1`)
      .bind(contentHash)
      .first();
    if (dup) {
      await env.DB.prepare(`UPDATE notes SET updated_at = ?1 WHERE id = ?2`).bind(now, dup.id).run();
      return { duplicate: true, noteId: dup.id };
    }
  }

  // استخراج خلاصه و تگ‌ها
  const { summary, tags } = await generateTagsAndSummary(env, cfg, payload.rawText);

  // برش متن به قطعات هم‌پوشان برای اسناد بزرگ
  const chunks = chunkTextSliding(payload.rawText, CONFIG.CHUNK_SIZE, CONFIG.CHUNK_OVERLAP);
  const rootId = `nd_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const vectorUpserts = [];
  const d1Statements = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = i === 0 ? rootId : `${rootId}_c${i}`;
    const parentId = i === 0 ? "" : rootId;
    const contextualChunk = `[مبدا: ${chat.title || "Private"} | فرستنده: ${payload.senderName || "User"} ${payload.fileName ? `| فایل: ${payload.fileName}` : ""}]\n${chunks[i]}`;

    let vec = null;
    try {
      vec = await generateEmbeddingVector(env, cfg, contextualChunk);
    } catch (e) {
      await logKernelError(env, "ingest.embedding", e);
    }

    if (vec) {
      vectorUpserts.push({
        id: chunkId,
        values: vec,
        metadata: {
          parent_id: rootId,
          chat_id: chat.id,
          media_type: payload.mediaType,
          sender: (payload.senderUsername || payload.senderName || "").slice(0, 40),
        },
      });
    }

    d1Statements.push(
      env.DB.prepare(
        `INSERT INTO notes (
          id, user_id, sender_name, sender_username, chat_id, chat_title, chat_type,
          message_id, media_type, file_id, file_unique_id, file_name, mime_type,
          raw_text, summary, tags, source_url, deep_link, content_hash,
          is_starred, chunk_index, parent_id, embedding_json, expires_at, created_at, updated_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7,
          ?8, ?9, ?10, ?11, ?12, ?13,
          ?14, ?15, ?16, ?17, ?18, ?19,
          0, ?20, ?21, ?22, ?23, ?24, ?24
        )`
      ).bind(
        chunkId,
        payload.userId,
        payload.senderName,
        payload.senderUsername,
        chat.id,
        chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || "Saved",
        chat.type || "private",
        msg.message_id || 0,
        payload.mediaType,
        payload.fileId,
        payload.fileUniqueId,
        payload.fileName,
        payload.mimeType,
        i === 0 ? payload.rawText : chunks[i],
        summary,
        tags,
        payload.sourceUrl,
        deepLink,
        i === 0 ? contentHash : `${contentHash}_${i}`,
        i,
        parentId,
        vec ? JSON.stringify(vec) : null,
        expiresAt,
        now
      )
    );
  }

  if (d1Statements.length > 0) {
    await env.DB.batch(d1Statements);
  }

  if (vectorUpserts.length > 0 && env.VECTORIZE) {
    try {
      await env.VECTORIZE.upsert(vectorUpserts);
    } catch (e) {
      await logKernelError(env, "ingest.vectorizeUpsert", e);
    }
  }

  await syncChatRegistry(env, chat, 1);

  const rootNote = await env.DB.prepare(`SELECT * FROM notes WHERE id = ?1`).bind(rootId).first();
  return { duplicate: false, noteId: rootId, chunksCount: chunks.length, note: rootNote };
}

async function deleteNoteAndVectors(env, noteIds) {
  const ids = Array.isArray(noteIds) ? noteIds : [noteIds];
  if (ids.length === 0) return;

  const allIds = new Set(ids);
  for (const id of ids) {
    const { results: childRows } = await env.DB.prepare(
      `SELECT id FROM notes WHERE parent_id = ?1 OR id = ?1`
    ).bind(id).all();
    for (const r of childRows || []) allIds.add(r.id);
  }

  const finalList = Array.from(allIds);
  const placeholders = finalList.map((_, i) => `?${i + 1}`).join(",");
  await env.DB.prepare(`DELETE FROM notes WHERE id IN (${placeholders})`).bind(...finalList).run();

  if (env.VECTORIZE) {
    try {
      await env.VECTORIZE.deleteByIds(finalList);
    } catch (e) {
      await logKernelError(env, "deleteNoteAndVectors", e);
    }
  }
}

// ----------------------------------------------------------------------------
// 9. ULTRA-FAST INLINE MODE ENGINE (<40ms Cached / Hybrid RRF + Native Media)
// ----------------------------------------------------------------------------

async function handleInlineQuery(env, cfg, inlineQuery) {
  const user = inlineQuery.from;
  const access = await checkUserAccess(env, cfg, user);

  if (access !== true) {
    return tgApi(env, "answerInlineQuery", {
      inline_query_id: inlineQuery.id,
      cache_time: 5,
      is_personal: true,
      results: [
        {
          type: "article",
          id: "locked_access",
          title: "⛔ دسترسی محدود است",
          description: access === "RATE_LIMITED" ? cfg.get("sys_rate_limit") : cfg.get("sys_locked"),
          input_message_content: {
            message_text: access === "RATE_LIMITED" ? cfg.get("sys_rate_limit") : cfg.get("sys_locked"),
          },
        },
      ],
    });
  }

  const rawQuery = (inlineQuery.query || "").trim();
  const { results, latencyMs, filters, cleanQuery } = await executeHybridSearch(env, cfg, rawQuery, {
    topK: 15,
  });

  const inlineResults = [];

  // اگر کاربر در اینلاین با علامت سوال (مثلا: @bot ?کوبرنتیز چطور کانفیگ شد؟) پرسیده باشد، کارت اول پاسخ RAG است
  if (filters.isRagQuestion && cleanQuery && results.length > 0) {
    const ragAnswer = await synthesizeRagAnswer(env, cfg, cleanQuery, results);
    if (ragAnswer) {
      inlineResults.push({
        type: "article",
        id: `rag_${Date.now()}`,
        title: `⚡ پاسخ سنتزشده از آرشیو: ${cleanQuery.slice(0, 45)}`,
        description: ragAnswer.replace(/\n+/g, " ").slice(0, 140),
        input_message_content: {
          message_text: `<b>⌗ پرسمان معنایی:</b> <code>${escapeHtml(cleanQuery)}</code>\n\n${escapeHtml(ragAnswer)}`,
          parse_mode: "HTML",
        },
      });
    }
  }

  for (const item of results) {
    const scorePct = item.score ? `${(item.score * 100).toFixed(0)}%` : "100%";
    const cardText = formatNoteTechnicalCard(item, latencyMs);

    const kbRows = [];
    const row1 = [];
    if (item.deep_link && item.deep_link.startsWith("http")) {
      row1.push({ text: cfg.get("btn_jump_msg"), url: item.deep_link });
    }
    row1.push({
      text: cfg.get("btn_copy_text"),
      copy_text: { text: (item.raw_text || "").slice(0, 250) },
    });
    kbRows.push(row1);
    const replyMarkup = { inline_keyboard: kbRows };

    // 1. اگر نتیجه تصویر است و file_id معتبر دارد -> رندر واقعی تصویر در اینلاین
    if (item.media_type === "photo" && item.file_id) {
      inlineResults.push({
        type: "photo",
        id: `ph_${item.id}`,
        photo_file_id: item.file_id,
        title: `🖼 [${scorePct}] ${(item.summary || item.raw_text || "تصویر").slice(0, 50)}`,
        description: `${item.chat_title || "Saved"} | ${(item.raw_text || "").slice(0, 90)}`,
        caption: cardText.slice(0, 1020),
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
      continue;
    }

    // 2. اگر کاربر صراحتا فیلتر type:doc یا type:voice زده و file_id موجود است -> ارسال خود فایل
    if (item.media_type === "doc" && item.file_id && filters.mediaType === "doc") {
      inlineResults.push({
        type: "document",
        id: `doc_${item.id}`,
        document_file_id: item.file_id,
        title: `📄 [${scorePct}] ${item.file_name || "سند آرشیوشده"}`,
        description: `${item.chat_title || "Saved"} | ${(item.summary || item.raw_text).slice(0, 90)}`,
        caption: cardText.slice(0, 1020),
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
      continue;
    }

    // 3. کارت استاندارد فنی و معنایی (همراه با لینک پرش به کانال/گروه و دکمه کپی)
    const iconMap = {
      text: "⌗",
      doc: "📄",
      voice: "🎙",
      audio: "🎵",
      video: "🎞",
      photo: "🖼",
      poll: "📊",
      location: "📍",
    };
    const badge = iconMap[item.media_type] || "▣";
    const titlePrefix = `${badge} [${scorePct} | ${latencyMs}ms] `;
    const titleBody = item.file_name
      ? `${item.file_name} (${item.chat_title || "Saved"})`
      : (item.summary || item.raw_text || "رکورد").replace(/\n+/g, " ").slice(0, 65);

    inlineResults.push({
      type: "article",
      id: `art_${item.id}`,
      title: `${titlePrefix}${titleBody}`,
      description: `[${item.chat_title || "خصوصی"} | ${item.sender_name || "سیستم"}] ${(item.raw_text || "").replace(/\n+/g, " ").slice(0, 115)}`,
      input_message_content: {
        message_text: cardText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
      reply_markup: replyMarkup,
    });
  }

  if (inlineResults.length === 0) {
    inlineResults.push({
      type: "article",
      id: "empty_matrix",
      title: "∅ نتیجه‌ای در ماتریس برداری یافت نشد",
      description: cfg.get("sys_no_results"),
      input_message_content: {
        message_text: `<code>${escapeHtml(cfg.get("sys_no_results"))}</code>`,
        parse_mode: "HTML",
      },
    });
  }

  return tgApi(env, "answerInlineQuery", {
    inline_query_id: inlineQuery.id,
    cache_time: CONFIG.INLINE_CACHE_TIME,
    is_personal: true,
    results: inlineResults.slice(0, 20),
  });
}

// ----------------------------------------------------------------------------
// 10. ADMIN CONTROL PANEL, COMMAND ROUTER & CALLBACK HANDLERS
// ----------------------------------------------------------------------------

async function buildSystemStatsReport(env, cfg) {
  const notesCount = (await env.DB.prepare(`SELECT COUNT(*) as c FROM notes WHERE chunk_index = 0`).first())?.c || 0;
  const chunksCount = (await env.DB.prepare(`SELECT COUNT(*) as c FROM notes`).first())?.c || 0;
  const chatsCount = (await env.DB.prepare(`SELECT COUNT(*) as c FROM chats WHERE is_enabled = 1`).first())?.c || 0;
  const usersCount = (await env.DB.prepare(`SELECT COUNT(*) as c FROM users`).first())?.c || 0;
  const starredCount = (await env.DB.prepare(`SELECT COUNT(*) as c FROM notes WHERE is_starred = 1`).first())?.c || 0;

  return (
    `<b>⛁ گزارش تله‌متری و وضعیت هسته آرشیو</b>\n\n` +
    `├─ <b>رکوردهای یکتا (Root Nodes):</b> <code>${notesCount}</code>\n` +
    `├─ <b>کل بردارها (Total Vectors):</b> <code>${chunksCount}</code>\n` +
    `├─ <b>کانال‌ها و گروه‌های متصل:</b> <code>${chatsCount}</code>\n` +
    `├─ <b>کاربران ثبت‌شده:</b> <code>${usersCount}</code>\n` +
    `├─ <b>رکوردهای نشان‌دار (★):</b> <code>${starredCount}</code>\n` +
    `├─ <b>مدل امبدینگ فعال:</b> <code>${escapeHtml(cfg.getEmbedModel())}</code>\n` +
    `├─ <b>مدل استنتاج LLM:</b> <code>${escapeHtml(cfg.getLlmModel())}</code>\n` +
    `├─ <b>وضعیت تگ‌زن خودکار:</b> <code>${cfg.isAutoTagEnabled() ? "ACTIVE" : "OFF"}</code>\n` +
    `└─ <b>سطح دسترسی سیستم:</b> <code>${cfg.getAccessMode().toUpperCase()}</code>`
  );
}

function buildAdminHomeKeyboard(cfg, workerOrigin) {
  const mode = cfg.getAccessMode().toUpperCase();
  const autoTag = cfg.isAutoTagEnabled() ? "ON" : "OFF";
  const urlScrape = cfg.isUrlScrapeEnabled() ? "ON" : "OFF";

  return {
    inline_keyboard: [
      [
        {
          text: `${cfg.get("btn_adm_toggle_pub")} [${mode}]`,
          callback_data: "adm:cycle_mode",
        },
      ],
      [
        { text: cfg.get("btn_adm_chats"), callback_data: "adm:chats:0" },
        { text: cfg.get("btn_adm_strings"), callback_data: "adm:strings" },
      ],
      [
        { text: `🏷 تگ‌زن خودکار [${autoTag}]`, callback_data: "adm:toggle:feature_autotag" },
        { text: `🌐 خزشگر لینک [${urlScrape}]`, callback_data: "adm:toggle:feature_url_scrape" },
      ],
      [
        { text: cfg.get("btn_adm_models"), callback_data: "adm:models" },
        { text: cfg.get("btn_adm_whitelist"), callback_data: "adm:whitelist" },
      ],
      [
        { text: cfg.get("btn_adm_export"), callback_data: "adm:export" },
        { text: cfg.get("btn_adm_reindex"), callback_data: "adm:reindex" },
      ],
      [
        { text: cfg.get("btn_adm_logs"), callback_data: "adm:logs" },
        { text: cfg.get("btn_mini_app"), web_app: { url: `${workerOrigin}/app` } },
      ],
      [{ text: cfg.get("btn_back"), callback_data: "act:home" }],
    ],
  };
}

async function handlePrivateCommand(env, cfg, msg, workerOrigin) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = (msg.text || "").trim();
  const userIsAdmin = isAdmin(userId, env);

  // دستورات پایه
  if (text.startsWith("/start")) {
    const bootText =
      `<b>${escapeHtml(cfg.get("sys_boot"))}</b>\n\n` +
      `▫ برای جستجو در هر چتی تایپ کنید:\n<code>@${escapeHtml(msg.via_bot?.username || "bot")} عبارت مورد نظر</code>\n` +
      `▫ برای ارسال فایل، عکس، ویس یا فوروارد پیام، کافی است مستقیماً در همین چت ارسال کنید یا ربات را در کانال/گروه خود عضو نمایید.`;
    return tgApi(env, "sendMessage", {
      chat_id: chatId,
      text: bootText,
      parse_mode: "HTML",
      reply_markup: buildMainDashboardKeyboard(cfg, workerOrigin, userIsAdmin),
    });
  }

  if (text.startsWith("/help")) {
    const helpMsg =
      `<b>ℹ راهنمای عملگرهای جستجوی معنایی و دستورات هسته</b>\n\n` +
      `<b>۱. فیلترهای پیشرفته در حالت Inline و دستور /search:</b>\n` +
      `• <code>type:photo</code> فقط تصاویر (نمایش گالری)\n` +
      `• <code>type:doc</code> فقط اسناد (PDF, DOCX, EPUB...)\n` +
      `• <code>type:voice</code> فقط ویس‌ها و فایل‌های صوتی\n` +
      `• <code>chat:channel</code> فقط پیام‌های کانال‌ها\n` +
      `• <code>from:username</code> فیلتر بر اساس فرستنده در گروه\n` +
      `• <code>star:1</code> فقط رکوردهای نشان‌دار\n` +
      `• <code>?سوال شما</code> سنتز پاسخ هوشمند (RAG) از روی یادداشت‌ها\n\n` +
      `<b>۲. دستورات خط فرمان:</b>\n` +
      `• <code>/search عبارت</code> — جستجوی ترکیبی برداری + واژگانی\n` +
      `• <code>/ask سوال</code> — پرسش و پاسخ مستند از آرشیو\n` +
      `• <code>/ttl 60 متن یادداشت</code> — ثبت یادداشت خودتخریب‌شونده (حذف پس از ۶۰ دقیقه)\n` +
      `• <code>/stats</code> — وضعیت مخزن و بردارها\n` +
      `• <code>/admin</code> — پنل مهندسی و شخصی‌سازی کامل (مخصوص ادمین)`;
    return tgApi(env, "sendMessage", {
      chat_id: chatId,
      text: helpMsg,
      parse_mode: "HTML",
      reply_markup: buildMainDashboardKeyboard(cfg, workerOrigin, userIsAdmin),
    });
  }

  if (text.startsWith("/stats")) {
    const report = await buildSystemStatsReport(env, cfg);
    return tgApi(env, "sendMessage", {
      chat_id: chatId,
      text: report,
      parse_mode: "HTML",
      reply_markup: buildMainDashboardKeyboard(cfg, workerOrigin, userIsAdmin),
    });
  }

  if (text.startsWith("/search")) {
    const q = text.replace(/^\/search(@\w+)?\s*/i, "").trim();
    if (!q) {
      return tgApi(env, "sendMessage", { chat_id: chatId, text: cfg.get("sys_empty_query") });
    }
    const { results, latencyMs } = await executeHybridSearch(env, cfg, q, { topK: 5 });
    if (results.length === 0) {
      return tgApi(env, "sendMessage", { chat_id: chatId, text: cfg.get("sys_no_results") });
    }
    for (const note of results) {
      await tgApi(env, "sendMessage", {
        chat_id: chatId,
        text: formatNoteTechnicalCard(note, latencyMs),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: buildNoteActionKeyboard(cfg, note),
      });
    }
    return;
  }

  if (text.startsWith("/ask")) {
    const q = text.replace(/^\/ask(@\w+)?\s*/i, "").trim();
    if (!q) {
      return tgApi(env, "sendMessage", { chat_id: chatId, text: cfg.get("sys_empty_query") });
    }
    const waitMsg = await tgApi(env, "sendMessage", {
      chat_id: chatId,
      text: `<code>${escapeHtml(cfg.get("sys_ask_prompt"))}</code>`,
      parse_mode: "HTML",
    });

    const { results, latencyMs } = await executeHybridSearch(env, cfg, q, { topK: 6 });
    if (results.length === 0) {
      return tgApi(env, "editMessageText", {
        chat_id: chatId,
        message_id: waitMsg.result?.message_id,
        text: cfg.get("sys_no_results"),
      });
    }

    const answer = await synthesizeRagAnswer(env, cfg, q, results);
    const sourcesLinks = results
      .slice(0, 4)
      .map(
        (r, i) =>
          `[${i + 1}] ${r.deep_link ? `<a href="${r.deep_link}">${escapeHtml(r.chat_title || "سند")}</a>` : escapeHtml(r.chat_title || "سند")} (<code>${r.id}</code>)`
      )
      .join(" | ");

    const out =
      `<b>⚡ پاسخ استنتاجی هسته (${latencyMs}ms):</b>\n\n` +
      `${escapeHtml(answer || "خطا در سنتز پاسخ.")}\n\n` +
      `<b>⛁ مراجع بازیابی‌شده:</b>\n${sourcesLinks}`;

    return tgApi(env, "editMessageText", {
      chat_id: chatId,
      message_id: waitMsg.result?.message_id,
      text: out,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  }

  if (text.startsWith("/ttl")) {
    const m = text.match(/^\/ttl(?:@\w+)?\s+(\d+)\s+([\s\S]+)$/i);
    if (!m) {
      return tgApi(env, "sendMessage", {
        chat_id: chatId,
        text: "فرمت صحیح: <code>/ttl 60 متن یادداشت موقت</code> (عدد بر حسب دقیقه)",
        parse_mode: "HTML",
      });
    }
    const mins = Math.max(1, parseInt(m[1], 10));
    const syntheticMsg = { ...msg, text: m[2].trim() };
    const res = await ingestTelegramMessage(env, cfg, syntheticMsg, { ttlMinutes: mins });
    if (res?.note) {
      return tgApi(env, "sendMessage", {
        chat_id: chatId,
        text: `⏱ رکورد زمان‌دار (TTL: ${mins} دقیقه) ثبت شد.\n\n` + formatNoteTechnicalCard(res.note),
        parse_mode: "HTML",
        reply_markup: buildNoteActionKeyboard(cfg, res.note),
      });
    }
    return;
  }

  // دستورات اختصاصی ادمین
  if (userIsAdmin) {
    if (text.startsWith("/admin")) {
      const report = await buildSystemStatsReport(env, cfg);
      return tgApi(env, "sendMessage", {
        chat_id: chatId,
        text: `<b>${escapeHtml(cfg.get("sys_admin_header"))}</b>\n\n${report}`,
        parse_mode: "HTML",
        reply_markup: buildAdminHomeKeyboard(cfg, workerOrigin),
      });
    }

    // دستور کاستومایز سریع تمام دکمه‌ها و متون ربات: /set key = value
    if (text.startsWith("/set ")) {
      const rawPair = text.slice(5).trim();
      const eqIdx = rawPair.indexOf("=");
      if (eqIdx === -1) {
        return tgApi(env, "sendMessage", {
          chat_id: chatId,
          text: cfg.get("sys_custom_prompt"),
          parse_mode: "Markdown",
        });
      }
      const k = rawPair.slice(0, eqIdx).trim();
      const v = rawPair.slice(eqIdx + 1).trim();
      await cfg.set(k, v);
      return tgApi(env, "sendMessage", {
        chat_id: chatId,
        text: `✅ کلید <code>${escapeHtml(k)}</code> در دیتابیس D1 بروزرسانی شد:\n<code>${escapeHtml(v)}</code>`,
        parse_mode: "HTML",
      });
    }

    if (text.startsWith("/reset ")) {
      const k = text.slice(7).trim();
      await cfg.delete(k);
      return tgApi(env, "sendMessage", {
        chat_id: chatId,
        text: `↻ کلید <code>${escapeHtml(k)}</code> به مقدار پیش‌فرض کارخانه بازگردانده شد.`,
        parse_mode: "HTML",
      });
    }

    if (text.startsWith("/allow ")) {
      const targetId = Number(text.slice(7).trim());
      if (targetId) {
        await env.DB.prepare(
          `INSERT INTO users (user_id, is_whitelisted, is_banned, created_at) VALUES (?1, 1, 0, ?2)
           ON CONFLICT(user_id) DO UPDATE SET is_whitelisted = 1, is_banned = 0`
        ).bind(targetId, Date.now()).run();
        return tgApi(env, "sendMessage", {
          chat_id: chatId,
          text: `🔑 کاربر <code>${targetId}</code> به لیست سفید اضافه شد.`,
          parse_mode: "HTML",
        });
      }
    }

    if (text.startsWith("/ban ")) {
      const targetId = Number(text.slice(5).trim());
      if (targetId) {
        await env.DB.prepare(
          `INSERT INTO users (user_id, is_whitelisted, is_banned, created_at) VALUES (?1, 0, 1, ?2)
           ON CONFLICT(user_id) DO UPDATE SET is_whitelisted = 0, is_banned = 1`
        ).bind(targetId, Date.now()).run();
        return tgApi(env, "sendMessage", {
          chat_id: chatId,
          text: `⛔ کاربر <code>${targetId}</code> مسدود شد.`,
          parse_mode: "HTML",
        });
      }
    }
  }
}

async function handleCallbackQuery(env, cfg, cb, workerOrigin) {
  const data = cb.data || "";
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const userId = cb.from?.id;
  const userIsAdmin = isAdmin(userId, env);

  const access = await checkUserAccess(env, cfg, cb.from);
  if (access !== true) {
    return tgApi(env, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: cfg.get("sys_locked"),
      show_alert: true,
    });
  }

  // --- ناوبری عمومی ---
  if (data === "act:home") {
    await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id });
    return tgApi(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: `<b>${escapeHtml(cfg.get("sys_boot"))}</b>`,
      parse_mode: "HTML",
      reply_markup: buildMainDashboardKeyboard(cfg, workerOrigin, userIsAdmin),
    });
  }

  if (data === "act:stats") {
    await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id });
    const report = await buildSystemStatsReport(env, cfg);
    return tgApi(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: report,
      parse_mode: "HTML",
      reply_markup: buildMainDashboardKeyboard(cfg, workerOrigin, userIsAdmin),
    });
  }

  if (data === "act:help") {
    await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id });
    return handlePrivateCommand(env, cfg, { chat: { id: chatId }, from: cb.from, text: "/help" }, workerOrigin);
  }

  if (data.startsWith("act:recent:") || data.startsWith("act:starred:")) {
    const isStarList = data.startsWith("act:starred:");
    const sql = isStarList
      ? `SELECT * FROM notes WHERE chunk_index = 0 AND is_starred = 1 ORDER BY created_at DESC LIMIT 6`
      : `SELECT * FROM notes WHERE chunk_index = 0 ORDER BY created_at DESC LIMIT 6`;
    const { results } = await env.DB.prepare(sql).all();
    await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id });

    if (!results || results.length === 0) {
      return tgApi(env, "sendMessage", { chat_id: chatId, text: cfg.get("sys_no_results") });
    }
    const listText = results
      .map(
        (r, idx) =>
          `<b>${idx + 1}.</b> [<code>${r.media_type.toUpperCase()}</code>] <code>${r.id}</code> — ${escapeHtml((r.summary || r.raw_text).slice(0, 90))}${r.deep_link ? ` (<a href="${r.deep_link}">لینک</a>)` : ""}`
      )
      .join("\n\n");
    return tgApi(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: `<b>${isStarList ? "★ رکوردهای نشان‌دار" : "◷ آخرین ورودی‌های ماتریس"}:</b>\n\n${listText}`,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: buildMainDashboardKeyboard(cfg, workerOrigin, userIsAdmin),
    });
  }

  // --- عملیات روی یک نود (نشان‌دار کردن، همسایه‌های معنایی، حذف) ---
  if (data.startsWith("node:star:")) {
    const noteId = data.slice(10);
    const row = await env.DB.prepare(`SELECT * FROM notes WHERE id = ?1`).bind(noteId).first();
    if (!row) {
      return tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "رکورد یافت نشد." });
    }
    const nextStar = row.is_starred === 1 ? 0 : 1;
    await env.DB.prepare(`UPDATE notes SET is_starred = ?1 WHERE id = ?2`).bind(nextStar, noteId).run();
    row.is_starred = nextStar;
    await tgApi(env, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: nextStar ? "★ به نشان‌دارها افزوده شد" : "از نشان‌دارها خارج شد",
    });
    return tgApi(env, "editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: buildNoteActionKeyboard(cfg, row),
    });
  }

  if (data.startsWith("node:sim:")) {
    const noteId = data.slice(9);
    await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "در حال محاسبه همسایه‌های برداری..." });
    const neighbors = await findNearestNeighbors(env, cfg, noteId, 4);
    if (neighbors.length === 0) {
      return tgApi(env, "sendMessage", { chat_id: chatId, text: cfg.get("sys_no_results") });
    }
    const textOut =
      `<b>◈ نزدیک‌ترین همسایه‌های معنایی به نود <code>${noteId}</code>:</b>\n\n` +
      neighbors
        .map(
          (n, i) =>
            `<b>${i + 1}. [${(n.score * 100).toFixed(0)}%]</b> <code>${n.id}</code> (${escapeHtml(n.chat_title || "Saved")})\n` +
            `<blockquote>${escapeHtml((n.summary || n.raw_text).slice(0, 180))}</blockquote>` +
            (n.deep_link ? `🔗 <a href="${n.deep_link}">پرش به پیام مرجع</a>` : "")
        )
        .join("\n\n");
    return tgApi(env, "sendMessage", {
      chat_id: chatId,
      text: textOut,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  }

  if (data.startsWith("node:del:")) {
    const noteId = data.slice(9);
    await deleteNoteAndVectors(env, [noteId]);
    await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id, text: cfg.get("sys_deleted_ok") });
    return tgApi(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: `<code>${escapeHtml(cfg.get("sys_deleted_ok"))} (ID: ${noteId})</code>`,
      parse_mode: "HTML",
    });
  }

  // --- کنترل پنل مهندسی ادمین ---
  if (data.startsWith("adm:")) {
    if (!userIsAdmin) {
      return tgApi(env, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "⛔ نیازمند سطح دسترسی Root Admin",
        show_alert: true,
      });
    }

    if (data === "adm:home") {
      await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id });
      const report = await buildSystemStatsReport(env, cfg);
      return tgApi(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `<b>${escapeHtml(cfg.get("sys_admin_header"))}</b>\n\n${report}`,
        parse_mode: "HTML",
        reply_markup: buildAdminHomeKeyboard(cfg, workerOrigin),
      });
    }

    if (data === "adm:cycle_mode") {
      const current = cfg.getAccessMode();
      const order = ["admin", "whitelist", "public"];
      const next = order[(order.indexOf(current) + 1) % order.length];
      await cfg.set("sys_access_mode", next);
      await tgApi(env, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: `سطح دسترسی به ${next.toUpperCase()} تغییر یافت.`,
      });
      const report = await buildSystemStatsReport(env, cfg);
      return tgApi(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `<b>${escapeHtml(cfg.get("sys_admin_header"))}</b>\n\n${report}`,
        parse_mode: "HTML",
        reply_markup: buildAdminHomeKeyboard(cfg, workerOrigin),
      });
    }

    if (data.startsWith("adm:toggle:")) {
      const key = data.slice(11);
      const curr = cfg.get(key, "1");
      const next = curr === "1" ? "0" : "1";
      await cfg.set(key, next);
      await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id, text: `${key} = ${next}` });
      const report = await buildSystemStatsReport(env, cfg);
      return tgApi(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `<b>${escapeHtml(cfg.get("sys_admin_header"))}</b>\n\n${report}`,
        parse_mode: "HTML",
        reply_markup: buildAdminHomeKeyboard(cfg, workerOrigin),
      });
    }

    if (data.startsWith("adm:chats:")) {
      const { results: chats } = await env.DB.prepare(
        `SELECT * FROM chats ORDER BY last_sync DESC LIMIT 18`
      ).all();
      await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id });

      const rows = (chats || []).map((c) => [
        {
          text: `${c.is_enabled ? "🟢" : "🔴"} ${c.chat_title || c.chat_id} (${c.indexed_count})`,
          callback_data: `adm:chat_tog:${c.chat_id}`,
        },
        {
          text: "🗑 پاکسازی",
          callback_data: `adm:chat_purge:${c.chat_id}`,
        },
      ]);
      rows.push([{ text: cfg.get("btn_back"), callback_data: "adm:home" }]);

      return tgApi(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text:
          `<b>📡 مدیریت کانال‌ها و گروه‌های متصل</b>\n` +
          `با کلیک روی نام هر کانال/گروه، دریافت و برداری‌سازی پیام‌های آن را متوقف یا فعال کنید:`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: rows },
      });
    }

    if (data.startsWith("adm:chat_tog:")) {
      const targetChatId = Number(data.slice(13));
      const row = await env.DB.prepare(`SELECT is_enabled FROM chats WHERE chat_id = ?1`)
        .bind(targetChatId)
        .first();
      if (row) {
        const next = row.is_enabled === 1 ? 0 : 1;
        await env.DB.prepare(`UPDATE chats SET is_enabled = ?1 WHERE chat_id = ?2`)
          .bind(next, targetChatId)
          .run();
      }
      cb.data = "adm:chats:0";
      return handleCallbackQuery(env, cfg, cb, workerOrigin);
    }

    if (data.startsWith("adm:chat_purge:")) {
      const targetChatId = Number(data.slice(15));
      const { results: chatNotes } = await env.DB.prepare(`SELECT id FROM notes WHERE chat_id = ?1`)
        .bind(targetChatId)
        .all();
      if (chatNotes && chatNotes.length > 0) {
        await deleteNoteAndVectors(
          env,
          chatNotes.map((x) => x.id)
        );
      }
      await env.DB.prepare(`UPDATE chats SET indexed_count = 0 WHERE chat_id = ?1`)
        .bind(targetChatId)
        .run();
      await tgApi(env, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "تمام رکوردهای این چت از D1 و Vectorize حذف شدند.",
        show_alert: true,
      });
      cb.data = "adm:chats:0";
      return handleCallbackQuery(env, cfg, cb, workerOrigin);
    }

    if (data === "adm:strings") {
      await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id });
      const keysList = Object.keys(DEFAULT_STRINGS)
        .map((k) => `• <code>${k}</code> = ${escapeHtml(cfg.get(k).slice(0, 35))}`)
        .join("\n");
      const textOut =
        `<b>✎ شخصی‌سازی زنده متون و دکمه‌های ربات</b>\n\n` +
        `برای تغییر هر دکمه یا پیام، دستور زیر را در چت بفرستید (یا از طریق Mini App ویرایش کنید):\n` +
        `<code>/set KEY = مقدار جدید</code>\n` +
        `برای بازگشت به پیش‌فرض:\n` +
        `<code>/reset KEY</code>\n\n` +
        `<b>کلیدهای فعال سیستم:</b>\n${keysList}`;
      return tgApi(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: textOut,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: cfg.get("btn_mini_app"), web_app: { url: `${workerOrigin}/app` } }],
            [{ text: cfg.get("btn_back"), callback_data: "adm:home" }],
          ],
        },
      });
    }

    if (data === "adm:models") {
      await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id });
      const curEmb = cfg.getEmbedModel();
      return tgApi(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text:
          `<b>⚡ پیکربندی مدل‌های Workers AI</b>\n\n` +
          `مدل امبدینگ فعلی: <code>${escapeHtml(curEmb)}</code>\n` +
          `توجه: ابعاد مدل انتخابی باید با ابعاد ایندکس Vectorize شما (1024 برای bge-m3 یا 384 برای bge-small) تطابق داشته باشد.`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `${curEmb.includes("bge-m3") ? "● " : ""}BGE-M3 (1024d - فارسی/چندزبانه)`,
                callback_data: "adm:set_emb:@cf/baai/bge-m3",
              },
            ],
            [
              {
                text: `${curEmb.includes("bge-small") ? "● " : ""}BGE-Small-EN (384d - سریع)`,
                callback_data: "adm:set_emb:@cf/baai/bge-small-en-v1.5",
              },
            ],
            [{ text: cfg.get("btn_back"), callback_data: "adm:home" }],
          ],
        },
      });
    }

    if (data.startsWith("adm:set_emb:")) {
      const modelName = data.slice(12);
      await cfg.set("model_embedding", modelName);
      await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id, text: `مدل به ${modelName} تغییر یافت.` });
      cb.data = "adm:models";
      return handleCallbackQuery(env, cfg, cb, workerOrigin);
    }

    if (data === "adm:whitelist") {
      await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id });
      const { results: users } = await env.DB.prepare(
        `SELECT * FROM users ORDER BY created_at DESC LIMIT 20`
      ).all();
      const uList =
        (users || [])
          .map(
            (u) =>
              `• <code>${u.user_id}</code> (@${escapeHtml(u.username || "none")}) — Whitelist: <b>${u.is_whitelisted ? "YES" : "NO"}</b> | Ban: <b>${u.is_banned ? "YES" : "NO"}</b>`
          )
          .join("\n") || "هیچ کاربری ثبت نشده است.";

      return tgApi(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text:
          `<b>🔑 مدیریت دسترسی کاربران (ACL)</b>\n\n` +
          `• افزودن به لیست سفید: <code>/allow USER_ID</code>\n` +
          `• مسدودسازی کاربر: <code>/ban USER_ID</code>\n\n` +
          `<b>کاربران اخیر:</b>\n${uList}`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: cfg.get("btn_back"), callback_data: "adm:home" }]] },
      });
    }

    if (data === "adm:export") {
      await tgApi(env, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "در حال استخراج کل رکوردها در قالب JSONL...",
      });
      const { results } = await env.DB.prepare(
        `SELECT id, user_id, sender_name, chat_id, chat_title, message_id, media_type, file_name, raw_text, summary, tags, deep_link, created_at
         FROM notes WHERE chunk_index = 0 ORDER BY created_at DESC LIMIT 2500`
      ).all();
      const jsonl = (results || []).map((r) => JSON.stringify(r)).join("\n");
      const fileName = `semantic_archive_dump_${new Date().toISOString().slice(0, 10)}.jsonl`;
      await sendDocumentBlob(
        env,
        chatId,
        fileName,
        jsonl || "{}",
        `⛁ نسخه پشتیبان آرشیو معنایی (${(results || []).length} رکورد پایه)`
      );
      return;
    }

    if (data === "adm:reindex") {
      await tgApi(env, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "در حال بازسازی بردارهای ۵۰ رکورد اخیر...",
      });
      const { results } = await env.DB.prepare(
        `SELECT * FROM notes ORDER BY created_at DESC LIMIT 50`
      ).all();
      let okCount = 0;
      const upserts = [];
      for (const r of results || []) {
        try {
          const vec = await generateEmbeddingVector(env, cfg, r.raw_text.slice(0, 1200));
          if (vec) {
            await env.DB.prepare(`UPDATE notes SET embedding_json = ?1 WHERE id = ?2`)
              .bind(JSON.stringify(vec), r.id)
              .run();
            upserts.push({
              id: r.id,
              values: vec,
              metadata: { parent_id: r.parent_id || r.id, chat_id: r.chat_id, media_type: r.media_type },
            });
            okCount++;
          }
        } catch (_) {}
      }
      if (upserts.length > 0 && env.VECTORIZE) {
        try {
          await env.VECTORIZE.upsert(upserts);
        } catch (_) {}
      }
      return tgApi(env, "sendMessage", {
        chat_id: chatId,
        text: `↻ بازسازی برداری انجام شد. <code>${okCount}</code> نود در D1 و Vectorize همگام‌سازی شدند.`,
        parse_mode: "HTML",
      });
    }

    if (data === "adm:logs") {
      await tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id });
      const { results: logs } = await env.DB.prepare(
        `SELECT * FROM error_logs ORDER BY id DESC LIMIT 10`
      ).all();
      const logStr =
        (logs || [])
          .map(
            (l) =>
              `[<code>${new Date(l.created_at).toISOString().slice(11, 19)}</code>] <b>${escapeHtml(l.context)}</b>:\n<code>${escapeHtml((l.error_msg || "").slice(0, 160))}</code>`
          )
          .join("\n\n") || "هیچ خطایی در هسته ثبت نشده است.";
      return tgApi(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `<b>⚠ لاگ خطاهای هسته (Dead-Letter Log):</b>\n\n${logStr}`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: cfg.get("btn_back"), callback_data: "adm:home" }]] },
      });
    }
  }
}

// ----------------------------------------------------------------------------
// 11. EMBEDDED TELEGRAM MINI APP (TMA) + REST API (/app & /api/*)
// ----------------------------------------------------------------------------

async function handleMiniAppApi(request, env, cfg) {
  const url = new URL(request.url);
  const initData = request.headers.get("X-Telegram-Init-Data") || "";
  const adminKeyHeader = request.headers.get("X-Admin-Secret") || "";

  let webUser = await verifyTelegramWebAppInitData(initData, getBotToken(env));
  if (!webUser && adminKeyHeader === CONFIG.WEBHOOK_SECRET) {
    webUser = { id: CONFIG.ADMIN_IDS[0], first_name: "RootAdmin" };
  }

  const userIsAdmin = webUser ? isAdmin(webUser.id, env) : false;
  const corsHeaders = {
    "Content-Type": "application/json;charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data, X-Admin-Secret",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // اگر کاربر در حالت قفل ادمین باشد و تایید هویت نشده باشد
  if (!webUser && cfg.getAccessMode() === "admin") {
    return new Response(
      JSON.stringify({ ok: false, error: "UNAUTHORIZED_TMA_SESSION" }),
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    if (url.pathname === "/api/bootstrap" && request.method === "GET") {
      const notesCount = (await env.DB.prepare(`SELECT COUNT(*) as c FROM notes WHERE chunk_index = 0`).first())?.c || 0;
      const vecCount = (await env.DB.prepare(`SELECT COUNT(*) as c FROM notes`).first())?.c || 0;
      const { results: chats } = await env.DB.prepare(`SELECT * FROM chats ORDER BY last_sync DESC LIMIT 50`).all();
      const { results: recent } = await env.DB.prepare(
        `SELECT id, sender_name, chat_title, media_type, file_name, raw_text, summary, tags, deep_link, is_starred, created_at
         FROM notes WHERE chunk_index = 0 ORDER BY created_at DESC LIMIT 20`
      ).all();

      const customStrings = {};
      for (const k of Object.keys(DEFAULT_STRINGS)) {
        customStrings[k] = cfg.get(k);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          isAdmin: userIsAdmin,
          stats: {
            notesCount,
            vecCount,
            chatsCount: (chats || []).length,
            accessMode: cfg.getAccessMode(),
            embedModel: cfg.getEmbedModel(),
            autoTag: cfg.isAutoTagEnabled(),
            urlScrape: cfg.isUrlScrapeEnabled(),
          },
          chats: chats || [],
          recent: recent || [],
          strings: customStrings,
        }),
        { headers: corsHeaders }
      );
    }

    if (url.pathname === "/api/search" && request.method === "POST") {
      const body = await request.json();
      const { results, latencyMs } = await executeHybridSearch(env, cfg, body.query || "", { topK: 20 });
      return new Response(
        JSON.stringify({
          ok: true,
          latencyMs,
          results: results.map((r) => ({
            id: r.id,
            sender_name: r.sender_name,
            chat_title: r.chat_title,
            media_type: r.media_type,
            file_name: r.file_name,
            raw_text: r.raw_text.slice(0, 600),
            summary: r.summary,
            tags: r.tags,
            deep_link: r.deep_link,
            is_starred: r.is_starred,
            score: r.score,
            created_at: r.created_at,
          })),
        }),
        { headers: corsHeaders }
      );
    }

    if (url.pathname === "/api/node/action" && request.method === "POST") {
      const body = await request.json();
      if (body.action === "delete" && body.id) {
        await deleteNoteAndVectors(env, [body.id]);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (body.action === "star" && body.id) {
        const row = await env.DB.prepare(`SELECT is_starred FROM notes WHERE id = ?1`).bind(body.id).first();
        const next = row?.is_starred === 1 ? 0 : 1;
        await env.DB.prepare(`UPDATE notes SET is_starred = ?1 WHERE id = ?2`).bind(next, body.id).run();
        return new Response(JSON.stringify({ ok: true, is_starred: next }), { headers: corsHeaders });
      }
    }

    if (url.pathname === "/api/admin/save" && request.method === "POST") {
      if (!userIsAdmin) {
        return new Response(JSON.stringify({ ok: false, error: "FORBIDDEN" }), { status: 403, headers: corsHeaders });
      }
      const body = await request.json();
      if (body.settings && typeof body.settings === "object") {
        for (const [k, v] of Object.entries(body.settings)) {
          await cfg.set(k, String(v));
        }
      }
      if (body.toggleChatId !== undefined) {
        const cId = Number(body.toggleChatId);
        const r = await env.DB.prepare(`SELECT is_enabled FROM chats WHERE chat_id = ?1`).bind(cId).first();
        if (r) {
          await env.DB.prepare(`UPDATE chats SET is_enabled = ?1 WHERE chat_id = ?2`)
            .bind(r.is_enabled === 1 ? 0 : 1, cId)
            .run();
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: false, error: "NOT_FOUND" }), { status: 404, headers: corsHeaders });
  } catch (e) {
    await logKernelError(env, "handleMiniAppApi", e);
    return new Response(JSON.stringify({ ok: false, error: String(e.message || e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

function renderMiniAppHtml() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>کنسول مهندسی آرشیو معنایی</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root {
      --bg: #0b0e14;
      --panel: #131822;
      --border: #242d3c;
      --text: #d9e2ec;
      --muted: #829ab1;
      --accent: #38bdf8;
      --ok: #10b981;
      --danger: #f43f5e;
      --font: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Segoe UI", Tahoma, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 13px;
      line-height: 1.55;
      padding: 12px;
      padding-bottom: 60px;
    }
    .hdr {
      border: 1px solid var(--border);
      background: var(--panel);
      padding: 10px 12px;
      border-radius: 6px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .hdr h1 { font-size: 14px; color: var(--accent); font-weight: 700; }
    .badge {
      background: #1e293b;
      border: 1px solid var(--border);
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 11px;
      color: var(--accent);
    }
    .tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }
    .tab-btn {
      background: var(--panel);
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 8px;
      border-radius: 5px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
    }
    .tab-btn.active {
      border-color: var(--accent);
      color: var(--accent);
      background: rgba(56, 189, 248, 0.08);
    }
    .search-box {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }
    input, select, textarea {
      width: 100%;
      background: var(--panel);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 10px;
      border-radius: 5px;
      font-family: inherit;
      font-size: 12px;
    }
    button.btn {
      background: var(--accent);
      color: #000;
      border: none;
      padding: 8px 14px;
      border-radius: 5px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
    }
    button.btn-sec {
      background: #1e293b;
      color: var(--text);
      border: 1px solid var(--border);
      padding: 5px 9px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }
    .grid-stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .stat-card {
      background: var(--panel);
      border: 1px solid var(--border);
      padding: 9px;
      border-radius: 5px;
    }
    .stat-card .lbl { color: var(--muted); font-size: 11px; }
    .stat-card .val { font-size: 16px; font-weight: 700; color: var(--accent); margin-top: 2px; }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 6px;
      border-bottom: 1px dashed var(--border);
      padding-bottom: 4px;
    }
    .card-body {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
      max-height: 110px;
      overflow-y: auto;
      margin-bottom: 8px;
    }
    .card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .hidden { display: none !important; }
    .field-row { margin-bottom: 9px; }
    .field-row label { display: block; font-size: 11px; color: var(--muted); margin-bottom: 3px; }
  </style>
</head>
<body>
  <div class="hdr">
    <h1>▣ کنسول مهندسی آرشیو برداری</h1>
    <span id="statusBadge" class="badge">CONNECTING...</span>
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('search')">⌗ جستجو و نودها</button>
    <button class="tab-btn" onclick="switchTab('chats')">📡 کانال‌ها و گروه‌ها</button>
    <button class="tab-btn" onclick="switchTab('admin')">⚙ هسته و کاستوم</button>
  </div>

  <!-- TAB 1: SEARCH & NODES -->
  <div id="tab-search">
    <div class="grid-stats">
      <div class="stat-card"><div class="lbl">رکوردهای پایه (D1)</div><div class="val" id="stNotes">-</div></div>
      <div class="stat-card"><div class="lbl">بردارها (Vectorize)</div><div class="val" id="stVecs">-</div></div>
    </div>
    <div class="search-box">
      <input type="text" id="qInput" placeholder="جستجوی مفهومی یا فیلتر (مثلا type:photo کوبرنتیز)..." onkeydown="if(event.key==='Enter')runSearch()" />
      <button class="btn" onclick="runSearch()">جستجو</button>
    </div>
    <div id="nodesList"></div>
  </div>

  <!-- TAB 2: CHATS -->
  <div id="tab-chats" class="hidden">
    <div class="card" style="color:var(--muted);font-size:11px;">
      فهرست تمام کانال‌ها و گروه‌هایی که ربات در آن‌ها عضو است. با کلیک روی وضعیت می‌توانید ذخیره خودکار آن کانال یا گروه را قطع یا وصل کنید.
    </div>
    <div id="chatsList"></div>
  </div>

  <!-- TAB 3: ADMIN & UI CUSTOMIZER -->
  <div id="tab-admin" class="hidden">
    <div class="card">
      <div class="field-row">
        <label>سطح دسترسی سیستم (Access Control Mode)</label>
        <select id="cfgAccessMode">
          <option value="admin">PRIVATE (فقط ادمین‌های سیستم)</option>
          <option value="whitelist">WHITELIST (فقط کاربران تاییدشده)</option>
          <option value="public">PUBLIC (عمومی برای تمام کاربران)</option>
        </select>
      </div>
      <div class="field-row">
        <label>مدل امبدینگ Workers AI</label>
        <select id="cfgEmbedModel">
          <option value="@cf/baai/bge-m3">@cf/baai/bge-m3 (1024d - چندزبانه و فارسی)</option>
          <option value="@cf/baai/bge-small-en-v1.5">@cf/baai/bge-small-en-v1.5 (384d - انگلیسی سریع)</option>
        </select>
      </div>
      <div class="field-row">
        <label>تگ‌گذاری خودکار با LLM (feature_autotag)</label>
        <select id="cfgAutoTag">
          <option value="1">فعال (ACTIVE)</option>
          <option value="0">غیرفعال (OFF)</option>
        </select>
      </div>
      <button class="btn" style="width:100%;margin-top:4px;" onclick="saveCoreSettings()">ذخیره تنظیمات هسته</button>
    </div>

    <div class="card">
      <div style="color:var(--accent);font-weight:700;margin-bottom:8px;">✎ شخصی‌سازی متون و دکمه‌های گرافیکی</div>
      <div id="stringsEditor"></div>
      <button class="btn" style="width:100%;margin-top:8px;" onclick="saveCustomStrings()">ذخیره تمام متون و دکمه‌ها در D1</button>
    </div>
  </div>

  <script>
    const tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
    const initData = tg?.initData || "";

    async function apiCall(path, method = "GET", body = null) {
      const opts = {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData
        }
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(path, opts);
      return res.json();
    }

    function switchTab(tab) {
      ["search", "chats", "admin"].forEach((t, i) => {
        document.getElementById("tab-" + t).classList.toggle("hidden", t !== tab);
        document.querySelectorAll(".tab-btn")[i].classList.toggle("active", t === tab);
      });
    }

    function renderNodes(items, latency = null) {
      const box = document.getElementById("nodesList");
      if (!items || items.length === 0) {
        box.innerHTML = '<div class="card">هیچ رکوردی یافت نشد.</div>';
        return;
      }
      box.innerHTML = items.map(n => {
        const pct = n.score ? Math.round(n.score * 100) + "%" : "RAW";
        const jumpBtn = n.deep_link ? \`<a class="btn-sec" href="\${n.deep_link}" target="_blank" style="text-decoration:none;">⎋ پرش به پیام</a>\` : "";
        return \`
          <div class="card" id="node-\${n.id}">
            <div class="card-top">
              <span>[\${(n.media_type || 'TEXT').toUpperCase()}] \${n.chat_title || 'Saved'} | \${n.sender_name || ''}</span>
              <span>\${pct} \${latency ? '('+latency+'ms)' : ''}</span>
            </div>
            <div class="card-body">\${(n.raw_text || '').replace(/</g,'&lt;')}</div>
            <div class="card-actions">
              \${jumpBtn}
              <button class="btn-sec" onclick="toggleStar('\${n.id}')">\${n.is_starred ? '★ نشان‌دار' : '☆ نشان'}</button>
              <button class="btn-sec" style="color:var(--danger);" onclick="deleteNode('\${n.id}')">✕ حذف</button>
            </div>
          </div>
        \`;
      }).join("");
    }

    function renderChats(chats) {
      const box = document.getElementById("chatsList");
      if (!chats || chats.length === 0) {
        box.innerHTML = '<div class="card">هنوز کانال یا گروهی ثبت نشده است.</div>';
        return;
      }
      box.innerHTML = chats.map(c => \`
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;">\${c.chat_title || c.chat_id}</div>
            <div style="font-size:11px;color:var(--muted);">Type: \${c.chat_type} | Indexed: \${c.indexed_count}</div>
          </div>
          <button class="btn-sec" onclick="toggleChat(\${c.chat_id})" style="color:\${c.is_enabled ? 'var(--ok)' : 'var(--danger)'}">
            \${c.is_enabled ? '● ACTIVE' : '○ PAUSED'}
          </button>
        </div>
      \`).join("");
    }

    async function bootstrap() {
      const data = await apiCall("/api/bootstrap");
      if (!data.ok) {
        document.getElementById("statusBadge").textContent = "AUTH_RESTRICTED";
        return;
      }
      document.getElementById("statusBadge").textContent = data.stats.accessMode.toUpperCase() + " MODE";
      document.getElementById("stNotes").textContent = data.stats.notesCount;
      document.getElementById("stVecs").textContent = data.stats.vecCount;
      renderNodes(data.recent);
      renderChats(data.chats);

      document.getElementById("cfgAccessMode").value = data.stats.accessMode;
      document.getElementById("cfgEmbedModel").value = data.stats.embedModel;
      document.getElementById("cfgAutoTag").value = data.stats.autoTag ? "1" : "0";

      const strBox = document.getElementById("stringsEditor");
      strBox.innerHTML = Object.entries(data.strings || {}).map(([k, v]) => \`
        <div class="field-row">
          <label>\${k}</label>
          <input type="text" data-str-key="\${k}" value="\${String(v).replace(/"/g, '&quot;')}" />
        </div>
      \`).join("");
    }

    async function runSearch() {
      const q = document.getElementById("qInput").value;
      const res = await apiCall("/api/search", "POST", { query: q });
      if (res.ok) renderNodes(res.results, res.latencyMs);
    }

    async function deleteNode(id) {
      await apiCall("/api/node/action", "POST", { action: "delete", id });
      const el = document.getElementById("node-" + id);
      if (el) el.remove();
    }

    async function toggleStar(id) {
      await apiCall("/api/node/action", "POST", { action: "star", id });
      bootstrap();
    }

    async function toggleChat(chatId) {
      await apiCall("/api/admin/save", "POST", { toggleChatId: chatId });
      bootstrap();
    }

    async function saveCoreSettings() {
      const settings = {
        sys_access_mode: document.getElementById("cfgAccessMode").value,
        model_embedding: document.getElementById("cfgEmbedModel").value,
        feature_autotag: document.getElementById("cfgAutoTag").value,
      };
      const res = await apiCall("/api/admin/save", "POST", { settings });
      if (res.ok && tg?.showAlert) tg.showAlert("تنظیمات هسته ذخیره شد.");
      bootstrap();
    }

    async function saveCustomStrings() {
      const inputs = document.querySelectorAll("[data-str-key]");
      const settings = {};
      inputs.forEach(inp => {
        settings[inp.getAttribute("data-str-key")] = inp.value;
      });
      const res = await apiCall("/api/admin/save", "POST", { settings });
      if (res.ok && tg?.showAlert) tg.showAlert("تمام متون و دکمه‌ها بروزرسانی شدند.");
    }

    bootstrap();
  </script>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// 12. MAIN TELEGRAM UPDATE DISPATCHER & WORKER ENTRYPOINT
// ----------------------------------------------------------------------------

async function processTelegramUpdate(env, update, workerOrigin) {
  await ensureSchema(env);
  const cfg = new RuntimeConfig(env);
  await cfg.load();

  try {
    // 1. Inline Queries (<40ms Semantic Search)
    if (update.inline_query) {
      return await handleInlineQuery(env, cfg, update.inline_query);
    }

    // 2. Graphical Button Callbacks
    if (update.callback_query) {
      return await handleCallbackQuery(env, cfg, update.callback_query, workerOrigin);
    }

    // 3. Auto-Register Channels & Groups when Bot is Added (`my_chat_member`)
    if (update.my_chat_member && update.my_chat_member.chat) {
      const st = update.my_chat_member.new_chat_member?.status;
      if (st === "administrator" || st === "member") {
        await syncChatRegistry(env, update.my_chat_member.chat, 0);
      }
      return;
    }

    // 4. Infinite Channels & Groups + Private Messages + Live Edits
    const msg =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.edited_channel_post;

    if (!msg || !msg.chat) return;

    const isEdit = Boolean(update.edited_message || update.edited_channel_post);
    const chatType = msg.chat.type || "private";

    // الف) در چت خصوصی: بررسی دسترسی، اجرای دستورات یا ایندکس پیام/فایل ارسالی
    if (chatType === "private") {
      const access = await checkUserAccess(env, cfg, msg.from);
      if (access !== true) {
        return await tgApi(env, "sendMessage", {
          chat_id: msg.chat.id,
          text: access === "RATE_LIMITED" ? cfg.get("sys_rate_limit") : cfg.get("sys_locked"),
        });
      }

      if (msg.text && msg.text.startsWith("/") && !isEdit) {
        return await handlePrivateCommand(env, cfg, msg, workerOrigin);
      }

      const startIngest = Date.now();
      const res = await ingestTelegramMessage(env, cfg, msg, { isEdit });
      if (res?.skipped) return;

      if (res?.duplicate) {
        return await tgApi(env, "sendMessage", {
          chat_id: msg.chat.id,
          reply_to_message_id: msg.message_id,
          text: `<code>${escapeHtml(cfg.get("sys_indexed_dup"))} (ID: ${res.noteId})</code>`,
          parse_mode: "HTML",
        });
      }

      if (res?.note) {
        const elapsed = Date.now() - startIngest;
        return await tgApi(env, "sendMessage", {
          chat_id: msg.chat.id,
          reply_to_message_id: msg.message_id,
          text:
            `<b>${escapeHtml(cfg.get("sys_indexed_ok"))}</b> (<code>${res.chunksCount} بردار</code>)\n\n` +
            formatNoteTechnicalCard(res.note, elapsed),
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: buildNoteActionKeyboard(cfg, res.note),
        });
      }
      return;
    }

    // ب) در کانال‌ها و گروه‌ها: ذخیره و برداری‌سازی بی‌صدا در پس‌زمینه (همراه با نام عضو و لینک پیام)
    if (chatType === "channel" || chatType === "supergroup" || chatType === "group") {
      // اگر در گروه دستور مستقیم /search یا /ask صدا زده شد، پاسخ بده
      if (msg.text && (msg.text.startsWith("/search@") || msg.text.startsWith("/ask@"))) {
        const access = await checkUserAccess(env, cfg, msg.from);
        if (access === true) {
          return await handlePrivateCommand(env, cfg, msg, workerOrigin);
        }
      }
      await ingestTelegramMessage(env, cfg, msg, { isEdit });
    }
  } catch (err) {
    await logKernelError(env, "processTelegramUpdate", err);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const workerOrigin = `${url.protocol}//${url.host}`;

    await ensureSchema(env);
    const cfg = new RuntimeConfig(env);
    await cfg.load();

    // 1. راه‌اندازی خودکار وب‌هوک با یک کلیک
    if (url.pathname === "/setup") {
      const webhookUrl = `${workerOrigin}/webhook`;
      const res = await tgApi(env, "setWebhook", {
        url: webhookUrl,
        secret_token: CONFIG.WEBHOOK_SECRET,
        allowed_updates: [
          "message",
          "edited_message",
          "channel_post",
          "edited_channel_post",
          "inline_query",
          "callback_query",
          "my_chat_member",
        ],
        drop_pending_updates: false,
      });

      return new Response(
        JSON.stringify(
          {
            status: "KERNEL_WEBHOOK_SETUP",
            webhook_url: webhookUrl,
            telegram_response: res,
            mini_app_url: `${workerOrigin}/app`,
          },
          null,
          2
        ),
        { headers: { "Content-Type": "application/json;charset=utf-8" } }
      );
    }

    // 2. بررسی سلامت سرویس و اتصال Bindings
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify(
          {
            ok: true,
            bindings: {
              D1_DB: Boolean(env.DB),
              VECTORIZE: Boolean(env.VECTORIZE),
              WORKERS_AI: Boolean(env.AI),
            },
            access_mode: cfg.getAccessMode(),
            embedding_model: cfg.getEmbedModel(),
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
        { headers: { "Content-Type": "application/json;charset=utf-8" } }
      );
    }

    // 3. مینی‌اپ تلگرام (TMA)
    if (url.pathname === "/app") {
      return new Response(renderMiniAppHtml(), {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      });
    }

    // 4. API مینی‌اپ
    if (url.pathname.startsWith("/api/")) {
      return handleMiniAppApi(request, env, cfg);
    }

    // 5. دریافت آپدیت‌های وب‌هوک تلگرام
    if (url.pathname === "/webhook" && request.method === "POST") {
      const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secretHeader !== CONFIG.WEBHOOK_SECRET) {
        return new Response("FORBIDDEN_WEBHOOK_SECRET", { status: 403 });
      }
      const update = await request.json().catch(() => null);
      if (update) {
        ctx.waitUntil(processTelegramUpdate(env, update, workerOrigin));
      }
      return new Response("OK", { status: 200 });
    }

    return new Response(
      "▣ Semantic Archive Kernel is Running. Visit /setup to bind Telegram Webhook or /health for diagnostics.",
      { status: 200, headers: { "Content-Type": "text/plain;charset=utf-8" } }
    );
  },

  // Cron Trigger جهت حذف خودکار یادداشت‌های زمان‌دار (TTL Ephemeral Notes)
  async scheduled(event, env, ctx) {
    await ensureSchema(env);
    const now = Date.now();
    const { results: expired } = await env.DB.prepare(
      `SELECT id FROM notes WHERE expires_at > 0 AND expires_at < ?1`
    ).bind(now).all();
    if (expired && expired.length > 0) {
      ctx.waitUntil(
        deleteNoteAndVectors(
          env,
          expired.map((r) => r.id)
        )
      );
    }
  },
};
