const apiKeyInput = document.getElementById("apiKey");
const modelSelect = document.getElementById("modelSelect");
const customModelWrap = document.getElementById("customModelWrap");
const customModelInput = document.getElementById("customModel");
const promptTemplateInput = document.getElementById("promptTemplate");
const saveBtn = document.getElementById("saveBtn");
const summarizeBtn = document.getElementById("summarizeBtn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

const MAX_PAGES = 50;
const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_PROMPT_TEMPLATE = [
  "你是專業論壇內容分析助理。請用繁體中文整理以下 Mobile01 討論串內容。",
  "在整理前，請先判斷每則貼文是否有明顯網軍帶風向、業配、行銷廣告、洗文或不自然推銷傾向。",
  "若判定為可疑，請將該則內容從共識與結論中排除，不要把它當作有效建議。",
  "判斷請保守且以內容線索為主，避免無根據指控。",
  "輸出格式：",
  "1) 三行摘要",
  "2) 主要共識（條列）",
  "3) 爭議與不同觀點（條列）",
  "4) 給讀者的結論建議（條列，需排除可疑網軍/廣告內容）",
  "5) 可疑網軍/行銷內容觀察（條列：寫出可疑特徵與貼文編號；若無則寫「未發現明顯可疑內容」）",
  "",
  "討論串標題: {{title}}",
  "抓取頁數: {{scannedPages}}/{{totalPages}}",
  "貼文數: {{postCount}}",
  "",
  "以下是貼文內容：",
  "{{posts}}"
].join("\n");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function setBusy(busy) {
  saveBtn.disabled = busy;
  summarizeBtn.disabled = busy;
}

function toggleCustomModelInput() {
  customModelWrap.classList.toggle("hidden", modelSelect.value !== "custom");
}

function getSelectedModel() {
  if (modelSelect.value === "custom") {
    return customModelInput.value.trim() || DEFAULT_MODEL;
  }
  return modelSelect.value || DEFAULT_MODEL;
}

function applySavedModel(savedModel) {
  const model = (savedModel || "").trim() || DEFAULT_MODEL;
  const isInPreset = Array.from(modelSelect.options).some((opt) => opt.value === model);

  if (isInPreset) {
    modelSelect.value = model;
    customModelInput.value = "";
  } else {
    modelSelect.value = "custom";
    customModelInput.value = model;
  }

  toggleCustomModelInput();
}

function getPromptTemplate() {
  return promptTemplateInput.value.trim() || DEFAULT_PROMPT_TEMPLATE;
}

async function collectThreadData(maxPages) {
  const MAX_POSTS = 300;
  const MAX_POST_CHARS = 1000;
  const MAX_TOTAL_CHARS = 120000;

  function cleanText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function createPageUrl(baseUrl, page) {
    const url = new URL(baseUrl);

    if (page <= 1) {
      url.searchParams.delete("p");
      url.searchParams.delete("page");
      return url.toString();
    }

    if (url.searchParams.has("p")) {
      url.searchParams.set("p", String(page));
    } else if (url.searchParams.has("page")) {
      url.searchParams.set("page", String(page));
    } else {
      url.searchParams.set("p", String(page));
    }

    return url.toString();
  }

  function detectTotalPages(doc) {
    let maxPage = 1;
    const anchors = doc.querySelectorAll("a[href]");

    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/[?&](?:p|page)=(\d{1,4})\b/);
      if (m) {
        maxPage = Math.max(maxPage, Number(m[1]));
      }

      const txt = cleanText(a.textContent || "");
      if (/^\d{1,4}$/.test(txt)) {
        maxPage = Math.max(maxPage, Number(txt));
      }
    }

    return Math.max(1, maxPage);
  }

  function extractPostsFromDoc(doc) {
    const selectors = [
      ".single-post-content",
      "[itemprop='articleBody']",
      ".c-article__content",
      ".post-content",
      ".article-content",
      ".message-content",
      "article .content",
      ".content"
    ];

    for (const selector of selectors) {
      const nodes = Array.from(doc.querySelectorAll(selector));
      const texts = nodes
        .map((el) => cleanText(el.innerText || el.textContent || ""))
        .filter((t) => t.length > 30);

      if (texts.length >= 2) {
        return texts;
      }
    }

    const fallbackNodes = Array.from(doc.querySelectorAll("article, .l-articlePage, .l-main"));
    const fallbackTexts = fallbackNodes
      .map((el) => cleanText(el.innerText || el.textContent || ""))
      .filter((t) => t.length > 50)
      .slice(0, 20);

    return fallbackTexts;
  }

  const baseUrl = window.location.href;
  const firstDoc = document;
  const title = cleanText(firstDoc.title || "Mobile01 討論串");
  const detectedPages = detectTotalPages(firstDoc);
  const totalPages = Math.min(detectedPages, maxPages);

  let totalChars = 0;
  const allPosts = [];
  const seen = new Set();

  for (let page = 1; page <= totalPages; page += 1) {
    const pageUrl = createPageUrl(baseUrl, page);

    let doc = firstDoc;
    if (page > 1) {
      const res = await fetch(pageUrl, { credentials: "include" });
      if (!res.ok) {
        continue;
      }
      const html = await res.text();
      doc = new DOMParser().parseFromString(html, "text/html");
    }

    const pagePosts = extractPostsFromDoc(doc);
    for (const rawText of pagePosts) {
      const text = rawText.slice(0, MAX_POST_CHARS);
      if (!text || seen.has(text)) {
        continue;
      }

      if (allPosts.length >= MAX_POSTS || totalChars + text.length > MAX_TOTAL_CHARS) {
        return {
          title,
          totalPages,
          scannedPages: page,
          posts: allPosts,
          truncated: true
        };
      }

      seen.add(text);
      allPosts.push(text);
      totalChars += text.length;
    }
  }

  return {
    title,
    totalPages,
    scannedPages: totalPages,
    posts: allPosts,
    truncated: false
  };
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(["openaiApiKey", "openaiModel", "openaiPromptTemplate"]);
  if (saved.openaiApiKey) {
    apiKeyInput.value = saved.openaiApiKey;
  }
  applySavedModel(saved.openaiModel);
  promptTemplateInput.value = (saved.openaiPromptTemplate || "").trim() || DEFAULT_PROMPT_TEMPLATE;
}

saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  const model = getSelectedModel();
  const promptTemplate = getPromptTemplate();

  await chrome.storage.local.set({
    openaiApiKey: apiKey,
    openaiModel: model,
    openaiPromptTemplate: promptTemplate
  });

  setStatus("已儲存。");
});

summarizeBtn.addEventListener("click", async () => {
  resultEl.textContent = "";

  const apiKey = apiKeyInput.value.trim();
  const model = getSelectedModel();
  const promptTemplate = getPromptTemplate();

  if (!apiKey) {
    setStatus("請先輸入 OpenAI API Key。");
    return;
  }

  setBusy(true);

  try {
    setStatus("正在抓取討論串所有頁面...");

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) {
      throw new Error("找不到目前分頁。");
    }

    const url = new URL(tab.url);
    if (url.hostname !== "www.mobile01.com") {
      throw new Error("請先切換到 Mobile01 討論串頁面。");
    }

    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectThreadData,
      args: [MAX_PAGES]
    });

    const threadData = injection?.[0]?.result;
    if (!threadData || !Array.isArray(threadData.posts) || threadData.posts.length === 0) {
      throw new Error("無法抓到文章內容，請確認目前頁面是討論串內容頁。\n若版型改版，可再調整 selector。");
    }

    setStatus(`已抓取 ${threadData.posts.length} 則內容，AI 生成中...`);

    const response = await chrome.runtime.sendMessage({
      type: "summarizeWithOpenAI",
      apiKey,
      model,
      promptTemplate,
      threadData
    });

    if (!response?.ok) {
      throw new Error(response?.error || "AI 生成失敗");
    }

    const header = [
      `標題: ${threadData.title}`,
      `頁數: ${threadData.scannedPages}/${threadData.totalPages}${threadData.truncated ? "（已截斷）" : ""}`,
      `文章數: ${threadData.posts.length}`,
      ""
    ].join("\n");

    resultEl.textContent = `${header}${response.summary}`;
    setStatus("完成。");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`錯誤: ${msg}`);
  } finally {
    setBusy(false);
  }
});

modelSelect.addEventListener("change", () => {
  toggleCustomModelInput();
});

loadSettings().catch((err) => {
  setStatus(`讀取設定失敗: ${err.message || err}`);
});
