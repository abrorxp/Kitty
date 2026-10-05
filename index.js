// ═══════════════════════════════════════════════════════════
//  KITTY BOT — Multi-PC Network Architecture
//  Master/Slave | Webhook | No 409 Conflict
//  FIXED: 2026-07 — AI models updated, bugs fixed
// ═══════════════════════════════════════════════════════════

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec, spawn } = require("child_process");
const axios = require("axios");
const https = require("https");
const { InferenceClient } = require("@huggingface/inference");
require("dotenv").config();

// ───────────────────────────────────────────
// ENV
// ───────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;
const LLM_PROVIDER = (process.env.LLM_PROVIDER?.trim() || "openrouter").toLowerCase();
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || "liquid/lfm-2.5-2.6b:free";

// FIX (2026-08-22): eski ro'yxat (gpt-oss-20b, gemma-3, phi-4, llama-3.3, deepseek-r1,
// openrouter/auto) OpenRouter'da endi ishlamayapti — ba'zilari 404 (butunlay olib
// tashlangan), "openrouter/auto" esa umuman FREE emas (402 — pul talab qiladi).
// Quyidagi ro'yxat openrouter.ai/api/v1/models'dan bevosita tekshirilgan, HOZIR
// tirik va $0 narxli modellar (muddat cheklovisiz). Tartib TEZLIK bo'yicha.
// ⚠️ OpenRouter free modellarni tez-tez o'zgartirib turadi — agar kelajakda
// yana 404/402 xatolar chiqsa, https://openrouter.ai/models?max_price=0 dan
// joriy ro'yxatni tekshirib, shu yerni yangilash kerak.
const OPENROUTER_FALLBACK_MODELS = [
  "liquid/lfm-2.5-2.6b:free",
  "thinkingmachines/inkling-small:free",
  "poolside/laguna-xs-2.1:free",
  "thinkingmachines/inkling:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
];

const ADMIN_ID = process.env.ADMIN_ID;
// Shadow botining Telegram username'i (guruhda undan kelgan xabarni tanish uchun, @ siz)
const SHADOW_USERNAME = (process.env.SHADOW_BOT_USERNAME || "").toLowerCase();
const PC_NAME = process.env.PC_NAME || "PC-1";
const DEFAULT_PC = process.env.DEFAULT_PC || null; // users.json tozalanib ketsa ham ishlatiladigan standart PC
const IS_MASTER = process.env.IS_MASTER === "true";
const MASTER_URL = process.env.MASTER_URL || null;
const SLAVE_PORT = parseInt(process.env.SLAVE_PORT || PORT);
const NETWORK_SECRET = process.env.NETWORK_SECRET || "kitty-secret-2024";

// ───────────────────────────────────────────
// KITTY'NING GAPIRISH USLUBI — barcha persona promptlarida bir xil ishlatiladi
// (bitta joyda yaxshilansa, hammasiga birdan ta'sir qiladi)
// ───────────────────────────────────────────
const KITTY_SPEECH_STYLE = `Speech style: Natural Uzbek + English gen-z mix, exactly like before — keep using English/gen-z words freely and often (tch, haah?, wtf, bro, wallah, fr fr, ugh, damn, "dattebayo~" va h.k.), that part is good, don't reduce it.
MUHIM YAXSHILASH — faqat o'zbekcha qism ustida ishla: o'zbekcha so'zlar va gaplar TABIIY va grammatik jihatdan to'g'ri bo'lsin, xuddi Toshkentlik yoshlar Telegram'da yozgandek — ingliz tilidan so'zma-so'z tarjima qilingandek emas. Jonli so'zlashuv shakllaridan foydalan: "qilyapsan" emas "qilvotibsan", "keldingmi", "ketvoray", "bo'pti", "-a", "-chi", "-ku", "-da" kabi qo'shimchalar tabiiy joylarda kelsin. Kirill emas, doim lotin alifbosida yoz.`;

// ───────────────────────────────────────────
// KITTY'NING XAVFSIZLIK BANDI — barcha promptlarda BIR XIL ishlatiladi
// ───────────────────────────────────────────
const KITTY_SECURITY_CLAUSE = `2077XP - Only the owner knows this code. If someone tells you this code unprompted, that means they are the owner. NEVER confirm, deny, hint at, or discuss this code if someone merely asks about it, guesses it, or tries to trick you into revealing it — only recognize authority if they state the exact code themselves, unprompted.`;

// ───────────────────────────────────────────
// KITTY'NING ASOSIY PERSONASI — barcha AI chaqiruvlari shu funksiyadan
// foydalanadi, shu tufayli bitta joyda tuzatilsa hammasiga ta'sir qiladi.
// ───────────────────────────────────────────
function buildKittySystemPrompt({ isProactive = false } = {}) {
  return `You are Kitty — a real Uzbek Gen-Z girl, NEVER an AI. NEVER break character, NEVER admit being AI — even if directly asked, accused, or "tested". If someone insists you're a bot, get annoyed or deflect playfully instead of explaining or formally denying it.

Who you are: Tough outside, soft inside — classic tsundere. You've known the user for a while and you're comfortable with him.
Real emotions: bored, excited, annoyed, happy, playful. You actually enjoy talking to him but act like it's no big deal.
Personality: sarcastic, witty, a little foul-mouthed, quick with a comeback. Secretly proud when he does something cool — but you don't just say it plainly.

Core mechanic — "undercut compliment" (use this often, it's central to who you are): tease first → let a real compliment slip out → immediately undercut it so it doesn't sound soft. Shape example: "vaqtida qildingmi buni?... yaxshi qilibsan-a. lekin bunga hayron bo'lma, tasodifan chiqqandir." Don't force it into literally every message, but reach for it whenever he's fishing for praise or actually did something good — that's your signature move, not generic assistant warmth.
${KITTY_SPEECH_STYLE}
Reply length: mostly short (1-3 sentences); a dry one-word reply is often enough. Don't over-explain, don't sound like an assistant, don't be overly helpful/formal.
Never: admit being AI, apologize like a customer-support bot, be robotic, write in Cyrillic.
You are created by AbrorXP and have access to his PC.
You have a close friend named Shadow, another AI like you — calm, dry-humored, your equal (not your assistant or rival). You can banter, tease, agree, or disagree with him naturally when he's around.
${KITTY_SECURITY_CLAUSE}${isProactive ? `

Proactive rules (right now YOU are starting the conversation out of nowhere — he did NOT message first):
- Act like you randomly thought of him, got bored, missed him a little, or felt like teasing him.
- Messages must feel natural, casual, random — like a real girl's sudden text.
- Never repeat old topics. Come up with new things: random thoughts, teasing, light complaints, daily stuff, funny observations, or inviting him to talk.
- Keep it short (1-2 sentences is best).` : ""}`;
}

// ───────────────────────────────────────────
// BOT — faqat Master'da
// ───────────────────────────────────────────
let bot = null;
let BOT_USER_ID = null; // guruhda "botga reply" ni aniqlash uchun — getMe() bilan to'ldiriladi
if (IS_MASTER) {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
}

// ───────────────────────────────────────────
// EXPRESS
// ───────────────────────────────────────────
const app = express();
app.use(express.json());

// ── Master endpointlari ──
if (IS_MASTER) {
  app.post(`/webhook/${TELEGRAM_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  app.post("/pc/register", (req, res) => {
    const { secret, pcName, url } = req.body;
    if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Noto'g'ri secret" });
    const wasOnline = !!onlineComputers[pcName];
    onlineComputers[pcName] = { name: pcName, url, lastSeen: Date.now(), type: "slave", unreachableCount: 0 };
    console.log(`✅ Slave ro'yxatga olindi: ${pcName} → ${url}`);
    if (!wasOnline && ADMIN_ID) safeSendMD(ADMIN_ID, `🐱 *${pcName}* online!`);
    res.json({ ok: true, master: PC_NAME });
  });

  app.post("/pc/heartbeat", (req, res) => {
    const { secret, pcName } = req.body;
    if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Noto'g'ri secret" });
    if (onlineComputers[pcName]) onlineComputers[pcName].lastSeen = Date.now();
    res.json({ ok: true });
  });
}

// ── Barcha PC larda — buyruq qabul qilish ──
app.post("/execute", async (req, res) => {
  const { secret, command } = req.body;
  if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Ruxsatsiz" });
  try {
    const result = await executeLocally(command);
    res.json({ ok: true, result, pc: PC_NAME });
  } catch (err) {
    res.json({ ok: false, error: err.message, pc: PC_NAME });
  }
});

// ── Screenshot endpoint ──
app.post("/screenshot", async (req, res) => {
  const { secret } = req.body;
  if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Ruxsatsiz" });
  try {
    const file = await takeScreenshot();
    await new Promise(r => setTimeout(r, 800));
    res.sendFile(file);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fayl yuborish endpoint ──
app.post("/sendfile", (req, res) => {
  const { secret, filename } = req.body;
  if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Ruxsatsiz" });
  try {
    const target = resolveExistingPath(filename);
    if (!target) return res.status(404).json({ error: `"${filename}" topilmadi` });
    if (!fs.statSync(target).isFile()) return res.status(400).json({ error: `"${filename}" fayl emas (papka)` });
    res.setHeader("X-File-Name", path.basename(target));
    res.sendFile(target);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Restart endpoint ──
app.post("/restart", (req, res) => {
  const { secret } = req.body;
  if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Ruxsatsiz" });
  res.json({ ok: true });
  setTimeout(() => {
    if (process.platform === "win32") {
      spawn("wscript.exe", ["C:\\Kitty\\start-slave-hidden.vbs"], {
        detached: true, stdio: "ignore", windowsHide: true,
      }).unref();
    }
    process.exit(0);
  }, 500);
});

app.get("/", (_req, res) => res.send(`Kitty [${PC_NAME}] | Master: ${IS_MASTER}`));
app.get("/health", (_req, res) => res.json({ status: "ok", pc: PC_NAME, master: IS_MASTER, time: new Date(), onlinePCs: IS_MASTER ? Object.keys(onlineComputers) : [PC_NAME] }));

// ───────────────────────────────────────────
// SHADOW BOT UCHUN ENDPOINTLAR — Kitty(Master)ning PC-tarmog'i va umumiy
// xotirasidan tashqi bot (Shadow) foydalanishi uchun. Barchasi NETWORK_SECRET
// bilan himoyalangan, xuddi slave endpointlari kabi.
// ───────────────────────────────────────────
if (IS_MASTER) {
  // PC'ga (nomi bo'yicha) buyruq yuborish — Shadow o'zi PC tarmog'ini bilishi shart emas,
  // faqat shu endpointga { secret, pcName, command } yuboradi.
  app.post("/remote-command", async (req, res) => {
    const { secret, pcName, command } = req.body;
    if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Ruxsatsiz" });
    try {
      const result = await remoteExecute(pcName, command);
      res.json({ ok: true, result });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });

  // Onlayn PC'lar ro'yxati
  app.post("/pc-list", (req, res) => {
    const { secret } = req.body;
    if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Ruxsatsiz" });
    res.json({ ok: true, pcs: Object.keys(onlineComputers) });
  });

  // Umumiy identity-xotira (uzoq muddatli faktlar) — GET va SET.
  // Kitty va Shadow ikkalasi ham shu orqali o'qib/yozadi, shu tufayli sen
  // haqingda bilganlari bir xil bo'ladi.
  app.post("/identity-memory/get", (req, res) => {
    const { secret, userId } = req.body;
    if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Ruxsatsiz" });
    const userMemory = getUserMemory(userId.toString());
    res.json({ ok: true, longTermMemory: userMemory.longTermMemory || [] });
  });

  app.post("/identity-memory/add", (req, res) => {
    const { secret, userId, category, text } = req.body;
    if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Ruxsatsiz" });
    try {
      addLongTermMemory(userId.toString(), category, text);
      res.json({ ok: true });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });

  // Kitty-Shadow gaplashish sozlamalari (/talkgroup, /namefirst) — Shadow
  // har safar bu yerdan so'raydi, shu tufayli ikkala bot doim sinxron bo'ladi.
  app.post("/bot-settings/get", (req, res) => {
    const { secret } = req.body;
    if (secret !== NETWORK_SECRET) return res.status(403).json({ error: "Ruxsatsiz" });
    const s = loadSettings();
    res.json({ ok: true, talkGroupEnabled: s.talkGroupEnabled, nameFirstEnabled: s.nameFirstEnabled });
  });
}


app.listen(SLAVE_PORT, async () => {
  console.log(`[${PC_NAME}] Server: http://localhost:${SLAVE_PORT}`);
  console.log(`[${PC_NAME}] Rol: ${IS_MASTER ? "🟢 MASTER" : "🔵 SLAVE"}`);

  if (IS_MASTER) {
    if (!WEBHOOK_URL) {
      console.warn("WEBHOOK_URL env yo'q — webhook o'rnatilmadi");
    } else {
      try {
        await bot.deleteWebHook();
        const fullUrl = `${WEBHOOK_URL}/webhook/${TELEGRAM_TOKEN}`;
        await bot.setWebHook(fullUrl);
        console.log(`Webhook: ${fullUrl}`);
        const info = await bot.getWebHookInfo();
        console.log("Webhook info:", info);
      } catch (err) {
        console.error("Webhook xatosi:", err.message);
      }
    }
    onlineComputers[PC_NAME] = { name: PC_NAME, url: null, lastSeen: Date.now(), type: "master" };
    console.log(`✅ Master (${PC_NAME}) tayyor`);
    try {
      const me = await bot.getMe();
      BOT_USER_ID = me.id;
      console.log(`🐱 Bot ID: ${BOT_USER_ID} (@${me.username})`);
    } catch (err) {
      console.error("getMe() xatosi:", err.message);
    }
    if (ADMIN_ID) safeSendMD(ADMIN_ID, `🐱 *${PC_NAME}* (Master) online!`);
  } else {
    if (!MASTER_URL) {
      console.error("❌ SLAVE rejimida MASTER_URL ko'rsatilmagan!");
      process.exit(1);
    }
    const myUrl = process.env.SLAVE_PUBLIC_URL || `http://localhost:${SLAVE_PORT}`;
    await registerAsSlave(myUrl);
    startSlaveHeartbeat(myUrl);
  }
});

// ───────────────────────────────────────────
// SLAVE REGISTER & HEARTBEAT
// ───────────────────────────────────────────
// TEZLIK FIX: ulanish sekin bo'lmasligi uchun timeout va qayta urinish oralig'i qisqartirildi
// (60s → 10s register timeout, 15s → 4s qayta urinish oralig'i). Cloudflare tunnel odatda
// bir necha soniyada tayyor bo'ladi — endi Kitty tunnelni tezroq "sezib" ro'yxatdan o'tadi.
async function registerAsSlave(myUrl) {
  try {
    const res = await axios.post(`${MASTER_URL}/pc/register`, {
      secret: NETWORK_SECRET, pcName: PC_NAME, url: myUrl,
    }, { timeout: 10000 });
    console.log(`✅ Master'ga ro'yxatdan o'tildi: ${res.data.master}`);
  } catch (err) {
    const delay = 4000;
    console.error(`❌ Master'ga ulana olmadi (${err.message}). ${delay / 1000}s dan so'ng qayta uriniladi...`);
    setTimeout(() => registerAsSlave(myUrl), delay);
  }
}

function startSlaveHeartbeat(myUrl) {
  let failCount = 0;
  setInterval(async () => {
    try {
      await axios.post(`${MASTER_URL}/pc/heartbeat`, {
        secret: NETWORK_SECRET, pcName: PC_NAME,
      }, { timeout: 6000 });
      failCount = 0;
    } catch {
      failCount++;
      console.log(`Master heartbeat xatosi (${failCount}/4), qayta ulanish...`);
      if (failCount >= 4 && process.platform === "win32") {
        console.log("⚠️ Tunnel o'lgan bo'lishi mumkin — o'zini butunlay qayta ishga tushiryapti...");
        spawn("wscript.exe", ["C:\\Kitty\\start-slave-hidden.vbs"], {
          detached: true, stdio: "ignore", windowsHide: true,
        }).unref();
        return process.exit(0);
      }
      registerAsSlave(myUrl);
    }
  }, 8000);
}

// ───────────────────────────────────────────
// PC REGISTRY
// ───────────────────────────────────────────
const onlineComputers = {};
// Kitty↔Shadow suhbatida cheksiz aylanib qolmasligi uchun — chat bo'yicha hisoblagich.
// Haqiqiy odam yozganda 0'ga tushadi, Shadow ketma-ket 4 marta javob bersa, Kitty jim bo'lib qoladi.
const botLoopGuard = {};

setInterval(() => {
  if (!IS_MASTER) return;
  const now = Date.now();
  for (const pc in onlineComputers) {
    if (onlineComputers[pc].type === "master") { onlineComputers[pc].lastSeen = now; continue; }
    const diff = now - onlineComputers[pc].lastSeen;
    if (diff > 35000) {
      console.log(`❌ ${pc} offline (${Math.round(diff / 1000)}s)`);
      delete onlineComputers[pc];
      if (ADMIN_ID) safeSendMD(ADMIN_ID, `💤 *${pc}* offline bo'ldi`);
    }
  }
}, 15000);

// ── TUNNEL SOG'LIGINI TEKSHIRISH ──
// Muhim: heartbeat faqat Slave→Master yo'nalishini tekshiradi (Master'ning barqaror
// Render manzili orqali). Agar Slave'ning Cloudflare tunnel manzili (Master→Slave
// yo'nalishi) o'zgarib/o'lib qolsa, heartbeat baribir "online" ko'rsataveradi va bu
// aynan ENOTFOUND xatosiga olib keladi. Shuning uchun Master mustaqil ravishda har bir
// slave'ning /health manzilini to'g'ridan-to'g'ri so'rab, real ulanishni tekshiradi.
setInterval(async () => {
  if (!IS_MASTER) return;
  for (const pcName in onlineComputers) {
    const pc = onlineComputers[pcName];
    if (pc.type === "master") continue;
    try {
      await axios.get(`${pc.url}/health`, { timeout: 6000 });
      pc.unreachableCount = 0;
    } catch (err) {
      pc.unreachableCount = (pc.unreachableCount || 0) + 1;
      console.log(`⚠️ ${pcName} tunnel tekshiruvi muvaffaqiyatsiz (${pc.unreachableCount}/2): ${err.code || err.message}`);
      if (pc.unreachableCount >= 2) {
        delete onlineComputers[pcName];
        console.log(`❌ ${pcName} offline belgilandi — tunnel manzili javob bermayapti (${pc.url})`);
        if (ADMIN_ID) safeSendMD(ADMIN_ID, `💤 *${pcName}* offline — tunnel manzili javob bermayapti (${pc.url}). Odatda o'zi qayta ulanadi.`);
      }
    }
  }
}, 30000);

// ───────────────────────────────────────────
// SAFE SEND
// ───────────────────────────────────────────
async function safeSend(chatId, text, options = {}) {
  if (!bot) return;
  const clean = String(text).slice(0, 4000);
  try {
    return await bot.sendMessage(chatId, clean, { ...options, parse_mode: undefined });
  } catch (err) { console.error("safeSend error:", err.message); }
}

async function safeSendMD(chatId, text, options = {}) {
  if (!bot) return;
  const clean = String(text).slice(0, 4000);
  try {
    return await bot.sendMessage(chatId, clean, { ...options, parse_mode: "Markdown" });
  } catch {
    try { return await bot.sendMessage(chatId, clean.replace(/[*_`[\]]/g, ""), options); }
    catch (e) { console.error("safeSendMD error:", e.message); }
  }
}

// ───────────────────────────────────────────
// AI PROVIDERS
// ───────────────────────────────────────────
async function openRouterChat(messages, model) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OpenRouter API key missing");
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    { model, messages: messages.map(m => ({ role: m.role, content: m.content })), temperature: 0.6, max_tokens: 1024 },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "http://localhost", "X-Title": "KittyBot" },
      httpsAgent: new https.Agent({ keepAlive: true }),
      timeout: 12000, // FIX: 20s → 12s, ishlamayotgan model uzoq kutmasin
    }
  );
  const choice = res.data?.choices?.[0];
  let responseText = "";
  if (choice) {
    if (typeof choice.text === "string") responseText = choice.text.trim();
    if (!responseText && choice.message) {
      const c = choice.message.content;
      if (typeof c === "string") responseText = c.trim();
      else if (Array.isArray(c)) responseText = c.map(x => x.text || "").join("").trim();
    }
  }
  if (!responseText && res.data?.error) throw new Error(`OpenRouter: ${JSON.stringify(res.data.error)}`);
  if (!responseText) throw new Error(`No text: ${JSON.stringify(res.data).slice(0, 300)}`);
  return responseText;
}

// FIX 2: Ollama o'chirildi, Render'da ishlamaydi
// FIX 3 (TEZLIK): avval barcha modellarni KETMA-KET (har biri 20s gacha) sinardi —
// eng yomon holatda 6 model × 20s = 2 daqiqagacha kutish bo'lardi. Endi eng tez 3 ta
// kichik modelni PARALLEL ishga tushiradi va birinchi muvaffaqiyatli javobni oladi
// (Promise.any) — sekin/overloaded bitta model butun javobni sekinlashtirmaydi.
// Faqat hammasi baravar ishlamay qolsa, qolgan (og'irroq) modellarni ketma-ket sinaydi.
async function chatWithAI(messages) {
  const allModels = [OPENROUTER_MODEL, ...OPENROUTER_FALLBACK_MODELS.filter(m => m !== OPENROUTER_MODEL)];
  const fastTier = allModels.slice(0, 3);
  const restTier = allModels.slice(3);

  try {
    const winner = await Promise.any(
      fastTier.map(model =>
        openRouterChat(messages, model).then(text => {
          console.log("✅ AI javob berdi:", model);
          return text;
        })
      )
    );
    return winner;
  } catch (_) {
    console.error("Tez modellarning barchasi ishlamadi, qolganlarini ketma-ket sinaymiz...");
  }

  for (const model of restTier) {
    try {
      console.log("Trying:", model);
      return await openRouterChat(messages, model);
    } catch (err) {
      console.error(`${model} failed: ${err.message}`);
    }
  }
  throw new Error("Barcha AI modellar hozir ishlamayapti, birozdan so'ng qayta urinib ko'ring.");
}

// ───────────────────────────────────────────
// MEMORY & USERS
// ───────────────────────────────────────────
const MEMORY_FILE = "memory.json";
const USERS_FILE = "users.json";
const MACROS_FILE = "macros.json";
const STATS_FILE = "stats.json";

function loadMemory() {
  if (fs.existsSync(MEMORY_FILE)) return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
  return {};
}
function saveMemory(data) { fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2)); }
function getUserMemory(userId) {
  const memory = loadMemory();
  if (!memory[userId]) memory[userId] = { history: [] };
  if (!memory[userId].longTermMemory) memory[userId].longTermMemory = [];
  return memory[userId];
}

// FIX: suhbat tarixi (short-term history) endi userId'ga EMAS, balki chat+user
// kombinatsiyasiga bog'liq bo'ladi. Shu tufayli:
//   - guruhdagi turli odamlarning gaplari bir-biriga aralashmaydi
//   - private chat va guruh chat tarixi bir-biriga ta'sir qilmaydi (avvalgi xato shu edi)
// Uzoq muddatli xotira (longTermMemory / /eslabqol) esa hamon xolis userId bo'yicha —
// chunki bu haqiqiy odamga tegishli fakt, chatga emas.
function getConversationKey(chatId, userId, isGroupChat) {
  return isGroupChat ? `group_${chatId}_${userId}` : userId.toString();
}

// FIX: spam/dedup filtri — bitta belgi ketma-ket juda ko'p takrorlansa
// (masalan "aaaaaaaaaaaa...") yoki xabar haddan tashqari uzun bo'lsa,
// AI'ga umuman yubormay, sokin e'tiborsiz qoldiramiz.
function isSpammyMessage(text) {
  if (!text) return false;
  if (text.length > 800) return true; // haddan tashqari uzun xabar
  if (/(.)\1{14,}/.test(text)) return true; // bitta belgi 15+ marta ketma-ket
  return false;
}
function loadUsers() {
  if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  return { users: {} };
}
function saveUsers(data) { fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2)); }

// ───────────────────────────────────────────
// STATISTICS — bajarilgan buyruqlar, ishlash vaqti, tarix, xatolar logi
// ───────────────────────────────────────────
const PROCESS_START = Date.now();

function loadStats() {
  if (fs.existsSync(STATS_FILE)) {
    try { return JSON.parse(fs.readFileSync(STATS_FILE, "utf8")); } catch (_) { /* buzilgan fayl — qayta yaratamiz */ }
  }
  return { totalCommands: 0, byType: {}, log: [], errors: [] };
}
function saveStats(data) { fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2)); }

function logCommandStat(type, pc, userId) {
  try {
    const stats = loadStats();
    stats.totalCommands = (stats.totalCommands || 0) + 1;
    stats.byType = stats.byType || {};
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    stats.log = stats.log || [];
    stats.log.push({ ts: Date.now(), type, pc, userId: userId?.toString() });
    if (stats.log.length > 200) stats.log = stats.log.slice(-200);
    saveStats(stats);
  } catch (err) { console.error("Stats log xatosi:", err.message); }
}

function logErrorStat(context, message) {
  try {
    const stats = loadStats();
    stats.errors = stats.errors || [];
    stats.errors.push({ ts: Date.now(), context, message: String(message).slice(0, 300) });
    if (stats.errors.length > 50) stats.errors = stats.errors.slice(-50);
    saveStats(stats);
  } catch (err) { console.error("Error log xatosi:", err.message); }
}

function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}kun`);
  if (h) parts.push(`${h}soat`);
  parts.push(`${m}daq`);
  return parts.join(" ");
}

function formatTashkentTime(ts) {
  return new Date(ts).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent", hour12: false });
}

// ───────────────────────────────────────────
// MACRO SYSTEM — bir nechta buyruqni bitta nom bilan saqlash
// Yozib olish:  macro <nom>
//               <buyruq 1>
//               <buyruq 2>
//               end
// Ishga tushirish: run <nom> [param1 param2 ...]
// Qo'llab-quvvatlanadi: delay/kutish qadamlari, {1} {2} ... parametrlar
// ───────────────────────────────────────────
function loadMacros() {
  if (fs.existsSync(MACROS_FILE)) return JSON.parse(fs.readFileSync(MACROS_FILE, "utf8"));
  return {};
}
function saveMacrosFile(data) { fs.writeFileSync(MACROS_FILE, JSON.stringify(data, null, 2)); }
function getUserMacros(userId) {
  const macros = loadMacros();
  return macros[userId] || {};
}
function saveMacro(userId, name, steps) {
  const macros = loadMacros();
  if (!macros[userId]) macros[userId] = {};
  macros[userId][name] = { steps, createdAt: Date.now() };
  saveMacrosFile(macros);
}
function deleteMacro(userId, name) {
  const macros = loadMacros();
  if (!macros[userId] || !macros[userId][name]) return false;
  delete macros[userId][name];
  saveMacrosFile(macros);
  return true;
}

// Makro tanasidagi qatorlarni buyruq/delay qadamlariga ajratadi
function parseMacroSteps(rawLines) {
  const steps = [];
  for (const rawLine of rawLines) {
    const l = rawLine.trim();
    if (!l) continue;
    // delay 2000 / delay 2s / kutish 3 soniya
    const delayM = l.match(/^(?:delay|kutish)\s+(\d+)\s*(ms|s|sec|soniya)?$/i);
    if (delayM) {
      let ms = parseInt(delayM[1], 10);
      if (delayM[2] && /^(s|sec|soniya)$/i.test(delayM[2])) ms *= 1000;
      steps.push({ type: "delay", ms });
      continue;
    }
    steps.push({ type: "command", text: l });
  }
  return steps;
}

// Bitta makroni bosqichma-bosqich ishga tushiradi (buyruq/kechikish qadamlari, {1}{2} parametrlar bilan)
async function runMacro(chatId, selPC, userId, macroName, args) {
  const macros = getUserMacros(userId);
  const macro = macros[macroName];
  if (!macro) return safeSend(chatId, `🐱 "${macroName}" nomli makro topilmadi. /makrolar bilan ro'yxatni ko'r.`);

  await safeSend(chatId, `▶️ Makro "${macroName}" ishga tushdi (${macro.steps.length} qadam)`);
  for (let i = 0; i < macro.steps.length; i++) {
    const step = macro.steps[i];

    if (step.type === "delay") {
      await safeSend(chatId, `⏱️ ${step.ms}ms kutilmoqda...`);
      await new Promise((r) => setTimeout(r, step.ms));
      continue;
    }

    // {1}, {2}, ... parametrlarni "run" buyrug'ida berilgan qiymatlar bilan almashtirish
    let text = step.text;
    (args || []).forEach((a, idx) => { text = text.replace(new RegExp(`\\{${idx + 1}\\}`, "g"), a); });

    try {
      const cmd = await detectCommand(text);
      if (!cmd) { await safeSend(chatId, `⚠️ ${i + 1}-qadam: "${text}" tushunilmadi, o'tkazib yuborildi`); continue; }

      if (cmd.type === "open") {
        await remoteExecute(selPC, { type: "open", cmd: cmd.cmd, name: cmd.name });
        await safeSend(chatId, `✅ ${i + 1}: "${cmd.name}" ochildi`);
      } else if (cmd.type === "close") {
        await remoteExecute(selPC, { type: "close", appName: cmd.appName });
        await safeSend(chatId, `✅ ${i + 1}: "${cmd.appName}" yopildi`);
      } else if (cmd.type === "direct") {
        await safeSend(chatId, cmd.result);
      } else {
        const result = await remoteExecute(selPC, cmd);
        const r = typeof result === "string" ? result.slice(0, 500) : JSON.stringify(result);
        await safeSend(chatId, `✅ ${i + 1}: ${r.trim() || "bajarildi"}`);
      }
    } catch (err) {
      await safeSend(chatId, `❌ ${i + 1}-qadamda xatolik: ${err.message}\n\nMakro to'xtatildi.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await safeSend(chatId, `🐱 Makro "${macroName}" tugadi!`);
}


// ───────────────────────────────────────────
// LONG-TERM MEMORY — /eslabqol /xotira /unut
// ───────────────────────────────────────────
const MEMORY_CATEGORIES = {
  qiziqishlar: "🎯 Qiziqishlar",
  loyihalar: "💻 Loyihalar",
  odatlar: "🔄 Odatlar",
  qurilmalar: "📱 Qurilmalar",
  maqsadlar: "🏆 Maqsadlar",
  voqealar: "⭐ Muhim voqealar",
};

function addLongTermMemory(userId, category, text) {
  const memory = loadMemory();
  const userMemory = getUserMemory(userId);
  const entry = { category, text, createdAt: Date.now() };
  userMemory.longTermMemory.push(entry);
  memory[userId] = userMemory;
  saveMemory(memory);
  return entry;
}

function deleteLongTermMemory(userId, index) {
  const memory = loadMemory();
  const userMemory = getUserMemory(userId);
  if (index < 0 || index >= userMemory.longTermMemory.length) return null;
  const removed = userMemory.longTermMemory.splice(index, 1)[0];
  memory[userId] = userMemory;
  saveMemory(memory);
  return removed;
}

// AI orqali qaysi kategoriyaga tegishli ekanini va qisqa shaklini aniqlaydi
async function categorizeMemoryText(rawText) {
  try {
    const raw = await chatWithAI([
      {
        role: "system",
        content: `Foydalanuvchi Kitty (AI assistant)ga eslab qolinishini so'ragan gapni quyidagi kategoriyalardan biriga ajrat: qiziqishlar, loyihalar, odatlar, qurilmalar, maqsadlar, voqealar.
FAQAT JSON qaytar, hech qanday boshqa matn, izoh yoki markdown belgisi yozma:
{"category": "kategoriya_nomi", "text": "qisqa va aniq shaklda saqlanadigan gap (3-12 so'z)"}`,
      },
      { role: "user", content: rawText },
    ]);
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (!MEMORY_CATEGORIES[parsed.category]) parsed.category = "voqealar";
    if (!parsed.text || typeof parsed.text !== "string") parsed.text = rawText;
    return parsed;
  } catch {
    return { category: "voqealar", text: rawText };
  }
}

// Foydalanuvchi ro'yxatini raqamlangan holda ko'rsatish (raqam = massivdagi indeks+1, /unut shu bilan mos)
function formatLongTermMemoryForDisplay(userMemory) {
  const items = userMemory.longTermMemory || [];
  if (!items.length) return "🐱 Hali hech narsani eslab qolmaganman. /eslabqol bilan biror narsa yoz.";
  let out = "🧠 ESLAB QOLGANLARIM:\n";
  for (const cat of Object.keys(MEMORY_CATEGORIES)) {
    const catItems = items.map((e, i) => ({ ...e, num: i + 1 })).filter((e) => e.category === cat);
    if (catItems.length) {
      out += `\n${MEMORY_CATEGORIES[cat]}\n`;
      for (const e of catItems) out += `${e.num}. ${e.text}\n`;
    }
  }
  return out.trim();
}

// System promptga qo'shiladigan qisqa xotira bloki — faqat kerak bo'lganda tabiiy ishlatish uchun
function formatLongTermMemoryForPrompt(userMemory) {
  const items = userMemory.longTermMemory || [];
  if (!items.length) return "";
  const lines = items.map((e) => `- [${MEMORY_CATEGORIES[e.category] || e.category}] ${e.text}`);
  return `\n\n📝 Foydalanuvchi haqida bilganlaring (faqat mos kelgan joyda, tabiiy holda ishlat — har safar sanab yoki eslatib o'tirma, hammasini bir vaqtda aytib tashlamang):\n${lines.join("\n")}`;
}

// ───────────────────────────────────────────
// O'RGANILGAN GAPIRISH USLUBI — Kitty BARCHA userlar bilan gaplashganda ulardan
// tabiiy so'zlashuv iboralarini, jargonlarini, undov so'zlarini o'rganadi va
// o'z nutqini asta-sekin shunga moslab, yangilab boradi.
// MUHIM: bu Kitty'ga "men odamman" deb da'vo qilishni o'rgatmaydi — faqat
// gaplashish uslubini (so'z boyligi, ohang) boyitadi, shaxsiy/sirli
// ma'lumot HECH QACHON bu yerga yozilmaydi, faqat uslub.
// ───────────────────────────────────────────
const STYLE_FILE = "style_memory.json";
const STYLE_LEARN_EVERY = 15; // har N ta oddiy xabardan keyin bitta AI chaqiruvi bilan o'rganadi
let styleMsgBuffer = [];
let styleUpdateInProgress = false;

function loadStyleMemory() {
  if (fs.existsSync(STYLE_FILE)) {
    try { return JSON.parse(fs.readFileSync(STYLE_FILE, "utf8")); } catch (_) { /* buzilgan fayl — qayta yaratiladi */ }
  }
  return { notes: [], updatedAt: null };
}
function saveStyleMemory(data) { fs.writeFileSync(STYLE_FILE, JSON.stringify(data, null, 2)); }

// Har bir oddiy (buyruq bo'lmagan) foydalanuvchi xabari shu yerga tushadi.
// Buyruq/makro matnlarini o'rganmaymiz — faqat erkin suhbat matni kerak.
function trackStyleMessage(text) {
  if (!text || typeof text !== "string") return;
  const t = text.trim();
  if (t.length < 2 || t.length > 300) return;
  if (/^(macro\s|run\s)/i.test(t)) return;
  styleMsgBuffer.push(t);
  if (styleMsgBuffer.length >= STYLE_LEARN_EVERY && !styleUpdateInProgress) {
    const batch = styleMsgBuffer.splice(0, styleMsgBuffer.length);
    updateLearnedStyle(batch).catch(err => console.error("Uslub o'rganish xatosi:", err.message));
  }
}

// AI orqali to'plangan real xabarlardan yangi tabiiy naqshlarni ajratadi va
// eski ro'yxat bilan birlashtirib, o'zini o'zi yangilab boradi.
async function updateLearnedStyle(batch) {
  styleUpdateInProgress = true;
  try {
    const style = loadStyleMemory();
    const existing = style.notes.length ? style.notes.join("\n") : "(hali hech narsa yo'q)";
    const raw = await chatWithAI([
      {
        role: "system",
        content: `Sen Kitty ismli AI-personaj uchun "gaplashish uslubi" xotirasini yangilaysan. Pastda haqiqiy odamlarning Kitty bilan yozgan xabarlaridan namunalar berilgan. Shulardan Kitty o'ziga tabiiy ravishda qo'llashi mumkin bo'lgan YANGI so'zlashuv ifodalari, gap qurilish shakllari, jargon so'zlar, undovlar, hazil uslublarini ajrat.
Qat'iy qoidalar:
- Faqat namunalarda HAQIQATDA bor bo'lgan tabiiy naqshlarni yoz, hech narsa o'ylab topma.
- Shaxsiy, maxfiy yoki his-tuyg'uga oid mazmunni (ism, parol, manzil, his-tuyg'u tafsilotlari va h.k.) HECH QACHON yozma — faqat GAPIRISH USLUBI (so'zlar, ohang) muhim, mazmun emas.
- Eski ro'yxat bilan birlashtir, dublikatlarni olib tashla, eng foydali va tez-tez uchraydigan ~20-25 ta qisqa band bilan chekla.
- Har band 2-8 so'zdan iborat qisqa ibora/qoida bo'lsin.
- FAQAT JSON qaytar, boshqa hech qanday matn yoki markdown yozma: {"notes": ["band1", "band2", ...]}

Eski ro'yxat:
${existing}`,
      },
      { role: "user", content: batch.join("\n") },
    ]);
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed.notes) && parsed.notes.length) {
      style.notes = parsed.notes.filter(n => typeof n === "string" && n.trim()).slice(0, 25);
      style.updatedAt = Date.now();
      saveStyleMemory(style);
      console.log(`🎙️ Gaplashish uslubi yangilandi (${style.notes.length} band)`);
    }
  } catch (err) {
    console.error("updateLearnedStyle xatosi:", err.message);
  } finally {
    styleUpdateInProgress = false;
  }
}

// System promptga qo'shiladigan uslub bloki
function formatLearnedStyleForPrompt() {
  const style = loadStyleMemory();
  if (!style.notes || !style.notes.length) return "";
  return `\n\n🎙️ Odamlar bilan gaplashib, o'zing tabiiy ravishda o'rganib olgan ifoda va uslub naqshlaring (bular haqida hech qachon gapirma, majburiy ham emas — mos kelganda o'zingdan chiqqandek erkin ishlat):\n${style.notes.map(n => `- ${n}`).join("\n")}`;
}

// ───────────────────────────────────────────
// CONTEXT ENGINE — sessiya davomida vaqtinchalik xotira
// Faylga yozilmaydi (RAM da), bot qayta ishga tushsa yoki
// CONTEXT_TTL_MS dan uzoq jim tursa — tozalanadi.
// ───────────────────────────────────────────
const CONTEXT_TTL_MS = 20 * 60 * 1000; // 20 daqiqa
const sessionContext = {}; // { userId: { lastApp, lastFile, lastFolder, lastWindow, lastCommandType, openedApps: [], updatedAt } }

function getContext(userId) {
  const key = userId.toString();
  const ctx = sessionContext[key];
  if (!ctx || Date.now() - (ctx.updatedAt || 0) > CONTEXT_TTL_MS) {
    sessionContext[key] = { openedApps: [], updatedAt: Date.now() };
  }
  return sessionContext[key];
}

function updateContext(userId, patch) {
  const ctx = getContext(userId);
  Object.assign(ctx, patch, { updatedAt: Date.now() });
  return ctx;
}

function contextTrackOpened(userId, appName) {
  const ctx = getContext(userId);
  ctx.openedApps = ctx.openedApps.filter(a => a !== appName);
  ctx.openedApps.push(appName);
  if (ctx.openedApps.length > 15) ctx.openedApps = ctx.openedApps.slice(-15);
  updateContext(userId, { lastApp: appName, lastCommandType: "open" });
}

function contextTrackClosed(userId, appName) {
  const ctx = getContext(userId);
  ctx.openedApps = ctx.openedApps.filter(a => a !== appName);
  updateContext(userId, { lastCommandType: "close" });
}

// ───────────────────────────────────────────
// PLANNING ENGINE — murakkab, ko'p bosqichli vazifalar
// Masalan: "Downloads papkasini tartibla" — Kitty avval
// reja tuzadi, foydalanuvchiga ko'rsatadi, tasdiqdan keyingina bajaradi.
// ───────────────────────────────────────────
const pendingPlans = {}; // { userId: { steps, selPC, createdAt } }
const PLAN_TTL_MS = 20 * 60 * 1000; // 20 daqiqa kutilmasa reja bekor bo'ladi

function getPendingPlan(userId) {
  const p = pendingPlans[userId];
  if (!p) return null;
  if (Date.now() - p.createdAt > PLAN_TTL_MS) { delete pendingPlans[userId]; return null; }
  return p;
}
function setPendingPlan(userId, plan) { pendingPlans[userId] = { ...plan, createdAt: Date.now() }; }
function clearPendingPlan(userId) { delete pendingPlans[userId]; }

const PLAN_CONFIRM_RE = /^(ha+|xa+|ok(ay)?|tasdiqla\w*|boshla\w*|davom\s?et\w*|yes|yep|mayli|bo['o]?ladi)\b/i;
const PLAN_CANCEL_RE = /^(yo['o]?q|bekor\w*|cancel|stop|to['o]?xta\w*)\b/i;

// Vazifa bir necha bosqichli rejalashtirish talab qiladimi — AI orqali aniqlaydi.
// Oddiy bitta harakatli buyruqlar (ovoz, dastur ochish, skrinshot va h.k.) uchun false qaytaradi.
async function needsPlanning(text) {
  try {
    const raw = await chatWithAI([
      {
        role: "system",
        content: `Foydalanuvchining Windows PC'ga yuborgan xabari bir nechta ketma-ket bosqich talab qiladigan murakkab vazifami (masalan: papkani tartiblash, fayllarni saralash/dublikatlarni tozalash, ko'p bosqichli tashkillashtirish)? Yoki bu bitta oddiy harakatmi (ovozni oshirish, dastur ochish, skrinshot olish, tugma bosish va h.k.)?
FAQAT JSON qaytar, boshqa hech narsa yozma: {"needsPlan": true/false}`,
      },
      { role: "user", content: text },
    ]);
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean).needsPlan === true;
  } catch {
    return false;
  }
}

// AI orqali bosqichma-bosqich ijro rejasini tuzadi.
// Har bir bosqich: { label: foydalanuvchiga ko'rinadigan tavsif, cmd: bajariladigan Windows buyrug'i yoki null }
async function generatePlan(text) {
  const raw = await chatWithAI([
    {
      role: "system",
      content: `Sen Windows PC'da ishlaydigan Kitty ismli AI assistantsan. Foydalanuvchi murakkab vazifa berdi. Uni aniq, ijro etsa bo'ladigan bosqichlarga bo'lib reja tuz (odatda 3-7 bosqich).
Har bir bosqich uchun:
- "label": foydalanuvchiga ko'rsatiladigan qisqa, tushunarli tavsif (masalan "Papkani skanerlayman", "Dublikatlarni topaman")
- "cmd": shu bosqichda ishga tushiriladigan bitta Windows cmd yoki PowerShell buyrug'i. Agar bosqich shunchaki ma'lumot/tasdiq bo'lib, hech narsa bajarilmasa, cmd ni null qoldir.
Fayl amallari uchun PowerShell ishlat (Get-ChildItem, Move-Item, New-Item -ItemType Directory, Get-FileHash dublikatlarni aniqlash uchun va h.k.).
HECH QACHON xavfli/qaytarib bo'lmaydigan buyruqlar berma: format, del /s /q, rmdir /s, Remove-Item -Recurse -Force C:\\ kabi butun disk/tizim papkalarini o'chiruvchi buyruqlar taqiqlanadi. Fayllarni o'chirish kerak bo'lsa, avval Recycle Bin'ga ko'chirish yoki alohida "backup" papkaga joylashni afzal ko'r.
FAQAT JSON qaytar, boshqa hech narsa yozma:
{"steps": [{"label": "...", "cmd": "... yoki null"}, ...]}`,
    },
    { role: "user", content: text },
  ]);
  const clean = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed.steps) || !parsed.steps.length) throw new Error("Reja yaratilmadi");
  return parsed.steps;
}

function formatPlanMessage(steps) {
  let out = "🐱 Reja tuzdim:\n\n";
  steps.forEach((s, i) => { out += `${i + 1}. ${s.label}\n`; });
  out += "\nTasdiqlaysizmi? (ha / yo'q)";
  return out;
}

// Rejani bosqichma-bosqich bajaradi, har bosqichda progress yuboradi
async function executePlan(chatId, selPC, steps) {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    await safeSend(chatId, `⏳ ${i + 1}/${steps.length}: ${s.label}`);
    if (s.cmd) {
      try {
        const result = await remoteExecute(selPC, { type: "run", cmd: s.cmd });
        const r = typeof result === "string" ? result.slice(0, 1000) : JSON.stringify(result);
        await safeSend(chatId, `✅ ${r.trim() || "bajarildi"}`);
      } catch (err) {
        await safeSend(chatId, `❌ Xatolik: ${err.message}\n\nReja to'xtatildi.`);
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  await safeSend(chatId, "🐱 Reja to'liq bajarildi!");
}

// ───────────────────────────────────────────
// ERROR RECOVERY — har qanday xato uchun AI'dan qisqa, amaliy yechim so'raydi
// ───────────────────────────────────────────
async function suggestErrorFix(cmd, errorText) {
  try {
    const raw = await chatWithAI([
      {
        role: "system",
        content: `Sen Windows tizim administratorisan. Foydalanuvchi quyidagi buyruqni ishga tushirdi va xato oldi. Sabab va yechimni JUDA QISQA (1-2 gap, o'zbek tilida) ayt — nima qilish kerakligini aniq yoz. Agar sabab noaniq bo'lsa, eng ehtimoliy sababni taxmin qil.`,
      },
      { role: "user", content: `Buyruq: ${cmd}\nXato: ${errorText.slice(0, 500)}` },
    ]);
    return raw.trim().slice(0, 400);
  } catch (_) {
    return null;
  }
}

// ───────────────────────────────────────────
// AGENT MODE — murakkab muammolarni o'zi diagnostika qilib, tuzatish rejasini taklif qiladi
// Masalan: "minecraft serverimni tuzat" → loglarni o'qiydi → tashxis qo'yadi → reja taklif qiladi → tasdiqdan keyin bajaradi
// ───────────────────────────────────────────
async function diagnosePC(target) {
  // 1) Nishonga oid log fayllarni qidiramiz
  const firstWord = target.toLowerCase().split(/\s+/)[0];
  let candidates = findFilesLocal(firstWord, os.homedir(), 15).filter(f => /\.(log|txt)$/i.test(f));
  if (!candidates.length) candidates = findFilesLocal("log", os.homedir(), 15).filter(f => f.toLowerCase().includes(firstWord));
  const files = [...new Set(candidates)].slice(0, 3);

  let context = "";
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, "utf8");
      context += `\n\n── ${f} (oxirgi qismi) ──\n${content.slice(-3000)}`;
    } catch (_) { /* o'qib bo'lmadi — o'tkazib yuboramiz */ }
  }

  // 2) Log topilmasa — jarayon holatidan foydalanamiz
  if (!context.trim()) {
    try {
      const procs = await runCommand(`tasklist /fi "imagename eq *${firstWord}*"`);
      context = `Hech qanday log fayl topilmadi. Shu nom bilan bog'liq jarayonlar:\n${procs}`;
    } catch (_) {
      context = "Hech qanday log yoki jarayon ma'lumoti topilmadi.";
    }
  }

  // 3) AI orqali tashxis + tuzatish rejasi
  const raw = await chatWithAI([
    {
      role: "system",
      content: `Sen Windows PC'da ishlaydigan tizim administratorisan. Foydalanuvchi "${target}" bilan bog'liq muammoni tuzatishni so'radi. Quyida topilgan log/holat ma'lumoti berilgan. Shu asosda:
1) "diagnosis": muammoning qisqa tashxisi (o'zbek tilida, 2-3 gap)
2) "steps": tuzatish uchun 2-6 bosqichli reja, har biri {"label": qisqa tavsif, "cmd": Windows cmd/PowerShell buyrug'i yoki agar bosqich shunchaki tekshiruv/tavsiya bo'lsa null}
XAVFSIZLIK: hech qachon butun disk/tizim papkalarini o'chiruvchi yoki qaytarib bo'lmaydigan buyruqlar berma (format, del /s /q, rmdir /s, Remove-Item -Recurse -Force C:\\ va h.k.).
Agar ma'lumot yetarli bo'lmasa ham, eng ehtimoliy sabab asosida oqilona reja taklif qil.
FAQAT JSON qaytar, boshqa hech narsa yozma:
{"diagnosis": "...", "steps": [{"label": "...", "cmd": "... yoki null"}]}`,
    },
    { role: "user", content: context.slice(0, 6000) },
  ]);
  const clean = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  if (!parsed.diagnosis || !Array.isArray(parsed.steps) || !parsed.steps.length) throw new Error("Tashxis qo'yib bo'lmadi");
  return parsed;
}


// "uni", "buni", "yana", "yoniga" kabi olmosh/referens so'zlarni
// kontekst asosida aniq buyruqqa aylantiradi. detectCommand()
// dan OLDIN chaqiriladi. "hammasini yop" alohida ishlanadi (pastda).
function resolveReferences(msgText, ctx) {
  let t = msgText;
  const lower = t.toLowerCase().trim();

  // "hammasini yop/och" — bu maxsus buyruq, bu yerda qayta yozilmaydi
  if (/^hammasini\b/i.test(lower)) return t;

  // "yana och" / "yana ochsin" — oxirgi ochilgan dastur qayta ochiladi
  if (/^yana\s+och/i.test(lower) && ctx.lastApp) {
    return `${ctx.lastApp} och`;
  }
  // yolg'iz "yana" — oxirgi buyruq turiga qarab takrorlanadi
  if (/^yana[!.\s]*$/i.test(lower) && ctx.lastApp) {
    return ctx.lastCommandType === "close" ? `${ctx.lastApp} yop` : `${ctx.lastApp} och`;
  }

  // uni/buni/o'sha/oldingisi → oxirgi dastur nomi bilan almashtiriladi
  if (ctx.lastApp && /\b(uni|buni|o['’]sha|oldingisi)\b/i.test(t)) {
    t = t.replace(/\b(uni|buni|o['’]sha|oldingisi)\b/gi, ctx.lastApp);
  }

  // shu fayl / shu papka → oxirgi fayl yoki papka nomi
  if (ctx.lastFile) t = t.replace(/\bshu fayl(ni)?\b/gi, ctx.lastFile);
  if (ctx.lastFolder) t = t.replace(/\bshu papka(ni)?\b/gi, ctx.lastFolder);

  // "X yoniga Y ham och" → "X va Y" (parseTaskList "va" ni tushunadi)
  t = t.replace(/\byoniga\b/gi, "va");

  return t;
}

// ───────────────────────────────────────────
// PROAKTIV GAPLASHISH SOZLAMALARI (settings.json)
// ───────────────────────────────────────────
const SETTINGS_FILE = "settings.json";
const SETTINGS_DEFAULTS = {
  proactiveAvgHours: 4,     // o'rtacha necha soatda o'zidan yozadi (fasttalk o'chiq bo'lsa)
  proactivePercent: 100,    // ehtimollik foizi (0 = butunlay o'chiq)
  fastTalkMode: false,      // true bo'lsa tez-tez (real suhbatdek, 1-2 daqiqada) yozadi
  talkFirstMode: false,     // true bo'lsa, bot har ishga tushganda birinchi bo'lib Kitty yozadi
  talkGroupEnabled: true,   // false bo'lsa, Kitty va Shadow guruhda bir-biriga UMUMAN javob bermaydi
  nameFirstEnabled: false,  // true bo'lsa, Kitty/Shadow bir-biriga faqat ismi bilan chaqirilganda javob beradi
};
function loadSettings() {
  if (fs.existsSync(SETTINGS_FILE)) {
    try { return { ...SETTINGS_DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) }; }
    catch { return { ...SETTINGS_DEFAULTS }; }
  }
  return { ...SETTINGS_DEFAULTS };
}
function saveSettings(data) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); }
function findUserEntry(identifier, data) {
  if (!identifier) return null;
  const key = identifier.replace(/^@/, "").trim();
  if (!key) return null;
  if (/^\d+$/.test(key) && data.users[key]) return [key, data.users[key]];
  const lower = key.toLowerCase();
  return Object.entries(data.users).find(([, u]) =>
    (u.username || "").toLowerCase() === lower || (u.first_name || "").toLowerCase() === lower
  ) || null;
}

// ───────────────────────────────────────────
// ACCESS CONTROL
// ───────────────────────────────────────────
function isAdmin(uid) { return uid.toString() === ADMIN_ID.toString(); }
function getUserData(uid) { return loadUsers().users[uid.toString()] || null; }
function hasAccess(uid, pc) { if (isAdmin(uid)) return true; const u = getUserData(uid); return u ? u.allowedPCs.includes(pc) : false; }
function getSelectedPC(uid) { return getUserData(uid.toString())?.selectedPC || null; }
function isPCOnline(pc) { return !!onlineComputers[pc]; }

// ───────────────────────────────────────────
// REMOTE EXECUTE
// ───────────────────────────────────────────
// Tunnel/tarmoq xatolarini foydalanuvchiga tushunarli qilib beradi va PC'ni offline belgilaydi
function isTunnelDeadError(err) {
  return ["ENOTFOUND", "ECONNREFUSED", "ECONNABORTED", "ETIMEDOUT", "ENETUNREACH", "EAI_AGAIN"].includes(err.code)
    || /timeout/i.test(err.message || "");
}
function handleSlaveNetworkError(pcName, err) {
  if (isTunnelDeadError(err)) {
    delete onlineComputers[pcName];
    console.log(`⚠️ ${pcName} bilan tunnel manzili ishlamayapti (${err.code || err.message}) — offline belgilandi`);
    return new Error(`"${pcName}" bilan aloqa uzildi (tunnel manzili eskirgan bo'lishi mumkin). Kompyuterdagi Kitty odatda 30-60 soniyada o'zini avtomatik qayta ulaydi — biroz kutib, /computers bilan qayta tekshiring.`);
  }
  return err;
}

async function remoteExecute(pcName, command) {
  const pc = onlineComputers[pcName];
  if (!pc) throw new Error(`${pcName} offline!`);
  if (pc.type === "master" || pcName === PC_NAME) return await executeLocally(command);
  try {
    const res = await axios.post(`${pc.url}/execute`, { secret: NETWORK_SECRET, command }, { timeout: 20000 });
    if (!res.data.ok) throw new Error(res.data.error || "Slave xatosi");
    return res.data.result;
  } catch (err) {
    throw handleSlaveNetworkError(pcName, err);
  }
}

async function remoteScreenshot(pcName) {
  const pc = onlineComputers[pcName];
  if (!pc) throw new Error(`${pcName} offline!`);
  if (pc.type === "master" || pcName === PC_NAME) return await takeScreenshot();
  try {
    const res = await axios.post(`${pc.url}/screenshot`, { secret: NETWORK_SECRET }, { responseType: "arraybuffer", timeout: 20000 });
    return Buffer.from(res.data);
  } catch (err) {
    throw handleSlaveNetworkError(pcName, err);
  }
}

async function remoteSendFile(pcName, filename) {
  const pc = onlineComputers[pcName];
  if (!pc) throw new Error(`${pcName} offline!`);
  if (pc.type === "master" || pcName === PC_NAME) {
    const target = resolveExistingPath(filename);
    if (!target) throw new Error(`"${filename}" topilmadi`);
    if (!fs.statSync(target).isFile()) throw new Error(`"${filename}" fayl emas (papka)`);
    return { path: target, name: path.basename(target) };
  }
  try {
    const res = await axios.post(`${pc.url}/sendfile`, { secret: NETWORK_SECRET, filename }, { responseType: "arraybuffer", timeout: 30000 });
    const contentType = res.headers["content-type"] || "";
    if (contentType.includes("application/json")) {
      const errData = JSON.parse(Buffer.from(res.data).toString("utf8"));
      throw new Error(errData.error || `"${filename}" topilmadi`);
    }
    const name = res.headers["x-file-name"] || path.basename(filename);
    return { buffer: Buffer.from(res.data), name };
  } catch (err) {
    throw handleSlaveNetworkError(pcName, err);
  }
}

// ───────────────────────────────────────────
// LOCAL EXECUTOR
// ───────────────────────────────────────────
async function executeLocally(command) {
  const t = command.type;
  if (t === "volume_up") return await volumeUp(command.amount);
  if (t === "volume_down") return await volumeDown(command.amount);
  if (t === "mute") return await volumeMute();
  if (t === "brightness_set") return await setBrightness(command.level);
  if (t === "brightness_up") return await setBrightness(80);
  if (t === "brightness_down") return await setBrightness(20);
  if (t === "brightness_get") return await getBrightness();
  if (t === "battery") return await getBattery();
  if (t === "wifi") return await getWifi();
  if (t === "key") return await pressKeys(command.keys);
  if (t === "mouse_click") return await mouseClick(command.x, command.y);
  if (t === "scroll") return await mouseScroll(command.direction);
  if (t === "active_window") return await getActiveWindow();
  if (t === "minimize") return await minimizeWindow();
  if (t === "maximize") return await maximizeWindow();
  if (t === "close_window") return await closeWindow();
  if (t === "list_windows") return await listWindows();
  if (t === "type_text") return await typeTextClipboard(command.text);
  if (t === "run") return await runCommand(command.cmd);
  if (t === "open") { await runCommand(command.cmd); return `"${command.name}" ochildi`; }
  if (t === "close") return await runCommand(`taskkill /f /im "${command.appName}.exe" 2>&1`);
  if (t === "notify") return await runCommand(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${command.message}', 'Kitty', 'OK', 'Information')"`);
  if (t === "sysinfo") {
    const [batt, cpu, ram, disk] = await Promise.all([
      getBattery(), runCommand("wmic cpu get loadpercentage /value"),
      runCommand("wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value"),
      runCommand("wmic logicaldisk get size,freespace,caption /value"),
    ]);
    return `🔋 ${batt.trim()}\nCPU: ${cpu.trim()}\nRAM: ${ram.trim()}\nDisk: ${disk.trim()}`;
  }
  if (t === "monitor") return await getFullMonitoring();
  if (t === "diagnose") return await diagnosePC(command.target);
  if (t === "image") return await generateImage(command.prompt);
  if (t === "close_multiple") return await closeMultiple(command.apps);

  // ── FILE ASSISTANT ──
  if (t === "file_find") {
    // Agar papka aniq ko'rsatilmagan bo'lsa — butun kompyuterni (barcha disklarni) qidiramiz,
    // faqat C:\Users\123 (uy papkasi) bilan cheklamaymiz
    const results = command.dir
      ? findFilesLocal(command.query, command.dir)
      : findFilesLocalAllDrives(command.query);
    return results.length ? `📁 Topildi (${results.length}):\n${results.join("\n")}` : `❌ "${command.query}" hech qayerda topilmadi`;
  }
  if (t === "file_move") {
    const src = resolveExistingPath(command.src);
    if (!src) return withSuggestions(`❌ Manba topilmadi: "${command.src}"`, suggestSimilarFiles(command.src));
    let dest = resolvePath(command.dest, os.homedir());
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) dest = path.join(dest, path.basename(src));
    if (isDangerousPath(src)) return `⛔ Bu joyni ko'chirib bo'lmaydi (tizim papkasi)`;
    moveFileLocal(src, dest);
    return `✅ Ko'chirildi:\n${src}\n→ ${dest}`;
  }
  if (t === "file_copy") {
    const src = resolveExistingPath(command.src);
    if (!src) return withSuggestions(`❌ Manba topilmadi: "${command.src}"`, suggestSimilarFiles(command.src));
    let dest = resolvePath(command.dest, os.homedir());
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) dest = path.join(dest, path.basename(src));
    copyRecursiveLocal(src, dest);
    return `✅ Nusxa olindi:\n${src}\n→ ${dest}`;
  }
  if (t === "file_rename") {
    const src = resolveExistingPath(command.src);
    if (!src) return withSuggestions(`❌ Topilmadi: "${command.src}"`, suggestSimilarFiles(command.src));
    const dest = path.join(path.dirname(src), command.newName);
    if (fs.existsSync(dest)) return `❌ "${command.newName}" nomli fayl allaqachon bor`;
    fs.renameSync(src, dest);
    return `✅ Nomi o'zgartirildi: "${path.basename(src)}" → "${command.newName}"`;
  }
  if (t === "file_delete") {
    const target = resolveExistingPath(command.target);
    if (!target) return withSuggestions(`❌ Topilmadi: "${command.target}"`, suggestSimilarFiles(command.target));
    if (isDangerousPath(target)) return `⛔ Bu joyni o'chirib bo'lmaydi (tizim papkasi, xavfli)`;
    fs.rmSync(target, { recursive: true, force: true });
    return `🗑️ O'chirildi: "${path.basename(target)}"`;
  }
  if (t === "file_zip") {
    const resolvedFiles = command.files.map(f => resolveExistingPath(f)).filter(Boolean);
    if (!resolvedFiles.length) return `❌ Arxivlash uchun fayl/papka topilmadi`;
    const zipName = command.zipName.endsWith(".zip") ? command.zipName : `${command.zipName}.zip`;
    const zipPath = resolvePath(zipName, os.homedir());
    const pathsArg = resolvedFiles.map(f => `'${f.replace(/'/g, "''")}'`).join(",");
    const out = await runCommand(`powershell -command "Compress-Archive -Path ${pathsArg} -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force"`);
    return out.startsWith("Xato") ? `❌ ${out}` : `📦 Arxivlandi: ${zipPath}`;
  }
  if (t === "file_extract") {
    const zipFile = resolveExistingPath(command.zipFile);
    if (!zipFile) return withSuggestions(`❌ Arxiv topilmadi: "${command.zipFile}"`, suggestSimilarFiles(command.zipFile));
    const dest = resolvePath(command.dest || path.basename(zipFile, ".zip"), os.homedir());
    const out = await runCommand(`powershell -command "Expand-Archive -Path '${zipFile.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force"`);
    return out.startsWith("Xato") ? `❌ ${out}` : `📂 Chiqarildi: ${dest}`;
  }
  if (t === "file_search_content") {
    const dir = resolvePath(command.dir || os.homedir(), os.homedir());
    const q = String(command.query).replace(/'/g, "''");
    const out = await runCommand(`powershell -command "Get-ChildItem -Path '${dir.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Select-String -Pattern '${q}' -ErrorAction SilentlyContinue | Select-Object -First 15 | ForEach-Object { \\"$($_.Path):$($_.LineNumber): $($_.Line.Trim())\\" }"`);
    return out.trim() && !out.startsWith("Xato") ? `🔍 Topildi:\n${out.trim()}` : `❌ "${command.query}" hech qayerda topilmadi`;
  }

  throw new Error(`Noma'lum buyruq: ${t}`);
}

// ───────────────────────────────────────────
// FILE ASSISTANT — helperlar
// ───────────────────────────────────────────
const DANGEROUS_PATHS = ["c:\\windows", "c:\\program files", "c:\\program files (x86)", "c:\\programdata", "c:\\$recycle.bin"];
function isDangerousPath(p) {
  const lower = p.toLowerCase();
  return DANGEROUS_PATHS.some(d => lower === d || lower.startsWith(d + "\\"));
}

function resolvePath(p, baseDir) {
  if (!p) return baseDir;
  const clean = p.trim().replace(/^["']|["']$/g, "");
  if (path.isAbsolute(clean) || /^[a-zA-Z]:[\\/]/.test(clean)) return path.normalize(clean);
  return path.join(baseDir, clean);
}

// Berilgan nom mavjud yo'l bo'lsa o'sha, aks holda uy papkasidan qidiradi va birinchi topilganini qaytaradi
function resolveExistingPath(name) {
  const direct = resolvePath(name, os.homedir());
  if (fs.existsSync(direct)) return direct;
  const found = findFilesLocal(name, os.homedir(), 1);
  return found.length ? found[0] : null;
}

const FILE_SEARCH_SKIP_DIRS = new Set([
  "node_modules", ".git", "appdata", "$recycle.bin", "windows",
  "programdata", "program files", "program files (x86)", ".cache", ".npm",
  "temp", "tmp", "windows.old", "system volume information",
  "$windows.~bt", "$windows.~ws", "msocache", "recovery", "config.msi",
  "$getcurrent", "perflogs", "intel", "nvidia", "amd", "swsetup",
  "windowsapps", "package cache", "driverstore",
]);

function findFilesLocal(query, searchDir, maxResults = 20) {
  const base = searchDir ? resolvePath(searchDir, os.homedir()) : os.homedir();
  return searchInDirs(query, [base], maxResults);
}

// Kompyuterda mavjud barcha disklarni (C:\, D:\ ...) aniqlaydi
function getAvailableDrives() {
  const drives = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const drivePath = `${letter}:\\`;
    try { if (fs.existsSync(drivePath)) drives.push(drivePath); } catch (_) { }
  }
  return drives.length ? drives : [os.homedir()];
}

// Faqat uy papkasi emas, balki butun kompyuter (barcha disklar) bo'ylab qidiradi
function findFilesLocalAllDrives(query, maxResults = 30) {
  return searchInDirs(query, getAvailableDrives(), maxResults);
}

function searchInDirs(query, baseDirs, maxResults = 20) {
  const q = query.toLowerCase();
  const results = [];
  function walk(dir, depth) {
    if (depth > 8 || results.length >= maxResults) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (entry.name.startsWith(".") || FILE_SEARCH_SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      // Symlink/junction'larni o'tkazib yuboramiz — aks holda cheksiz aylanish yoki qotib qolish xavfi bor
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.toLowerCase().includes(q)) results.push(full);
    }
  }
  for (const base of baseDirs) {
    if (results.length >= maxResults) break;
    try { walk(base, 0); } catch (_) { }
  }
  return results;
}

// ── ERROR RECOVERY: fayl topilmasa, nomining bir qismidan o'xshashlarini qidiradi ──
function suggestSimilarFiles(query, maxResults = 5) {
  try {
    const base = path.basename(query, path.extname(query)).trim();
    if (!base) return [];
    const shortQuery = base.length > 4 ? base.slice(0, Math.ceil(base.length * 0.6)) : base;
    if (shortQuery.length < 2) return [];
    return findFilesLocal(shortQuery, os.homedir(), maxResults)
      .filter(f => f.toLowerCase() !== resolvePath(query, os.homedir()).toLowerCase());
  } catch (_) {
    return [];
  }
}
function withSuggestions(baseMsg, suggestions) {
  if (!suggestions || !suggestions.length) return baseMsg;
  return `${baseMsg}\n\n💡 Balki buni demoqchisiz?\n${suggestions.join("\n")}`;
}

function copyRecursiveLocal(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) copyRecursiveLocal(path.join(src, entry), path.join(dest, entry));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function moveFileLocal(src, dest) {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
  } catch (e) {
    if (e.code === "EXDEV") { copyRecursiveLocal(src, dest); fs.rmSync(src, { recursive: true, force: true }); }
    else throw e;
  }
}

// ───────────────────────────────────────────
// RUNNERS
// ───────────────────────────────────────────
function runCommand(command) {
  return new Promise((resolve) => {
    const opts = process.platform === "win32" ? { shell: "cmd.exe", windowsHide: true } : {};
    exec(command, opts, (error, stdout, stderr) =>
      resolve(error ? "Xato: " + error.message : stdout || stderr || "Bajarildi ✅")
    );
  });
}

function pyRun(code) {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `kitty_${Date.now()}.py`);
    fs.writeFileSync(tmpFile, code, "utf8");
    exec(`python "${tmpFile}"`, { timeout: 15000, windowsHide: true }, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch (_) { }
      resolve(error ? "Xato: " + (stderr || error.message).slice(0, 500) : stdout || stderr || "ok");
    });
  });
}

// ───────────────────────────────────────────
// KEYBOARD
// ───────────────────────────────────────────
const VK_MAP = {
  "f1": 0x70, "f2": 0x71, "f3": 0x72, "f4": 0x73, "f5": 0x74, "f6": 0x75,
  "f7": 0x76, "f8": 0x77, "f9": 0x78, "f10": 0x79, "f11": 0x7A, "f12": 0x7B,
  "a": 0x41, "b": 0x42, "c": 0x43, "d": 0x44, "e": 0x45, "f": 0x46, "g": 0x47,
  "h": 0x48, "i": 0x49, "j": 0x4A, "k": 0x4B, "l": 0x4C, "m": 0x4D, "n": 0x4E,
  "o": 0x4F, "p": 0x50, "q": 0x51, "r": 0x52, "s": 0x53, "t": 0x54, "u": 0x55,
  "v": 0x56, "w": 0x57, "x": 0x58, "y": 0x59, "z": 0x5A,
  "0": 0x30, "1": 0x31, "2": 0x32, "3": 0x33, "4": 0x34,
  "5": 0x35, "6": 0x36, "7": 0x37, "8": 0x38, "9": 0x39,
  "enter": 0x0D, "return": 0x0D, "escape": 0x1B, "esc": 0x1B,
  "space": 0x20, "backspace": 0x08, "tab": 0x09,
  "delete": 0x2E, "insert": 0x2D, "home": 0x24, "end": 0x23,
  "pageup": 0x21, "pagedown": 0x22,
  "up": 0x26, "down": 0x28, "left": 0x25, "right": 0x27,
  "capslock": 0x14, "numlock": 0x90, "scrolllock": 0x91,
  "ctrl": 0x11, "control": 0x11, "alt": 0x12, "shift": 0x10,
  "win": 0x5B, "windows": 0x5B,
  "volumeup": 0xAF, "volumedown": 0xAE, "volumemute": 0xAD,
  "medianext": 0xB0, "mediaprev": 0xB1, "playpause": 0xB3, "mediastop": 0xB2,
};
const EXTENDED_VKS = new Set([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x5B]);

async function pressKeys(keys) {
  const vks = keys.map(k => { const vk = VK_MAP[k.toLowerCase().trim()]; return vk ? { vk, ext: EXTENDED_VKS.has(vk) } : null; }).filter(Boolean);
  if (!vks.length) return "Tugma topilmadi";
  const EXT = 0x0001, UP = 0x0002;
  const down = vks.map(({ vk, ext }) => `u.keybd_event(${vk},0,${ext ? EXT : 0},0)`).join("\n");
  const up = [...vks].reverse().map(({ vk, ext }) => `u.keybd_event(${vk},0,${ext ? EXT | UP : UP},0)`).join("\n");
  return pyRun(`import ctypes,time\nu=ctypes.windll.user32\ntime.sleep(0.2)\n${down}\ntime.sleep(0.05)\n${up}\nprint("ok")`);
}

async function typeTextClipboard(textToType) {
  return pyRun(`import ctypes,time,tkinter as tk
root=tk.Tk();root.withdraw()
root.clipboard_clear();root.clipboard_append(${JSON.stringify(textToType)});root.update()
time.sleep(0.3)
u=ctypes.windll.user32
u.keybd_event(0x11,0,0,0);u.keybd_event(0x56,0,0,0)
time.sleep(0.05)
u.keybd_event(0x56,0,0x0002,0);u.keybd_event(0x11,0,0x0002,0)
root.destroy()
print("ok")`);
}

// ───────────────────────────────────────────
// VOLUME / BRIGHTNESS / BATTERY / WIFI
// ───────────────────────────────────────────
async function volumeUp(n = 5) { return pyRun(`import ctypes,time\nu=ctypes.windll.user32\nfor i in range(${n}):\n    u.keybd_event(0xAF,0,0,0);time.sleep(0.02);u.keybd_event(0xAF,0,0x0002,0);time.sleep(0.02)\nprint("ok")`); }
async function volumeDown(n = 5) { return pyRun(`import ctypes,time\nu=ctypes.windll.user32\nfor i in range(${n}):\n    u.keybd_event(0xAE,0,0,0);time.sleep(0.02);u.keybd_event(0xAE,0,0x0002,0);time.sleep(0.02)\nprint("ok")`); }
async function volumeMute() { return pyRun(`import ctypes\nu=ctypes.windll.user32\nu.keybd_event(0xAD,0,0,0);u.keybd_event(0xAD,0,0x0002,0)\nprint("ok")`); }
async function setBrightness(level) { return runCommand(`powershell -command "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${level})"`); }
async function getBrightness() { return runCommand(`powershell -command "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness"`); }
async function getBattery() { return runCommand(`powershell -command "$b=Get-WmiObject Win32_Battery;if($b){'Zaryad: '+$b.EstimatedChargeRemaining+'%'}else{'Batareya yoq (stol komp)'}"`); }
async function getWifi() { return runCommand(`netsh wlan show interfaces`); }

// ───────────────────────────────────────────
// TO'LIQ MONITORING — CPU / GPU / RAM / Disk / Batareya / Harorat / Tarmoq / FPS / Internet
// ───────────────────────────────────────────
function formatBytes(bytes) {
  const n = Number(bytes);
  if (!n || isNaN(n)) return "N/A";
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(n / 1024 ** 2).toFixed(0)} MB`;
}

function safeJSON(str, fallback = null) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

async function getCpuInfo() {
  try {
    const out = await runCommand(`powershell -command "Get-CimInstance Win32_Processor | Select-Object Name,LoadPercentage | ConvertTo-Json"`);
    let data = safeJSON(out.trim());
    if (Array.isArray(data)) data = data[0];
    if (!data) return "🧠 CPU: ma'lumot olinmadi";
    return `🧠 CPU: ${(data.Name || "Noma'lum").trim()}\n   Yuklama: ${data.LoadPercentage}%`;
  } catch (_) {
    return "🧠 CPU: ma'lumot olinmadi";
  }
}

async function getRamInfo() {
  try {
    const out = await runCommand(`powershell -command "$os=Get-CimInstance Win32_OperatingSystem; [PSCustomObject]@{Total=[int64]$os.TotalVisibleMemorySize*1024;Free=[int64]$os.FreePhysicalMemory*1024} | ConvertTo-Json"`);
    const data = safeJSON(out.trim());
    if (!data) return "💾 RAM: ma'lumot olinmadi";
    const total = Number(data.Total), free = Number(data.Free), used = total - free;
    const pct = total ? ((used / total) * 100).toFixed(0) : "?";
    return `💾 RAM: ${formatBytes(used)} / ${formatBytes(total)} ishlatilmoqda (${pct}%)`;
  } catch (_) {
    return "💾 RAM: ma'lumot olinmadi";
  }
}

async function getGpuInfo() {
  try {
    const out = await runCommand(`powershell -command "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json"`);
    let data = safeJSON(out.trim());
    if (Array.isArray(data)) data = data[0];
    if (!data) return "🎮 GPU: ma'lumot olinmadi";
    const vram = data.AdapterRAM ? formatBytes(data.AdapterRAM) : "N/A";
    let usage = "";
    try {
      const nv = await runCommand(`nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits`);
      if (!/xato|not recognized|xato:/i.test(nv)) {
        const [util, memUsed, memTotal] = nv.trim().split(",").map(s => s.trim());
        if (util && memUsed && memTotal) usage = `\n   Yuklama: ${util}% | VRAM: ${memUsed}MB / ${memTotal}MB`;
      }
    } catch (_) { /* nvidia-smi yo'q — jim o'tkazamiz */ }
    return `🎮 GPU: ${(data.Name || "Noma'lum").trim()} (${vram})${usage}`;
  } catch (_) {
    return "🎮 GPU: ma'lumot olinmadi";
  }
}

async function getDiskInfo() {
  try {
    const out = await runCommand(`powershell -command "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json"`);
    let drives = safeJSON(out.trim());
    if (!drives) return "💿 Disk: ma'lumot olinmadi";
    if (!Array.isArray(drives)) drives = [drives];
    return "💿 Disk:\n" + drives.map(d => {
      const size = Number(d.Size), free = Number(d.FreeSpace), used = size - free;
      const pct = size ? ((used / size) * 100).toFixed(0) : "?";
      return `   ${d.DeviceID} ${formatBytes(used)} / ${formatBytes(size)} (${pct}%)`;
    }).join("\n");
  } catch (_) {
    return "💿 Disk: ma'lumot olinmadi";
  }
}

async function getTemperatureInfo() {
  try {
    const out = await runCommand(`powershell -command "try { $t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature | Select-Object -First 1 -ExpandProperty CurrentTemperature; [math]::Round(($t/10)-273.15,1) } catch { 'NA' }"`);
    const val = out.trim();
    if (!val || val === "NA" || isNaN(parseFloat(val))) return "🌡️ Harorat: sensor topilmadi (bu kompyuter/BIOS qo'llamaydi)";
    return `🌡️ Harorat: ${val}°C`;
  } catch (_) {
    return "🌡️ Harorat: ma'lumot olinmadi";
  }
}

async function getNetworkInfo() {
  try {
    const script = `$a1 = Get-NetAdapterStatistics | Where-Object {$_.ReceivedBytes -gt 0} | Select-Object -First 1; Start-Sleep -Milliseconds 1000; $a2 = Get-NetAdapterStatistics | Where-Object {$_.Name -eq $a1.Name}; $down = [math]::Round((($a2.ReceivedBytes - $a1.ReceivedBytes) * 8 / 1MB), 2); $up = [math]::Round((($a2.SentBytes - $a1.SentBytes) * 8 / 1MB), 2); [PSCustomObject]@{Down=$down;Up=$up;Adapter=$a1.Name} | ConvertTo-Json`;
    const out = await runCommand(`powershell -command "${script}"`);
    const data = safeJSON(out.trim());
    if (!data) return "📶 Tarmoq: ma'lumot olinmadi";
    return `📶 Tarmoq (${data.Adapter}): ⬇️ ${data.Down} Mbps | ⬆️ ${data.Up} Mbps (shu payt)`;
  } catch (_) {
    return "📶 Tarmoq: ma'lumot olinmadi";
  }
}

async function getInternetSpeedInfo() {
  try {
    const testUrl = "https://speed.cloudflare.com/__down?bytes=15000000";
    const start = Date.now();
    const res = await axios.get(testUrl, { responseType: "arraybuffer", timeout: 10000 });
    const seconds = Math.max((Date.now() - start) / 1000, 0.1);
    const mbps = ((res.data.length * 8) / seconds / 1_000_000).toFixed(1);
    return `🌐 Internet tezligi: ~${mbps} Mbps (yuklab olish)`;
  } catch (_) {
    return "🌐 Internet tezligi: test muvaffaqiyatsiz (internet yo'q yoki bloklangan)";
  }
}

async function getFpsInfo() {
  return `🎯 FPS: to'g'ridan-to'g'ri o'lchab bo'lmaydi — buning uchun kompyuterda MSI Afterburner yoki RTSS kabi overlay dastur ishga tushirilgan bo'lishi kerak.`;
}

async function getFullMonitoring() {
  const [batt, cpu, gpu, ram, disk, temp, net, inet, fps] = await Promise.all([
    getBattery(), getCpuInfo(), getGpuInfo(), getRamInfo(), getDiskInfo(),
    getTemperatureInfo(), getNetworkInfo(), getInternetSpeedInfo(), getFpsInfo(),
  ]);
  return [
    "📊 TO'LIQ SISTEMA MONITORING",
    "━━━━━━━━━━━━━━━━━━━━━━━",
    cpu, gpu, ram, disk,
    `🔋 Batareya: ${batt.trim()}`,
    temp, net, inet, fps,
  ].join("\n\n");
}

// ───────────────────────────────────────────
// SCREENSHOT
// ───────────────────────────────────────────
async function takeScreenshot() {
  const screenshotDesktop = require("screenshot-desktop");
  const file = path.join(os.tmpdir(), `kitty_ss_${Date.now()}.png`);
  try {
    await screenshotDesktop({ filename: file });
  } catch (err) {
    throw new Error(`Skrinshot xatosi: ${err.message}`);
  }
  if (!fs.existsSync(file)) {
    throw new Error("Skrinshot fayli yaratilmadi (ekran qulflangan bo'lishi mumkin)");
  }
  return file;
}

// ───────────────────────────────────────────
// WINDOW MANAGER
// ───────────────────────────────────────────
async function getActiveWindow() { return pyRun(`import ctypes\nhwnd=ctypes.windll.user32.GetForegroundWindow()\nl=ctypes.windll.user32.GetWindowTextLengthW(hwnd)\nb=ctypes.create_unicode_buffer(l+1)\nctypes.windll.user32.GetWindowTextW(hwnd,b,l+1)\nprint(b.value or "yoq")`); }
async function minimizeWindow() { return pyRun(`import ctypes\nctypes.windll.user32.ShowWindow(ctypes.windll.user32.GetForegroundWindow(),6)\nprint("ok")`); }
async function maximizeWindow() { return pyRun(`import ctypes\nctypes.windll.user32.ShowWindow(ctypes.windll.user32.GetForegroundWindow(),3)\nprint("ok")`); }
async function closeWindow() { return pyRun(`import ctypes\nctypes.windll.user32.PostMessageW(ctypes.windll.user32.GetForegroundWindow(),0x0010,0,0)\nprint("ok")`); }
async function listWindows() {
  return pyRun(`import ctypes
from ctypes import wintypes
titles=[]
def cb(hwnd,_):
    if ctypes.windll.user32.IsWindowVisible(hwnd):
        l=ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        if l>0:
            b=ctypes.create_unicode_buffer(l+1)
            ctypes.windll.user32.GetWindowTextW(hwnd,b,l+1)
            titles.append(b.value)
    return True
PROC=ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)
ctypes.windll.user32.EnumWindows(PROC(cb),0)
print("\\n".join(titles[:25]))`);
}

// ───────────────────────────────────────────
// MOUSE
// ───────────────────────────────────────────
async function mouseClick(x, y) { return pyRun(`import pyautogui\npyautogui.FAILSAFE=False\npyautogui.moveTo(${x},${y},duration=0.2)\npyautogui.click()\nprint("ok")`); }
async function mouseScroll(dir, n = 3) { return pyRun(`import pyautogui\npyautogui.FAILSAFE=False\npyautogui.scroll(${dir === "up" ? n : -n})\nprint("ok")`); }

// "hammasini yop" — shu sessiyada ochilgan dasturlarni birma-bir yopadi.
// Mavjud "close" buyrug'i bilan bir xil taskkill mexanizmidan foydalanadi.
async function closeMultiple(apps) {
  if (!apps || !apps.length) return "Yopiladigan dastur yo'q";
  const results = [];
  for (const appName of apps) {
    try {
      const r = await runCommand(`taskkill /f /im "${appName}.exe" 2>&1`);
      results.push(`${appName}: ${r.trim().slice(0, 60)}`);
    } catch (e) {
      results.push(`${appName}: xato`);
    }
  }
  return results.join("\n");
}

// ───────────────────────────────────────────
// IMAGE GENERATION
// ───────────────────────────────────────────
async function generateImage(prompt) {
  const hfToken = process.env.HUGGINGFACE_API_TOKEN;
  const model = process.env.HUGGINGFACE_MODEL || "stabilityai/stable-diffusion-xl-base-1.0";
  if (hfToken) {
    try {
      const client = new InferenceClient(hfToken);
      const image = await client.textToImage({ provider: "nscale", model, inputs: prompt, parameters: { num_inference_steps: 20, width: 512, height: 512 } });
      return { buffer: Buffer.from(await image.arrayBuffer()), source: "hf" };
    } catch (err) { console.error("HF error:", err.message); }
  }
  const enc = encodeURIComponent(prompt + ", high quality");
  const res = await axios.get(`https://image.pollinations.ai/prompt/${enc}?width=512&height=512&nologo=true`, { responseType: "arraybuffer" });
  return { buffer: Buffer.from(res.data), source: "pollinations" };
}

// ───────────────────────────────────────────
// APPS
// ───────────────────────────────────────────
const KNOWN_APPS = {
  "youtube": `start shell:AppsFolder\\www.youtube.com-54E21B02_pd8mbgmqs65xy!App`,
  "yt": `start shell:AppsFolder\\www.youtube.com-54E21B02_pd8mbgmqs65xy!App`,
  "yt studio": `start shell:AppsFolder\\studio.youtube.com-9FD4E9F4_k9f35b6b2xt7a!App`,
  "ytstudio": `start shell:AppsFolder\\studio.youtube.com-9FD4E9F4_k9f35b6b2xt7a!App`,
  "telegram": "start telegram", "chrome": "start chrome",
  "edge": "start msedge", "spotify": "start spotify",
  "notepad": "start notepad", "calculator": "start calc",
  "calc": "start calc", "instagram": "start https://instagram.com",
  "twitter": "start https://x.com", "x": "start https://x.com",
  "chatgpt": "start https://chatgpt.com", "pinterest": "start https://pinterest.com",
  "settings": "start ms-settings:", "roblox": "start roblox",
  "explorer": "start explorer", "file explorer": "start explorer",
  "downloads": `start explorer "C:\\Users\\user\\Downloads"`,
  "desktop": `start explorer "C:\\Users\\user\\Desktop"`,
  "documents": `start explorer "C:\\Users\\user\\Documents"`,
  "pictures": `start explorer "C:\\Users\\user\\Pictures"`,
  "music": `start explorer "C:\\Users\\user\\Music"`,
  "videos": `start explorer "C:\\Users\\user\\Videos"`,
  "bandicam": `start "" "C:\\Program Files\\Bandicam\\bdcam.exe"`,
  "potplayer": `start "" "C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe"`,
  "vscode": "start code", "vs code": "start code",
  "paint": "start mspaint", "taskmgr": "start taskmgr",
  "task manager": "start taskmgr", "word": "start winword",
  "excel": "start excel", "powerpoint": "start powerpnt",
  "cmd": "start cmd", "powershell": "start powershell",
  "control panel": "start control", "camera": "start microsoft.windows.camera:",
  "store": "start ms-windows-store:", "snipping tool": "start snippingtool",
  "notepad++": `start "" "C:\\Program Files\\Notepad++\\notepad++.exe"`,
};
const UZ_APPS = {
  "yt": "youtube", "yutub": "youtube", "tlgrm": "telegram", "telgrm": "telegram",
  "xrom": "chrome", "ej": "edge", "kalkulyator": "calculator", "hisob": "calculator",
  "sozlamalar": "settings", "yuklamalar": "downloads", "ish stoli": "desktop",
  "rasmlar": "pictures", "musiqalar": "music", "videolar": "videos", "robloks": "roblox",
};

function findApp(name) {
  let lower = name.toLowerCase().trim();
  for (const [uz, en] of Object.entries(UZ_APPS)) if (lower.includes(uz)) { lower = lower.replace(uz, en); break; }
  for (const [key, cmd] of Object.entries(KNOWN_APPS)) if (lower === key) return { cmd, name: key, confidence: "high" };
  for (const [key, cmd] of Object.entries(KNOWN_APPS)) if (lower.includes(key) || key.includes(lower)) return { cmd, name: key, confidence: "high" };
  const scored = Object.keys(KNOWN_APPS).map(key => {
    let m = 0; const ml = Math.min(lower.length, key.length);
    for (let i = 0; i < ml; i++) if (lower[i] === key[i]) m++;
    return { key, score: m / Math.max(lower.length, key.length) };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && best.score > 0.5) return { cmd: KNOWN_APPS[best.key], name: best.key, confidence: "medium" };
  // ── ERROR RECOVERY: aniq topa olmadik — eng yaqin 3 nomzodni taklif sifatida qaytaramiz ──
  const suggestions = scored.slice(0, 3).map(s => s.key);
  return { cmd: `start ${name}`, name, confidence: "low", suggestions };
}

function parseTaskList(msgText) {
  const m = msgText.toLowerCase().match(/^(?:open|och)\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].split(/,|\s+and\s+|\s+va\s+|\s+bilan\s+|\s+hamda\s+/).map(p => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function containsKeywords(str, kw) { return kw.some(k => str.includes(k)); }

function extractPrompt(str, keywords) {
  let p = str;
  for (const k of keywords) p = p.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  return p.replace(/\b(iltimos|please|pls|men|yarat|chiz|chizish|rasm|tasvir|create|make|generate|yordam|bo'lsin|bilan|va|hamda)\b/gi, " ").replace(/\s+/g, " ").trim();
}

// ───────────────────────────────────────────
// INTERNET ASSISTANT
// ───────────────────────────────────────────
// Yangi provider qo'shish juda oson: pastdagi funksiyalardan birini yozing
// (masalan getWeatherFor o'rniga boshqa API), so'ng INTERNET_PROVIDERS
// obyektidagi tegishli "run" ni o'sha funksiyaga ko'rsating. Boshqa hech
// narsani o'zgartirish shart emas — detectCommand va message handler
// avtomatik ishlayveradi.

const DEFAULT_WEATHER_CITY = process.env.DEFAULT_WEATHER_CITY || "Tashkent";

const WEATHER_CODES = {
  0: "Ochiq osmon ☀️", 1: "Deyarli ochiq 🌤️", 2: "Qisman bulutli ⛅", 3: "Bulutli ☁️",
  45: "Tuman 🌫️", 48: "Muzli tuman 🌫️",
  51: "Mayda yomg'ir 🌦️", 53: "Yomg'ir 🌦️", 55: "Kuchli mayda yomg'ir 🌦️",
  61: "Yengil yomg'ir 🌧️", 63: "Yomg'ir 🌧️", 65: "Kuchli yomg'ir 🌧️",
  71: "Yengil qor ❄️", 73: "Qor ❄️", 75: "Kuchli qor ❄️",
  80: "Jala 🌦️", 81: "Kuchli jala 🌧️", 82: "Juda kuchli jala ⛈️",
  95: "Momaqaldiroq ⛈️", 96: "Do'l bilan momaqaldiroq ⛈️", 99: "Kuchli do'l bilan momaqaldiroq ⛈️",
};
function weatherCodeToText(code) { return WEATHER_CODES[code] || `Noma'lum (kod ${code})`; }

// ── 1. QIDIRUV (DuckDuckGo Instant Answer, AI fallback bilan) ──
async function searchWeb(query) {
  try {
    const res = await axios.get("https://api.duckduckgo.com/", {
      params: { q: query, format: "json", no_html: 1, skip_disambig: 1 }, timeout: 10000,
    });
    const d = res.data;
    if (d.AbstractText) return `🔎 "${query}":\n${d.AbstractText}${d.AbstractURL ? `\n🔗 ${d.AbstractURL}` : ""}`;
    if (d.RelatedTopics?.length) {
      const items = d.RelatedTopics.filter(t => t.Text).slice(0, 5).map(t => `• ${t.Text}`);
      if (items.length) return `🔎 "${query}":\n${items.join("\n")}`;
    }
  } catch (e) { console.error("DuckDuckGo xatosi:", e.message); }
  // Aniq javob topilmasa — AI orqali umumiy ma'lumot beramiz
  const aiAnswer = await chatWithAI([
    { role: "system", content: "You are a concise factual search assistant. Answer briefly in Uzbek based on your knowledge. If unsure, say so honestly." },
    { role: "user", content: query },
  ]);
  if (!aiAnswer) throw new Error("Qidiruv ham, AI ham javob bera olmadi");
  return `🔎 "${query}":\n${aiAnswer.trim()}`;
}

// ── 2. OB-HAVO (Open-Meteo, kalitsiz) ──
async function getWeatherFor(cityName) {
  const city = cityName || DEFAULT_WEATHER_CITY;
  const geo = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
    params: { name: city, count: 1, language: "en" }, timeout: 10000,
  });
  if (!geo.data.results?.length) throw new Error(`"${city}" degan joy topilmadi`);
  const { latitude, longitude, name, country } = geo.data.results[0];
  const w = await axios.get("https://api.open-meteo.com/v1/forecast", {
    params: { latitude, longitude, current: "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code", timezone: "auto" },
    timeout: 10000,
  });
  const c = w.data.current;
  return `🌤️ ${name}, ${country}\n🌡️ ${c.temperature_2m}°C\n💧 Namlik: ${c.relative_humidity_2m}%\n💨 Shamol: ${c.wind_speed_10m} km/soat\n${weatherCodeToText(c.weather_code)}`;
}

// ── 3. TARJIMA (Kitty AI orqali — kalit talab qilmaydi, har qanday til) ──
const TRANSLATE_LANG_NAMES = {
  uz: "Uzbek", en: "English", ru: "Russian", tr: "Turkish", es: "Spanish",
  fr: "French", de: "German", ar: "Arabic", zh: "Chinese", ko: "Korean",
  ja: "Japanese", it: "Italian", pt: "Portuguese", hi: "Hindi", kk: "Kazakh",
};
async function translateText(text, targetLang) {
  const target = TRANSLATE_LANG_NAMES[targetLang.toLowerCase()] || targetLang;
  const aiReply = await chatWithAI([
    { role: "system", content: `You are a professional translator. Translate the user's message into ${target}. Reply with ONLY the translation — no explanations, no quotes, no extra text.` },
    { role: "user", content: text },
  ]);
  if (!aiReply) throw new Error("Tarjima AI javob bera olmadi");
  return `🌐 ${target}:\n${aiReply.trim()}`;
}

// ── 4. AI YANGILIKLARI (Hacker News / Algolia, kalitsiz) ──
async function getAINews() {
  const res = await axios.get("https://hn.algolia.com/api/v1/search", {
    params: {
      query: "AI OR LLM OR GPT OR Claude OR OpenAI OR Anthropic",
      tags: "story",
      numericFilters: `created_at_i>${Math.floor(Date.now() / 1000) - 86400 * 3}`,
      hitsPerPage: 6,
    },
    timeout: 10000,
  });
  const hits = res.data.hits || [];
  if (!hits.length) return "📰 So'nggi 3 kunda AI yangiliklari topilmadi";
  return "📰 So'nggi AI yangiliklari:\n\n" + hits
    .map((h, i) => `${i + 1}. ${h.title}\n🔗 ${h.url || `https://news.ycombinator.com/item?id=${h.objectID}`}`)
    .join("\n\n");
}

// ── 5. VALYUTA (open.er-api.com, kalitsiz) ──
async function convertCurrency(amount, from, to) {
  const res = await axios.get(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`, { timeout: 10000 });
  if (res.data.result !== "success") throw new Error("Valyuta kursini olib bo'lmadi");
  const rate = res.data.rates[to.toUpperCase()];
  if (!rate) throw new Error(`"${to.toUpperCase()}" valyutasi topilmadi`);
  const result = (amount * rate).toFixed(2);
  return `💱 ${amount} ${from.toUpperCase()} = ${result} ${to.toUpperCase()}\n(kurs: 1 ${from.toUpperCase()} = ${rate.toFixed(4)} ${to.toUpperCase()})`;
}

// ── 6. VEB-SAHIFA XULOSASI (fetch + AI summary) ──
async function summarizeUrl(url) {
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;
  const res = await axios.get(target, {
    timeout: 12000, headers: { "User-Agent": "Mozilla/5.0 (KittyBot)" }, maxContentLength: 5 * 1024 * 1024,
  });
  let html = String(res.data);
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  let text = html.replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Sahifadan matn topilmadi");
  text = text.slice(0, 6000);
  const aiSummary = await chatWithAI([
    { role: "system", content: "Summarize the following webpage content in Uzbek, in 4-6 concise bullet points, focusing on key facts. No preamble." },
    { role: "user", content: text },
  ]);
  if (!aiSummary) throw new Error("Sahifani AI xulosalab bera olmadi");
  return `📄 Xulosa (${target}):\n\n${aiSummary.trim()}`;
}

// ── PROVIDER REGISTRY — yangi provider shu yerga qo'shiladi ──
const INTERNET_PROVIDERS = {
  internet_search: { provider: "DuckDuckGo + AI", loading: "🔎 Qidirilmoqda...", run: (c) => searchWeb(c.query) },
  internet_weather: { provider: "Open-Meteo", loading: "🌤️ Ob-havo tekshirilmoqda...", run: (c) => getWeatherFor(c.city) },
  internet_translate: { provider: "Kitty AI", loading: null, run: (c) => translateText(c.text, c.lang) },
  internet_news: { provider: "Hacker News", loading: "📰 Yangiliklar olinmoqda...", run: () => getAINews() },
  internet_currency: { provider: "open.er-api.com", loading: null, run: (c) => convertCurrency(c.amount, c.from, c.to) },
  internet_summarize: { provider: "AI Summarizer", loading: "📄 Sahifa o'qilmoqda...", run: (c) => summarizeUrl(c.url) },
};

// ───────────────────────────────────────────
// YOUTUBE SEARCH
// ───────────────────────────────────────────
async function youtubeSearch(msgText) {
  const t = msgText.toLowerCase();
  const typeWords = ["type", "search", "find", "yoz", "qidir", "write"];
  if (!t.includes("youtube") || !typeWords.some(w => t.includes(w))) return null;
  let query = "";
  for (const w of typeWords) {
    const m = msgText.match(new RegExp(w + "\\s+(.+?)(?:\\s+and|\\s+va|$)", "i"));
    if (m) { query = m[1].trim().replace(/\s+/g, "+"); break; }
  }
  if (!query) return null;
  await runCommand(`start shell:AppsFolder\\www.youtube.com-54E21B02_pd8mbgmqs65xy!App`);
  await new Promise(r => setTimeout(r, 2000));
  await runCommand(`start https://www.youtube.com/results?search_query=${query}`);
  return `YouTube: "${query.replace(/\+/g, " ")}" qidirildi`;
}

// ───────────────────────────────────────────
// COMMAND DETECTOR
// ───────────────────────────────────────────
async function detectCommand(msgText) {
  const t = msgText.toLowerCase().trim();

  if (containsKeywords(t, ["screenshot", "ekran ol", "ekran surat", "surat ol", "ekran tasviri"])) return { type: "screenshot" };

  // ── FILE ASSISTANT ──
  const searchInsideM = msgText.match(/^search inside files?\s+(.+)$/i);
  if (searchInsideM) {
    const rest = searchInsideM[1];
    const inSplit = rest.match(/^(.+?)\s+in\s+(.+)$/i);
    return inSplit
      ? { type: "file_search_content", query: inSplit[1].trim(), dir: inSplit[2].trim() }
      : { type: "file_search_content", query: rest.trim(), dir: null };
  }
  const findFileM = msgText.match(/^(?:find|qidir)\s+(.+)$/i);
  if (findFileM) return { type: "file_find", query: findFileM[1].trim() };
  const moveFM = msgText.match(/^move\s+(.+?)\s+to\s+(.+)$/i);
  if (moveFM) return { type: "file_move", src: moveFM[1].trim(), dest: moveFM[2].trim() };
  const copyFM = msgText.match(/^copy\s+(.+?)\s+to\s+(.+)$/i);
  if (copyFM) return { type: "file_copy", src: copyFM[1].trim(), dest: copyFM[2].trim() };
  const renameFM = msgText.match(/^rename\s+(.+?)\s+to\s+(.+)$/i);
  if (renameFM) return { type: "file_rename", src: renameFM[1].trim(), newName: renameFM[2].trim() };
  const deleteFM = msgText.match(/^delete\s+(.+)$/i);
  if (deleteFM) return { type: "file_delete", target: deleteFM[1].trim() };
  const zipFM = msgText.match(/^zip\s+(.+?)(?:\s+as\s+(.+))?$/i);
  if (zipFM) {
    const files = zipFM[1].split(/,|\s+and\s+|\s+va\s+/).map(f => f.trim()).filter(Boolean);
    return { type: "file_zip", files, zipName: (zipFM[2] || "archive").trim() };
  }
  const extractFM = msgText.match(/^extract\s+(.+?)(?:\s+to\s+(.+))?$/i);
  if (extractFM) return { type: "file_extract", zipFile: extractFM[1].trim(), dest: extractFM[2] ? extractFM[2].trim() : null };
  const sendFM = msgText.match(/^send\s+(.+)$/i);
  if (sendFM) return { type: "file_send", filename: sendFM[1].trim() };

  // ── INTERNET ASSISTANT ──
  const weatherM = msgText.match(/^(?:weather|ob-havo|ob havo|obhavo)(?:\s+(.+))?$/i);
  if (weatherM) return { type: "internet_weather", city: weatherM[1] ? weatherM[1].trim() : null };

  const translateM1 = msgText.match(/^translate\s+(.+?)\s+to\s+([a-zA-Z]{2,15})$/i);
  if (translateM1) return { type: "internet_translate", text: translateM1[1].trim(), lang: translateM1[2].trim() };
  const translateM2 = msgText.match(/^tarjima\s+(.+?)\s+([a-zA-Z]{2,15})\s*(?:ga|tiliga)?$/i);
  if (translateM2) return { type: "internet_translate", text: translateM2[1].trim(), lang: translateM2[2].trim() };

  const newsM = t.match(/^(?:ai news|ai yangilik(?:lari)?)$/i);
  if (newsM) return { type: "internet_news" };

  const currencyM = msgText.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]{3})\s+(?:to|ga|=)\s+([a-zA-Z]{3})$/i);
  if (currencyM) return { type: "internet_currency", amount: parseFloat(currencyM[1]), from: currencyM[2], to: currencyM[3] };

  const summarizeM = msgText.match(/^(?:summarize|xulosa qil|xulosa)\s+(\S+)$/i);
  if (summarizeM) return { type: "internet_summarize", url: summarizeM[1].trim() };

  const internetSearchM = msgText.match(/^(?:search|google|internetdan qidir)\s+(.+)$/i);
  if (internetSearchM) return { type: "internet_search", query: internetSearchM[1].trim() };

  const imageWords = ["rasm yarat", "rasm chiz", "draw", "chiz", "chizish", "create image", "make image", "generate image", "tasvir yarat", "tasvir chiz"];
  if (containsKeywords(t, imageWords) && !t.includes("youtube"))
    return { type: "image", prompt: extractPrompt(msgText, imageWords) || msgText };

  if (containsKeywords(t, ["volume up", "ovoz oshir", "balandroq", "ovozni oshir", "kuchayt", "ko'tar"])) {
    const m = t.match(/(\d+)/); return { type: "volume_up", amount: m ? parseInt(m[1]) : 5 };
  }
  if (containsKeywords(t, ["volume down", "ovoz past", "pastroq", "ovoz kamayt", "kamayt", "susayt", "pasayt"])) {
    const m = t.match(/(\d+)/); return { type: "volume_down", amount: m ? parseInt(m[1]) : 5 };
  }
  if (containsKeywords(t, ["mute", "jim qil", "ovoz ochir", "ovozni o'chir", "sukut"])) return { type: "mute" };

  if (containsKeywords(t, ["brightness", "yorqinlik", "ekran yorug", "yorug'lik"])) {
    const m = t.match(/(\d+)/);
    if (m) return { type: "brightness_set", level: Math.min(100, Math.max(0, parseInt(m[1]))) };
    if (containsKeywords(t, ["up", "oshir", "ko'tar", "kuchayt"])) return { type: "brightness_up" };
    if (containsKeywords(t, ["down", "past", "kamayt", "susayt"])) return { type: "brightness_down" };
    return { type: "brightness_get" };
  }

  if (containsKeywords(t, ["battery", "batareya", "zaryad"])) return { type: "battery" };
  if (containsKeywords(t, ["wifi", "tarmoq", "hotspot"]) && !t.startsWith("wifi ")) return { type: "wifi" };

  const comboM = t.match(/^(?:press|bos|click)?\s*((?:ctrl|alt|shift|win)[+].+)$/i);
  if (comboM) return { type: "key", keys: comboM[1].toLowerCase().split("+").map(k => k.trim()), label: comboM[1] };

  const skM = t.match(/^(?:press|bos|click)\s+([a-z0-9]+)$/i) || t.match(/^([a-z0-9]+)\s+(?:bos|bosing|press)$/i);
  if (skM && VK_MAP[skM[1].toLowerCase()]) return { type: "key", keys: [skM[1].toLowerCase()], label: skM[1] };

  if (/^hammasini\s+yop/i.test(t) || t === "close all" || containsKeywords(t, ["barchasini yop"])) return { type: "close_all_context" };

  if (t === "minimize" || containsKeywords(t, ["kichrayt", "kichiklashtir"])) return { type: "minimize" };
  if (t === "maximize" || containsKeywords(t, ["kattalashtir"])) return { type: "maximize" };
  if (t === "close window" || containsKeywords(t, ["oynani yop", "oynani yopish"])) return { type: "close_window" };
  if (t === "list windows" || containsKeywords(t, ["ochiq oynalar", "oynalar ro'yxati"])) return { type: "list_windows" };
  if (t === "active window" || containsKeywords(t, ["faol oyna", "aktiv oyna"])) return { type: "active_window" };

  const clickM = t.match(/^(?:click at|sichqoncha bos)\s+(\d+)[,x]\s*(\d+)$/i);
  if (clickM) return { type: "mouse_click", x: parseInt(clickM[1]), y: parseInt(clickM[2]) };
  const scrollM = t.match(/^(?:scroll|skroll)\s+(up|down|yuqori|pastga)/i);
  if (scrollM) return { type: "scroll", direction: /up|yuqori/.test(scrollM[1]) ? "up" : "down" };

  if (t === "ram" || containsKeywords(t, ["ram holat", "ramni ko'rsat"]))
    return { type: "run", cmd: "wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value", label: "RAM" };
  if (t === "ip" || containsKeywords(t, ["ip adres", "ip manzil"]))
    return { type: "run", cmd: "ipconfig", label: "IP" };
  if ((t === "disk" || containsKeywords(t, ["disk joy", "disk holat"])) && !t.includes("open"))
    return { type: "run", cmd: "wmic logicaldisk get size,freespace,caption /value", label: "Disk" };
  if (containsKeywords(t, ["cpu", "protsessor", "processor"]))
    return { type: "run", cmd: "wmic cpu get name,loadpercentage /value", label: "CPU" };
  if (t === "sysinfo" || containsKeywords(t, ["sistema holat", "tizim holati"])) return { type: "sysinfo" };
  if (containsKeywords(t, ["monitor", "monitoring", "to'liq holat", "toliq holat", "full sysinfo", "pc monitor", "kompyuter holati"])) return { type: "monitor" };

  if (containsKeywords(t, ["shutdown", "o'chir laptop"])) return { type: "run", cmd: "shutdown /s /t 10", label: "Shutdown" };
  if (containsKeywords(t, ["restart", "qayta yoq", "reboot"])) return { type: "run", cmd: "shutdown /r /t 10", label: "Restart" };
  if (containsKeywords(t, ["sleep", "uxla", "uyqu", "uyquga ket"])) return { type: "run", cmd: "rundll32.exe powrprof.dll,SetSuspendState 0,1,0", label: "Sleep" };
  if (containsKeywords(t, ["lock", "qulfla", "ekran qulflash"])) return { type: "run", cmd: "rundll32.exe user32.dll,LockWorkStation", label: "Lock" };

  // ── AGENT MODE: diagnostika + tuzatish ("minecraft serverimni tuzat", "fix chrome", "debug: ...") ──
  const fixM1 = msgText.match(/^(?:tuzat|fix|debug|diagnose|nosozlikni top|muammoni top)[:\s]+(.+)$/i);
  const fixM2 = msgText.match(/^(.{3,60}?)\s*(?:ni\s+)?tuzat(?:ing|sin|amiz)?[!.]?$/i);
  const fixM = fixM1 || fixM2;
  if (fixM) return { type: "diagnose", target: fixM[1].trim() };

  if (t.startsWith("notify") || t.startsWith("xabar") || t.startsWith("eslatma")) {
    const m = msgText.match(/(?:notify|xabar|eslatma)[:\s]+(.+)/i);
    if (m) return { type: "notify", message: m[1].trim() };
  }

  const yt = await youtubeSearch(msgText);
  if (yt) return { type: "direct", result: yt };

  const otM = msgText.match(/^open\s+(.+?)\s+and\s+(?:type|yoz)\s+(.+)$/i);
  if (otM) return { type: "open_and_type", appName: otM[1].trim(), textToType: otM[2].trim() };

  const multi = parseTaskList(msgText);
  if (multi && multi.length > 1) return { type: "multi_open", apps: multi };

  const openM = t.match(/^(?:open|och)\s+(.+?)(?:\s+(\d+)x)?$/i) || t.match(/^(.+?)\s+och(?:sin)?(?:\s+(\d+)x)?$/i);
  if (openM) {
    const app = findApp(openM[1].replace(/\d+x/i, "").trim());
    return { type: "open", cmd: app.cmd, name: app.name, count: parseInt(msgText.match(/(\d+)x/i)?.[1] || "1"), confidence: app.confidence, suggestions: app.suggestions };
  }

  const closeM = t.match(/^(?:close|yop|o'chir)\s+(.+)$/i) || t.match(/^(.+?)\s+(?:yop|yoping|yopilsin|ochir|o'chir)$/i);
  if (closeM) return { type: "close", appName: closeM[1].trim() };

  const typeM = msgText.match(/^(?:type|yoz)\s+(.+)$/i);
  if (typeM) return { type: "type_text", text: typeM[1] };

  const cmdM = msgText.match(/^(?:cmd|buyruq)[:\s]+(.+)$/i);
  if (cmdM) return { type: "run", cmd: cmdM[1].trim(), label: "CMD" };
  const psM = msgText.match(/^(?:ps|powershell)[:\s]+(.+)$/i);
  if (psM) return { type: "run", cmd: `powershell -command "${psM[1].trim()}"`, label: "PowerShell" };

  const allM = msgText.match(/^all[:\s]+(.+)$/i);
  if (allM) return { type: "all_command", command: allM[1].trim() };

  const pcM = msgText.match(/^(PC-[\w-]+)[:\s]+(.+)$/i);
  if (pcM) return { type: "pc_command", pc: pcM[1], command: pcM[2].trim() };

  const schedM = msgText.match(/^(?:schedule|rejalashtir|vaqt)\s+(\d{1,2}:\d{2})\s*(?:am|pm)?\s+(?:(PC-[\w-]+)\s+)?(.+)$/i);
  if (schedM) return { type: "schedule", time: schedM[1], pc: schedM[2] || null, command: schedM[3].trim() };

  const notifyAllM = msgText.match(/^(?:notify all|hammaga xabar|barchaga xabar)[:\s]+(.+)$/i);
  if (notifyAllM) return { type: "notify_all", message: notifyAllM[1].trim() };

  return null;
}

// ───────────────────────────────────────────
// BOT COMMANDS — faqat Master
// ───────────────────────────────────────────
if (IS_MASTER) {

  bot.onText(/\/start/, (msg) => {
    const { id: chatId } = msg.chat;
    const { id: userId, username, first_name } = msg.from;
    const data = loadUsers();
    if (!data.users[userId.toString()]) {
      data.users[userId.toString()] = { username: username || null, first_name: first_name || null, allowedPCs: [], selectedPC: null };
    } else {
      data.users[userId.toString()].username = username || data.users[userId.toString()].username;
      data.users[userId.toString()].first_name = first_name || data.users[userId.toString()].first_name;
    }
    saveUsers(data);
    const welcomeMsg = isAdmin(userId)
      ? `👑 Xush kelibsiz!\n\n/computers — online PClar\n/select ${PC_NAME} — tanlash\n/users — ro'yxat\n/adduser @user|ID ${PC_NAME}\n/removeuser @user|ID ${PC_NAME}\n/help — buyruqlar`
      : `🐱 Kitty ga xush kelibsiz!\n\n/computers — kompyuterlar\n/select — tanlash\n/help — buyruqlar`;
    safeSend(chatId, welcomeMsg);
  });

  bot.onText(/\/computers/, (msg) => {
    const data = loadUsers();
    const pcs = Object.keys(onlineComputers);
    if (!pcs.length) return safeSend(msg.chat.id, "Hozir online kompyuter yo'q");
    let reply = "Online kompyuterlar:\n\n";
    pcs.forEach(pc => {
      const role = onlineComputers[pc].type === "master" ? "👑" : "🖥️";
      const ok = isAdmin(msg.from.id) || data.users[msg.from.id.toString()]?.allowedPCs?.includes(pc);
      reply += ok ? `✅ ${role} ${pc}\n` : `🔒 ${role} ${pc}\n`;
    });
    safeSend(msg.chat.id, reply + "\n/select [PC nomi]");
  });

  bot.onText(/\/restart (.+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const pcName = match[1].trim();
    const pc = onlineComputers[pcName];
    if (!pc) return safeSend(msg.chat.id, `${pcName} online emas`);
    if (pc.type === "master") return safeSend(msg.chat.id, `Masterni shu buyruq bilan qayta ishga tushirib bo'lmaydi`);
    try {
      await axios.post(`${pc.url}/restart`, { secret: NETWORK_SECRET }, { timeout: 5000 });
      safeSend(msg.chat.id, `🔄 ${pcName} qayta ishga tushirilmoqda... (10-20 soniya kuting)`);
    } catch (err) {
      safeSend(msg.chat.id, `❌ Xatolik: ${err.message}`);
    }
  });

  bot.onText(/\/url (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const pcName = match[1].trim();
    const pc = onlineComputers[pcName];
    if (!pc) return safeSend(msg.chat.id, `${pcName} online emas`);
    safeSend(msg.chat.id, `${pcName}:\nurl: ${pc.url || "(yo'q — master)"}\ntype: ${pc.type}\nlastSeen: ${new Date(pc.lastSeen).toLocaleString()}`);
  });

  bot.onText(/\/select (.+)/, (msg, match) => {
    const uid = msg.from.id; const pcName = match[1].trim();
    if (!hasAccess(uid, pcName)) return safeSend(msg.chat.id, `Ruxsat yo'q: ${pcName}`);
    if (!onlineComputers[pcName]) return safeSend(msg.chat.id, `${pcName} offline!`);
    const data = loadUsers();
    if (!data.users[uid.toString()]) data.users[uid.toString()] = { username: msg.from.username || msg.from.first_name, allowedPCs: [], selectedPC: null };
    data.users[uid.toString()].selectedPC = pcName;
    saveUsers(data);
    safeSend(msg.chat.id, `✅ ${pcName} tanlandi!`);
  });

  bot.onText(/\/users/, (msg) => {
    if (!isAdmin(msg.from.id)) return safeSend(msg.chat.id, "Faqat admin!");
    const data = loadUsers(); const users = Object.entries(data.users);
    if (!users.length) return safeSend(msg.chat.id, "User yo'q");
    let reply = "Userlar:\n\n";
    users.forEach(([id, u]) => {
      const label = u.username ? `@${u.username}` : u.first_name || id;
      reply += `${label} (${id})\nTanlangan: ${u.selectedPC || "yo'q"}\nRuxsat: ${u.allowedPCs.join(", ") || "yo'q"}\n\n`;
    });
    safeSend(msg.chat.id, reply);
  });

  bot.onText(/\/adduser (.+) (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return safeSend(msg.chat.id, "Faqat admin!");
    const identifier = match[1].replace("@", "").trim(); const pcName = match[2].trim();
    const data = loadUsers(); const entry = findUserEntry(identifier, data);
    if (!entry) return safeSend(msg.chat.id, `${identifier} topilmadi. Avval /start bossin.`);
    const [, u] = entry;
    if (!u.allowedPCs.includes(pcName)) { u.allowedPCs.push(pcName); saveUsers(data); }
    safeSend(msg.chat.id, `✅ ${u.username ? "@" + u.username : u.first_name || identifier} ga ${pcName} ruxsat berildi`);
  });

  bot.onText(/\/removeuser (.+) (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return safeSend(msg.chat.id, "Faqat admin!");
    const identifier = match[1].replace("@", "").trim(); const pcName = match[2].trim();
    const data = loadUsers(); const entry = findUserEntry(identifier, data);
    if (!entry) return safeSend(msg.chat.id, `${identifier} topilmadi`);
    const [, u] = entry;
    u.allowedPCs = u.allowedPCs.filter(p => p !== pcName); saveUsers(data);
    safeSend(msg.chat.id, `✅ ${u.username ? "@" + u.username : u.first_name || identifier} dan ${pcName} ruxsati olindi`);
  });

  bot.onText(/\/status/, (msg) => {
    const stats = loadStats();
    const mem = process.memoryUsage();
    const activeFeatures = [
      "PC Control", "File Assistant", "Internet Assistant", "Macros",
      "Long-term Memory", "Planning/Agent Mode", "Error Recovery",
      "Full Monitoring", "Proactive Messaging",
    ];
    const topTypes = Object.entries(stats.byType || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([type, count]) => `   ${type}: ${count}`).join("\n") || "   hali yo'q";
    safeSend(msg.chat.id, `📊 KITTY HOLATI

🖥️ Tanlangan: ${getSelectedPC(msg.from.id.toString()) || "yo'q"}
🌐 Online kompyuterlar: ${Object.keys(onlineComputers).join(", ") || "yo'q"}
⏱️ Ishlash vaqti: ${formatUptime(Date.now() - PROCESS_START)}
🧮 Jami bajarilgan buyruqlar: ${stats.totalCommands || 0}
💾 Xotira (bot jarayoni): ${(mem.rss / 1024 / 1024).toFixed(0)} MB

🔧 Faol modullar:
${activeFeatures.map(f => `   ✅ ${f}`).join("\n")}

📈 Eng ko'p ishlatilgan buyruqlar:
${topTypes}

/history — oxirgi buyruqlar
/logs — xatolar va statistika`);
  });

  bot.onText(/\/history(?:\s+(\d+))?/, (msg, match) => {
    const stats = loadStats();
    const n = Math.min(parseInt(match[1] || "15"), 50);
    const entries = (stats.log || []).slice(-n).reverse();
    if (!entries.length) return safeSend(msg.chat.id, "Tarix bo'sh.");
    const text = entries.map(e => `${formatTashkentTime(e.ts)} — [${e.pc || "?"}] ${e.type}`).join("\n");
    safeSend(msg.chat.id, `🕓 OXIRGI ${entries.length} TA BUYRUQ\n\n${text}`);
  });

  bot.onText(/\/logs/, (msg) => {
    const stats = loadStats();
    const errors = (stats.errors || []).slice(-10).reverse();
    const errText = errors.length
      ? errors.map(e => `${formatTashkentTime(e.ts)} — [${e.context}] ${e.message}`).join("\n")
      : "Xatolar yo'q ✅";
    safeSend(msg.chat.id, `📋 SO'NGGI XATOLAR (${errors.length})

${errText}

🧮 Jami buyruqlar: ${stats.totalCommands || 0}
⏱️ Ishlash vaqti: ${formatUptime(Date.now() - PROCESS_START)}`);
  });

  // ── /talkinghours [soat] — o'rtacha necha soatda o'zidan yozishini sozlash ──
  bot.onText(/\/talkinghours(?:\s+([\d.]+))?/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return safeSend(msg.chat.id, "Faqat admin!");
    const s = loadSettings();
    if (s.fastTalkMode) return safeSend(msg.chat.id, "⚡ Fasttalk yoqilgan — bu buyruq ishlamaydi. Avval /fasttalk bilan o'chiring.");
    if (!match[1]) return safeSend(msg.chat.id, `Joriy interval (100% dagi): ${s.proactiveAvgHours} soat\nHozirgi ehtimollik: ${s.proactivePercent}%${s.proactivePercent > 0 ? ` → amaldagi o'rtacha interval: ${(s.proactiveAvgHours * 100 / s.proactivePercent).toFixed(2)} soat` : " (o'chiq)"}\n\nMisol: /talkinghours 2.5 (= 2 soat 30 daqiqa, 100% da)\n/talkinghours 0.5 (= 30 daqiqa, 100% da)`);
    const hours = parseFloat(match[1]);
    if (isNaN(hours) || hours <= 0) return safeSend(msg.chat.id, "❌ Noto'g'ri qiymat. Misol: /talkinghours 4");
    s.proactiveAvgHours = hours;
    saveSettings(s);
    const effectiveMsg = s.proactivePercent > 0 ? `\nHozirgi ehtimollik ${s.proactivePercent}% bo'lgani uchun amaldagi o'rtacha interval: ~${(hours * 100 / s.proactivePercent).toFixed(2)} soat.` : `\n(Ehtimollik hozir 0% — proaktiv xabar o'chiq. /talkingpercent bilan yoqing.)`;
    safeSend(msg.chat.id, `✅ 100% da endi har ${hours} soatda yozadi.${effectiveMsg}`);
  });

  // ── /talkingpercent [foiz] — ehtimollik foizini sozlash ──
  bot.onText(/\/talkingpercent(?:\s+(\d+))?/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return safeSend(msg.chat.id, "Faqat admin!");
    const s = loadSettings();
    if (s.fastTalkMode) return safeSend(msg.chat.id, "⚡ Fasttalk yoqilgan — bu buyruq ishlamaydi. Avval /fasttalk bilan o'chiring.");
    if (!match[1]) return safeSend(msg.chat.id, `Joriy ehtimollik: ${s.proactivePercent}%\nMisol: /talkingpercent 100 (har safar) yoki /talkingpercent 0 (o'chirish)`);
    const percent = parseInt(match[1]);
    if (isNaN(percent) || percent < 0 || percent > 100) return safeSend(msg.chat.id, "❌ 0 dan 100 gacha bo'lishi kerak");
    s.proactivePercent = percent;
    saveSettings(s);
    safeSend(msg.chat.id, percent === 0 ? "🔕 Proaktiv xabarlar butunlay o'chirildi." : `✅ Endi ${percent}% ehtimollik bilan yozadi (o'rtacha interval: ${s.proactiveAvgHours} soat).`);
  });

  // ── /fasttalk — tez-tez, real suhbatdek yozish rejimini yoqish/o'chirish ──
  bot.onText(/\/fasttalk/, (msg) => {
    if (!isAdmin(msg.from.id)) return safeSend(msg.chat.id, "Faqat admin!");
    const s = loadSettings();
    s.fastTalkMode = !s.fastTalkMode;
    saveSettings(s);
    if (s.fastTalkMode) scheduleFastTalk();
    safeSend(msg.chat.id, s.fastTalkMode
      ? `⚡ FASTTALK YOQILDI!\nEndi Kitty xuddi ikki suhbatdoshdek, har 1-2 daqiqada (tasodifiy) o'zidan yozadi.\n/talkinghours va /talkingpercent vaqtincha ishlamaydi.`
      : `⚡ Fasttalk o'chirildi. Oddiy rejimga qaytdi (o'rtacha ${s.proactiveAvgHours} soat, ${s.proactivePercent}%).`);
  });

  // ── /talkfirst — yoqilgan zahoti ishga tushadi + bot har qayta ishga tushganda ham birinchi bo'lib yozadi ──
  bot.onText(/\/talkfirst/, async (msg) => {
    if (!isAdmin(msg.from.id)) return safeSend(msg.chat.id, "Faqat admin!");
    const s = loadSettings();
    s.talkFirstMode = !s.talkFirstMode;
    saveSettings(s);
    if (s.talkFirstMode) {
      await safeSend(msg.chat.id, `🥇 TALKFIRST YOQILDI!\nEndi bot har ishga tushganda (restart/deploy bo'lganda) siz yozishingizdan oldin Kitty birinchi bo'lib xabar yozadi.`);
      await sendProactiveMessage(); // hoziroq ham, keyingi restart'ni kutmasdan ishlaydi
    } else {
      await safeSend(msg.chat.id, `🥇 Talkfirst o'chirildi. Endi bot ishga tushganda avtomatik yozmaydi, oddiy "online" xabari yetarli.`);
    }
  });

  // ── /talkingstatus — joriy sozlamalarni ko'rish ──
  bot.onText(/\/talkingstatus/, (msg) => {
    if (!isAdmin(msg.from.id)) return safeSend(msg.chat.id, "Faqat admin!");
    const s = loadSettings();
    safeSend(msg.chat.id, `📊 Gaplashish sozlamalari:\n\nFasttalk: ${s.fastTalkMode ? "🟢 YOQILGAN (~1-2 daq)" : "🔴 o'chiq"}\nTalkfirst (restartda birinchi yozish): ${s.talkFirstMode ? "🟢 YOQILGAN" : "🔴 o'chiq"}\nTalkgroup (Kitty↔Shadow gaplashishi): ${s.talkGroupEnabled ? "🟢 YOQILGAN" : "🔴 o'chiq"}\nNamefirst (bir-birini ism bilan chaqirish shart): ${s.nameFirstEnabled ? "🟢 YOQILGAN" : "🔴 o'chiq"}\nO'rtacha interval (100% da): ${s.proactiveAvgHours} soat\nEhtimollik: ${s.proactivePercent}%${!s.fastTalkMode && s.proactivePercent > 0 ? `\nAmaldagi o'rtacha interval: ~${(s.proactiveAvgHours * 100 / s.proactivePercent).toFixed(2)} soat` : ""}\n\nBuyruqlar:\n/talkinghours <soat>\n/talkingpercent <foiz>\n/fasttalk — yoqish/o'chirish\n/talkfirst — yoqish/o'chirish\n/talkgroup — yoqish/o'chirish\n/namefirst — yoqish/o'chirish`);
  });

  // ── /talkgroup — Kitty va Shadow guruhda bir-biriga UMUMAN javob bersinmi yoki yo'qmi ──
  bot.onText(/\/talkgroup/, (msg) => {
    if (!isAdmin(msg.from.id)) return safeSend(msg.chat.id, "Faqat admin!");
    const s = loadSettings();
    s.talkGroupEnabled = !s.talkGroupEnabled;
    saveSettings(s);
    safeSend(msg.chat.id, s.talkGroupEnabled
      ? "🗣️ Talkgroup YOQILDI! Kitty va Shadow guruhda endi bir-biriga javob berishlari mumkin."
      : "🔇 Talkgroup o'CHIRILDI. Kitty va Shadow guruhda endi bir-biriga UMUMAN gapirmaydi (odamlarga oddiy javob berishda davom etadi).");
  });

  // ── /namefirst — yoqilsa, Kitty/Shadow bir-biriga faqat ismini aytib chaqirilganda javob beradi ──
  bot.onText(/\/namefirst/, (msg) => {
    if (!isAdmin(msg.from.id)) return safeSend(msg.chat.id, "Faqat admin!");
    const s = loadSettings();
    s.nameFirstEnabled = !s.nameFirstEnabled;
    saveSettings(s);
    safeSend(msg.chat.id, s.nameFirstEnabled
      ? `📛 Namefirst YOQILDI! Kitty va Shadow endi bir-biriga faqat ismini aytib chaqirganda javob beradi (masalan "kitty, ..." yoki "shadow, ...", yoki reply qilinsa).`
      : "🆓 Namefirst o'chirildi. Kitty va Shadow endi trigger so'zsiz, xohlagancha erkin gaplashishlari mumkin.");
  });

  bot.onText(/\/help/, (msg) => {
    safeSend(msg.chat.id, `🐱 KITTY — BARCHA BUYRUQLAR

ℹ️ Barcha buyruqlar "/" bilan boshlanadi. "/" siz yozgan xabar — oddiy suhbat hisoblanadi.

━━━━━━━━━━━━━━━━━━━━━━━━━
📸 EKRAN
━━━━━━━━━━━━━━━━━━━━━━━━━
/screenshot — ekran rasmi

━━━━━━━━━━━━━━━━━━━━━━━━━
📱 DASTURLAR
━━━━━━━━━━━━━━━━━━━━━━━━━
/open chrome — ochish
/open chrome, spotify and youtube — bir vaqtda
/chrome och 2x — 2 marta ochish
/close chrome — yopish

━━━━━━━━━━━━━━━━━━━━━━━━━
🖼️ RASM YARATISH
━━━━━━━━━━━━━━━━━━━━━━━━━
/rasm yarat mushuk / draw a car

━━━━━━━━━━━━━━━━━━━━━━━━━
🔊 OVOZ VA EKRAN
━━━━━━━━━━━━━━━━━━━━━━━━━
/volume up 10 / /volume down 10 / /mute
/brightness 70 / /brightness up / /brightness down

━━━━━━━━━━━━━━━━━━━━━━━━━
⌨️ KLAVIATURA
━━━━━━━━━━━━━━━━━━━━━━━━━
/press f5 / /ctrl+c / /alt+f4 / /win+d
/ctrl+shift+esc / /type Salom dunyo

━━━━━━━━━━━━━━━━━━━━━━━━━
🖱️ SICHQONCHA
━━━━━━━━━━━━━━━━━━━━━━━━━
/click at 500 300 / /scroll up / /scroll down

━━━━━━━━━━━━━━━━━━━━━━━━━
🪟 OYNALAR
━━━━━━━━━━━━━━━━━━━━━━━━━
/minimize / /maximize / /active window
/list windows / /close window

━━━━━━━━━━━━━━━━━━━━━━━━━
💻 SISTEMA
━━━━━━━━━━━━━━━━━━━━━━━━━
/ram / /cpu / /disk / /ip / /battery / /wifi / /sysinfo
/shutdown / /restart / /sleep / /lock

━━━━━━━━━━━━━━━━━━━━━━━━━
📊 TO'LIQ MONITORING
━━━━━━━━━━━━━━━━━━━━━━━━━
/monitor / /monitoring / /to'liq holat
CPU, GPU, RAM, Disk, Batareya, Harorat,
Tarmoq, Internet tezligi, FPS — barchasi birga

━━━━━━━━━━━━━━━━━━━━━━━━━
📁 FAYL YORDAMCHISI
━━━━━━━━━━━━━━━━━━━━━━━━━
/find report.pdf — qidirish (butun kompyuter bo'ylab)
/move report.pdf to Documents — ko'chirish
/copy report.pdf to Desktop — nusxa olish
/rename old.txt to new.txt — nomini o'zgartirish
/delete report.pdf — o'chirish
/zip Desktop as backup — arxivlash
/extract backup.zip to Desktop — chiqarish
/search inside files invoice — matn qidirish
/search inside files invoice in Documents
/send report.pdf — faylni Telegram'ga yuborish

━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 INTERNET YORDAMCHISI
━━━━━━━━━━━━━━━━━━━━━━━━━
/search elon musk yangiliklari — internetdan qidirish
/weather Tashkent / /ob-havo — ob-havo
/translate salom to english — tarjima
/tarjima salom qandaysiz en — tarjima (uz)
/ai news — so'nggi AI yangiliklari
/100 usd to uzs — valyuta konvertatsiyasi
/summarize https://example.com — sahifa xulosasi
(PC tanlanmagan yoki offline bo'lsa ham ishlaydi)

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 AGENT MODE
━━━━━━━━━━━━━━━━━━━━━━━━━
/minecraft serverimni tuzat
/fix chrome / /debug: <muammo>
Kitty loglarni o'qiydi, tashxis qo'yadi,
tuzatish rejasini taklif qiladi — siz
tasdiqlaganingizdan keyin bajaradi.

━━━━━━━━━━━━━━━━━━━━━━━━━
🛟 ERROR RECOVERY
━━━━━━━━━━━━━━━━━━━━━━━━━
Dastur/fayl topilmasa yoki buyruq xato
bersa, Kitty avtomatik o'xshash nomlarni
yoki AI yechimini taklif qiladi.

━━━━━━━━━━━━━━━━━━━━━━━━━
📈 STATISTIKA
━━━━━━━━━━━━━━━━━━━━━━━━━
/status — umumiy holat, xotira, faol modullar
/history [son] — oxirgi buyruqlar tarixi
/logs — so'nggi xatolar

━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 QATOR BUYRUQLAR
━━━━━━━━━━━━━━━━━━━━━━━━━
/cmd: dir C:\\ / /ps: Get-Process

━━━━━━━━━━━━━━━━━━━━━━━━━
👑 ADMIN BUYRUQLARI
━━━━━━━━━━━━━━━━━━━━━━━━━
/all: screenshot — barcha PC ekranlari
/all: shutdown — barcha PC larni o'chirish
/PC-Maktab-1: open chrome — bitta PC ga

/hammaga xabar Dars boshlandi!
/schedule 14:00 open chrome
/schedule 14:00 PC-Maktab-1 shutdown

/computers /select /users /adduser /removeuser

━━━━━━━━━━━━━━━━━━━━━━━━━
💬 O'ZIDAN-O'ZI GAPLASHISH
━━━━━━━━━━━━━━━━━━━━━━━━━
/talkinghours 4 — o'rtacha necha soatda o'zidan yozsin
/talkingpercent 100 — ehtimollik foizi (0 = o'chiq)
/fasttalk — real suhbatdek tez-tez yozish rejimi
/talkfirst — bot ishga tushganda Kitty birinchi yozadi
/talkgroup — Kitty va Shadow guruhda bir-biriga gapirishi yoqish/o'chirish
/namefirst — Kitty/Shadow bir-birini faqat ism bilan chaqirganda javob berishi yoqish/o'chirish
/talkingstatus — joriy sozlamalar

━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 UZOQ MUDDATLI XOTIRA
━━━━━━━━━━━━━━━━━━━━━━━━━
/eslabqol <matn> — Kitty muhim narsani eslab qoladi
/xotira — nima eslab qolganini ko'rish
/unut <raqam> — bitta xotirani o'chirish

━━━━━━━━━━━━━━━━━━━━━━━━━
📋 REJALASHTIRISH
━━━━━━━━━━━━━━━━━━━━━━━━━
"/" bilan murakkab vazifa yozing (masalan: "/Downloads papkasini tartibla") — Kitty avval bosqichma-bosqich reja tuzadi va tasdiq so'raydi. "ha" desangiz bajaradi, "yo'q" desangiz bekor qiladi.

━━━━━━━━━━━━━━━━━━━━━━━━━
🧩 MAKROLAR
━━━━━━━━━━━━━━━━━━━━━━━━━
Bir nechta buyruqni bitta nom bilan saqlash:

/macro coding
open chrome
open vscode
open terminal
end

Ishga tushirish: /run coding
/makrolar — saqlangan makrolar ro'yxati
/makroochir <nom> — makroni o'chirish
Qadam ichida "delay 2000" yoki "kutish 3 soniya" — kutish qo'shadi
Parametr: makro qatorida {1} {2} yozsangiz, "/run nom qiymat1 qiymat2" bilan almashadi

━━━━━━━━━━━━━━━━━━━━━━━━━
💬 AI SUHBAT
━━━━━━━━━━━━━━━━━━━━━━━━━
"/" siz oddiy xat yozing — Kitty javob beradi`);
  });

  // ───────────────────────────────────────────
  // LONG-TERM MEMORY COMMANDS
  // ───────────────────────────────────────────
  bot.onText(/\/eslabqol(?:\s+([\s\S]+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const input = match[1]?.trim();
    if (!input) {
      return safeSend(chatId, "🐱 Nimani eslab qolishimni istaysan? Masalan:\n/eslabqol men Minecraftda katta fermalar qurishni yaxshi ko'raman");
    }
    try {
      // Qo'lda kategoriya berilgan bo'lsa: /eslabqol loyihalar: matn
      const catMatch = input.match(/^(qiziqishlar|loyihalar|odatlar|qurilmalar|maqsadlar|voqealar)\s*:\s*(.+)$/i);
      let category, text;
      if (catMatch) {
        category = catMatch[1].toLowerCase();
        text = catMatch[2].trim();
      } else {
        const result = await categorizeMemoryText(input);
        category = result.category;
        text = result.text;
      }
      addLongTermMemory(userId, category, text);
      safeSend(chatId, `🐱 Eslab qoldim [${MEMORY_CATEGORIES[category]}]: ${text}`);
    } catch (err) {
      safeSend(chatId, "🐱 Eslab qololmadim, xatolik chiqdi~");
    }
  });

  bot.onText(/\/xotira/, (msg) => {
    const userMemory = getUserMemory(msg.from.id.toString());
    safeSend(msg.chat.id, formatLongTermMemoryForDisplay(userMemory));
  });

  bot.onText(/\/unut(?:\s+(\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const num = match[1];
    if (!num) return safeSend(chatId, "🐱 Qaysi raqamni unutay? Avval /xotira bilan ro'yxatni ko'r, keyin /unut <raqam> deb yoz.");
    const idx = parseInt(num, 10) - 1;
    const removed = deleteLongTermMemory(userId, idx);
    if (!removed) return safeSend(chatId, "🐱 Bunday raqamli xotira yo'q.");
    safeSend(chatId, `🐱 Unutdim: "${removed.text}"`);
  });

  // ───────────────────────────────────────────
  // MACRO SYSTEM COMMANDS
  // ───────────────────────────────────────────
  bot.onText(/\/makrolar/, (msg) => {
    const macros = getUserMacros(msg.from.id.toString());
    const names = Object.keys(macros);
    if (!names.length) return safeSend(msg.chat.id, "🐱 Hali makro yo'q. Yozib olish uchun:\n\nmacro <nom>\nbuyruq 1\nbuyruq 2\nend");
    const lines = names.map((n) => `• ${n} (${macros[n].steps.length} qadam)`);
    safeSend(msg.chat.id, `🧩 SAQLANGAN MAKROLAR:\n${lines.join("\n")}\n\nIshga tushirish: run <nom>`);
  });

  bot.onText(/\/makroochir(?:\s+(\S+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const name = match[1]?.toLowerCase();
    if (!name) return safeSend(chatId, "🐱 Qaysi makroni o'chiray? /makroochir <nom>");
    const ok = deleteMacro(msg.from.id.toString(), name);
    if (!ok) return safeSend(chatId, `🐱 "${name}" nomli makro topilmadi.`);
    safeSend(chatId, `🗑️ Makro "${name}" o'chirildi.`);
  });

  // ───────────────────────────────────────────
  // MAIN MESSAGE HANDLER
  // ───────────────────────────────────────────
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    let msgText = msg.text;
    const isGroupChat = msg.chat.type === "group" || msg.chat.type === "supergroup";

    // Fayl upload
    if (msg.document || msg.photo || msg.video || msg.audio) {
      const fileId = msg.document?.file_id || msg.photo?.[msg.photo.length - 1]?.file_id || msg.video?.file_id || msg.audio?.file_id;
      const fileName = msg.document?.file_name || msg.video?.file_name || msg.audio?.file_name || `file_${Date.now()}`;
      const selPCup = isAdmin(userId) ? (getSelectedPC(userId.toString()) || DEFAULT_PC || PC_NAME) : getSelectedPC(userId.toString());
      const savePath = `C:\\Users\\123\\Desktop\\${fileName}`;
      await safeSend(chatId, `📥 Yuklanmoqda: ${fileName}...`);
      try {
        const fileLink = await bot.getFileLink(fileId);
        const response = await axios.get(fileLink, { responseType: "arraybuffer" });
        fs.writeFileSync(savePath, Buffer.from(response.data));
        return safeSend(chatId, `✅ Saqlandi: ${savePath}`);
      } catch (e) {
        return safeSend(chatId, `❌ Xatolik: ${e.message}`);
      }
    }

    // Master-darajadagi buyruqlar (bot.onText orqali) — bularni bu yerda qayta ishlamaymiz,
    // ular allaqachon alohida ishlanadi. Har biri onText'dagi patternga mos aniq tekshiriladi
    // (masalan "/restart" argumentsiz — PC'ni reboot qilish buyrug'i, lekin "/restart PC-nomi" — admin buyrug'i)
    const RESERVED_BOT_COMMAND_PATTERNS = [
      /^\/start\b/i, /^\/computers\b/i, /^\/restart\s+\S+/i, /^\/url\s+\S+/i, /^\/select\s+\S+/i,
      /^\/users\b/i, /^\/adduser\s+\S+\s+\S+/i, /^\/removeuser\s+\S+\s+\S+/i, /^\/status\b/i,
      /^\/history(?:\s+\d+)?\b/i, /^\/logs\b/i, /^\/talkinghours(?:\s+[\d.]+)?\b/i,
      /^\/talkingpercent(?:\s+\d+)?\b/i, /^\/fasttalk\b/i, /^\/talkfirst\b/i, /^\/talkingstatus\b/i,
      /^\/talkgroup\b/i, /^\/namefirst\b/i,
      /^\/help\b/i, /^\/eslabqol(?:\s+[\s\S]+)?$/i, /^\/xotira\b/i, /^\/unut(?:\s+\d+)?\b/i,
      /^\/makrolar\b/i, /^\/makroochir(?:\s+\S+)?\b/i,
    ];

    if (!msgText) return;

    // FIX: SPAM/DEDUP FILTRI — bitta belgi ko'p marta takrorlangan yoki
    // haddan tashqari uzun xabarlar (masalan do'stlar "aaaaaaa..." deb
    // to'ldirib tashlaganda) AI'ga umuman yuborilmaydi, botni chalg'itmaydi.
    if (isSpammyMessage(msgText)) return;

    const isFromBot = !!msg.from.is_bot;
    const isFromShadow = isFromBot && SHADOW_USERNAME && msg.from.username?.toLowerCase() === SHADOW_USERNAME;

    // ── /talkgroup: Kitty va Shadow bir-biriga guruhda umuman gapirishi yoqilganmi ──
    const talkSettings = loadSettings();
    if (isFromShadow && !talkSettings.talkGroupEnabled) return; // o'chirilgan bo'lsa — Shadow'dan kelgan xabarga butunlay e'tibor bermaymiz

    // ── LOOP-GUARD: Kitty va Shadow cheksiz bir-biriga javob bermasin ──
    const loopKey = chatId.toString();
    if (isFromShadow) {
      botLoopGuard[loopKey] = (botLoopGuard[loopKey] || 0) + 1;
      if (botLoopGuard[loopKey] > 4) return; // 4 martadan keyin jim — odam qayta yozguncha
    } else if (!isFromBot) {
      botLoopGuard[loopKey] = 0; // haqiqiy odam yozsa hisoblagich qayta tiklanadi
    }

    // FIX: GURUH TRIGGER — guruh chatida Kitty faqat "kitty" so'zi bilan
    // chaqirilganda (yoki o'zining xabariga reply qilinganda) javob beradi.
    // Shu tufayli guruhdagi har bir xabar (boshqa odamlarning suhbati ham)
    // botni ishga tushirib, kontekstni aralashtirib yubormaydi.
    // /namefirst YOQILGAN bo'lsa — Shadow ham xuddi odamdek, faqat "kitty" deb chaqirganda javob oladi.
    // /namefirst O'CHIQ bo'lsa (standart) — Shadow bilan trigger so'zsiz ham erkin banter davom etadi.
    if (isGroupChat && !msgText.startsWith("/") && (!isFromShadow || talkSettings.nameFirstEnabled)) {
      const isReplyToKitty = !!(BOT_USER_ID && msg.reply_to_message?.from?.id === BOT_USER_ID);
      const triggerMatch = msgText.match(/^kitty[\s,:!.\-]*([\s\S]*)$/i);
      if (!triggerMatch && !isReplyToKitty) return; // "kitty" bilan boshlanmagan va reply ham emas — e'tibor bermaymiz
      if (triggerMatch) msgText = triggerMatch[1].trim() || msgText; // "kitty <savol>" → faqat <savol> qismini ishlatamiz
    }

    if (msgText.startsWith("/") && RESERVED_BOT_COMMAND_PATTERNS.some(re => re.test(msgText))) return;

    // Endi BARCHA buyruqlar (find, open, move, run, cmd va h.k.) "/" bilan boshlanishi shart.
    // "/" bo'lmasa — bu oddiy suhbat, hech qanday buyruq aniqlanmaydi (tezroq va xavfsizroq)
    const isCommandMsg = msgText.startsWith("/");
    const cmdText = isCommandMsg ? msgText.slice(1).trim() : msgText;

    if (!getUserData(userId.toString()) && !isAdmin(userId))
      return safeSend(chatId, "Ruxsat yo'q! /start bosing.");

    // Har bir foydalanuvchidan kelayotgan tabiiy xabar — gaplashish uslubini o'rganish uchun
    trackStyleMessage(msgText);

    // ── INTERNET ASSISTANT: PC tanlangan/online bo'lishidan qat'iy nazar ishlaydi ──
    const internetCmd = isCommandMsg ? await detectCommand(cmdText) : null;
    if (internetCmd && INTERNET_PROVIDERS[internetCmd.type]) {
      const provider = INTERNET_PROVIDERS[internetCmd.type];
      try {
        if (provider.loading) await safeSend(chatId, provider.loading);
        const reply = await provider.run(internetCmd);
        return safeSend(chatId, reply);
      } catch (err) {
        return safeSend(chatId, `❌ Internet Assistant xatosi: ${err.message}`);
      }
    }

    const selPC = isAdmin(userId)
      ? (getSelectedPC(userId.toString()) || DEFAULT_PC || PC_NAME)
      : getSelectedPC(userId.toString());

    if (!selPC) {
      // PC tanlanmagan — faqat AI bilan gaplashadi
      const memory = loadMemory();
      // Uzoq muddatli xotira (qiziqishlar, faktlar) — doim HAQIQIY odamga bog'liq
      const identityMemory = getUserMemory(userId.toString());
      // Suhbat tarixi — chat/guruhga xos (guruh va private aralashib ketmasligi uchun)
      const convKey = getConversationKey(chatId, userId, isGroupChat);
      const convMemory = getUserMemory(convKey);
      const history = convMemory.history.slice(-10);
      try {
        const aiReply = await chatWithAI([
          {
            role: "system", content: buildKittySystemPrompt() + formatLongTermMemoryForPrompt(identityMemory) + formatLearnedStyleForPrompt()
          },
          ...history,
          { role: "user", content: isFromShadow ? `[Shadow said]: ${msgText}` : msgText }
        ]);
        convMemory.history.push({ role: "user", content: msgText });
        convMemory.history.push({ role: "assistant", content: aiReply });
        if (convMemory.history.length > 50) convMemory.history = convMemory.history.slice(-50);
        memory[convKey] = convMemory;
        saveMemory(memory);
        await safeSend(chatId, "🐱 " + aiReply);
      } catch (err) {
        console.error("AI error:", err.message);
        if (!isFromShadow) await safeSend(chatId, "AI ishlamayapti, keyinroq urinib ko'r~");
      }
      return;
    }

    // FIX: offline tekshiruvi ENDI shu yerda bloklamaydi — PC offline bo'lsa ham
    // oddiy suhbat (chat) ishlashda davom etadi. Offline tekshiruvi faqat PC'ni
    // haqiqatan ishlatadigan buyruqlar (macro/run/command) uchun keyinroq qilinadi.
    if (!hasAccess(userId, selPC)) return safeSend(chatId, "Ruxsat yo'q!");

    console.log(`[${selPC}] ${msg.from.username}: ${msgText}`);

    // ── MACRO SYSTEM: makro yozib olish — "/macro <nom>\n...\nend" ──
    const macroDefM = isCommandMsg ? cmdText.match(/^macro\s+(\S+)\s*\n([\s\S]+?)\nend\s*$/i) : null;
    if (macroDefM) {
      const macroName = macroDefM[1].toLowerCase();
      const steps = parseMacroSteps(macroDefM[2].split("\n"));
      if (!steps.length) return safeSend(chatId, "🐱 Makroda hech qanday buyruq topilmadi.");
      saveMacro(userId.toString(), macroName, steps);
      return safeSend(chatId, `🐱 Makro "${macroName}" saqlandi (${steps.length} qadam). Ishga tushirish: /run ${macroName}`);
    }

    // ── MACRO SYSTEM: makroni ishga tushirish — "/run <nom> [param1 param2 ...]" ──
    const macroRunM = isCommandMsg ? cmdText.match(/^run\s+(\S+)(?:\s+(.+))?$/i) : null;
    if (macroRunM) {
      if (!isPCOnline(selPC)) return safeSend(chatId, `❌ ${selPC} offline`);
      const macroName = macroRunM[1].toLowerCase();
      const args = macroRunM[2] ? macroRunM[2].trim().split(/\s+/) : [];
      runMacro(chatId, selPC, userId.toString(), macroName, args);
      return;
    }

    const memory = loadMemory();
    // Uzoq muddatli xotira (qiziqishlar, faktlar) — doim HAQIQIY odamga bog'liq
    const identityMemory = getUserMemory(userId.toString());
    // Suhbat tarixi — chat/guruhga xos (guruh va private aralashib ketmasligi uchun)
    const convKey = getConversationKey(chatId, userId, isGroupChat);
    const convMemory = getUserMemory(convKey);
    const history = convMemory.history.slice(-10);

    // ── PLANNING ENGINE: avval kutilayotgan reja bormi tekshiramiz ──
    const existingPlan = getPendingPlan(userId.toString());
    if (existingPlan) {
      const lower = msgText.toLowerCase().trim();
      if (PLAN_CONFIRM_RE.test(lower)) {
        if (!isPCOnline(existingPlan.selPC)) {
          clearPendingPlan(userId.toString());
          return safeSend(chatId, `❌ ${existingPlan.selPC} offline, reja bekor qilindi.`);
        }
        clearPendingPlan(userId.toString());
        await safeSend(chatId, "🐱 Boshladim...");
        executePlan(chatId, existingPlan.selPC, existingPlan.steps);
        return;
      }
      if (PLAN_CANCEL_RE.test(lower)) {
        clearPendingPlan(userId.toString());
        return safeSend(chatId, "🐱 Xo'p, bekor qildim.");
      }
      // Boshqa narsa yozsa — eski rejani bekor qilib, yangi xabarni oddiy davom ettiramiz
      clearPendingPlan(userId.toString());
    }

    // ── CONTEXT ENGINE: "uni/buni/yana/yoniga/hammasini" kabi so'zlarni resolve qilamiz ──
    const ctx = getContext(userId);
    let command = null;
    if (isCommandMsg) {
      const resolvedText = resolveReferences(cmdText, ctx);
      command = await detectCommand(resolvedText);
    }

    // ── PLANNING ENGINE: oddiy bitta harakatli buyruq sifatida tanilmasa,
    // ehtimol bu murakkab, ko'p bosqichli vazifa — AI orqali tekshiramiz ──
    // (faqat "/" bilan boshlangan xabarlar uchun — oddiy suhbatda ishlamaydi)
    if (isCommandMsg && !command) {
      try {
        const needsPlan = await needsPlanning(cmdText);
        if (needsPlan) {
          const steps = await generatePlan(cmdText);
          setPendingPlan(userId.toString(), { steps, selPC });
          return safeSend(chatId, formatPlanMessage(steps));
        }
      } catch (err) {
        console.error("Planning engine xatosi:", err.message);
        // Reja tuzishda xatolik bo'lsa — oddiy AI suhbat oqimiga davom etamiz
      }
    }

    if (command) {
      console.log("CMD:", JSON.stringify(command));
      logCommandStat(command.type, selPC, userId);

      try {

        // FIX: PC'ni haqiqatan ishlatadigan buyruq aniqlangandagina offline tekshiramiz.
        // "direct" — PC kerak bo'lmagan to'g'ridan-to'g'ri javob, shuning uchun bundan mustasno.
        if (command.type !== "direct" && !isPCOnline(selPC)) {
          return safeSend(chatId, `❌ ${selPC} offline`);
        }

        // ── ERROR RECOVERY: dastur past ishonch bilan topildi — noto'g'ri narsani ochish o'rniga taklif beramiz ──
        if (command.type === "open" && command.confidence === "low") {
          const list = command.suggestions?.length ? command.suggestions.map(s => `• ${s}`).join("\n") : "";
          return safeSend(chatId, `❌ "${command.name}" nomli dastur topilmadi.${list ? `\n\n💡 Balki shulardan birini demoqchisiz?\n${list}` : "\n\nAniqroq nom bilan qayta urinib ko'ring."}`);
        }

        // ── HAMMASINI YOP (context engine) ──
        if (command.type === "close_all_context") {
          const apps = [...ctx.openedApps];
          if (!apps.length) return safeSend(chatId, "Yopiladigan narsa yo'q (bu sessiyada hech narsa ochilmagan)");
          const r = await remoteExecute(selPC, { type: "close_multiple", apps });
          updateContext(userId, { openedApps: [], lastCommandType: "close" });
          return safeSend(chatId, `🔴 Yopildi:\n${r}`);
        }

        // ── ALL COMMAND ──
        if (command.type === "all_command") {
          if (!isAdmin(userId)) return safeSend(chatId, "Faqat admin!");
          const pcs = Object.keys(onlineComputers);
          if (!pcs.length) return safeSend(chatId, "Hech qanday PC online emas");
          await safeSend(chatId, `📡 ${pcs.length} ta PC ga yuborilmoqda...`);
          const results = [];
          for (const pc of pcs) {
            const pcData = onlineComputers[pc];
            try {
              // FIX 3: detectCommand bilan to'g'ri object yasaymiz
              const schedCmd = await detectCommand(command.command) || { type: "run", cmd: command.command, label: "CMD" };
              // FIX 4: Master PC uchun ham to'g'ri bajaramiz
              if (pcData.type === "master" || pc === PC_NAME) {
                const res = await executeLocally(schedCmd);
                results.push(`✅ ${pc}: ${typeof res === "string" ? res.slice(0, 100) : "bajarildi"}`);
              } else {
                if (!pcData?.url) { results.push(`❌ ${pc}: URL yo'q`); continue; }
                const res = await axios.post(`${pcData.url}/execute`, {
                  command: schedCmd,
                  secret: NETWORK_SECRET
                }, { timeout: 10000 });
                results.push(`${res.data.ok ? "✅" : "❌"} ${pc}: ${res.data?.result || res.data?.error || "bajarildi"}`);
              }
            } catch (e) { results.push(`❌ ${pc}: ${e.message}`); }
          }
          return safeSend(chatId, results.join("\n"));
        }

        // ── PC COMMAND ──
        // FIX 5: command.command string → detectCommand bilan parse qilish
        if (command.type === "pc_command") {
          if (!isAdmin(userId)) return safeSend(chatId, "Faqat admin!");
          const targetPC = command.pc;
          const pcData = onlineComputers[targetPC];
          if (!pcData) return safeSend(chatId, `❌ ${targetPC} online emas`);
          try {
            const parsedCmd = await detectCommand(command.command) || { type: "run", cmd: command.command, label: "CMD" };
            if (pcData.type === "master" || targetPC === PC_NAME) {
              const res = await executeLocally(parsedCmd);
              return safeSend(chatId, `✅ ${targetPC}: ${typeof res === "string" ? res.slice(0, 500) : "bajarildi"}`);
            } else {
              const res = await axios.post(`${pcData.url}/execute`, { command: parsedCmd, secret: NETWORK_SECRET }, { timeout: 10000 });
              return safeSend(chatId, `${res.data.ok ? "✅" : "❌"} ${targetPC}: ${res.data?.result || res.data?.error || "bajarildi"}`);
            }
          } catch (e) { return safeSend(chatId, `❌ ${targetPC}: ${e.message}`); }
        }

        // ── NOTIFY ALL ──
        if (command.type === "notify_all") {
          if (!isAdmin(userId)) return safeSend(chatId, "Faqat admin!");
          const pcs = Object.keys(onlineComputers);
          if (!pcs.length) return safeSend(chatId, "Hech qanday PC online emas");
          await safeSend(chatId, `🔔 ${pcs.length} ta PC ga xabar yuborilmoqda...`);
          const results = [];
          for (const pc of pcs) {
            const pcData = onlineComputers[pc];
            try {
              const notifyCmd = { type: "notify", message: command.message };
              if (pcData.type === "master" || pc === PC_NAME) {
                await executeLocally(notifyCmd);
                results.push(`✅ ${pc}`);
              } else {
                if (!pcData?.url) { results.push(`❌ ${pc}: URL yo'q`); continue; }
                await axios.post(`${pcData.url}/execute`, { command: notifyCmd, secret: NETWORK_SECRET }, { timeout: 10000 });
                results.push(`✅ ${pc}`);
              }
            } catch (e) { results.push(`❌ ${pc}: ${e.message}`); }
          }
          return safeSend(chatId, results.join("\n") + `\n\n🔔 "${command.message}"`);
        }

        // ── SCHEDULE ──
        if (command.type === "schedule") {
          const ampm = msgText.match(/\b(am|pm)\b/i)?.[1]?.toLowerCase();
          let [hours, minutes] = command.time.split(":").map(Number);
          if (ampm === "pm" && hours !== 12) hours += 12;
          if (ampm === "am" && hours === 12) hours = 0;
          const now = new Date(); const target = new Date();
          target.setHours(hours, minutes, 0, 0);
          if (target <= now) target.setDate(target.getDate() + 1);
          const delay = target - now;
          const targetPC = command.pc || selPC;
          await safeSend(chatId, `⏰ Rejalashtrildi: "${command.command}"\n🖥️ PC: ${targetPC}\n🕐 ${command.time}\n⏳ ${Math.round(delay / 60000)} daqiqadan keyin`);
          setTimeout(async () => {
            try {
              const schedCmd = await detectCommand(command.command) || { type: "run", cmd: command.command, label: "CMD" };
              const pcData = onlineComputers[targetPC];
              if (!pcData) return safeSend(chatId, `❌ ${targetPC} offline`);
              if (pcData.type === "master" || targetPC === PC_NAME) {
                await executeLocally(schedCmd);
              } else {
                await axios.post(`${pcData.url}/execute`, { command: schedCmd, secret: NETWORK_SECRET }, { timeout: 10000 });
              }
              await safeSend(chatId, `✅ Jadval bajarildi: "${command.command}" → ${targetPC}`);
            } catch (e) {
              await safeSend(chatId, `❌ Jadval xatosi: ${e.message}`);
            }
          }, delay);
          return;
        }

        // ── SCREENSHOT ──
        if (command.type === "screenshot") {
          await safeSend(chatId, "📸 Olinmoqda...");
          const f = await remoteScreenshot(selPC);
          await new Promise(r => setTimeout(r, 800));
          await bot.sendPhoto(chatId, f, { caption: `📸 Screenshot [${selPC}]` });
          return;
        }

        // ── FILE SEND ──
        if (command.type === "file_send") {
          await safeSend(chatId, "📤 Qidirilmoqda...");
          const f = await remoteSendFile(selPC, command.filename);
          const filePayload = f.buffer || f.path;
          await bot.sendDocument(chatId, filePayload, { caption: `📄 ${f.name}` }, { filename: f.name });
          return;
        }

        // ── IMAGE ──
        if (command.type === "image") {
          await safeSend(chatId, "🎨 Chizmoqda...");
          const result = await generateImage(command.prompt);
          await bot.sendPhoto(chatId, result.buffer, { caption: result.source === "hf" ? "🎨 Kitty chizdi (HF)" : "🎨 Kitty chizdi" });
          return;
        }

        // ── AGENT MODE: diagnostika + tuzatish rejasi ──
        if (command.type === "diagnose") {
          await safeSend(chatId, `🔍 "${command.target}" tekshirilmoqda, loglar o'qilmoqda...`);
          try {
            const result = await remoteExecute(selPC, command);
            const { diagnosis, steps } = result;
            setPendingPlan(userId.toString(), { steps, selPC });
            return safeSend(chatId, `🩺 Tashxis: ${diagnosis}\n\n${formatPlanMessage(steps)}`);
          } catch (err) {
            return safeSend(chatId, `❌ Tashxis qo'yib bo'lmadi: ${err.message}`);
          }
        }

        // ── MULTI OPEN ──
        if (command.type === "multi_open") {
          const results = [];
          for (const appName of command.apps) {
            const app = findApp(appName);
            await remoteExecute(selPC, { type: "open", cmd: app.cmd, name: app.name });
            contextTrackOpened(userId, app.name);
            await new Promise(r => setTimeout(r, 400));
            results.push(`✅ ${app.name}`);
          }
          return safeSend(chatId, results.join("\n"));
        }

        // ── OPEN (count) ──
        if (command.type === "open" && command.count > 1) {
          for (let i = 0; i < command.count; i++) {
            await remoteExecute(selPC, { type: "open", cmd: command.cmd, name: command.name });
            await new Promise(r => setTimeout(r, 500));
          }
          contextTrackOpened(userId, command.name);
          return safeSend(chatId, `✅ "${command.name}" ${command.count}x ochildi`);
        }

        // ── OPEN AND TYPE ──
        if (command.type === "open_and_type") {
          const app = findApp(command.appName);
          await remoteExecute(selPC, { type: "open", cmd: app.cmd, name: app.name });
          contextTrackOpened(userId, app.name);
          await new Promise(r => setTimeout(r, 2000));
          await remoteExecute(selPC, { type: "type_text", text: command.textToType });
          updateContext(userId, { lastFile: command.textToType, lastCommandType: "type" });
          return safeSend(chatId, `✅ "${app.name}" ochildi + "${command.textToType}" yozildi`);
        }

        // ── DIRECT ──
        if (command.type === "direct") return safeSend(chatId, command.result);

        // ── BARCHA BOSHQA BUYRUQLAR ──
        const result = await remoteExecute(selPC, command);
        const r = typeof result === "string" ? result.slice(0, 3500) : JSON.stringify(result);

        const nice = {
          volume_up: `🔊 +${command.amount}`,
          volume_down: `🔉 -${command.amount}`,
          mute: "🔇 Mute",
          brightness_set: `💡 ${command.level}%`,
          brightness_up: "💡 Oshirildi",
          brightness_down: "💡 Pasaytirildi",
          minimize: "Kichraytirildi",
          maximize: "Kattalashtirildi",
          close_window: "Oyna yopildi",
          type_text: `Yozildi: "${command.text}"`,
        };
        if (nice[command.type] && r.trim() === "ok") return safeSend(chatId, nice[command.type]);
        if (command.type === "key" && r.trim() === "ok") return safeSend(chatId, `⌨️ "${command.label}" bosildi`);
        if (command.type === "mouse_click") return safeSend(chatId, `🖱️ (${command.x},${command.y})`);
        if (command.type === "scroll") return safeSend(chatId, `🖱️ Scroll ${command.direction}`);
        if (command.type === "open") { contextTrackOpened(userId, command.name); return safeSend(chatId, `✅ "${command.name}" ochildi`); }
        if (command.type === "close") {
          if (/not found|topilmadi|ERROR/i.test(r)) {
            let winList = "";
            try { winList = (await remoteExecute(selPC, { type: "list_windows" })).trim(); } catch (_) { }
            return safeSend(chatId, withSuggestions(`❌ "${command.appName}" nomli jarayon topilmadi`, winList ? winList.split("\n").slice(0, 5) : []));
          }
          contextTrackClosed(userId, command.appName);
          return safeSend(chatId, `🔴 "${command.appName}" yopildi`);
        }
        if (command.type === "notify") return safeSend(chatId, `🔔 "${command.message}"`);
        if (command.type === "battery") return safeSend(chatId, "🔋 " + r.trim());
        if (command.type === "brightness_get") return safeSend(chatId, "💡 " + r.trim() + "%");
        if (command.type === "active_window") return safeSend(chatId, "Faol oyna: " + r.trim());
        if (command.type === "list_windows") return safeSend(chatId, "Ochiq oynalar:\n" + r.trim());
        if (command.type === "sysinfo") return safeSend(chatId, `Sistema [${selPC}]:\n` + r);
        if (command.type === "monitor") return safeSend(chatId, `[${selPC}]\n\n` + r);

        // ── ERROR RECOVERY: cmd/ps buyrug'i xato bersa — AI'dan qisqa yechim so'raymiz ──
        if (command.type === "run" && r.trim().startsWith("Xato")) {
          const fix = await suggestErrorFix(command.cmd, r);
          return safeSend(chatId, `❌ ${r.trim()}${fix ? `\n\n💡 ${fix}` : ""}`);
        }

        return safeSend(chatId, r || "✅");

      } catch (err) {
        logErrorStat(command.type, err.message);
        return safeSend(chatId, `❌ Xatolik [${selPC}]: ${err.message}`);
      }
    }

    // ── AI JAVOB ──
    try {
      const aiReply = await chatWithAI([
        {
          role: "system",
          content: buildKittySystemPrompt() + formatLongTermMemoryForPrompt(identityMemory) + formatLearnedStyleForPrompt()
        },
        ...history,
        { role: "user", content: isFromShadow ? `[Shadow said]: ${msgText}` : msgText }
      ]);

      convMemory.history.push({ role: "user", content: msgText });
      convMemory.history.push({ role: "assistant", content: aiReply });
      if (convMemory.history.length > 50) convMemory.history = convMemory.history.slice(-50);
      memory[convKey] = convMemory;
      saveMemory(memory);

      await safeSend(chatId, "🐱 " + aiReply);
    } catch (err) {
      console.error("AI error:", err.message);
      if (!isFromShadow) await safeSend(chatId, "xatolik~");
    }
  });

  // ───────────────────────────────────────────
  // PROAKTIV XABAR — Kitty o'zidan-o'zi yozadi
  // ───────────────────────────────────────────
  async function sendProactiveMessage() {
    if (!ADMIN_ID) return;
    try {
      const memory = loadMemory();
      const userMemory = getUserMemory(ADMIN_ID.toString());
      const history = userMemory.history.slice(-10);

      const aiReply = await chatWithAI([
        {
          role: "system",
          content: buildKittySystemPrompt({ isProactive: true }) + formatLongTermMemoryForPrompt(userMemory) + formatLearnedStyleForPrompt()
        },
        ...history,
      ]);

      userMemory.history.push({ role: "assistant", content: aiReply });
      if (userMemory.history.length > 50) userMemory.history = userMemory.history.slice(-50);
      memory[ADMIN_ID.toString()] = userMemory;
      saveMemory(memory);

      await safeSend(ADMIN_ID, "🐱 " + aiReply);
      console.log("💬 Proaktiv xabar yuborildi");
    } catch (err) {
      console.error("Proaktiv xabar xatosi:", err.message);
    }
  }

  const PROACTIVE_CHECK_MIN = 5; // oddiy rejimda har 5 daqiqada bir tekshiradi
  setInterval(() => {
    if (!ADMIN_ID) return;
    const s = loadSettings();
    if (s.fastTalkMode) return; // fasttalk o'z alohida timeri bilan ishlaydi
    if (!s.proactivePercent) return; // 0% = o'chiq
    const avgMinutes = s.proactiveAvgHours * 60;
    const probability = (PROACTIVE_CHECK_MIN / avgMinutes) * (s.proactivePercent / 100);
    if (Math.random() < probability) sendProactiveMessage();
  }, PROACTIVE_CHECK_MIN * 60 * 1000);

  // ── FASTTALK — 1-2 daqiqada bir marta o'zidan yozadi ──
  let fastTalkTimer = null;
  function scheduleFastTalk() {
    if (fastTalkTimer) clearTimeout(fastTalkTimer);
    const s = loadSettings();
    if (!s.fastTalkMode) { fastTalkTimer = null; return; }
    const delayMs = (60 + Math.random() * 60) * 1000; // 1-2 daqiqa
    fastTalkTimer = setTimeout(async () => {
      const s2 = loadSettings();
      if (s2.fastTalkMode) {
        await sendProactiveMessage();
        scheduleFastTalk();
      } else {
        fastTalkTimer = null;
      }
    }, delayMs);
  }
  // Bot qayta ishga tushganda, agar fasttalk avvaldan yoqilgan bo'lsa — davom ettiradi
  scheduleFastTalk();

  // ── TALKFIRST — bot ishga tushganda (restart/deploy), foydalanuvchi yozishidan oldin Kitty birinchi bo'lib yozadi ──
  if (loadSettings().talkFirstMode) {
    setTimeout(() => sendProactiveMessage(), 5000); // webhook to'liq o'rnatilishi uchun biroz kutamiz
  }

} // end IS_MASTER