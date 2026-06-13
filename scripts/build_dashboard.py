"""產生可選電影的互動儀表板 index.html。"""

from __future__ import annotations

import json

from scripts.config import DATA_FILES, OUTPUT_DIR


def build_dashboard() -> None:
    summary_path = DATA_FILES["analysis_dir"] / "summary_with_ai.json"
    if not summary_path.exists():
        summary_path = DATA_FILES["analysis_dir"] / "summary.json"
    if not summary_path.exists():
        raise FileNotFoundError("請先執行 analyze_all()")

    movies = json.loads(summary_path.read_text(encoding="utf-8"))
    movies_json = json.dumps(movies, ensure_ascii=False)

    html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>爛片現形鏡 — 電影真實評價分析</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap" rel="stylesheet" />
  <style>
    :root {{
      --bg: #0a0a0f;
      --bg-card: rgba(22, 22, 32, 0.85);
      --border: rgba(255, 255, 255, 0.08);
      --gold: #f5c518;
      --gold-dim: #c9a227;
      --red: #e50914;
      --green: #46d369;
      --text: #f5f5f7;
      --muted: #8e8e93;
      --glow: rgba(245, 197, 24, 0.15);
    }}

    * {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.6;
    }}

    /* 電影院氛圍背景 */
    body::before {{
      content: "";
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 50% at 50% -20%, rgba(229, 9, 20, 0.18), transparent),
        radial-gradient(ellipse 60% 40% at 100% 100%, rgba(245, 197, 24, 0.08), transparent),
        radial-gradient(ellipse 50% 30% at 0% 80%, rgba(70, 211, 105, 0.05), transparent);
      pointer-events: none;
      z-index: 0;
    }}

    .page {{
      position: relative;
      z-index: 1;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px 48px;
    }}

    /* ── Header ── */
    .hero {{
      padding: 40px 0 32px;
      text-align: center;
    }}

    .logo {{
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }}

    .logo-icon {{
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--red), #b20710);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 8px 32px rgba(229, 9, 20, 0.4);
    }}

    .hero h1 {{
      font-size: clamp(1.6rem, 4vw, 2.2rem);
      font-weight: 900;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #fff 30%, var(--gold));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }}

    .hero .tagline {{
      color: var(--muted);
      font-size: 0.9rem;
      margin-top: 8px;
    }}

    .hero .tagline span {{
      display: inline-block;
      background: rgba(255,255,255,0.06);
      padding: 3px 10px;
      border-radius: 20px;
      margin: 2px 4px;
      font-size: 0.8rem;
    }}

    /* ── 控制列 ── */
    .controls {{
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      justify-content: center;
      margin: 28px 0 36px;
      padding: 20px 24px;
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
    }}

    .select-wrap {{
      display: flex;
      flex-direction: column;
      gap: 6px;
    }}

    .select-wrap label {{
      font-size: 0.75rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 500;
    }}

    select {{
      font-family: inherit;
      font-size: 1rem;
      font-weight: 500;
      padding: 12px 40px 12px 16px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: rgba(0,0,0,0.4) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%238e8e93' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E") no-repeat right 14px center;
      color: var(--text);
      min-width: 280px;
      cursor: pointer;
      appearance: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }}

    select:hover, select:focus {{
      border-color: var(--gold-dim);
      box-shadow: 0 0 0 3px var(--glow);
      outline: none;
    }}

    .verdict {{
      padding: 10px 22px;
      border-radius: 50px;
      font-weight: 700;
      font-size: 0.95rem;
      letter-spacing: 0.05em;
      transition: all 0.3s ease;
    }}

    .verdict.positive {{
      background: linear-gradient(135deg, #1a4d2e, #2d6a4f);
      color: var(--green);
      border: 1px solid rgba(70, 211, 105, 0.3);
      box-shadow: 0 0 20px rgba(70, 211, 105, 0.2);
    }}

    .verdict.negative {{
      background: linear-gradient(135deg, #4a1515, #7f1d1d);
      color: #ff6b6b;
      border: 1px solid rgba(229, 9, 20, 0.4);
      box-shadow: 0 0 20px rgba(229, 9, 20, 0.25);
    }}

    .verdict.mixed {{
      background: linear-gradient(135deg, #3d3500, #5c4d00);
      color: var(--gold);
      border: 1px solid rgba(245, 197, 24, 0.3);
      box-shadow: 0 0 20px var(--glow);
    }}

    /* ── 主內容 ── */
    #content {{
      display: flex;
      flex-direction: column;
      gap: 20px;
      animation: fadeIn 0.4s ease;
    }}

    @keyframes fadeIn {{
      from {{ opacity: 0; transform: translateY(8px); }}
      to {{ opacity: 1; transform: translateY(0); }}
    }}

    .card {{
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      transition: transform 0.2s, box-shadow 0.2s;
    }}

    .card:hover {{
      box-shadow: 0 8px 32px rgba(0,0,0,0.35);
    }}

    .card-header {{
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 18px;
    }}

    .card-header .icon {{
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }}

    .card-header h2 {{
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text);
    }}

    .card-header .sub {{
      font-size: 0.8rem;
      color: var(--muted);
      font-weight: 400;
    }}

    .grid-2 {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }}

    @media (max-width: 768px) {{
      .grid-2 {{ grid-template-columns: 1fr; }}
      select {{ min-width: 100%; }}
    }}

    /* AI 摘要 */
    .ai-box {{
      background: linear-gradient(135deg, rgba(229,9,20,0.12), rgba(0,0,0,0.3));
      border: 1px solid rgba(229, 9, 20, 0.25);
      border-radius: 12px;
      padding: 20px 24px;
      font-size: 1.1rem;
      line-height: 1.75;
      position: relative;
    }}

    .ai-box::before {{
      content: "\\201C";
      position: absolute;
      top: 8px;
      left: 12px;
      font-size: 3rem;
      color: var(--red);
      opacity: 0.3;
      font-family: Georgia, serif;
      line-height: 1;
    }}

    .ai-box p {{
      padding-left: 28px;
    }}

    /* 統計 */
    .stats {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }}

    .stat {{
      background: rgba(0,0,0,0.35);
      padding: 16px 12px;
      border-radius: 12px;
      text-align: center;
      border: 1px solid var(--border);
    }}

    .stat.push .num {{ color: var(--green); }}
    .stat.boo .num {{ color: #ff6b6b; }}
    .stat.total .num {{ color: var(--gold); }}

    .stat .num {{
      font-size: 1.8rem;
      font-weight: 900;
      line-height: 1.2;
    }}

    .stat .lbl {{
      font-size: 0.75rem;
      color: var(--muted);
      margin-top: 4px;
      font-weight: 500;
    }}

    .meta-row {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }}

    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 500;
      background: rgba(255,255,255,0.06);
      border: 1px solid var(--border);
    }}

    .badge.ptt {{ border-color: rgba(245,197,24,0.3); color: var(--gold); }}
    .badge.tmdb {{ border-color: rgba(70,130,255,0.3); color: #6eb5ff; }}

    /* 關鍵詞 */
    .word-section {{ margin-bottom: 16px; }}
    .word-section:last-child {{ margin-bottom: 0; }}

    .word-label {{
      font-size: 0.75rem;
      color: var(--muted);
      margin-bottom: 8px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }}

    .words {{ display: flex; flex-wrap: wrap; gap: 8px; }}

    .word {{
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.82rem;
      font-weight: 500;
      background: rgba(255,255,255,0.08);
      border: 1px solid var(--border);
      transition: transform 0.15s;
    }}

    .word:hover {{ transform: scale(1.05); }}
    .word.pos {{ background: rgba(70,211,105,0.15); border-color: rgba(70,211,105,0.3); color: #7dcea0; }}
    .word.neg {{ background: rgba(229,9,20,0.15); border-color: rgba(229,9,20,0.3); color: #ff8a8a; }}

    /* 文字雲 */
    .cloud-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }}

    .cloud-item {{
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      transition: transform 0.25s;
    }}

    .cloud-item:hover {{
      transform: translateY(-4px);
      box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    }}

    .cloud-item img {{
      width: 100%;
      display: block;
    }}

    .cloud-caption {{
      text-align: center;
      padding: 10px;
      font-size: 0.85rem;
      font-weight: 600;
      color: #333;
      background: #f8f8f8;
    }}

    .cloud-caption.pos {{ color: #2d6a4f; }}
    .cloud-caption.neg {{ color: #c0392b; }}

    footer {{
      text-align: center;
      padding: 32px 16px;
      color: var(--muted);
      font-size: 0.78rem;
      border-top: 1px solid var(--border);
      margin-top: 40px;
    }}
  </style>
</head>
<body>
  <div class="page">
    <header class="hero">
      <div class="logo">
        <div class="logo-icon">🎬</div>
        <h1>爛片現形鏡</h1>
      </div>
      <p class="tagline">
        電影真實評價分析與雷區預警
        <br />
        <span>PTT 輿情</span>
        <span>TMDB 影評</span>
        <span>Jieba 斷詞</span>
        <span>WordCloud</span>
        <span>AI 摘要</span>
      </p>
    </header>

    <div class="controls">
      <div class="select-wrap">
        <label for="movie-select">選擇電影</label>
        <select id="movie-select" aria-label="選擇電影"></select>
      </div>
      <span id="verdict-badge" class="verdict mixed">見仁見智</span>
    </div>

    <main id="content"></main>

    <footer>
      網路資料擷取與分析 專題｜研究用途<br />
      資料來源：PTT 電影版 + TMDB 國際電影資料庫<br />
      <a href="../bar_chart_race/index.html" style="color:#6eb5ff">📊 Bar Chart Race 動畫</a>
    </footer>
  </div>

  <script>
    const MOVIES = {movies_json};
    const select = document.getElementById("movie-select");
    const content = document.getElementById("content");
    const badge = document.getElementById("verdict-badge");

    MOVIES.forEach((m, i) => {{
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = m.name;
      select.appendChild(opt);
    }});

    function verdictClass(v) {{
      if (v === "推薦") return "positive";
      if (v === "避雷") return "negative";
      return "mixed";
    }}

    function render(movie) {{
      const ai = movie.ai || {{}};
      const verdict = ai.verdict || movie.sentiment_zh || "見仁見智";
      badge.textContent = verdict;
      badge.className = "verdict " + verdictClass(verdict);

      const wc = movie.wordclouds || {{}};
      const src = movie.sources || {{}};
      const topWords = (movie.top_words || []).slice(0, 15)
        .map(([w, n]) => `<span class="word">${{w}} <small style="opacity:0.6">${{n}}</small></span>`).join("");
      const posWords = (movie.positive_words || []).slice(0, 10)
        .map(([w, n]) => `<span class="word pos">${{w}}</span>`).join("") || '<span style="color:var(--muted)">—</span>';
      const negWords = (movie.negative_words || []).slice(0, 10)
        .map(([w, n]) => `<span class="word neg">${{w}}</span>`).join("") || '<span style="color:var(--muted)">—</span>';

      const cloudHtml = [
        wc.all ? `<div class="cloud-item"><img src="${{wc.all}}" alt="整體文字雲" loading="lazy" /><div class="cloud-caption">整體評價關鍵詞</div></div>` : "",
        wc.positive ? `<div class="cloud-item"><img src="${{wc.positive}}" alt="好評文字雲" loading="lazy" /><div class="cloud-caption pos">好評關鍵詞</div></div>` : "",
        wc.negative ? `<div class="cloud-item"><img src="${{wc.negative}}" alt="負評文字雲" loading="lazy" /><div class="cloud-caption neg">負評關鍵詞</div></div>` : "",
      ].filter(Boolean).join("") || '<p style="color:var(--muted);text-align:center;padding:24px">尚無文字雲，請執行 python main.py</p>';

      content.style.animation = "none";
      content.offsetHeight;
      content.style.animation = "fadeIn 0.4s ease";

      content.innerHTML = `
        <section class="card">
          <div class="card-header">
            <div class="icon" style="background:rgba(229,9,20,0.2)">💬</div>
            <div>
              <h2>AI 一句話總結</h2>
              <div class="sub">避雷 / 推薦 精華</div>
            </div>
          </div>
          <div class="ai-box"><p>${{ai.summary || "（尚無摘要，請執行 python main.py）"}}</p></div>
        </section>

        <div class="grid-2">
          <section class="card">
            <div class="card-header">
              <div class="icon" style="background:rgba(245,197,24,0.15)">📊</div>
              <div>
                <h2>情緒統計</h2>
                <div class="sub">${{movie.sentiment_zh || "—"}}</div>
              </div>
            </div>
            <div class="stats">
              <div class="stat push"><div class="num">${{movie.push_positive || 0}}</div><div class="lbl">推</div></div>
              <div class="stat boo"><div class="num">${{movie.push_negative || 0}}</div><div class="lbl">噓</div></div>
              <div class="stat total"><div class="num">${{movie.total_comments || 0}}</div><div class="lbl">總留言</div></div>
            </div>
            <div class="meta-row">
              <span class="badge ptt">PTT ${{src.ptt || 0}} 則</span>
              <span class="badge tmdb">TMDB ${{src.tmdb || 0}} 則</span>
            </div>
          </section>

          <section class="card">
            <div class="card-header">
              <div class="icon" style="background:rgba(70,211,105,0.15)">🔤</div>
              <div>
                <h2>高頻關鍵詞</h2>
                <div class="sub">Jieba 斷詞分析</div>
              </div>
            </div>
            <div class="word-section">
              <div class="word-label">全部</div>
              <div class="words">${{topWords}}</div>
            </div>
            <div class="word-section">
              <div class="word-label">好評</div>
              <div class="words">${{posWords}}</div>
            </div>
            <div class="word-section">
              <div class="word-label">負評</div>
              <div class="words">${{negWords}}</div>
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card-header">
            <div class="icon" style="background:rgba(110,181,255,0.15)">☁️</div>
            <div>
              <h2>文字雲</h2>
              <div class="sub">WordCloud 視覺化</div>
            </div>
          </div>
          <div class="cloud-grid">${{cloudHtml}}</div>
        </section>
      `;
    }}

    select.addEventListener("change", () => render(MOVIES[select.value]));
    render(MOVIES[0]);
  </script>
</body>
</html>
"""

    out = OUTPUT_DIR / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"[OK] 儀表板：{out}")


if __name__ == "__main__":
    build_dashboard()
