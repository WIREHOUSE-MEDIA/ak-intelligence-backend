const express = require('express');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;
app.use(express.json());

// ── API HOSTS ────────────────────────────────────────────────
const IG_HOST    = 'instagram-looter2.p.rapidapi.com';
const IG2_HOST   = 'instagram-scraper-stable-api.p.rapidapi.com';
const TT_HOST    = 'tiktok-scraper2.p.rapidapi.com';
const TT2_HOST   = 'tiktok-api23.p.rapidapi.com';
const SCRAPTIK   = 'scraptik.p.rapidapi.com';
const YT_HOST    = 'youtube-v3-alternative.p.rapidapi.com';
const SHZ_HOST   = 'shazam.p.rapidapi.com';
const SHZC_HOST  = 'shazam-core.p.rapidapi.com';
const AM_HOST    = 'apple-music24.p.rapidapi.com';
const MF_HOST    = 'musicfetch2.p.rapidapi.com';

const RAPID_KEY = process.env.RAPID_KEY || '';
const rh = host => ({ 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': host, 'Content-Type': 'application/json' });

// ── ENV ──────────────────────────────────────────────────────
const JB_KEY  = process.env.JSONBIN_KEY           || '';
const AK_BIN  = process.env.AK_JSONBIN_BIN        || '';
const CR_BIN  = process.env.CREATOR_JSONBIN_BIN   || '';
const JBIN    = 'https://api.jsonbin.io/v3';
const AT_BASE = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE || 'appmEo06Ys7B1OawE'}`;
const AT_KEY  = process.env.AIRTABLE_KEY || '';

// ── CONFIG ───────────────────────────────────────────────────
app.get('/config', (req, res) => res.json({
  hasRapid:    !!RAPID_KEY,
  hasJb:       !!(JB_KEY && AK_BIN),
  hasCrJb:     !!(JB_KEY && CR_BIN),
  hasAirtable: !!AT_KEY,
  hasAnthropic:!!process.env.ANTHROPIC_API_KEY,
  akBin: AK_BIN, crBin: CR_BIN,
  jbKey: JB_KEY,  // creator dashboard reads this
  jbBin: AK_BIN,
}));

app.get('/debug', (req, res) => {
  const c = v => v ? `SET (${v.length}c)` : 'NOT SET';
  res.send(`<pre style="font-size:14px;padding:2rem;background:#0d0a18;color:#c4a8e8;font-family:monospace">
AK Intelligence Backend — Debug
════════════════════════════════
ANTHROPIC_API_KEY     ${c(process.env.ANTHROPIC_API_KEY)}
AIRTABLE_KEY          ${c(AT_KEY)}
RAPID_KEY             ${c(RAPID_KEY)}
JSONBIN_KEY           ${c(JB_KEY)}
AK_JSONBIN_BIN        ${c(AK_BIN)} ${AK_BIN}
CREATOR_JSONBIN_BIN   ${c(CR_BIN)} ${CR_BIN}
SPOTIFY_ID            ${c(process.env.SPOTIFY_ID)}
SPOTIFY_SECRET        ${c(process.env.SPOTIFY_SECRET)}
CHARTEX_ID            ${c(process.env.CHARTEX_ID)}
CHARTEX_TOKEN         ${c(process.env.CHARTEX_TOKEN)}
  </pre>`);
});

// ════════════════════════════════════════════════════════════
// JSONBIN PROXY
// ════════════════════════════════════════════════════════════
const jbHeaders = { 'X-Master-Key': JB_KEY, 'Content-Type': 'application/json', 'X-Bin-Meta': 'false' };

app.get('/jb/ak', async (req, res) => {
  if (!JB_KEY || !AK_BIN) return res.status(503).json({ error: 'Set AK_JSONBIN_BIN + JSONBIN_KEY in Render' });
  try {
    const r = await fetch(`${JBIN}/b/${AK_BIN}/latest`, { headers: jbHeaders });
    const d = await r.json();
    res.json(d?.record || d || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/jb/ak', async (req, res) => {
  if (!JB_KEY || !AK_BIN) return res.status(503).json({ error: 'JSONBin not configured' });
  try {
    const r = await fetch(`${JBIN}/b/${AK_BIN}`, { method: 'PUT', headers: jbHeaders, body: JSON.stringify(req.body) });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Creator Dashboard bin — read-only cross-pull
app.get('/jb/creator', async (req, res) => {
  if (!JB_KEY || !CR_BIN) return res.status(503).json({ error: 'Set CREATOR_JSONBIN_BIN in Render' });
  try {
    const r = await fetch(`${JBIN}/b/${CR_BIN}/latest`, { headers: jbHeaders });
    const d = await r.json();
    res.json(d?.record || d || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// TIKTOK — tiktok-scraper2 + tiktok-api23
// ════════════════════════════════════════════════════════════
app.get('/api/tt-post', async (req, res) => {
  const { videoId, videoUrl } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const url = videoUrl ? decodeURIComponent(videoUrl) : `https://www.tiktok.com/@user/video/${videoId}`;
    const r = await fetch(
      `https://${TT_HOST}/video/info_v2?video_url=${encodeURIComponent(url)}&video_id=${videoId}`,
      { headers: rh(TT_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tt-post-v2', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(`https://${TT2_HOST}/api/post/detail?videoId=${videoId}`, { headers: rh(TT2_HOST) });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tt-music', async (req, res) => {
  const { musicId } = req.query;
  if (!musicId) return res.status(400).json({ error: 'Missing musicId' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(`https://${TT2_HOST}/api/music/info?musicId=${musicId}`, { headers: rh(TT2_HOST) });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tt-music-posts', async (req, res) => {
  const { musicId, count = 30, cursor = 0 } = req.query;
  if (!musicId) return res.status(400).json({ error: 'Missing musicId' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${TT2_HOST}/api/music/posts?musicId=${musicId}&count=${count}&cursor=${cursor}`,
      { headers: rh(TT2_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tt-user', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Missing username' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(`https://${TT2_HOST}/api/user/info?uniqueId=${encodeURIComponent(username)}`, { headers: rh(TT2_HOST) });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// INSTAGRAM — instagram-looter2 + instagram-scraper-stable-api
// ════════════════════════════════════════════════════════════
app.get('/api/ig-post', async (req, res) => {
  const { postUrl } = req.query;
  if (!postUrl) return res.status(400).json({ error: 'Missing postUrl' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const raw = decodeURIComponent(postUrl);
    const code = raw.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[2];
    if (!code) return res.status(400).json({ error: 'Cannot extract shortcode' });
    const normalized = `https://www.instagram.com/p/${code}/`;
    const r = await fetch(`https://${IG_HOST}/post?url=${encodeURIComponent(normalized)}`, { headers: rh(IG_HOST) });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stable IG scraper fallback
app.get('/api/ig-post-v2', async (req, res) => {
  const { postUrl } = req.query;
  if (!postUrl) return res.status(400).json({ error: 'Missing postUrl' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const raw = decodeURIComponent(postUrl);
    const code = raw.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[2];
    if (!code) return res.status(400).json({ error: 'Cannot extract shortcode' });
    const r = await fetch(
      `https://${IG2_HOST}/get_media_data_v2.php?media_code=${code}`,
      { headers: rh(IG2_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ig-music', async (req, res) => {
  const { audioId } = req.query;
  if (!audioId) return res.status(400).json({ error: 'Missing audioId' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(`https://${IG_HOST}/music?id=${audioId}`, { headers: rh(IG_HOST) });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ig-user', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Missing username' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(`https://${IG_HOST}/profile?username=${encodeURIComponent(username)}`, { headers: rh(IG_HOST) });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// IG post comments
app.get('/api/ig-comments', async (req, res) => {
  const { mediaCode, sortOrder = 'popular' } = req.query;
  if (!mediaCode) return res.status(400).json({ error: 'Missing mediaCode' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${IG2_HOST}/get_post_comments.php?media_code=${mediaCode}&sort_order=${sortOrder}`,
      { headers: rh(IG2_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// SCRAPTIK — search, hashtags, no-watermark download
// ════════════════════════════════════════════════════════════
app.get('/api/scraptik-search-users', async (req, res) => {
  const { keyword, count = 20, cursor = 0 } = req.query;
  if (!keyword) return res.status(400).json({ error: 'Missing keyword' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SCRAPTIK}/search-users?keyword=${encodeURIComponent(keyword)}&count=${count}&cursor=${cursor}`,
      { headers: rh(SCRAPTIK) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/scraptik-search-posts', async (req, res) => {
  const { keyword, count = 20, offset = 0 } = req.query;
  if (!keyword) return res.status(400).json({ error: 'Missing keyword' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SCRAPTIK}/search-posts?keyword=${encodeURIComponent(keyword)}&count=${count}&offset=${offset}&use_filters=0&publish_time=0&sort_type=0&region=US`,
      { headers: rh(SCRAPTIK) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/scraptik-search-hashtags', async (req, res) => {
  const { keyword, count = 20, cursor = 0 } = req.query;
  if (!keyword) return res.status(400).json({ error: 'Missing keyword' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SCRAPTIK}/search-hashtags?keyword=${encodeURIComponent(keyword)}&count=${count}&cursor=${cursor}`,
      { headers: rh(SCRAPTIK) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/scraptik-hashtag-posts', async (req, res) => {
  const { cid, count = 20, cursor = 0 } = req.query;
  if (!cid) return res.status(400).json({ error: 'Missing cid (challenge ID)' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SCRAPTIK}/hashtag-posts?cid=${cid}&count=${count}&cursor=${cursor}`,
      { headers: rh(SCRAPTIK) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/scraptik-music', async (req, res) => {
  const { music_id, region = 'US' } = req.query;
  if (!music_id) return res.status(400).json({ error: 'Missing music_id' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SCRAPTIK}/get-music?region=${region}&music_id=${music_id}`,
      { headers: rh(SCRAPTIK) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/scraptik-music-posts', async (req, res) => {
  const { music_id, count = 18, cursor = 0, region = 'US' } = req.query;
  if (!music_id) return res.status(400).json({ error: 'Missing music_id' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SCRAPTIK}/music-posts?music_id=${music_id}&count=${count}&cursor=${cursor}&region=${region}`,
      { headers: rh(SCRAPTIK) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// TikTok video without watermark
app.get('/api/tt-no-watermark', async (req, res) => {
  const { aweme_id } = req.query;
  if (!aweme_id) return res.status(400).json({ error: 'Missing aweme_id (video ID)' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SCRAPTIK}/video-without-watermark?aweme_id=${aweme_id}`,
      { headers: rh(SCRAPTIK) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Scraptik comments
app.get('/api/scraptik-comments', async (req, res) => {
  const { aweme_id, count = 10, cursor = 0, region = 'US' } = req.query;
  if (!aweme_id) return res.status(400).json({ error: 'Missing aweme_id' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SCRAPTIK}/list-comments?aweme_id=${aweme_id}&count=${count}&cursor=${cursor}&region=${region}`,
      { headers: rh(SCRAPTIK) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// YOUTUBE
// ════════════════════════════════════════════════════════════
app.get('/api/yt-video', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${YT_HOST}/videos?part=statistics%2Csnippet&id=${videoId}`,
      { headers: rh(YT_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// SHAZAM + SHAZAMCORE
// ════════════════════════════════════════════════════════════
app.get('/api/shazam-charts', async (req, res) => {
  const { country = 'US' } = req.query;
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SHZ_HOST}/charts/get-top-songs-in-country?country_code=${country}`,
      { headers: rh(SHZ_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/shazam-search', async (req, res) => {
  const { q, limit = 5 } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SHZ_HOST}/search?term=${encodeURIComponent(q)}&locale=en-US&offset=0&limit=${limit}`,
      { headers: rh(SHZ_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ShazamCore — total shazams for a track
app.get('/api/shazam-total', async (req, res) => {
  const { trackId } = req.query;
  if (!trackId) return res.status(400).json({ error: 'Missing trackId' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SHZC_HOST}/v1/tracks/total-shazams?track_id=${trackId}`,
      { headers: rh(SHZC_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ShazamCore — YouTube views for a track
app.get('/api/shazam-yt', async (req, res) => {
  const { trackId, name } = req.query;
  if (!trackId) return res.status(400).json({ error: 'Missing trackId' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${SHZC_HOST}/v1/tracks/youtube-video?track_id=${trackId}${name ? '&name=' + encodeURIComponent(name) : ''}`,
      { headers: rh(SHZC_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// APPLE MUSIC
// ════════════════════════════════════════════════════════════
app.get('/api/apple-track', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url (Apple Music track URL)' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${AM_HOST}/track/?url=${encodeURIComponent(decodeURIComponent(url))}`,
      { headers: rh(AM_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/apple-album', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url (Apple Music album URL)' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${AM_HOST}/playlist1/?url=${encodeURIComponent(decodeURIComponent(url))}`,
      { headers: rh(AM_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// MUSICFETCH — cross-platform lookup by ISRC/UPC/URL
// ════════════════════════════════════════════════════════════
app.get('/api/music-by-isrc', async (req, res) => {
  const { isrc, country = 'US' } = req.query;
  if (!isrc) return res.status(400).json({ error: 'Missing isrc' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${MF_HOST}/isrc?isrc=${isrc}&country=${country}`,
      { headers: rh(MF_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/music-by-url', async (req, res) => {
  const { url, country = 'US' } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url (Spotify/Apple/etc URL)' });
  if (!RAPID_KEY) return res.status(503).json({ error: 'RAPID_KEY not set' });
  try {
    const r = await fetch(
      `https://${MF_HOST}/url?url=${encodeURIComponent(decodeURIComponent(url))}&country=${country}`,
      { headers: rh(MF_HOST) }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// IMAGE PROXY — bypasses CDN cross-origin blocks
// ════════════════════════════════════════════════════════════
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');
  try {
    const r = await fetch(decodeURIComponent(url), {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.instagram.com/' }
    });
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    r.body.pipe(res);
  } catch (e) { res.status(500).send(e.message); }
});

// ════════════════════════════════════════════════════════════
// CHARTEX
// ════════════════════════════════════════════════════════════
app.get('/chartex/sounds', async (req, res) => {
  const { search, limit = 20 } = req.query;
  if (!search) return res.status(400).json({ error: 'Missing search' });
  try {
    const CX_ID    = process.env.CHARTEX_ID    || '';
    const CX_TOKEN = process.env.CHARTEX_TOKEN || '';
    const headers  = CX_ID ? { 'X-APP-ID': CX_ID, 'X-APP-TOKEN': CX_TOKEN } : {};
    const r = await fetch(
      `https://api.chartex.com/external/v1/sounds/?search=${encodeURIComponent(search)}&limit=${limit}`,
      { headers }
    );
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// SPOTIFY
// ════════════════════════════════════════════════════════════
let spCache = { token: null, expiry: 0 };
async function getSpToken() {
  if (spCache.token && Date.now() < spCache.expiry) return spCache.token;
  const id = process.env.SPOTIFY_ID, sec = process.env.SPOTIFY_SECRET;
  if (!id || !sec) return null;
  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${id}&client_secret=${sec}`
    });
    if (!r.ok) return null;
    const d = await r.json();
    spCache = { token: d.access_token, expiry: Date.now() + (d.expires_in - 60) * 1000 };
    return spCache.token;
  } catch { return null; }
}

app.get('/spotify/:path(*)', async (req, res) => {
  const token = await getSpToken();
  if (!token) return res.status(503).json({ error: 'Spotify not configured' });
  try {
    const qs = Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '';
    const r = await fetch(`https://api.spotify.com/v1/${req.params.path}${qs}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// AIRTABLE
// ════════════════════════════════════════════════════════════
const atH = () => ({ Authorization: `Bearer ${AT_KEY}`, 'Content-Type': 'application/json' });

app.get('/airtable/:table', async (req, res) => {
  if (!AT_KEY) return res.status(503).json({ error: 'AIRTABLE_KEY not set' });
  try {
    const qs = req.query.filterByFormula ? `?filterByFormula=${encodeURIComponent(req.query.filterByFormula)}` : '';
    const r = await fetch(`${AT_BASE}/${encodeURIComponent(req.params.table)}${qs}`, { headers: atH() });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/airtable/:table', async (req, res) => {
  if (!AT_KEY) return res.status(503).json({ error: 'AIRTABLE_KEY not set' });
  try {
    const r = await fetch(`${AT_BASE}/${encodeURIComponent(req.params.table)}`, {
      method: 'POST', headers: atH(), body: JSON.stringify({ fields: req.body })
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/airtable/:table/:id', async (req, res) => {
  if (!AT_KEY) return res.status(503).json({ error: 'AIRTABLE_KEY not set' });
  try {
    const r = await fetch(`${AT_BASE}/${encodeURIComponent(req.params.table)}/${req.params.id}`, {
      method: 'PATCH', headers: atH(), body: JSON.stringify({ fields: req.body })
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/airtable/:table/:id', async (req, res) => {
  if (!AT_KEY) return res.status(503).json({ error: 'AIRTABLE_KEY not set' });
  try {
    const r = await fetch(`${AT_BASE}/${encodeURIComponent(req.params.table)}/${req.params.id}`, {
      method: 'DELETE', headers: atH()
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// ANTHROPIC — Hey Jessi
// ════════════════════════════════════════════════════════════
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/ai/chat', async (req, res) => {
  const { messages, system } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });
  const sysPrompt = system || `You are Hey Jessi, the AI intelligence partner for Alicia Keys at Wirehouse Media.
You know AK's full catalog, streaming performance, TikTok sound analytics, campaign data (Con Cora Gala x Karol G, Plentiful ft. Pusha T, Hell's Kitchen Broadway), creator CRM, budget tracking, and social listening.
Be specific, data-driven, and actionable. Use real numbers from the conversation context.
Key facts: Spotify 36.6M monthly listeners, Instagram 28M followers, TikTok 8M followers, Girl on Fire 1.7M creates, Try Sleeping 4370+ creates from Con Cora Gala campaign.`;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 2048,
      system: sysPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    });
    res.json({ reply: response.content[0]?.text || '' });
  } catch (e) {
    console.error('[AI]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
// SPA — serve index.html for all routes (hash routing)
// ════════════════════════════════════════════════════════════
app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`AK Intelligence running on port ${PORT}`));
