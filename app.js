const state = {
  mode: "motion",
  resolution: "720p",
  video: null,
  refs: [],
  requestId: null,
  timer: null
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const videoInput = $("#videoInput");
const imageInput = $("#imageInput");
const videoDrop = $("#videoDrop");
const videoPreview = $("#videoPreview");
const videoEl = videoPreview.querySelector("video");
const videoMeta = $("#videoMeta");
const thumbs = $("#thumbs");
const prompt = $("#prompt");
const generateBtn = $("#generateBtn");
const cancelBtn = $("#cancelBtn");
const resultEmpty = $("#resultEmpty");
const resultLoading = $("#resultLoading");
const resultVideo = $("#resultVideo");
const outputVideo = $("#outputVideo");
const errorBox = $("#error");

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}
function clearError() {
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
}
function setBusy(busy) {
  generateBtn.disabled = busy;
  cancelBtn.classList.toggle("hidden", !busy);
}
function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function updateModeUI() {
  const motion = state.mode === "motion";
  $("#title").textContent = motion ? "Motion Transfer" : "Object Swap";
  $("#description").textContent = motion
    ? "Preserve the motion, camera movement and timing while rebuilding the scene around your references."
    : "Replace a character, product, clothing or other element while preserving the rest of the shot.";
  $("#modelName").textContent = motion ? "Genjutsu Motion Transfer" : "Genjutsu Object Swap";
  $$(".mode").forEach(b => b.classList.toggle("active", b.dataset.mode === state.mode));
}

async function checkApi() {
  try {
    const r = await fetch("/api/health");
    const d = await r.json();
    $("#apiDot").classList.toggle("ok", d.configured);
    $("#apiDot").classList.toggle("bad", !d.configured);
    $("#apiStatus").textContent = d.configured ? "API ready" : "API key missing";
  } catch {
    $("#apiDot").classList.add("bad");
    $("#apiStatus").textContent = "Server offline";
  }
}

videoInput.addEventListener("change", () => {
  const file = videoInput.files?.[0];
  if (file) setVideo(file);
});

function setVideo(file) {
  clearError();
  state.video = file;
  videoEl.src = URL.createObjectURL(file);
  videoPreview.classList.remove("hidden");
  videoDrop.classList.add("hidden");
  $("#videoCounter").textContent = "1 / 1";
  videoMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
}

$("#removeVideo").addEventListener("click", () => {
  state.video = null;
  videoEl.removeAttribute("src");
  videoPreview.classList.add("hidden");
  videoDrop.classList.remove("hidden");
  videoInput.value = "";
  $("#videoCounter").textContent = "0 / 1";
});

imageInput.addEventListener("change", () => {
  const incoming = [...imageInput.files];
  for (const file of incoming) {
    if (state.refs.length >= 8) break;
    state.refs.push(file);
  }
  imageInput.value = "";
  renderRefs();
});

function renderRefs() {
  thumbs.innerHTML = "";
  state.refs.forEach((file, i) => {
    const wrap = document.createElement("div");
    wrap.className = "thumb";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.onclick = () => {
      state.refs.splice(i, 1);
      renderRefs();
    };
    wrap.append(img, btn);
    thumbs.appendChild(wrap);
  });
  $("#refCount").textContent = state.refs.length;
}

$$(".mode").forEach(btn => {
  btn.addEventListener("click", () => {
    state.mode = btn.dataset.mode;
    updateModeUI();
  });
});

$$("[data-res]").forEach(btn => {
  btn.addEventListener("click", () => {
    state.resolution = btn.dataset.res;
    $$("[data-res]").forEach(x => x.classList.toggle("active", x === btn));
  });
});

prompt.addEventListener("input", () => {
  $("#charCount").textContent = `${prompt.value.length.toLocaleString()} / 10,000`;
});

$$(".prompt-suggestions button").forEach(btn => {
  btn.addEventListener("click", () => {
    prompt.value = prompt.value ? `${prompt.value}\n${btn.dataset.prompt}` : btn.dataset.prompt;
    prompt.dispatchEvent(new Event("input"));
  });
});

["dragenter","dragover"].forEach(type => {
  videoDrop.addEventListener(type, e => {
    e.preventDefault();
    videoDrop.style.borderColor = "#777";
  });
});
["dragleave","drop"].forEach(type => {
  videoDrop.addEventListener(type, e => {
    e.preventDefault();
    videoDrop.style.borderColor = "";
  });
});
videoDrop.addEventListener("drop", e => {
  const file = [...e.dataTransfer.files].find(f => f.type.startsWith("video/"));
  if (file) setVideo(file);
});

async function getUploadUrl(file) {
  const r = await fetch("/api/upload-url", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({contentType: file.type})
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Could not create upload URL");
  return data;
}

async function uploadToSignedUrl(file) {
  const signed = await getUploadUrl(file);
  const headers = signed.upload_headers || signed.headers || {};
  const put = await fetch(signed.upload_url, {
    method: "PUT",
    headers,
    body: file
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return signed.public_url;
}

async function generate() {
  clearError();
  if (!state.video) return showError("Add a source video first.");
  if (state.refs.length === 0) return showError("Add at least one reference image.");

  setBusy(true);
  resultEmpty.classList.add("hidden");
  resultVideo.classList.add("hidden");
  resultLoading.classList.remove("hidden");
  $("#resultStatus").textContent = "Uploading";
  $("#loadingText").textContent = "Uploading your references…";
  $("#loadingSub").textContent = "Files are sent directly to the media storage.";

  try {
    const videoUrl = await uploadToSignedUrl(state.video);
    const imageUrls = [];
    for (let i = 0; i < state.refs.length; i++) {
      $("#loadingText").textContent = `Uploading reference ${i + 1} of ${state.refs.length}…`;
      imageUrls.push(await uploadToSignedUrl(state.refs[i]));
    }

    $("#resultStatus").textContent = "Queued";
    $("#loadingText").textContent = "Starting generation…";

    const r = await fetch("/api/generate", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        mode: state.mode,
        resolution: state.resolution,
        prompt: prompt.value,
        videoUrl,
        imageUrls
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Generation request failed");

    state.requestId = data.request_id;
    if (!state.requestId) {
      // Some SDK/workflow responses can return a completed result immediately.
      const url = data.video?.url || data.output?.video?.url;
      if (url) return finish(url);
      throw new Error("No request_id returned by the provider.");
    }
    poll();
  } catch (err) {
    finishError(err.message);
  }
}

async function poll() {
  if (!state.requestId) return;
  try {
    const r = await fetch(`/api/status/${encodeURIComponent(state.requestId)}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Status request failed");

    const status = data.status || "in_progress";
    $("#resultStatus").textContent = status.replaceAll("_"," ");

    if (status === "completed") {
      const url = data.video?.url || data.output?.video?.url || data.result?.video?.url;
      if (!url) throw new Error("Generation completed but no video URL was returned.");
      return finish(url);
    }

    if (["failed","nsfw","canceled","cancelled"].includes(status)) {
      throw new Error(data.error?.message || data.error || `Generation ${status}`);
    }

    $("#loadingText").textContent =
      status === "queued" ? "Waiting in the generation queue…" : "Rendering your video…";
    $("#loadingSub").textContent = "You can leave this page open while the model works.";

    state.timer = setTimeout(poll, 2500);
  } catch (err) {
    finishError(err.message);
  }
}

function finish(url) {
  clearTimeout(state.timer);
  setBusy(false);
  state.requestId = null;
  resultLoading.classList.add("hidden");
  resultVideo.classList.remove("hidden");
  $("#resultStatus").textContent = "Completed";
  outputVideo.src = url;
  $("#downloadBtn").href = url;
}

function finishError(message) {
  clearTimeout(state.timer);
  setBusy(false);
  state.requestId = null;
  resultLoading.classList.add("hidden");
  resultEmpty.classList.remove("hidden");
  $("#resultStatus").textContent = "Error";
  showError(message);
}

generateBtn.addEventListener("click", generate);

cancelBtn.addEventListener("click", async () => {
  if (!state.requestId) return;
  try {
    await fetch(`/api/cancel/${encodeURIComponent(state.requestId)}`, {method:"POST"});
  } catch {}
  finishError("Generation canceled.");
});

updateModeUI();
checkApi();
