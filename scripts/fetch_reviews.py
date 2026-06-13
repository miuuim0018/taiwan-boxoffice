"""整合 PTT + TMDB 評論資料。"""

from __future__ import annotations

import json

from scripts.config import DATA_FILES, MOVIES
from scripts.scrape_ptt import _session, scrape_movie
from scripts.scrape_tmdb import fetch_reviews as fetch_tmdb_reviews


def fetch_all_reviews() -> list[dict]:
    DATA_FILES["reviews_dir"].mkdir(parents=True, exist_ok=True)
    session = _session()
    results = []

    for movie in MOVIES:
        print(f"[擷取] {movie['name']} …")
        ptt_data = scrape_movie(session, movie)
        tmdb_comments = fetch_tmdb_reviews(movie)

        for c in ptt_data["comments"]:
            c.setdefault("source", "ptt")

        merged_comments = ptt_data["comments"] + tmdb_comments
        ptt_count = sum(1 for c in merged_comments if c.get("source") == "ptt")
        tmdb_count = sum(1 for c in merged_comments if c.get("source") == "tmdb")

        data = {
            **ptt_data,
            "comments": merged_comments,
            "total_comments": len(merged_comments),
            "sources": {
                "ptt": ptt_count,
                "tmdb": tmdb_count,
            },
        }

        out = DATA_FILES["reviews_dir"] / f"{movie['id']}.json"
        out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  → 合計 {data['total_comments']} 則（PTT {ptt_count} + TMDB {tmdb_count}）")
        results.append(data)

    return results


if __name__ == "__main__":
    fetch_all_reviews()
