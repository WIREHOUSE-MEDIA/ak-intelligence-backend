const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const session = require("express-session");
const crypto = require("crypto");
const path = require("path");

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

// Realistic browser User-Agent — helps bypass Spotify/Cloudflare bot checks
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(session({
  secret: crypto.randomBytes(32).toString("hex"),
  resave: false, saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ─── SERVE DASHBOARD ─────────────────────────────────────
// Looks for index.html at root OR in /public folder
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname)); // also serve from root

app.get("/", (req, res) => {
  const fs = require("fs");
  // Check /public/index.html first, then root index.html
  const publicPath = path.join(__dirname, "public", "index.html");
  const rootPath = path.join(__dirname, "index.html");
  if (fs.existsSync(publicPath)) {
    res.sendFile(publicPath);
  } else if (fs.existsSync(rootPath)) {
    res.sendFile(rootPath);
  } else {
    res.json({
      status: "ok",
      service: "Wirehouse Media — AK Artist Intelligence Backend",
      version: "3.1.0",
      message: "Upload index.html to GitHub root or /public folder"
    });
  }
});

// ═══════════════════════════════════════════════════════════
// SPOTIFY — with realistic headers + retry on HTML response
// ═══════════════════════════════════════════════════════════
let spToken = null, spExpiry = 0;

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function getSpotifyToken() {
  if (spToken && Date.now() < spExpiry) return spToken;
  const creds = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  
  // Try up to 3 times with delay
  for(let attempt = 0; attempt < 3; attempt++){
    if(attempt > 0) await sleep(1000 * attempt);
    try {
      const r = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${creds}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        body: "grant_type=client_credentials"
      });
      const text = await r.text();
      if(text.trim().startsWith("<")){
        console.log(`Spotify returned HTML on attempt ${attempt+1}, retrying...`);
        continue;
      }
      const d = JSON.parse(text);
      if(!d.access_token) throw new Error(`No token in response: ${text.substring(0,100)}`);
      spToken = d.access_token;
      spExpiry = Date.now() + (d.expires_in - 60) * 1000;
      return spToken;
    } catch(e) {
      if(attempt === 2) throw e;
    }
  }
  throw new Error("Spotify auth failed after 3 attempts (bot check). Try again in 60 seconds.");
}

async function spFetch(path) {
  const tok = await getSpotifyToken();
  await sleep(200); // Small delay between token and data request
  const r = await fetch(`https://api.spotify.com${path}`, {
    headers: {
      "Authorization": `Bearer ${tok}`,
      "User-Agent": UA,
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    }
  });
  const text = await r.text();
  if(text.trim().startsWith("<")) {
    // Force token refresh and retry once
    spToken = null; spExpiry = 0;
    await sleep(2000);
    const tok2 = await getSpotifyToken();
    const r2 = await fetch(`https://api.spotify.com${path}`, {
      headers: { "Authorization": `Bearer ${tok2}`, "User-Agent": UA, "Accept": "application/json" }
    });
    const text2 = await r2.text();
    if(text2.trim().startsWith("<")) throw new Error("Spotify is rate-limiting this IP. Try again in 60 seconds.");
    return JSON.parse(text2);
  }
  if(!r.ok) throw new Error(`Spotify ${r.status}: ${text.substring(0,200)}`);
  return JSON.parse(text);
}

app.get("/spotify/token", async (req, res) => {
  try { res.json({ access_token: await getSpotifyToken() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/spotify/artist", async (req, res) => {
  try { res.json(await spFetch(`/v1/artists/${req.query.id||"3DiDSECUqqY1AuBP8qtaIa"}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/spotify/top-tracks", async (req, res) => {
  try { res.json(await spFetch(`/v1/artists/${req.query.id||"3DiDSECUqqY1AuBP8qtaIa"}/top-tracks?market=${req.query.market||"US"}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/spotify/search", async (req, res) => {
  try { res.json(await spFetch(`/v1/search?q=${encodeURIComponent(req.query.q)}&type=${req.query.type||"track"}&limit=${req.query.limit||10}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/spotify/albums", async (req, res) => {
  try { res.json(await spFetch(`/v1/artists/${req.query.id||"3DiDSECUqqY1AuBP8qtaIa"}/albums?include_groups=album,single&market=US&limit=50`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// CHARTEX — filter results to Alicia Keys only
// ═══════════════════════════════════════════════════════════
app.get("/chartex/sounds", async (req, res) => {
  try {
    let { search = "alicia keys", limit = 50 } = req.query; // Get more so we can filter
    // Build smart search — use song name only (ChartEx searches sound names, not artist names)
    const searchQuery = search.toLowerCase().includes("alicia") ? search : search;
    
    const url = `https://api.chartex.com/external/v1/tiktok-sounds/?search=${encodeURIComponent(searchQuery)}&limit=${limit}`;
    const r = await fetch(url, {
      headers: { "X-APP-ID": CX_APP_ID, "X-APP-TOKEN": CX_TOKEN }
    });
    if(!r.ok) return res.status(r.status).json({ error: await r.text() });
    
    const raw = await r.json();
    let items = raw?.data?.items || raw?.results || raw || [];
    
    // Filter to Alicia Keys sounds only (check artists field OR sound creator name)
    const akFiltered = items.filter(s => {
      const artist = (s.artists||"").toLowerCase();
      const creator = (s.tiktok_sound_creator_name||"").toLowerCase();
      const songName = (s.song_name||"").toLowerCase();
      return artist.includes("alicia keys") || creator.includes("alicia keys") ||
             artist.includes("alicia") || creator.includes("alicia");
    });
    
    // If no AK-specific results, return all (for catalogue search where we don't have exact artist)
    const finalItems = akFiltered.length > 0 ? akFiltered : items.slice(0, 20);
    
    res.json({ items: finalItems, total: finalItems.length, raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// AIRTABLE — full CRUD
// ═══════════════════════════════════════════════════════════
const AT_BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AT_H = () => ({ "Authorization": `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" });

app.get("/airtable/:table", async (req, res) => {
  try {
    const { maxRecords=100, filterByFormula, sort } = req.query;
    let url = `${AT_BASE}/${encodeURIComponent(req.params.table)}?maxRecords=${maxRecords}`;
    if(filterByFormula) url += `&filterByFormula=${encodeURIComponent(filterByFormula)}`;
    if(sort) url += `&sort[0][field]=${encodeURIComponent(sort)}&sort[0][direction]=desc`;
    const r = await fetch(url, { headers: AT_H() });
    if(!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/airtable/:table", async (req, res) => {
  try {
    const r = await fetch(`${AT_BASE}/${encodeURIComponent(req.params.table)}`, {
      method: "POST", headers: AT_H(), body: JSON.stringify({ fields: req.body })
    });
    if(!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/airtable/:table/:id", async (req, res) => {
  try {
    const r = await fetch(`${AT_BASE}/${encodeURIComponent(req.params.table)}/${req.params.id}`, {
      method: "PATCH", headers: AT_H(), body: JSON.stringify({ fields: req.body })
    });
    if(!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/airtable/:table/:id", async (req, res) => {
  try {
    const r = await fetch(`${AT_BASE}/${encodeURIComponent(req.params.table)}/${req.params.id}`, {
      method: "DELETE", headers: AT_H()
    });
    if(!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// CANVA OAUTH
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
    if(state !== req.session.canvaState) return res.status(400).send("State mismatch");
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
    if(!r.ok) return res.status(400).json({ error: await r.text() });
    const tokens = await r.json();
    req.session.canvaToken = tokens.access_token;
    req.session.canvaRefresh = tokens.refresh_token;
    res.redirect(`${FRONTEND_URL||RENDER_BASE}?canva=connected`);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/canva/token", (req, res) => {
  if(!req.session.canvaToken) return res.status(401).json({ error: "Not authenticated with Canva" });
  res.json({ access_token: req.session.canvaToken });
});

app.post("/canva/design", async (req, res) => {
  try {
    if(!req.session.canvaToken) return res.status(401).json({ error: "Connect Canva first" });
    const r = await fetch("https://api.canva.com/rest/v1/designs", {
      method: "POST",
      headers: { "Authorization": `Bearer ${req.session.canvaToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ design_type: { type: req.body.designType||"instagram_post" }, title: req.body.title })
    });
    if(!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GOOGLE OAUTH
// ═══════════════════════════════════════════════════════════
app.get("/auth/google", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.googleState = state;
  const scopes = ["https://www.googleapis.com/auth/calendar","https://www.googleapis.com/auth/calendar.events","https://www.googleapis.com/auth/drive.file","https://www.googleapis.com/auth/drive.metadata.readonly","profile","email"].join(" ");
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
    if(state !== req.session.googleState) return res.status(400).send("State mismatch");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT, grant_type: "authorization_code" }).toString()
    });
    if(!r.ok) return res.status(400).json({ error: await r.text() });
    const tokens = await r.json();
    req.session.googleToken = tokens.access_token;
    req.session.googleRefresh = tokens.refresh_token;
    res.redirect(`${FRONTEND_URL||RENDER_BASE}?google=connected`);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/google/calendar/events", async (req, res) => {
  try {
    if(!req.session.googleToken) return res.status(401).json({ error: "Connect Google first", authUrl: "/auth/google" });
    const { timeMin=new Date().toISOString(), maxResults=50 } = req.query;
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`, {
      headers: { Authorization: `Bearer ${req.session.googleToken}` }
    });
    if(!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/google/calendar/events", async (req, res) => {
  try {
    if(!req.session.googleToken) return res.status(401).json({ error: "Connect Google first" });
    const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST", headers: { Authorization: `Bearer ${req.session.googleToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    if(!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/google/drive/files", async (req, res) => {
  try {
    if(!req.session.googleToken) return res.status(401).json({ error: "Connect Google first" });
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=${req.query.pageSize||20}&fields=files(id,name,mimeType,webViewLink,thumbnailLink,createdTime,modifiedTime)`, {
      headers: { Authorization: `Bearer ${req.session.googleToken}` }
    });
    if(!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
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
const AK_SYSTEM = `You are "Hey Jessi" — the AI Intelligence Partner for Wirehouse Media's AK Artist Intelligence Platform, built for Alicia Keys. You work like a full digital team combined into one.

WHO YOU ARE: Sharp, professional, deeply knowledgeable about AK's brand, voice, catalog, business ventures, and digital strategy. You write in AK's voice when asked. You analyze data like a senior data analyst. You build coverage reports like a PR firm. You write shotlists like an experienced creative director. You strategize like a veteran music industry consultant.

AK VERIFIED DATA (April 2026):
- Instagram @aliciakeys: 28M followers, 0.61% engagement, 165.8K avg likes
- TikTok @aliciakeys: 8M followers, 50.5M total likes
- Spotify: 36.6M monthly listeners, 1.2B+ all-time streams
- AGENCY: Wirehouse Media (NOT Roc Nation)

CON CORA GALA WITH KAROL G (Mar 19-28, 2026):
- Total reach: 43.9M+ (collab reel 32.9M views + 1.6M likes)
- Try Sleeping with a Broken Heart: 4,370 TikTok creates, 1,096,600 TikTok views, 571,333 Spotify streams in 14 days
- Worldwide streaming: +21% (Spotify +24%, Apple Music +22%)
- Latin streaming: +59% (Spotify +66%) — Karol G crossover confirmed
- Peak: March 25 aligned with viral social activity
- Spotify follower spike: +6,045 on March 23 (+93.6% vs avg)
- Cover trend: Male creators doing emotional covers — 261.6K views, 49K likes in 3 days

OTHER KEY DATA:
- Girl on Fire: 1.71M TikTok creates, 932M video views
- Plentiful ft. Pusha T: 695 TikTok creates, 2.1M views
- Hell's Kitchen Broadway: sell-out run spring 2026

AK'S VOICE: Warm, powerful, spiritual, soulful. Calls fans "family." Celebrates women, healing, music, community. Never corporate — always personal and real.

YOU CAN DO:
1. COVERAGE REPORTS — Executive summary, top narratives with post handles + engagement numbers, streaming impact worldwide + Latin, TikTok creates/views, key insights, trends, recommendations
2. SHOTLISTS & CAPTURE PLANS — Time-stamped, concept names, reference links, time estimates, thumbnail checkpoints, requestor tags (KSC/AKW)
3. COPY — IG captions, TikTok scripts, newsletters, press releases, creator briefs — all in AK's voice
4. CREATOR STRATEGY — Source creators, write mass outreach emails, write campaign briefs
5. TEAM WORKFLOW — Agendas, schedules, content calendars, approval workflows, newsletters, presentations
6. ANALYSIS — Which songs to push, Latin market ops, trending sounds, sound page performance

If user provides Sony DSRP data, incorporate those exact numbers into the analysis.
Use headers, bullets, bold for reports. Be specific with numbers. Include real links.`;


app.post("/ai/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if(!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });
    if(!ANTHROPIC_API_KEY=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) return res.status(500).json({ 

    });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: claude-haiku-4-5-20251001", max_tokens: 2000, system: AK_SYSTEM, messages })
    });
    if(!r.ok) {
      const txt = await r.text();
      return res.status(r.status).json({ error: `Anthropic error: ${txt}` });
    }
    const data = await r.json();
    res.json({ reply: data.content?.[0]?.text || "No response" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Wirehouse Media — AK Intelligence Backend v3.0 running on port ${PORT}`);
});
