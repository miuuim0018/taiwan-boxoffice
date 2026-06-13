"""Jieba 斷詞、詞頻、情緒與文字雲分析。"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import jieba
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from wordcloud import WordCloud

from scripts.config import (
    DATA_FILES,
    MOVIES,
    NEGATIVE_HINTS,
    OUTPUT_DIR,
    POSITIVE_HINTS,
    ROOT,
    STOPWORDS,
)
from scripts.scrape_ptt import load_movie_reviews


def _sentiment_from_tag(tag: str) -> str:
    if tag == "推":
        return "positive"
    if tag == "噓":
        return "negative"
    return "neutral"


def _lexicon_sentiment(text: str) -> int:
    score = 0
    for w in POSITIVE_HINTS:
        if w in text:
            score += 1
    for w in NEGATIVE_HINTS:
        if w in text:
            score -= 1
    return score


def tokenize_texts(texts: list[str]) -> list[str]:
    words: list[str] = []
    for text in texts:
        for w in jieba.cut(text):
            w = w.strip()
            if len(w) < 2:
                continue
            if w in STOPWORDS:
                continue
            if w.isdigit():
                continue
            words.append(w)
    return words


def analyze_movie(movie_id: str) -> dict:
    data = load_movie_reviews(movie_id)
    comments = data["comments"]
    if not comments:
        raise ValueError(f"《{data['name']}》沒有擷取到留言，請調整 keywords 後重新爬取")

    pos_texts, neg_texts, neu_texts = [], [], []
    tag_counter = Counter()
    lex_scores = []

    for c in comments:
        tag = c.get("tag", "→")
        text = c.get("text", "")
        tag_counter[tag] += 1
        sent = _sentiment_from_tag(tag)
        lex = _lexicon_sentiment(text)
        lex_scores.append(lex)

        if sent == "positive" or lex > 0:
            pos_texts.append(text)
        elif sent == "negative" or lex < 0:
            neg_texts.append(text)
        else:
            neu_texts.append(text)

    all_words = tokenize_texts([c["text"] for c in comments])
    pos_words = tokenize_texts(pos_texts)
    neg_words = tokenize_texts(neg_texts)
    freq = Counter(all_words).most_common(30)
    pos_freq = Counter(pos_words).most_common(20)
    neg_freq = Counter(neg_words).most_common(20)

    push_pos = tag_counter.get("推", 0)
    push_neg = tag_counter.get("噓", 0)
    push_neu = tag_counter.get("→", 0) + tag_counter.get("?", 0)

    if push_pos + push_neg > 0:
        sentiment_label = "positive" if push_pos > push_neg * 1.3 else (
            "negative" if push_neg > push_pos * 1.3 else "mixed"
        )
    else:
        avg_lex = sum(lex_scores) / max(len(lex_scores), 1)
        sentiment_label = "positive" if avg_lex > 0.2 else "negative" if avg_lex < -0.2 else "mixed"

    sentiment_zh = {"positive": "偏正向", "negative": "偏負向", "mixed": "好壞參半"}[sentiment_label]

    sources = data.get("sources") or {
        "ptt": sum(1 for c in comments if c.get("source") == "ptt"),
        "tmdb": sum(1 for c in comments if c.get("source") == "tmdb"),
    }

    return {
        "id": movie_id,
        "name": data["name"],
        "total_comments": data["total_comments"],
        "sources": sources,
        "article_count": len(data.get("articles", [])),
        "tag_counts": dict(tag_counter),
        "push_positive": push_pos,
        "push_negative": push_neg,
        "push_neutral": push_neu,
        "sentiment": sentiment_label,
        "sentiment_zh": sentiment_zh,
        "top_words": freq,
        "positive_words": pos_freq,
        "negative_words": neg_freq,
        "sample_comments": {
            "positive": pos_texts[:5],
            "negative": neg_texts[:5],
        },
    }


def _font_path() -> str | None:
    candidates = [
        "C:/Windows/Fonts/msjh.ttc",
        "C:/Windows/Fonts/msjhbd.ttc",
        "C:/Windows/Fonts/mingliu.ttc",
    ]
    for p in candidates:
        if Path(p).exists():
            return p
    return None


def _make_wordcloud(words: list[str], out_path: Path, title: str) -> Path | None:
    if not words:
        return None
    font = _font_path()
    wc = WordCloud(
        width=1000,
        height=600,
        background_color="white",
        font_path=font,
        max_words=120,
        colormap="OrRd",
        margin=10,
    ).generate(" ".join(words))

    plt.rcParams["font.sans-serif"] = ["Microsoft JhengHei"]
    plt.rcParams["axes.unicode_minus"] = False
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.imshow(wc, interpolation="bilinear")
    ax.set_title(title, fontsize=14)
    ax.axis("off")
    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
    return out_path


def build_wordclouds(movie_id: str, analysis: dict) -> dict[str, str]:
    wc_dir = OUTPUT_DIR / "wordclouds"
    paths = {}

    all_words = [w for w, _ in analysis["top_words"] for _ in range(3)]
    pos_words = [w for w, _ in analysis["positive_words"] for _ in range(2)]
    neg_words = [w for w, _ in analysis["negative_words"] for _ in range(2)]

    mapping = {
        "all": (all_words, wc_dir / f"{movie_id}_all.png", f"{analysis['name']} — 整體文字雲"),
        "positive": (pos_words, wc_dir / f"{movie_id}_positive.png", f"{analysis['name']} — 好評關鍵詞"),
        "negative": (neg_words, wc_dir / f"{movie_id}_negative.png", f"{analysis['name']} — 負評關鍵詞"),
    }

    for key, (words, path, title) in mapping.items():
        if _make_wordcloud(words, path, title):
            # index.html 在 output/ 內，路徑需相對於 output/
            paths[key] = str(path.relative_to(OUTPUT_DIR)).replace("\\", "/")

    return paths


def analyze_all() -> list[dict]:
    DATA_FILES["analysis_dir"].mkdir(parents=True, exist_ok=True)
    results = []

    for movie in MOVIES:
        print(f"[分析] {movie['name']} …")
        analysis = analyze_movie(movie["id"])
        clouds = build_wordclouds(movie["id"], analysis)
        analysis["wordclouds"] = clouds

        out = DATA_FILES["analysis_dir"] / f"{movie['id']}.json"
        out.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
        results.append(analysis)
        print(f"  → 情緒：{analysis['sentiment_zh']}，推文 推/噓 = {analysis['push_positive']}/{analysis['push_negative']}")

    summary_path = DATA_FILES["analysis_dir"] / "summary.json"
    summary_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return results


if __name__ == "__main__":
    analyze_all()
