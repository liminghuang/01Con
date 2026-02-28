function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data?.output)) {
    const chunks = [];
    for (const item of data.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === "string" && c.text.trim()) {
            chunks.push(c.text.trim());
          }
        }
      }
    }
    if (chunks.length > 0) {
      return chunks.join("\n\n");
    }
  }

  return "";
}

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

function renderPromptTemplate(promptTemplate, threadData, joinedPosts) {
  let output = (promptTemplate || "").trim() || DEFAULT_PROMPT_TEMPLATE;
  const replacements = {
    "{{title}}": threadData.title || "",
    "{{scannedPages}}": String(threadData.scannedPages ?? ""),
    "{{totalPages}}": String(threadData.totalPages ?? ""),
    "{{postCount}}": String(threadData.posts?.length ?? 0),
    "{{posts}}": joinedPosts
  };

  for (const [key, value] of Object.entries(replacements)) {
    output = output.split(key).join(value);
  }

  return output;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "summarizeWithOpenAI") {
    return false;
  }

  (async () => {
    try {
      const { apiKey, model, promptTemplate, threadData } = message;
      if (!apiKey || !threadData?.posts?.length) {
        throw new Error("缺少 API Key 或文章內容");
      }

      const joinedPosts = threadData.posts
        .map((txt, idx) => `[${idx + 1}] ${txt}`)
        .join("\n\n");

      const prompt = renderPromptTemplate(promptTemplate, threadData, joinedPosts);

      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: "請忠於使用者提供內容，不要捏造不存在的結論；若內容疑似網軍或行銷廣告，請標示為可疑並從最終建議排除。"
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: prompt
                }
              ]
            }
          ],
          temperature: 0.2,
          max_output_tokens: 900
        })
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.message || `HTTP ${res.status}`;
        throw new Error(`OpenAI API 失敗: ${detail}`);
      }

      const summary = extractOutputText(data);
      if (!summary) {
        throw new Error("AI 回傳為空");
      }

      sendResponse({ ok: true, summary });
    } catch (err) {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  })();

  return true;
});
