"""合併官方每週票房與歷史累計總榜，產生 Bar Chart Race 資料。"""



from __future__ import annotations



from scripts.classify_film_genre import apply_genres_to_weekly, build_genre_map

from scripts.fetch_boxoffice_official import (

    TFAI_WEEKLY_ARCHIVE,

    build_alltime_frames,

    build_frames,

    build_monthly_data,

    build_yearly_champions,

    build_yearly_rankings,

    build_analytics_data,

    build_market_trends,

    collect_meta,

    collect_monthly_meta,

    export,

    export_analytics,

    export_insights,

    export_market,

    export_yearly_rankings,

    export_monthly,

    load_official_weekly,

    load_snapshot_payload,

    movie_label,

)

from scripts.scrape_tmdb import _api_key





def build() -> dict:

    print("[1/4] 載入官方每週票房…")

    weekly = load_official_weekly()



    print("[2/4] 片種分類（動作片、動畫片…）…")

    labels = {

        movie_label(row["name"], row.get("release", ""))

        for rows in weekly.values()

        for row in rows

    }

    genre_map = build_genre_map(labels, _api_key(), use_tmdb=False)

    apply_genres_to_weekly(weekly, genre_map)



    official_frames = build_frames(weekly)

    o_start = official_frames[0]["date"] if official_frames else ""

    o_end = official_frames[-1]["date"] if official_frames else ""

    source_note = (

        f"官方全量 JSON（{len(official_frames)} 週）"

        if len(official_frames) > 120

        else f"開放資料 CSV 鏡像（{len(official_frames)} 週，約 2018/08–2020/06）"

    )

    print(f"      {len(official_frames)} 週（{o_start} → {o_end}）— {source_note}")



    print("[3/4] 產生歷史累計總榜動畫…")

    snapshot = load_snapshot_payload()

    alltime_frames, a_start, a_end = build_alltime_frames(weekly, snapshot)

    if snapshot:

        print(f"      預載 2016 起快照 + {len(alltime_frames)} 週動畫（{a_start} → {a_end}）")

    else:

        print(f"      {len(alltime_frames)} 週（{a_start or o_start} → {a_end or o_end}）")



    print("[4/4] 產生月票房圖表資料…")

    monthly = build_monthly_data(weekly)

    monthly_meta = collect_monthly_meta(monthly)

    yearly_champions = build_yearly_champions(weekly)

    yearly_rankings = build_yearly_rankings(weekly)

    export_monthly(

        {

            "valueSuffix": " 萬",

            "subtitle": "當月週票房加總（官方「銷售金額」，萬元）",

            "years": sorted(monthly.keys()),

            "meta": monthly_meta,

            "months": monthly,

        }

    )

    export_insights(

        {

            "valueSuffix": " 萬",

            "subtitle": "各年度單片週票房加總最高者（萬元）",

            "years": sorted(yearly_champions.keys()),

            "champions": yearly_champions,

        }

    )

    export_yearly_rankings(yearly_rankings)

    print(f"      monthly.json：{len(monthly)} 年")

    print(f"      insights.json：{len(yearly_champions)} 年年度冠軍")

    print(f"      yearly_rankings.json：{len(yearly_rankings['years'])} 年多維排行")

    from scripts.enrich_yearly_movie_meta import enrich as enrich_yearly_meta

    print("      movie_meta.json…")

    enrich_yearly_meta()



    print("[5/6] 產生深度分析資料…")

    analytics = build_analytics_data(weekly)

    export_analytics(analytics)

    print(f"      analytics.json：{len(analytics['movieList'])} 片｜{len(analytics['weekDates'])} 週")

    market = build_market_trends(weekly)

    export_market(market)

    print(f"      market.json：{market['coverage']['weeks']} 週｜{market['coverage']['months']} 月")



    meta = collect_meta(weekly, official_frames)

    sample = official_frames[len(official_frames) // 2] if official_frames else {"items": []}

    per_week = len(sample["items"])

    alltime_sample = alltime_frames[len(alltime_frames) // 2] if alltime_frames else {"items": []}

    per_alltime = len(alltime_sample["items"])



    limited = o_end[:4] <= "2020" and len(official_frames) < 120

    coverage_note = (

        f"當週在映：{o_start}–{o_end}，共 {len(official_frames)} 週。"

        + ("（自動資料僅到 2020/06）" if limited else "")

        + f" 歷史累計總榜：{a_start or o_start}–{a_end or o_end}，共 {len(alltime_frames)} 週。"

        + " 月票房圖表見「月票房」分頁。"

        + " 年度冠軍見「年度冠軍」分頁。"

        + " 深度分析見「票房分析」分頁。"

        + f" 每週檔案請至 {TFAI_WEEKLY_ARCHIVE} 。"

    )



    end_year = (a_end or o_end)[:4]

    modes: dict = {

        "boxoffice_official": {

            "label": f"當週在映（{len(official_frames)} 週）",

            "frameUnit": "week",

            "title": f"【{o_start[:4]}–{o_end[:4]}】台灣電影 官方累計票房排行榜",

            "subtitle": f"{o_start}–{o_end}｜當週在映約 {per_week} 部（萬元）",

            "frames": official_frames,

        },

        "boxoffice_alltime": {

            "label": f"歷史累計總榜（{len(alltime_frames)} 週）",

            "frameUnit": "week",

            "title": f"【2016–{end_year}】台灣電影 歷史累計票房總排行榜",

            "subtitle": f"{a_start or o_start}–{a_end or o_end}｜歷史最高累計前 {per_alltime} 部（萬元）",

            "frames": alltime_frames,

        },

    }



    return {

        "defaultMode": "boxoffice_official",

        "valueSuffix": " 萬",

        "source": "國家電影及視聽文化中心｜政府資料開放平臺 dataset/94224",

        "sourceUrl": "https://data.gov.tw/dataset/94224",

        "meta": meta,

        "coverage": {

            "start": o_start,

            "end": o_end,

            "weeks": len(official_frames),

            "note": coverage_note,

        },

        "modes": modes,

    }





def main() -> None:

    payload = build()

    if _api_key():

        from scripts.enrich_bar_race_posters import enrich



        print("[6/6] TMDB 海報…")

        payload = enrich(payload)

    else:

        print("[6/6] 略過海報（未設定 TMDB_API_KEY）")

    export(payload)

    for mode_id, mode in payload["modes"].items():

        print(f"[OK] {mode_id}: {len(mode['frames'])} 幀")





if __name__ == "__main__":

    main()

