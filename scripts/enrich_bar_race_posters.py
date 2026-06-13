"""以 TMDB 為 Bar Chart Race 資料補上海報 URL（寫入 data.json / data.js）。"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

from scripts.fetch_boxoffice_official import export
from scripts.scrape_tmdb import _api_key, find_poster_url

ROOT = Path(__file__).resolve().parent.parent
DATA_JSON = ROOT / "bar_chart_race" / "data.json"
CACHE_PATH = ROOT / "data" / "bar_race_posters.json"

# 官方譯名與 TMDB 搜尋不易對上時的手動對照
TITLE_OVERRIDES: dict[str, str] = {
    "復仇者聯盟：無限之戰": "Avengers Infinity War",
    "復仇者聯盟:無限之戰": "Avengers Infinity War",
    "復仇者聯盟：終局之戰": "Avengers Endgame",
    "復仇者聯盟:終局之戰": "Avengers Endgame",
    "侏羅紀世界:殞落國度": "Jurassic World Fallen Kingdom",
    "侏羅紀世界：殞落國度": "Jurassic World Fallen Kingdom",
    "一級玩家": "Ready Player One",
    "不可能的任務：全面瓦解": "Mission Impossible Fallout",
    "玩命關頭：特別行動": "Fast and Furious Hobbs and Shaw",
    "玩命關頭:特別行動": "Fast and Furious Hobbs and Shaw",
    "與神同行": "Along with the Gods The Two Worlds",
    "與神同行：最終審判": "Along with the Gods The Last 49 Days",
    "鬼滅之刃 無限列車篇": "Demon Slayer Mugen Train",
}


def parse_label(name: str) -> tuple[str, int | None]:
    m = re.match(r"^(.+?)\s*\((\d{4})\)\s*$", name)
    if m:
        return m.group(1).strip(), int(m.group(2))
    return name.strip(), None


def collect_ranked_names(payload: dict, top_k: int = 25) -> set[str]:
    names: set[str] = set()
    modes = payload.get("modes") or {}
    if not modes and payload.get("frames"):
        modes = {"default": payload}
    for mode in modes.values():
        for frame in mode.get("frames", []):
            ranked = sorted(frame.get("items", []), key=lambda x: x["value"], reverse=True)
            for item in ranked[:top_k]:
                names.add(item["name"])
    return names


def load_cache() -> dict[str, str | None]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict[str, str | None]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    posters_web = ROOT / "bar_chart_race" / "posters.json"
    posters_web.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def resolve_poster(name: str, api_key: str, cache: dict[str, str | None]) -> str | None:
    if name in cache:
        return cache[name]

    title, year = parse_label(name)
    queries = []
    if title in TITLE_OVERRIDES:
        queries.append(TITLE_OVERRIDES[title])
    queries.append(title)
    # 去掉副標題再試
    short = re.split(r"[:：]", title)[0].strip()
    if short and short not in queries:
        queries.append(short)

    poster = None
    for q in queries:
        poster = find_poster_url(q, api_key, year)
        if poster:
            break
        time.sleep(0.15)

    cache[name] = poster
    return poster


def apply_posters(payload: dict, cache: dict[str, str | None]) -> int:
    applied = 0
    modes = payload.get("modes") or {}
    if not modes and payload.get("frames"):
        modes = {"default": payload}
    for mode in modes.values():
        for frame in mode.get("frames", []):
            for item in frame.get("items", []):
                poster = cache.get(item["name"])
                if poster:
                    item["poster"] = poster
                    applied += 1
                elif "poster" in item:
                    del item["poster"]
    return applied


def enrich(payload: dict | None = None, top_k: int = 25) -> dict:
    api_key = _api_key()
    if not api_key:
        raise SystemExit(
            "請在 .env 設定 TMDB_API_KEY（https://www.themoviedb.org/settings/api）"
        )

    if payload is None:
        payload = json.loads(DATA_JSON.read_text(encoding="utf-8"))

    names = sorted(collect_ranked_names(payload, top_k=top_k))
    cache = load_cache()
    todo = [n for n in names if n not in cache]
    print(f"[posters] 待查詢 {len(todo)} / 共 {len(names)} 部（快取 {len(cache)}）")

    for i, name in enumerate(todo, 1):
        poster = resolve_poster(name, api_key, cache)
        mark = "OK" if poster else "--"
        line = f"  [{i}/{len(todo)}] {mark} {name}"
        print(line.encode("cp950", errors="replace").decode("cp950"))
        save_cache(cache)
        time.sleep(0.1)

    save_cache(cache)
    count = apply_posters(payload, cache)
    print(f"[posters] 已寫入 {count} 筆 item 海報欄位")
    return payload


def main() -> None:
    payload = enrich()
    export(payload)
    print(f"[OK] {DATA_JSON}")
    print(f"[OK] {DATA_JSON.parent / 'data.js'}")


if __name__ == "__main__":
    main()
