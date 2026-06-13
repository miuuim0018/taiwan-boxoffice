"""快速測試 API 金鑰是否可用。"""
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / "文字雲" / ".env")

tmdb = os.getenv("TMDB_API_KEY")
gemini = os.getenv("GEMINI_API_KEY")

print("=== API 狀態 ===")
print("TMDB_API_KEY:", "已設定" if tmdb and tmdb != "your_api_key_here" else "未設定")
print("GEMINI_API_KEY:", "已設定" if gemini and gemini != "your_api_key_here" else "未設定")

if tmdb and tmdb != "your_api_key_here":
    r = requests.get(
        "https://api.themoviedb.org/3/movie/1008042/reviews",
        params={"api_key": tmdb, "language": "zh-TW", "page": 1},
        timeout=15,
    )
    if r.ok:
        print("TMDB 測試: 成功，周處除三害有", r.json().get("total_results", 0), "則評論")
    else:
        print("TMDB 測試: 失敗", r.status_code, r.text[:100])
else:
    print("TMDB: 請在 .env 加入 TMDB_API_KEY=你的金鑰")

if gemini and gemini != "your_api_key_here":
    try:
        import google.generativeai as genai

        genai.configure(api_key=gemini)
        for model in ("gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"):
            try:
                m = genai.GenerativeModel(model)
                resp = m.generate_content("回覆：測試成功")
                print(f"Gemini 測試 ({model}): 成功")
                break
            except Exception as e:
                print(f"Gemini ({model}):", str(e)[:80])
    except Exception as e:
        print("Gemini 錯誤:", e)
else:
    print("Gemini: 未設定（可從文字雲/.env 讀取）")
