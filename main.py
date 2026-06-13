"""
爛片現形鏡 — 電影真實評價分析與雷區預警
執行：python main.py
"""

from scripts.fetch_reviews import fetch_all_reviews
from scripts.analyze import analyze_all
from scripts.ai_summary import summarize_all
from scripts.build_dashboard import build_dashboard
from scripts.build_ppt import build_ppt
from scripts.config import OUTPUT_DIR


def main() -> None:
    print("=" * 60)
    print("爛片現形鏡 — PTT + TMDB 電影評價分析")
    print("=" * 60)

    fetch_all_reviews()
    analyze_all()
    summarize_all()
    build_dashboard()
    ppt = build_ppt()

    print("\n完成！請用瀏覽器開啟：")
    print(f"  {OUTPUT_DIR / 'index.html'}")
    print(f"  簡報 PPT：{ppt}")


if __name__ == "__main__":
    main()
