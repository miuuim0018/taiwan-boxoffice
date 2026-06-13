"""為年度排行上榜電影抓取 TMDB 簡介（快取至 movie_meta.json）。"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

from scripts.enrich_bar_race_posters import TITLE_OVERRIDES, parse_label
from scripts.scrape_tmdb import (
    _api_key,
    fetch_movie_details,
    find_movie_id,
    find_poster_url,
)

ROOT = Path(__file__).resolve().parent.parent
RANKINGS_JSON = ROOT / "bar_chart_race" / "yearly_rankings.json"
MONTHLY_JSON = ROOT / "bar_chart_race" / "monthly.json"
CACHE_PATH = ROOT / "data" / "bar_race_movie_meta.json"
WEB_PATH = ROOT / "bar_chart_race" / "movie_meta.json"
POSTER_CACHE = ROOT / "data" / "bar_race_posters.json"


def collect_ranked_names(top_n: int = 30) -> set[str]:
    """年度／月度排行會出現的片名（供 TMDB 評分與簡介）。"""
    names: set[str] = set()

    if RANKINGS_JSON.exists():
        data = json.loads(RANKINGS_JSON.read_text(encoding="utf-8"))
        for movies in (data.get("movies") or {}).values():
            ranked = sorted(movies, key=lambda x: x.get("value", 0), reverse=True)
            for item in ranked[:top_n]:
                if item.get("value", 0) > 0 and item.get("name"):
                    names.add(item["name"])

    if MONTHLY_JSON.exists():
        data = json.loads(MONTHLY_JSON.read_text(encoding="utf-8"))
        for months in (data.get("months") or {}).values():
            for month_data in months.values():
                for item in month_data.get("items") or []:
                    if item.get("name"):
                        names.add(item["name"])

    return names


def load_cache() -> dict[str, dict | None]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict[str, dict | None]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    WEB_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def _search_queries(title: str) -> list[str]:
    queries: list[str] = []
    if title in TITLE_OVERRIDES:
        queries.append(TITLE_OVERRIDES[title])
    queries.append(title)
    short = re.split(r"[:：]", title)[0].strip()
    if short and short not in queries:
        queries.append(short)
    return queries


def resolve_meta(name: str, api_key: str, cache: dict[str, dict | None]) -> dict | None:
    if name in cache:
        return cache[name]

    title, year = parse_label(name)
    movie_id = None
    for q in _search_queries(title):
        movie_id = find_movie_id(q, api_key, year)
        if movie_id:
            break
        time.sleep(0.12)

    meta: dict | None = None
    if movie_id:
        try:
            meta = fetch_movie_details(movie_id, api_key, language="zh-TW")
        except Exception:
            meta = None

    if not meta or not meta.get("overview"):
        poster = None
        for q in _search_queries(title):
            poster = find_poster_url(q, api_key, year)
            if poster:
                break
        if meta:
            meta["overview"] = meta.get("overview") or ""
            if poster and not meta.get("poster"):
                meta["poster"] = poster
        elif poster:
            meta = {
                "tmdb_id": movie_id,
                "title": title,
                "overview": "",
                "vote_average": None,
                "release_date": "",
                "runtime": 0,
                "poster": poster,
            }

    if meta and not meta.get("poster"):
        if POSTER_CACHE.exists():
            posters = json.loads(POSTER_CACHE.read_text(encoding="utf-8"))
            url = posters.get(name)
            if url:
                meta["poster"] = url

    cache[name] = meta
    return meta


def enrich(top_n: int = 30) -> dict[str, dict | None]:
    names = sorted(collect_ranked_names(top_n=top_n))
    cache = load_cache()
    api_key = _api_key()

    if not api_key:
        print("[movie_meta] 未設定 TMDB_API_KEY，僅同步現有快取")
        save_cache(cache)
        return cache

    todo = [n for n in names if n not in cache]
    print(f"[movie_meta] 待查詢 {len(todo)} / 共 {len(names)} 部（快取 {len(cache)}）")

    for i, name in enumerate(todo, 1):
        meta = resolve_meta(name, api_key, cache)
        mark = "OK" if meta and meta.get("overview") else "--"
        line = f"  [{i}/{len(todo)}] {mark} {name}"
        print(line.encode("cp950", errors="replace").decode("cp950"))
        save_cache(cache)
        time.sleep(0.12)

    save_cache(cache)
    with_overview = sum(1 for v in cache.values() if v and v.get("overview"))
    print(f"[movie_meta] 已快取 {len(cache)} 部，含簡介 {with_overview} 部")
    return cache


def main() -> None:
    enrich()
    print(f"[OK] {WEB_PATH}")


if __name__ == "__main__":
    main()
