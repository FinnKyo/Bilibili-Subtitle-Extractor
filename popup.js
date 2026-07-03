const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const subtitleListEl = document.getElementById("subtitleList");
const reloadButton = document.getElementById("reloadButton");

const SUPPORTED_PAGE = /^https:\/\/www\.bilibili\.com\/video\//i;
const API_ENDPOINTS = [
  "https://api.bilibili.com/x/player/wbi/v2",
  "https://api.bilibili.com/x/player/v2",
];
const VIEW_API_ENDPOINT = "https://api.bilibili.com/x/web-interface/view";
let extractionRunId = 0;

document.addEventListener("DOMContentLoaded", () => {
  reloadButton.addEventListener("click", extractSubtitles);
  extractSubtitles();
});

async function extractSubtitles() {
  const runId = ++extractionRunId;
  setStatus("正在读取当前页面...", "neutral");
  renderEmptyState("正在读取字幕...");
  setMeta("");
  reloadButton.disabled = true;

  try {
    const tab = await getActiveTab();

    if (!isCurrentRun(runId)) {
      return;
    }

    const pageUrl = await getCurrentTabUrl(tab);

    if (!isCurrentRun(runId)) {
      return;
    }

    if (!tab?.id || !SUPPORTED_PAGE.test(pageUrl)) {
      setStatus("请在 Bilibili 视频页面打开插件。", "error");
      renderEmptyState("当前页面不支持。请打开 https://www.bilibili.com/video/... 视频页后再点击插件。");
      return;
    }

    const result = await buildSubtitleTracks(pageUrl);

    if (!isCurrentRun(runId)) {
      return;
    }

    if (!result.tracks.length) {
      setStatus("当前视频没有可用字幕。", "error");
      renderEmptyState("当前视频没有可用字幕。");
      return;
    }

    renderSubtitleCards(result.tracks);
    setStatus(`已找到 ${result.trackCount || 0} 条字幕轨道。`, result.successCount ? "success" : "error");
    setMeta(result.title ? truncate(result.title, 34) : "");
  } catch (error) {
    if (!isCurrentRun(runId)) {
      return;
    }

    const message = friendlyError(error);
    setStatus(message, "error");
    renderEmptyState(message);
  } finally {
    if (isCurrentRun(runId)) {
      reloadButton.disabled = false;
    }
  }
}

function isCurrentRun(runId) {
  return runId === extractionRunId;
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

async function getCurrentTabUrl(tab) {
  if (!tab?.id) {
    return tab?.url || "";
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.location.href,
    });
    return results?.[0]?.result || tab.url || "";
  } catch {
    return tab.url || "";
  }
}

async function buildSubtitleTracks(pageUrl) {
  const video = await resolveCurrentVideo(pageUrl);
  const tracks = dedupeTracks(await fetchSubtitleTracks(video));

  if (!tracks.length) {
    return { tracks: [], trackCount: 0, successCount: 0, title: video.title || "" };
  }

  const subtitleTracks = await Promise.all(tracks.map((track, index) => buildSubtitleTrack(track, index)));
  const successfulTracks = subtitleTracks.filter((track) => track.ok);
  const failedTracks = subtitleTracks.filter((track) => !track.ok);
  const visibleTracks = successfulTracks.length ? successfulTracks : failedTracks;

  return {
    tracks: visibleTracks,
    trackCount: successfulTracks.length || tracks.length,
    successCount: successfulTracks.length,
    title: video.title || "",
  };
}

async function resolveCurrentVideo(pageUrl) {
  const video = {
    bvid: parseBvid(pageUrl),
    aid: parseAid(pageUrl),
    page: getCurrentPageFromUrl(pageUrl),
    title: "",
    cid: "",
  };

  if (!video.bvid && !video.aid) {
    return video;
  }

  const params = new URLSearchParams();

  if (video.bvid) {
    params.set("bvid", video.bvid);
  } else {
    params.set("aid", video.aid);
  }
  params.set("_", String(Date.now()));

  try {
    const response = await fetch(`${VIEW_API_ENDPOINT}?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      return video;
    }

    const json = await response.json();
    const data = json?.data || {};
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const matchedPage = pages.find((page) => Number(page.page) === Number(video.page));
    const fallbackPage = pages[video.page - 1] || pages[0];

    return {
      ...video,
      aid: data.aid || video.aid,
      bvid: data.bvid || video.bvid,
      cid: matchedPage?.cid || fallbackPage?.cid || data.cid || video.cid,
      title: data.title || video.title,
    };
  } catch {
    return video;
  }
}

async function fetchSubtitleTracks(video) {
  if (!video.cid || (!video.bvid && !video.aid)) {
    return [];
  }

  const params = new URLSearchParams({ cid: String(video.cid) });

  if (video.bvid) {
    params.set("bvid", String(video.bvid));
  } else if (video.aid) {
    params.set("aid", String(video.aid));
  }
  params.set("_", String(Date.now()));

  for (const endpoint of API_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        continue;
      }

      const json = await response.json();
      const subtitleResult = getPlayerSubtitleResult(json);

      if (subtitleResult.found) {
        return subtitleResult.tracks;
      }
    } catch {
      // Try the next endpoint.
    }
  }

  return [];
}

async function buildSubtitleTrack(track, index) {
  const label = buildTrackLabel(track, index);
  const language = getTrackLanguage(track, index);
  const isAutoGenerated = isAutoGeneratedTrack(track, language);
  const url = getSubtitleUrl(track);

  if (!url) {
    return {
      ok: false,
      label,
      language,
      isAutoGenerated,
      lineCount: 0,
      timedText: "",
      plainText: "",
      error: "字幕地址为空，无法读取",
    };
  }

  try {
    const response = await fetch(url, { credentials: "include", cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await readJsonResponse(response);
    const items = normalizeSubtitleBody(json);

    if (!items.length) {
      return {
        ok: false,
        label,
        language,
        isAutoGenerated,
        lineCount: 0,
        timedText: "",
        plainText: "",
        error: "字幕内容为空",
      };
    }

    const lines = items.map((item) => {
      const from = formatTime(item.from);
      const to = formatTime(item.to);
      const content = cleanSubtitleText(item.content);
      return `[${from} - ${to}] ${content}`;
    });
    const plainText = items.map((item) => cleanSubtitleText(item.content)).filter(Boolean).join("\n");

    return {
      ok: true,
      label,
      language,
      isAutoGenerated,
      lineCount: items.length,
      timedText: `## ${label}\n${lines.join("\n")}`,
      plainText,
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      label,
      language,
      isAutoGenerated,
      lineCount: 0,
      timedText: "",
      plainText: "",
      error: `字幕读取失败：${error?.message || "未知错误"}`,
    };
  }
}

function normalizeTracks(value) {
  return (Array.isArray(value) ? value : [])
    .filter((track) => track && typeof track === "object")
    .map((track) => ({
      ...track,
      subtitle_url: getSubtitleUrl(track),
    }))
    .filter((track) => track.subtitle_url || track.lan || track.lan_doc);
}

function getPlayerSubtitleResult(json) {
  if (json?.code !== 0 || !json?.data || typeof json.data !== "object") {
    return { found: false, tracks: [] };
  }

  if ("subtitle" in json.data) {
    return {
      found: true,
      tracks: normalizeTracks(json.data.subtitle?.subtitles || []),
    };
  }

  return { found: false, tracks: [] };
}

function dedupeTracks(tracks) {
  const sortedTracks = normalizeTracks(tracks).sort((a, b) => {
    return Number(Boolean(getSubtitleUrl(b))) - Number(Boolean(getSubtitleUrl(a)));
  });
  const seenUrls = new Set();
  const seenLanguagesWithUrl = new Set();
  const result = [];

  for (const track of sortedTracks) {
    const url = getSubtitleUrl(track);
    const languageKey = cleanSubtitleText(track.lan_doc || track.language || track.lan).toLowerCase();

    if (url) {
      if (seenUrls.has(url)) {
        continue;
      }

      seenUrls.add(url);
      seenLanguagesWithUrl.add(languageKey);
      result.push(track);
      continue;
    }

    if (!languageKey || !seenLanguagesWithUrl.has(languageKey)) {
      result.push(track);
    }
  }

  return result;
}

function normalizeSubtitleBody(json) {
  const body = json?.body || json?.data?.body || json?.result?.body || [];

  if (!Array.isArray(body)) {
    return [];
  }

  return body
    .map((item) => ({
      from: Number(item.from),
      to: Number(item.to),
      content: cleanSubtitleText(item.content),
    }))
    .filter((item) => Number.isFinite(item.from) && Number.isFinite(item.to) && item.content);
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  if (/^\s*</.test(text)) {
    throw new Error("返回的是网页，不是字幕 JSON");
  }

  return JSON.parse(text);
}

function normalizeSubtitleUrl(url) {
  if (!url || typeof url !== "string") {
    return "";
  }

  const trimmedUrl = url.trim();

  if (trimmedUrl.startsWith("//")) {
    return `https:${trimmedUrl}`;
  }

  if (/^http:\/\/[^/]*(hdslb|bilivideo)\.com\//i.test(trimmedUrl)) {
    return trimmedUrl.replace(/^http:\/\//i, "https://");
  }

  if (trimmedUrl.startsWith("/")) {
    return `https://www.bilibili.com${trimmedUrl}`;
  }

  return trimmedUrl;
}

function parseBvid(url) {
  const match = String(url || "").match(/\/video\/(BV[a-zA-Z0-9]+)/);
  return match?.[1] || "";
}

function parseAid(url) {
  const match = String(url || "").match(/\/video\/av(\d+)/i);
  return match?.[1] || "";
}

function getCurrentPageFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const page = Number(parsedUrl.searchParams.get("p"));
    return Number.isFinite(page) && page > 0 ? page : 1;
  } catch {
    return 1;
  }
}

function getSubtitleUrl(track) {
  if (!track || typeof track !== "object") {
    return "";
  }

  return normalizeSubtitleUrl(
    track.subtitle_url ||
      track.subtitleUrl ||
      track.ai_subtitle_url ||
      track.aiSubtitleUrl ||
      "",
  );
}

function getTrackLanguage(track, index) {
  return cleanSubtitleText(track.lan_doc || track.language || track.lan) || `字幕 ${index + 1}`;
}

function buildTrackLabel(track, index) {
  const language = getTrackLanguage(track, index);
  const autoGenerated = isAutoGeneratedTrack(track, language);
  return autoGenerated && !/自动|AI/i.test(language) ? `${language}（自动生成）` : language;
}

function isAutoGeneratedTrack(track, language) {
  return (
    track.ai_status === 2 ||
    track.ai_type === 1 ||
    track.type === "ai" ||
    /自动|AI/i.test(language || "")
  );
}

function cleanSubtitleText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const centiseconds = Math.floor((safeSeconds % 1) * 100);
  return `${pad(minutes)}:${pad(wholeSeconds)}.${pad(centiseconds)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function renderSubtitleCards(tracks) {
  subtitleListEl.textContent = "";

  tracks.forEach((track, index) => {
    const card = document.createElement("article");
    const bodyId = `subtitle-card-body-${index}`;
    const isExpanded = index === 0;
    card.className = `subtitle-card${track.ok ? "" : " error"}${isExpanded ? " expanded" : ""}`;

    const header = document.createElement("button");
    header.className = "subtitle-card-header";
    header.type = "button";
    header.setAttribute("aria-expanded", String(isExpanded));
    header.setAttribute("aria-controls", bodyId);

    const title = document.createElement("div");
    title.className = "subtitle-card-title";

    const name = document.createElement("div");
    name.className = "subtitle-card-name";
    name.textContent = track.label;

    const meta = document.createElement("div");
    meta.className = "subtitle-card-meta";

    const typeBadge = document.createElement("span");
    typeBadge.className = `badge ${track.ok ? (track.isAutoGenerated ? "" : "manual") : "error"}`;
    typeBadge.textContent = track.ok
      ? track.isAutoGenerated
        ? "自动生成"
        : "自带字幕"
      : "读取失败";

    const count = document.createElement("span");
    count.textContent = track.ok ? `${track.lineCount} 行` : track.error;

    meta.append(typeBadge, count);
    title.append(name, meta);

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "›";
    chevron.setAttribute("aria-hidden", "true");

    header.append(title, chevron);
    header.addEventListener("click", () => {
      const expanded = card.classList.toggle("expanded");
      header.setAttribute("aria-expanded", String(expanded));
    });

    const body = document.createElement("div");
    body.className = "subtitle-card-body";
    body.id = bodyId;

    if (track.ok) {
      const actions = document.createElement("div");
      actions.className = "card-actions";

      const copyTimedButton = document.createElement("button");
      copyTimedButton.className = "secondary-button";
      copyTimedButton.type = "button";
      copyTimedButton.textContent = "复制带时间轴";

      const copyPlainButton = document.createElement("button");
      copyPlainButton.className = "secondary-button";
      copyPlainButton.type = "button";
      copyPlainButton.textContent = "复制纯文本";

      const textarea = document.createElement("textarea");
      textarea.className = "subtitle-text";
      textarea.readOnly = true;
      textarea.spellcheck = false;
      textarea.value = track.timedText;

      copyTimedButton.addEventListener("click", () => {
        copySubtitle(track.timedText, `${track.label}（带时间轴）`, textarea);
      });
      copyPlainButton.addEventListener("click", () => {
        copySubtitle(track.plainText, `${track.label}（纯文本）`, textarea);
      });

      actions.append(copyTimedButton, copyPlainButton);
      body.append(actions, textarea);
    } else {
      const error = document.createElement("p");
      error.className = "error-text";
      error.textContent = track.error || "字幕读取失败。";
      body.append(error);
    }

    card.append(header, body);
    subtitleListEl.append(card);
  });
}

function renderEmptyState(message) {
  subtitleListEl.textContent = "";
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";
  emptyState.textContent = message;
  subtitleListEl.append(emptyState);
}

async function copySubtitle(text, label, textarea) {
  const subtitleText = String(text || "").trim();

  if (!subtitleText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(subtitleText);
    setStatus(`${label}已复制。`, "success");
  } catch {
    if (textarea) {
      textarea.focus();
      textarea.select();
    }
    setStatus("复制失败，请按 Cmd/Ctrl + C 手动复制。", "error");
  }
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.classList.toggle("success", type === "success");
  statusEl.classList.toggle("error", type === "error");
}

function setMeta(text) {
  metaEl.textContent = text;
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function friendlyError(error) {
  const message = error?.message || String(error || "");

  if (/Cannot access contents|permission|host permission/i.test(message)) {
    return "插件没有访问当前页面的权限，请刷新 Bilibili 页面后再试。";
  }

  return message || "抽取字幕失败。";
}
