const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const session = require("express-session");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

const {
  SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET,
  CX_APP_ID, CX_TOKEN,
  CANVA_CLIENT_ID, CANVA_CLIENT_SECRET,
  AIRTABLE_TOKEN, AIRTABLE_BASE_ID,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
  ANTHROPIC_API_KEY, FRONTEND_URL,
} = process.env;

const RENDER_BASE = "https://ak-intelligence-backend.onrender.com";
const CANVA_REDIRECT = `${RENDER_BASE}/auth/canva/callback`;
const GOOGLE_REDIRECT = `${RENDER_BASE}/auth/google/callback`;

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(session({
  secret: crypto.randomBytes(32).toString("hex"),
  resave: false, saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ─── HEALTH CHECK ────────────────────────────────────────
app.get("/", (req, res) => res.json({
  status: "ok",
  service: "Wirehouse Media — AK Artist Intelligence Backend",
  version: "2.0.0",
  endpoints: ["/spotify/token","/spotify/artist","/spotify/top-tracks","/chartex/sounds",
    "/airtable/:table","/auth/canva","/auth/google","/google/calendar/events","/google/drive/files","/ai/chat"]
}));

// ═══════════════════════════════════════════════════════════
// SPOTIFY — with retry and HTML response detection
// ═══════════════════════════════════════════════════════════
let spToken = null, spExpiry = 0;

async function getSpotifyToken() {
  if (spToken && Date.now() < spExpiry) return spToken;
  const creds = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "WirehouseMedia/2.0"
    },
    body: "grant_type=client_credentials"
  });
  const text = await r.text();
  if (!r.ok || text.trim().startsWith("<")) {
    throw new Error(`Spotify auth failed: ${r.status} — ${text.substring(0, 100)}`);
  }
  const d = JSON.parse(text);
  if (!d.access_token) throw new Error(`No access token: ${text.substring(0, 200)}`);
  spToken = d.access_token;
  spExpiry = Date.now() + (d.expires_in - 60) * 1000;
  return spToken;
}

async function spFetch(path) {
  const tok = await getSpotifyToken();
  const r = await fetch(`https://api.spotify.com${path}`, {
    headers: {
      "Authorization": `Bearer ${tok}`,
      "User-Agent": "WirehouseMedia/2.0",
      "Accept": "application/json"
    }
  });
  const text = await r.text();
  if (text.trim().startsWith("<")) {
    // Spotify returned HTML (bot check / rate limit) — clear token and retry once
    spToken = null; spExpiry = 0;
    const tok2 = await getSpotifyToken();
    const r2 = await fetch(`https://api.spotify.com${path}`, {
      headers: { "Authorization": `Bearer ${tok2}`, "Accept": "application/json" }
    });
    const text2 = await r2.text();
    if (text2.trim().startsWith("<")) throw new Error("Spotify returned HTML (rate limited). Try again in 30 seconds.");
    return JSON.parse(text2);
  }
  if (!r.ok) throw new Error(`Spotify ${r.status}: ${text.substring(0, 200)}`);
  return JSON.parse(text);
}

app.get("/spotify/token", async (req, res) => {
  try { res.json({ access_token: await getSpotifyToken() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/spotify/artist", async (req, res) => {
  try {
    const id = req.query.id || "3DiDSECUqqY1AuBP8qtaIa";
    res.json(await spFetch(`/v1/artists/${id}`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/spotify/top-tracks", async (req, res) => {
  try {
    const id = req.query.id || "3DiDSECUqqY1AuBP8qtaIa";
    const market = req.query.market || "US";
    res.json(await spFetch(`/v1/artists/${id}/top-tracks?market=${market}`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/spotify/search", async (req, res) => {
  try {
    const { q, type = "track", limit = 10 } = req.query;
    res.json(await spFetch(`/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/spotify/albums", async (req, res) => {
  try {
    const id = req.query.id || "3DiDSECUqqY1AuBP8qtaIa";
    res.json(await spFetch(`/v1/artists/${id}/albums?include_groups=album,single&market=US&limit=50`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// CHARTEX — always append "alicia keys" to search
// ═══════════════════════════════════════════════════════════
app.get("/chartex/sounds", async (req, res) => {
  try {
    let { search = "alicia keys", limit = 20 } = req.query;
    // Always include "alicia keys" in search for better results
    if (!search.toLowerCase().includes("alicia keys")) {
      search = `alicia keys ${search}`;
    }
    const url = `https://api.chartex.com/external/v1/tiktok-sounds/?search=${encodeURIComponent(search)}&limit=${limit}`;
    const r = await fetch(url, {
      headers: { "X-APP-ID": CX_APP_ID, "X-APP-TOKEN": CX_TOKEN }
    });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: `ChartEx ${r.status}: ${text}` });
    const data = JSON.parse(text);
    // Normalize the response — ChartEx returns {data: {items: [...]}}
    const items = data?.data?.items || data?.results || data || [];
    res.json({ items, raw: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// AIRTABLE — full CRUD
// ═══════════════════════════════════════════════════════════
const AT_BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AT_H = () => ({ "Authorization": `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" });

app.get("/airtable/:table", async (req, res) => {
  try {
    const { maxRecords = 100, filterByFormula, sort } = req.query;
    let url = `${AT_BASE}/${encodeURIComponent(req.params.table)}?maxRecords=${maxRecords}`;
    if (filterByFormula) url += `&filterByFormula=${encodeURIComponent(filterByFormula)}`;
    if (sort) url += `&sort[0][field]=${encodeURIComponent(sort)}&sort[0][direction]=desc`;
    const r = await fetch(url, { headers: AT_H() });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/airtable/:table", async (req, res) => {
  try {
    const r = await fetch(`${AT_BASE}/${encodeURIComponent(req.params.table)}`, {
      method: "POST", headers: AT_H(),
      body: JSON.stringify({ fields: req.body })
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/airtable/:table/:id", async (req, res) => {
  try {
    const r = await fetch(`${AT_BASE}/${encodeURIComponent(req.params.table)}/${req.params.id}`, {
      method: "PATCH", headers: AT_H(),
      body: JSON.stringify({ fields: req.body })
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/airtable/:table/:id", async (req, res) => {
  try {
    const r = await fetch(`${AT_BASE}/${encodeURIComponent(req.params.table)}/${req.params.id}`, {
      method: "DELETE", headers: AT_H()
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// CANVA OAUTH — PKCE
// ═══════════════════════════════════════════════════════════
app.get("/auth/canva", (req, res) => {
  const codeVerifier = crypto.randomBytes(64).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  req.session.canvaCodeVerifier = codeVerifier;
  req.session.canvaState = state;
  const scopes = "design:content:read design:content:write design:meta:read folder:read folder:write asset:read asset:write brandtemplate:content:read brandtemplate:meta:read comment:read comment:write profile:read";
  const authUrl = new URL("https://www.canva.com/api/oauth/authorize");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CANVA_CLIENT_ID);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect_uri", CANVA_REDIRECT);
  res.redirect(authUrl.toString());
});

app.get("/auth/canva/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (state !== req.session.canvaState) return res.status(400).send("State mismatch");
    const r = await fetch("https://api.canva.com/rest/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code_verifier: req.session.canvaCodeVerifier,
        code, redirect_uri: CANVA_REDIRECT,
        client_id: CANVA_CLIENT_ID, client_secret: CANVA_CLIENT_SECRET
      }).toString()
    });
    if (!r.ok) return res.status(400).json({ error: await r.text() });
    const tokens = await r.json();
    req.session.canvaToken = tokens.access_token;
    req.session.canvaRefresh = tokens.refresh_token;
    res.redirect(`${FRONTEND_URL || RENDER_BASE}?canva=connected`);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/canva/token", (req, res) => {
  if (!req.session.canvaToken) return res.status(401).json({ error: "Not authenticated with Canva" });
  res.json({ access_token: req.session.canvaToken });
});

app.post("/canva/design", async (req, res) => {
  try {
    if (!req.session.canvaToken) return res.status(401).json({ error: "Connect Canva first" });
    const { title, designType = "instagram_post" } = req.body;
    const r = await fetch("https://api.canva.com/rest/v1/designs", {
      method: "POST",
      headers: { "Authorization": `Bearer ${req.session.canvaToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ design_type: { type: designType }, title })
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/canva/designs", async (req, res) => {
  try {
    if (!req.session.canvaToken) return res.status(401).json({ error: "Connect Canva first" });
    const r = await fetch("https://api.canva.com/rest/v1/designs?limit=20", {
      headers: { "Authorization": `Bearer ${req.session.canvaToken}` }
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GOOGLE OAUTH
// ═══════════════════════════════════════════════════════════
app.get("/auth/google", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.googleState = state;
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "profile", "email"
  ].join(" ");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "consent");
  res.redirect(authUrl.toString());
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (state !== req.session.googleState) return res.status(400).send("State mismatch");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT, grant_type: "authorization_code"
      }).toString()
    });
    if (!r.ok) return res.status(400).json({ error: await r.text() });
    const tokens = await r.json();
    req.session.googleToken = tokens.access_token;
    req.session.googleRefresh = tokens.refresh_token;
    res.redirect(`${FRONTEND_URL || RENDER_BASE}?google=connected`);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/google/calendar/events", async (req, res) => {
  try {
    if (!req.session.googleToken) return res.status(401).json({ error: "Connect Google first", authUrl: "/auth/google" });
    const { timeMin = new Date().toISOString(), maxResults = 50 } = req.query;
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${req.session.googleToken}` } });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/google/calendar/events", async (req, res) => {
  try {
    if (!req.session.googleToken) return res.status(401).json({ error: "Connect Google first" });
    const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${req.session.googleToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/google/calendar/events/:id", async (req, res) => {
  try {
    if (!req.session.googleToken) return res.status(401).json({ error: "Connect Google first" });
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${req.params.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${req.session.googleToken}` }
    });
    res.json({ success: r.ok });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/google/drive/files", async (req, res) => {
  try {
    if (!req.session.googleToken) return res.status(401).json({ error: "Connect Google first" });
    const { pageSize = 20 } = req.query;
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&fields=files(id,name,mimeType,webViewLink,thumbnailLink,createdTime,modifiedTime)`, {
      headers: { Authorization: `Bearer ${req.session.googleToken}` }
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/auth/status", (req, res) => {
  res.json({
    canva: !!req.session.canvaToken,
    google: !!req.session.googleToken,
    spotify: !!spToken && Date.now() < spExpiry,
    airtable: !!AIRTABLE_TOKEN,
    chartex: !!CX_TOKEN,
    ai: !!ANTHROPIC_API_KEY
  });
});

// ═══════════════════════════════════════════════════════════
// AI CHAT — Claude with full AK context
// ═══════════════════════════════════════════════════════════
const AK_SYSTEM = `You are the AI Intelligence Assistant for Wirehouse Media's Artist Intelligence Platform, deployed for Alicia Keys.

VERIFIED DATA (April 2026):
- Instagram @aliciakeys: 28M followers, 0.61% engagement, 165.8K avg likes, 1.4K avg comments
- TikTok @aliciakeys: 8M followers, 50.5M total likes
- Spotify: 36.6M monthly listeners, Artist ID: 3DiDSECUqqY1AuBP8qtaIa, 1.2B+ all-time streams
- YouTube: ~7M subs | Facebook: ~35M | X/Twitter: ~28M
- KEY EVENT 2026: Con Cora Gala — Alicia Keys performed with Karol G. Major cultural moment.
- TRENDING: "Plentiful ft. Pusha T" — 695 TikTok creates, 2.1M views, 1.58M Spotify streams
- "Try Sleeping with a Broken Heart" — +34% streaming spike post-Con Cora Gala
- "Girl on Fire" — 1.7M TikTok creates (live from ChartEx), 932M video views
- Hell's Kitchen Broadway — sell-out run spring 2026
- L'Aurora ft. Eros Ramazzotti — 2025 Italian collab

TOP STREAMS: If I Ain't Got You (1.2B), Fallin' (980M), No One (860M), Girl on Fire (620M)

PLATFORM: Wirehouse Media Artist Intelligence Platform — proprietary SaaS.
INTEGRATIONS: ChartEx (TikTok sound data), Spotify API, Airtable (CRM), Canva (design), Google Calendar.

YOU CAN:
- Generate full coverage reports on any event, campaign, or moment
- Find and link to specific posts and social media content
- Analyze streaming and TikTok sound trends with real data
- Draft social posts, press releases, campaign briefs, pitch decks
- Identify creator opportunities and influencer strategy
- Generate Airtable record suggestions
- Recommend content strategy based on catalog and trend data
- Pull all coverage around any moment (Con Cora Gala, Plentiful drop, etc.)

FORMAT: Sharp, data-driven. Use headers and bullets for reports. Always include real clickable links:
- Spotify: https://open.spotify.com/artist/3DiDSECUqqY1AuBP8qtaIa
- TikTok search: https://www.tiktok.com/search?q=alicia+keys
- Instagram: https://instagram.com/aliciakeys
- YouTube: https://youtube.com/@AliciaKeys`;

app.post("/ai/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured in Render environment variables. Add it at dashboard.render.com → ak-intelligence-backend → Environment." });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: AK_SYSTEM,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      })
    });
    if (!r.ok) {
      const txt = await r.text();
      return res.status(r.status).json({ error: txt });
    }
    const data = await r.json();
    res.json({ reply: data.content?.[0]?.text || "No response" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── START ───────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Wirehouse Media — AK Intelligence Backend v2.0 running on port ${PORT}`);
});
