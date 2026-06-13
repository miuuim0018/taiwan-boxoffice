"""使用 Gemini 產生電影避雷／推薦一句話總結。"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from scripts.config import DATA_FILES, MOVIES, ROOT

load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / "文字雲" / ".env")


def _get_api_key() -> str | None:
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")


def _fallback_summary(analysis: dict) -> dict:
    name = analysis["name"]
    sent = analysis["sentiment_zh"]
    top = "、".join(w for w, _ in analysis["top_words"][:5])
    neg = "、".join(w for w, _ in analysis["negative_words"][:3])
    pos = "、".join(w for w, _ in analysis["positive_words"][:3])

    if analysis["sentiment"] == "negative":
        summary = f"《{name}》鄉民評價偏雷，常見負評包括「{neg or top}」。建議先看影評再買票。"
        verdict = "避雷"
    elif analysis["sentiment"] == "positive":
        summary = f"《{name}》口碑不錯，討論熱詞有「{pos or top}」。整體偏推薦。"
        verdict = "推薦"
    else:
        summary = f"《{name}》評價兩極，有人讚「{pos}」，也有人嫌「{neg}」。見仁見智。"
        verdict = "見仁見智"

    return {
        "summary": summary[:80],
        "verdict": verdict,
        "sentiment": analysis["sentiment"],
        "source": "rule_based",
    }


def summarize_with_gemini(analysis: dict, use_ai: bool = True) -> dict:
    api_key = _get_api_key()
    if not use_ai or not api_key or api_key == "your_api_key_here":
        result = _fallback_summary(analysis)
        print(f"  [提示] 使用規則式摘要（可於 .env 設定 GEMINI_API_KEY 啟用 AI）")
        return result

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        for model_name in ("gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash-latest"):
            try:
                model = genai.GenerativeModel(model_name)
                break
            except Exception:
                model = None
        if model is None:
            raise RuntimeError("找不到可用的 Gemini 模型")

        pos_samples = "\n".join(f"- {t}" for t in analysis["sample_comments"]["positive"][:4])
        neg_samples = "\n".join(f"- {t}" for t in analysis["sample_comments"]["negative"][:4])
        top_words = "、".join(w for w, _ in analysis["top_words"][:12])

        prompt = f"""你是電影評論分析助手。根據以下 PTT 電影版留言統計，寫出繁體中文結論。

電影：{analysis['name']}
留言數：{analysis['total_comments']}
推文統計：推 {analysis['push_positive']} / 噓 {analysis['push_negative']}
高頻詞：{top_words}

好評留言範例：
{pos_samples or '（無）'}

負評留言範例：
{neg_samples or '（無）'}

請輸出 JSON（不要 markdown）：
{{
  "summary": "50字內的一句話避雷或推薦總結",
  "verdict": "推薦 或 避雷 或 見仁見智",
  "sentiment": "positive 或 negative 或 mixed"
}}"""

        resp = model.generate_content(prompt)
        text = resp.text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
        result["source"] = "gemini"
        return result
    except Exception as exc:
        print(f"  [警告] Gemini 失敗：{exc}")
        fallback = _fallback_summary(analysis)
        fallback["source"] = "fallback"
        return fallback


def summarize_all() -> list[dict]:
    results = []
    for movie in MOVIES:
        path = DATA_FILES["analysis_dir"] / f"{movie['id']}.json"
        if not path.exists():
            continue
        analysis = json.loads(path.read_text(encoding="utf-8"))
        print(f"[AI] {analysis['name']} …")
        ai = summarize_with_gemini(analysis)
        merged = {**analysis, "ai": ai}
        path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
        results.append(merged)
        print(f"  → {ai['verdict']}：{ai['summary']}")

    out = DATA_FILES["analysis_dir"] / "summary_with_ai.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return results


if __name__ == "__main__":
    summarize_all()
