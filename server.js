import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HF_BASE = "https://api.higgsfield.ai";
const HF_API_KEY = process.env.HF_API_KEY;

const MODELS = {
  motion: "higgsfiled/genjutsu/motion-transfer/v1.0",
  object: "higgsfiled/genjutsu/object-swap/v1.0"
};

app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

function authHeaders() {
  if (!HF_API_KEY) throw new Error("HF_API_KEY is missing. Add the complete Higgsfield API key in Render → Environment Variables.");
  return {
    Authorization: `Key ${HF_API_KEY}`,
    "Content-Type": "application/json"
  };
}

async function hfFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || data?.raw || `Higgsfield HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(HF_API_KEY),
    models: MODELS
  });
});

/**
 * Returns a signed upload URL. The browser then uploads directly to that URL.
 */
app.post("/api/upload-url", async (req, res) => {
  try {
    const contentType = String(req.body?.contentType || "");
    if (!contentType) return res.status(400).json({ error: "contentType is required" });

    const data = await hfFetch(`${HF_BASE}/files/generate-upload-url`, {
      method: "POST",
      body: JSON.stringify({ content_type: contentType })
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Start a Genjutsu generation.
 */
app.post("/api/generate", async (req, res) => {
  try {
    const { mode, prompt = "", videoUrl, imageUrls = [], resolution = "720p" } = req.body || {};

    if (!MODELS[mode]) return res.status(400).json({ error: "Invalid mode" });
    if (!videoUrl) return res.status(400).json({ error: "videoUrl is required" });
    if (!Array.isArray(imageUrls) || imageUrls.length > 8) {
      return res.status(400).json({ error: "Use up to 8 reference images" });
    }
    if (!["480p", "720p", "1080p"].includes(resolution)) {
      return res.status(400).json({ error: "Invalid resolution" });
    }

    const data = await hfFetch(`${HF_BASE}/${MODELS[mode]}`, {
      method: "POST",
      body: JSON.stringify({
        prompt: String(prompt).slice(0, 10000),
        video_url: videoUrl,
        image_urls: imageUrls,
        resolution
      })
    });

    res.json({
      ...data,
      model: MODELS[mode],
      mode
    });
  } catch (error) {
    const status = /Higgsfield HTTP 4\d\d/.test(error.message) ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * Poll a request by request_id.
 */
app.get("/api/status/:requestId", async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.requestId);
    const data = await hfFetch(`${HF_BASE}/requests/${id}/status`, {
      method: "GET",
      headers: { "Content-Type": undefined }
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cancel a generation.
 */
app.post("/api/cancel/:requestId", async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.requestId);
    const data = await hfFetch(`${HF_BASE}/requests/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({})
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Genjutsu Studio running at http://localhost:${PORT}`);
});
