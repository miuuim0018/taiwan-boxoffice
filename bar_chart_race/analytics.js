/**
 * 票房深度分析：單片走勢、同週對決、檔期專題、國片占比、片種熱度
 */
(function () {
  let payload = null;
  const charts = {};
  let filmMode = "week";
  let seasonKey = "spring";
  let selectedSeasonYear = null;
  const SEASON_ALL = "all";
  let domesticPeriod = "monthly";
  let genrePeriod = "monthly";
  let selectedGenres = new Set();
  let duelValueMode = "week";
  let duelContext = null;
  let countryPeriod = "monthly";
  let selectedCountryYear = null;
  let selectedCountryMonth = null;
  let selectedCountries = new Set();
  let countryMoreExpanded = false;
  let posters = {};
  let yearlyRankings = null;
  let movieMeta = {};
  let ratingScope = "all";
  let ratingShowIntro = false;
  let ratingSelectedName = null;
  let ratingScatterPoints = [];
  let ratingQuadrantStats = null;
  let ratingCountryPicker = null;
  let ratingTrendCountries = new Set();
  let ratingTrendMoreExpanded = false;

  const QUADRANT_META = {
    niche: { label: "叫好不叫座", note: "低票房 · 高評分", sort: (a, b) => b.y - a.y || b.x - a.x },
    star: { label: "叫好又叫座", note: "高票房 · 高評分", sort: (a, b) => b.x - a.x || b.y - a.y },
    flop: { label: "雙低", note: "低票房 · 低評分", sort: (a, b) => b.x - a.x || b.y - a.y },
    hit: { label: "高票房低口碑", note: "高票房 · 低評分", sort: (a, b) => b.x - a.x || a.y - b.y },
  };

  const { sortCountries, matchesCountries, CountryMultiSelect, PRIORITY_COUNTRIES, splitCountriesForDisplay, mergeMoviesByName, formatBoxOffice, formatBoxOfficeAxis } =
    window.BCR_FILTER;
  const {
    buildScatterPoints,
    pearsonR,
    quadrantStats,
    interpretCorrelation,
    shortName: ratingShortName,
  } = window.BCR_RATING;
  const RATING_ALL = "all";

  const COUNTRY_COLORS = [
    "#5ba3f5", "#ffb74d", "#81c784", "#e57373", "#ba68c8", "#4dd0e1",
    "#fff176", "#a1887f", "#90a4ae", "#f06292", "#7986cb", "#aed581",
  ];

  const GENRE_COLORS = [
    "#5ba3f5", "#ffb74d", "#81c784", "#e57373", "#ba68c8", "#4dd0e1",
    "#fff176", "#a1887f", "#90a4ae", "#f06292",
  ];
  const DUEL_COLORS = ["#5ba3f5", "#ffb74d", "#81c784", "#e57373"];

  async function loadAnalytics() {
    const res = await fetch("analytics.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function loadPosters() {
    const paths = ["posters.json", "../data/bar_race_posters.json"];
    for (const path of paths) {
      try {
        const res = await fetch(path);
        if (res.ok) {
          posters = await res.json();
          return;
        }
      } catch {
        /* try next */
      }
    }
    posters = {};
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function syncRatingIntroToggle() {
    const btn = document.getElementById("rating-intro-toggle");
    if (!btn) return;
    btn.classList.toggle("analytics-toggle-btn--active", ratingShowIntro);
    btn.setAttribute("aria-pressed", ratingShowIntro ? "true" : "false");
    btn.textContent = ratingShowIntro ? "隱藏電影介紹" : "顯示電影介紹";
  }

  function hideRatingIntroUi() {
    const tip = document.getElementById("rating-scatter-tooltip");
    if (tip) {
      tip.hidden = true;
      tip.style.opacity = "0";
    }
  }

  function renderAnalyticsStatRow(containerId, items) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = items
      .filter((item) => item.value !== "" && item.value != null)
      .map(
        (item) =>
          `<div class="analytics-stat"><span class="analytics-stat-label">${item.label}</span><strong>${item.value}</strong></div>`
      )
      .join("");
  }

  function posterUrl(name) {
    const meta = movieMeta[name];
    if (meta?.poster) return meta.poster;
    return posters[name] || "";
  }

  function boxOfficeRankMap(points) {
    const sorted = [...points].sort((a, b) => b.x - a.x);
    const map = new Map();
    sorted.forEach((p, i) => map.set(p.name, i + 1));
    return map;
  }

  function pointsInQuadrant(points, stats, key) {
    const { mx, my } = stats;
    return points.filter((p) => {
      const highBox = p.x >= mx;
      const highRate = p.y >= my;
      if (key === "star") return highBox && highRate;
      if (key === "hit") return highBox && !highRate;
      if (key === "niche") return !highBox && highRate;
      if (key === "flop") return !highBox && !highRate;
      return false;
    });
  }

  function ratingPosterHtml(name) {
    const url = posterUrl(name);
    if (url) {
      return `<div class="champ-rank-poster"><img src="${escapeHtml(url)}" alt="" loading="lazy" /></div>`;
    }
    return `<div class="champ-rank-poster champ-rank-poster--empty">🎬</div>`;
  }

  function buildRatingRankRow(p, rank, maxBox) {
    const pct = maxBox > 0 ? (p.x / maxBox) * 100 : 0;
    const rankCls = Math.min(rank, 3);
    const tags = [];
    if (p.genre) tags.push(`<span class="month-tag month-tag--genre">${escapeHtml(p.genre)}</span>`);
    if (p.country) tags.push(`<span class="month-tag month-tag--country">${escapeHtml(p.country)}</span>`);
    const tagLine = tags.length ? `<div class="month-tags">${tags.join("")}</div>` : "";
    return `
      <div class="rating-modal-row champ-rank-row champ-rank-row--clickable" data-movie-name="${escapeHtml(p.name)}" tabindex="0" role="button" aria-label="查看 ${escapeHtml(ratingShortName(p.name))} 介紹">
        <div class="champ-rank-num champ-rank-num--${rankCls}">${rank}</div>
        ${ratingPosterHtml(p.name)}
        <div class="champ-rank-body">
          <div class="rating-modal-title-line">
            <span class="month-name" title="${escapeHtml(p.name)}">${escapeHtml(ratingShortName(p.name))}</span>
            ${tagLine}
          </div>
          <div class="month-bar-wrap">
            <div class="month-bar" style="width:${Math.max(4, pct)}%;background:#5ba3f5"></div>
          </div>
          <span class="analytics-meta">${formatBoxOffice(p.x)} · TMDB ${p.y.toFixed(1)}</span>
        </div>
        <div class="rating-modal-metric">${formatBoxOffice(p.x)}</div>
      </div>`;
  }

  function bindRatingModalRowClicks(container) {
    container.querySelectorAll(".champ-rank-row--clickable").forEach((row) => {
      const handler = () => {
        const name = row.dataset.movieName;
        const hit = ratingScatterPoints.find((x) => x.name === name);
        if (hit) showRatingMovieModal(hit.name, hit.x, hit.y, ratingScatterPoints);
      };
      row.onclick = handler;
      row.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handler();
        }
      };
    });
  }

  function openRatingModal(title, note, bodyHtml) {
    const modal = document.getElementById("rating-rank-modal");
    const titleEl = document.getElementById("rating-rank-modal-title");
    const noteEl = document.getElementById("rating-rank-modal-note");
    const bodyEl = document.getElementById("rating-rank-modal-body");
    if (!modal || !titleEl || !bodyEl) return;
    titleEl.textContent = title;
    if (noteEl) noteEl.textContent = note || "";
    bodyEl.innerHTML = bodyHtml;
    modal.hidden = false;
    document.body.classList.add("champ-info-modal-open");
    bindRatingModalRowClicks(bodyEl);
  }

  function closeRatingModal() {
    const modal = document.getElementById("rating-rank-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("champ-info-modal-open");
  }

  function showRatingMovieModal(name, boxOffice, rating, points) {
    if (!name || !points?.length) return;
    const rankMap = boxOfficeRankMap(points);
    const rank = rankMap.get(name);
    const meta = movieMeta[name] || {};
    const title = meta.title || ratingShortName(name);
    const rankNote = rank ? `票房排名 #${rank} / ${points.length}` : "";
    const bodyHtml = `
      ${rankNote ? `<p class="rating-modal-rank">${rankNote}</p>` : ""}
      <div class="rating-intro-card rating-intro-card--modal">${buildRatingIntroBlock(name, boxOffice, rating, false)}</div>`;
    openRatingModal(
      title,
      `${formatBoxOffice(boxOffice)} · TMDB ${rating.toFixed(1)} 分`,
      bodyHtml
    );
  }

  function showRatingQuadrantModal(key) {
    const stats = ratingQuadrantStats;
    const points = ratingScatterPoints;
    const meta = QUADRANT_META[key];
    if (!stats || !points.length || !meta) return;
    const filtered = pointsInQuadrant(points, stats, key).sort(meta.sort);
    if (!filtered.length) return;
    const maxBox = Math.max(...filtered.map((p) => p.x), 1);
    const rows = filtered.map((p, i) => buildRatingRankRow(p, i + 1, maxBox)).join("");
    const scopeLabel = ratingScope === RATING_ALL ? "歷年" : `${ratingScope} 年`;
    openRatingModal(
      meta.label,
      `${scopeLabel} · ${meta.note} · 共 ${filtered.length} 片 · 依象限內票房排序`,
      `<div class="rating-modal-list">${rows}</div>`
    );
  }

  function buildRatingIntroBlock(name, boxOffice, rating, compact = false) {
    const meta = movieMeta[name] || {};
    const url = posterUrl(name);
    const title = meta.title || ratingShortName(name);
    const official =
      meta.title && meta.title !== ratingShortName(name) ? ratingShortName(name) : "";
    const tags = [];

    if (rating != null) {
      tags.push(`<span class="champ-info-tag champ-info-tag--rating">TMDB ${rating.toFixed(1)}</span>`);
    }
    if (boxOffice != null) {
      tags.push(`<span class="champ-info-tag">${formatBoxOffice(boxOffice)}</span>`);
    }
    if (meta.runtime > 0) {
      tags.push(`<span class="champ-info-tag">${meta.runtime} 分鐘</span>`);
    }

    const posterBlock = url
      ? `<div class="rating-intro-poster${compact ? " rating-intro-poster--sm" : ""}"><img src="${escapeHtml(url)}" alt="" loading="lazy" /></div>`
      : `<div class="rating-intro-poster rating-intro-poster--empty${compact ? " rating-intro-poster--sm" : ""}">🎬</div>`;

    const overview = (meta.overview || "").trim();
    const limit = compact ? 88 : 220;
    const overviewHtml = overview
      ? `<p class="rating-intro-overview${compact ? " rating-intro-overview--sm" : ""}">${escapeHtml(
          overview.length > limit ? `${overview.slice(0, limit)}…` : overview
        )}</p>`
      : `<p class="champ-info-empty">此片暫無 TMDB 劇情簡介</p>`;

    return `
      ${posterBlock}
      <div class="rating-intro-body">
        <h3 class="rating-intro-title${compact ? " rating-intro-title--sm" : ""}">${escapeHtml(title)}</h3>
        ${official ? `<p class="champ-info-official">官方片名：${escapeHtml(official)}</p>` : ""}
        ${tags.length ? `<div class="champ-info-meta">${tags.join("")}</div>` : ""}
        ${overviewHtml}
      </div>`;
  }

  function showRatingPointDetail(name, boxOffice, rating) {
    ratingSelectedName = name;
    showRatingMovieModal(name, boxOffice, rating, ratingScatterPoints);
  }

  function ratingExternalTooltip(context) {
    const tooltipEl = document.getElementById("rating-scatter-tooltip");
    if (!tooltipEl || !ratingShowIntro) return;

    const tooltip = context.tooltip;
    if (tooltip.opacity === 0) {
      tooltipEl.hidden = true;
      tooltipEl.style.opacity = "0";
      return;
    }

    const point = tooltip.dataPoints?.[0];
    if (!point) return;
    const raw = point.raw || {};
    const name = raw.name || "";
    tooltipEl.innerHTML = buildRatingIntroBlock(name, point.parsed.x, point.parsed.y, true);
    tooltipEl.hidden = false;
    tooltipEl.style.opacity = "1";

    const { offsetLeft, offsetTop } = context.chart.canvas;
    const left = offsetLeft + tooltip.caretX;
    const top = offsetTop + tooltip.caretY;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  }

  function ratingTooltipOptions() {
    if (!ratingShowIntro) {
      return {
        enabled: true,
        callbacks: {
          label(ctx) {
            const raw = ctx.raw || {};
            const name = raw.name ? ratingShortName(raw.name) : "";
            return `${name}：${formatBoxOffice(ctx.parsed.x)} · ${ctx.parsed.y.toFixed(1)} 分`;
          },
        },
      };
    }
    return {
      enabled: false,
      external: ratingExternalTooltip,
    };
  }

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function resolveMovie(q) {
    const query = (q || "").trim();
    if (!query) return null;
    if (payload.movies[query]) return query;
    const lower = query.toLowerCase();
    const exact = payload.movieList.find((n) => n.toLowerCase() === lower);
    if (exact) return exact;
    return payload.movieList.find((n) => n.toLowerCase().includes(lower)) || null;
  }

  function parseSeries(name) {
    const movie = payload.movies[name];
    if (!movie?.s?.length) return null;
    return {
      name,
      country: movie.c || "",
      genre: movie.g || "",
      dates: movie.s.map((p) => p[4]),
      weekValue: movie.s.map((p) => p[1]),
      cumulative: movie.s.map((p) => p[2]),
      tickets: movie.s.map((p) => p[3]),
    };
  }

  function pct(n) {
    return (n * 100).toFixed(1) + "%";
  }

  function chartFont() {
    return { family: "'Noto Sans TC', sans-serif", size: 11 };
  }

  function dualAxisOptions(valueLabel, ticketLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          labels: { color: "#cfd8dc", font: chartFont() },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.dataset.yAxisID === "y1") {
                return `${ctx.dataset.label}：${ctx.parsed.y.toLocaleString()} 張`;
              }
              return `${ctx.dataset.label}：${ctx.parsed.y.toLocaleString()} 萬元`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#8b9cb0", font: chartFont(), maxRotation: 45, minRotation: 0, maxTicksLimit: 14 },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          position: "left",
          title: { display: true, text: valueLabel, color: "#b0bec5", font: chartFont() },
          ticks: { color: "#8b9cb0" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y1: {
          position: "right",
          title: { display: true, text: ticketLabel, color: "#b0bec5", font: chartFont() },
          ticks: { color: "#8b9cb0" },
          grid: { drawOnChartArea: false },
        },
      },
    };
  }

  function setupSuggest(inputId, suggestId, onPick) {
    const input = document.getElementById(inputId);
    const box = document.getElementById(suggestId);

    function renderSuggest() {
      const q = input.value.trim();
      if (q.length < 1) {
        box.hidden = true;
        return;
      }
      const lower = q.toLowerCase();
      const hits = payload.movieList
        .filter((n) => n.toLowerCase().includes(lower))
        .slice(0, 12);
      if (!hits.length) {
        box.hidden = true;
        return;
      }
      box.innerHTML = hits
        .map((n) => `<button type="button" class="analytics-suggest-item" data-name="${n.replace(/"/g, "&quot;")}">${n}</button>`)
        .join("");
      box.hidden = false;
      box.querySelectorAll(".analytics-suggest-item").forEach((btn) => {
        btn.onclick = () => {
          input.value = btn.dataset.name;
          box.hidden = true;
          if (onPick) onPick(btn.dataset.name);
        };
      });
    }

    input.addEventListener("input", renderSuggest);
    input.addEventListener("focus", renderSuggest);
    document.addEventListener("click", (e) => {
      if (!box.contains(e.target) && e.target !== input) box.hidden = true;
    });
  }

  function renderFilmChart() {
    const name = resolveMovie(document.getElementById("film-search").value);
    const metaEl = document.getElementById("film-meta");
    if (!name) {
      metaEl.textContent = "找不到符合的電影，請換個關鍵字。";
      destroyChart("film");
      return;
    }
    const series = parseSeries(name);
    if (!series) {
      metaEl.textContent = "此片無週次資料。";
      destroyChart("film");
      return;
    }

    document.getElementById("film-search").value = name;
    const tags = [series.genre, series.country].filter(Boolean).join(" · ");
    metaEl.textContent = `${name}${tags ? "｜" + tags : ""}｜共 ${series.dates.length} 週`;

    const values = filmMode === "cumulative" ? series.cumulative : series.weekValue;
    const valueLabel = filmMode === "cumulative" ? "累計票房 / 萬元" : "週票房 / 萬元";
    const valueDatasetLabel = filmMode === "cumulative" ? "累計票房" : "週票房";

    destroyChart("film");
    charts.film = new Chart(document.getElementById("film-chart"), {
      type: "bar",
      data: {
        labels: series.dates,
        datasets: [
          {
            label: valueDatasetLabel,
            data: values,
            backgroundColor: "rgba(91,163,245,0.75)",
            borderRadius: 4,
            yAxisID: "y",
            order: 2,
          },
          {
            label: "售票數",
            data: series.tickets,
            type: "line",
            borderColor: "#ffb74d",
            backgroundColor: "#ffb74d",
            borderWidth: 2.5,
            pointRadius: 3,
            tension: 0.25,
            yAxisID: "y1",
            order: 1,
          },
        ],
      },
      options: dualAxisOptions(valueLabel, "售票數 / 張"),
    });
  }

  function alignDuelByPremiere(a, b) {
    const maxWeeks = Math.max(a.dates.length, b.dates.length);
    const labels = Array.from({ length: maxWeeks }, (_, i) => `第 ${i + 1} 週`);

    function pick(series, key) {
      return Array.from({ length: maxWeeks }, (_, i) =>
        i < series[key].length ? series[key][i] : null
      );
    }

    function sumTickets(arr) {
      return arr.reduce((s, n) => s + (n || 0), 0);
    }

    return {
      labels,
      aDates: a.dates,
      bDates: b.dates,
      aWeekValue: pick(a, "weekValue"),
      bWeekValue: pick(b, "weekValue"),
      aCumulative: pick(a, "cumulative"),
      bCumulative: pick(b, "cumulative"),
      aTickets: pick(a, "tickets"),
      bTickets: pick(b, "tickets"),
      summary: {
        a: {
          name: a.name,
          premiere: a.dates[0],
          last: a.dates[a.dates.length - 1],
          weeks: a.dates.length,
          totalValue: a.cumulative[a.cumulative.length - 1] || 0,
          totalTickets: sumTickets(a.tickets),
        },
        b: {
          name: b.name,
          premiere: b.dates[0],
          last: b.dates[b.dates.length - 1],
          weeks: b.dates.length,
          totalValue: b.cumulative[b.cumulative.length - 1] || 0,
          totalTickets: sumTickets(b.tickets),
        },
      },
    };
  }

  function renderDuelMeta(ctx) {
    const el = document.getElementById("duel-meta");
    if (!ctx) {
      el.textContent = "";
      return;
    }
    const suffix = (payload.valueSuffix || " 萬").trim();
    const { a, b } = ctx.summary;
    const valueWinner =
      a.totalValue === b.totalValue ? "平手" : a.totalValue > b.totalValue ? a.name : b.name;
    const ticketWinner =
      a.totalTickets === b.totalTickets
        ? "平手"
        : a.totalTickets > b.totalTickets
          ? a.name
          : b.name;

    el.innerHTML = `
      <strong>${a.name}</strong>：${a.premiere} 首映 → ${a.last} 下片，共 ${a.weeks} 週｜
      累計 ${a.totalValue.toLocaleString()} ${suffix}｜售票 ${a.totalTickets.toLocaleString()} 張
      <br />
      <strong>${b.name}</strong>：${b.premiere} 首映 → ${b.last} 下片，共 ${b.weeks} 週｜
      累計 ${b.totalValue.toLocaleString()} ${suffix}｜售票 ${b.totalTickets.toLocaleString()} 張
      <br />
      累計票房勝：${valueWinner}｜售票勝：${ticketWinner}`;
  }

  function duelChartOptions(ctx) {
    const valueLabel =
      duelValueMode === "cumulative" ? "累計票房 / 萬元" : "週票房 / 萬元";
    const opts = dualAxisOptions(valueLabel, "售票數 / 張");
    opts.plugins.tooltip.callbacks.title = (items) => items[0]?.label || "";
    opts.plugins.tooltip.callbacks.afterTitle = (items) => {
      const idx = items[0]?.dataIndex ?? 0;
      const lines = [];
      if (ctx.aDates[idx]) lines.push(`${ctx.summary.a.name}：${ctx.aDates[idx]}`);
      if (ctx.bDates[idx]) lines.push(`${ctx.summary.b.name}：${ctx.bDates[idx]}`);
      return lines;
    };
    return opts;
  }

  function renderDuelChart() {
    const nameA = resolveMovie(document.getElementById("duel-a").value);
    const nameB = resolveMovie(document.getElementById("duel-b").value);
    if (!nameA || !nameB) {
      alert("請輸入兩部有效的電影名稱。");
      return;
    }
    const seriesA = parseSeries(nameA);
    const seriesB = parseSeries(nameB);
    if (!seriesA || !seriesB) {
      alert("其中一部電影沒有週次資料。");
      return;
    }

    document.getElementById("duel-a").value = nameA;
    document.getElementById("duel-b").value = nameB;

    const ctx = alignDuelByPremiere(seriesA, seriesB);
    duelContext = ctx;
    renderDuelMeta(ctx);

    const valueKey = duelValueMode === "cumulative" ? "Cumulative" : "WeekValue";
    const aValues = ctx[`a${valueKey}`];
    const bValues = ctx[`b${valueKey}`];
    const valueTag = duelValueMode === "cumulative" ? "累計票房" : "週票房";

    destroyChart("duel");
    charts.duel = new Chart(document.getElementById("duel-chart"), {
      type: "line",
      data: {
        labels: ctx.labels,
        datasets: [
          {
            label: `${nameA} ${valueTag}`,
            data: aValues,
            borderColor: DUEL_COLORS[0],
            backgroundColor: DUEL_COLORS[0],
            yAxisID: "y",
            tension: 0.25,
            pointRadius: 3,
            spanGaps: false,
          },
          {
            label: `${nameB} ${valueTag}`,
            data: bValues,
            borderColor: DUEL_COLORS[1],
            backgroundColor: DUEL_COLORS[1],
            yAxisID: "y",
            tension: 0.25,
            pointRadius: 3,
            spanGaps: false,
          },
          {
            label: `${nameA} 售票數`,
            data: ctx.aTickets,
            borderColor: DUEL_COLORS[2],
            borderDash: [6, 4],
            yAxisID: "y1",
            tension: 0.25,
            pointRadius: 2,
            spanGaps: false,
          },
          {
            label: `${nameB} 售票數`,
            data: ctx.bTickets,
            borderColor: DUEL_COLORS[3],
            borderDash: [6, 4],
            yAxisID: "y1",
            tension: 0.25,
            pointRadius: 2,
            spanGaps: false,
          },
        ],
      },
      options: duelChartOptions(ctx),
    });
  }

  function seasonList() {
    return payload.seasons?.[seasonKey] || [];
  }

  function allSeasonEntry() {
    const fromPayload = payload.seasons?.all?.[seasonKey];
    if (fromPayload) return fromPayload;
    const seasons = seasonList();
    if (!seasons.length) return null;
    const years = seasons.map((s) => s.year);
    let totalValue = 0;
    let totalTickets = 0;
    let domesticValue = 0;
    let domesticTickets = 0;
    const movieMap = new Map();
    seasons.forEach((s) => {
      totalValue += s.totalValue || 0;
      totalTickets += s.totalTickets || 0;
      domesticValue += s.domesticValue || 0;
      domesticTickets += s.domesticTickets || 0;
      (s.top || []).forEach((m) => {
        const cur = movieMap.get(m.name);
        if (!cur) movieMap.set(m.name, { ...m });
        else {
          cur.value = (cur.value || 0) + (m.value || 0);
          cur.tickets = (cur.tickets || 0) + (m.tickets || 0);
        }
      });
    });
    const top = [...movieMap.values()].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 15);
    return {
      year: SEASON_ALL,
      label: `${years[0]}–${years[years.length - 1]} 歷年${seasonKey === "spring" ? "春節檔" : "暑假檔"}`,
      period: seasons[0]?.period || "",
      totalValue,
      totalTickets,
      domesticValue,
      domesticShare: totalValue ? domesticValue / totalValue : 0,
      domesticTicketsShare: totalTickets ? domesticTickets / totalTickets : 0,
      top,
    };
  }

  function selectedSeasonEntry() {
    if (selectedSeasonYear === SEASON_ALL) return allSeasonEntry();
    return seasonList().find((s) => s.year === selectedSeasonYear) || null;
  }

  function renderSeasonYearNav() {
    const nav = document.getElementById("season-year-nav");
    if (!nav) return;
    const seasons = seasonList();
    if (
      !selectedSeasonYear ||
      (selectedSeasonYear !== SEASON_ALL && !seasons.some((s) => s.year === selectedSeasonYear))
    ) {
      selectedSeasonYear = seasons[seasons.length - 1]?.year || null;
    }
    const allActive = selectedSeasonYear === SEASON_ALL ? " champ-year-btn--active" : "";
    nav.innerHTML =
      `<button type="button" class="champ-year-btn champ-year-btn--all${allActive}" data-year="${SEASON_ALL}">歷年</button>` +
      seasons
        .map((s) => {
          const active = s.year === selectedSeasonYear ? " champ-year-btn--active" : "";
          return `<button type="button" class="champ-year-btn${active}" data-year="${s.year}">${s.year}</button>`;
        })
        .join("");
    nav.querySelectorAll(".champ-year-btn").forEach((btn) => {
      btn.onclick = () => {
        selectedSeasonYear = btn.dataset.year;
        renderSeasonChart();
      };
    });
  }

  function renderSeasonChart() {
    const seasons = seasonList();
    document.getElementById("season-note").textContent =
      seasons[0]?.period || (seasonKey === "spring" ? "1–2 月週次加總" : "7–8 月週次加總");

    destroyChart("season");
    if (!seasons.length) return;

    charts.season = new Chart(document.getElementById("season-chart"), {
      type: "bar",
      data: {
        labels: seasons.map((s) => s.year),
        datasets: [
          {
            label: "國片占比 (%)",
            data: seasons.map((s) => +(s.domesticShare * 100).toFixed(1)),
            backgroundColor: seasons.map((s) =>
              s.year === selectedSeasonYear && selectedSeasonYear !== SEASON_ALL
                ? "rgba(129,199,132,1)"
                : "rgba(129,199,132,0.55)"
            ),
            borderRadius: 4,
            yAxisID: "y",
          },
          {
            label: "總票房 (萬元)",
            data: seasons.map((s) => s.totalValue),
            type: "line",
            borderColor: "#ffb74d",
            backgroundColor: "#ffb74d",
            yAxisID: "y1",
            tension: 0.25,
            pointRadius: seasons.map((s) =>
              s.year === selectedSeasonYear && selectedSeasonYear !== SEASON_ALL ? 6 : 4
            ),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick(_evt, elements) {
          if (!elements.length) return;
          selectedSeasonYear = seasons[elements[0].index].year;
          renderSeasonChart();
        },
        plugins: {
          legend: { labels: { color: "#cfd8dc", font: chartFont() } },
          tooltip: {
            callbacks: {
              afterBody(items) {
                const s = seasons[items[0].dataIndex];
                return [
                  `總售票：${s.totalTickets.toLocaleString()} 張`,
                  `國片售票占比：${pct(s.domesticTicketsShare)}`,
                  "（點擊長條看該年 Top 片）",
                ];
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: "#8b9cb0", font: chartFont() }, grid: { display: false } },
          y: {
            title: { display: true, text: "國片占比 %", color: "#b0bec5", font: chartFont() },
            ticks: { color: "#8b9cb0" },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y1: {
            position: "right",
            title: { display: true, text: "總票房 / 萬元", color: "#b0bec5", font: chartFont() },
            ticks: { color: "#8b9cb0" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });

    renderSeasonYearNav();
    renderSeasonDetail(selectedSeasonEntry());
  }

  function renderSeasonDetail(season) {
    const el = document.getElementById("season-detail");
    if (!season) {
      el.innerHTML = "";
      return;
    }
    const suffix = (payload.valueSuffix || " 萬").trim();
    const rows = (season.top || [])
      .map(
        (item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.name}</td>
          <td>${item.genre || "—"}</td>
          <td>${item.country || "—"}</td>
          <td>${item.value.toLocaleString()} ${suffix}</td>
          <td>${(item.tickets || 0).toLocaleString()} 張</td>
        </tr>`
      )
      .join("");
    el.innerHTML = `
      <h3>${season.label} 詳情</h3>
      <p class="analytics-meta">
        總票房 ${season.totalValue.toLocaleString()} ${suffix}｜
        售票 ${season.totalTickets.toLocaleString()} 張｜
        國片占比 ${pct(season.domesticShare)}（金額）／${pct(season.domesticTicketsShare)}（售票）
      </p>
      <table class="analytics-table">
        <thead>
          <tr><th>#</th><th>片名</th><th>片種</th><th>國別</th><th>票房</th><th>售票數</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6">無資料</td></tr>'}</tbody>
      </table>`;
  }

  function trendRows(period) {
    return period === "yearly" ? payload.yearlyTrends || [] : payload.monthlyTrends || [];
  }

  function renderDomesticChart() {
    const rows = trendRows(domesticPeriod);
    destroyChart("domestic");
    charts.domestic = new Chart(document.getElementById("domestic-chart"), {
      type: "line",
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          {
            label: "國片金額占比",
            data: rows.map((r) => +(r.domesticShare * 100).toFixed(2)),
            borderColor: "#81c784",
            backgroundColor: "rgba(129,199,132,0.15)",
            fill: true,
            tension: 0.25,
            pointRadius: domesticPeriod === "yearly" ? 5 : 2,
          },
          {
            label: "國片售票占比",
            data: rows.map((r) => +(r.domesticTicketsShare * 100).toFixed(2)),
            borderColor: "#5ba3f5",
            backgroundColor: "rgba(91,163,245,0.1)",
            fill: true,
            tension: 0.25,
            pointRadius: domesticPeriod === "yearly" ? 5 : 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#cfd8dc", font: chartFont() } },
          tooltip: {
            callbacks: {
              label(ctx) {
                return `${ctx.dataset.label}：${ctx.parsed.y}%`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#8b9cb0",
              font: chartFont(),
              maxRotation: 45,
              maxTicksLimit: domesticPeriod === "monthly" ? 18 : 12,
            },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            title: { display: true, text: "占比 %", color: "#b0bec5", font: chartFont() },
            ticks: { color: "#8b9cb0", callback: (v) => v + "%" },
            grid: { color: "rgba(255,255,255,0.06)" },
            suggestedMax: 100,
          },
        },
      },
    });
  }

  function genreColor(genre) {
    const order = payload.genreOrder || [];
    const idx = order.indexOf(genre);
    return GENRE_COLORS[(idx >= 0 ? idx : 0) % GENRE_COLORS.length];
  }

  function topGenres(rows, limit = 6) {
    const totals = new Map();
    rows.forEach((r) => {
      Object.entries(r.byGenreShare || {}).forEach(([g, share]) => {
        totals.set(g, (totals.get(g) || 0) + share);
      });
    });
    const ordered = payload.genreOrder || [];
    const picked = ordered.filter((g) => totals.has(g)).slice(0, limit);
    if (picked.length < limit) {
      [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([g]) => {
          if (!picked.includes(g) && picked.length < limit) picked.push(g);
        });
    }
    return picked.slice(0, limit);
  }

  function activeGenres() {
    const order = payload.genreOrder || [];
    return order.filter((g) => selectedGenres.has(g));
  }

  function syncGenreChips() {
    document.querySelectorAll(".analytics-genre-chip").forEach((btn) => {
      btn.classList.toggle("analytics-genre-chip--active", selectedGenres.has(btn.dataset.genre));
    });
  }

  function initGenrePicker() {
    const wrap = document.getElementById("genre-picker");
    const genres = payload.genreOrder || [];
    selectedGenres = new Set(topGenres(trendRows(genrePeriod)));

    wrap.innerHTML = genres
      .map((g) => {
        const active = selectedGenres.has(g) ? " analytics-genre-chip--active" : "";
        return `<button type="button" class="analytics-genre-chip${active}" data-genre="${g}" style="--chip-color:${genreColor(g)}">${g}</button>`;
      })
      .join("");

    wrap.querySelectorAll(".analytics-genre-chip").forEach((btn) => {
      btn.onclick = () => {
        const g = btn.dataset.genre;
        if (selectedGenres.has(g)) {
          if (selectedGenres.size <= 1) return;
          selectedGenres.delete(g);
        } else {
          selectedGenres.add(g);
        }
        syncGenreChips();
        renderGenreChart();
      };
    });

    document.getElementById("genre-preset-top6").onclick = () => {
      selectedGenres = new Set(topGenres(trendRows(genrePeriod)));
      syncGenreChips();
      renderGenreChart();
    };
    document.getElementById("genre-select-all").onclick = () => {
      selectedGenres = new Set(payload.genreOrder || []);
      syncGenreChips();
      renderGenreChart();
    };
    document.getElementById("genre-clear-all").onclick = () => {
      const top = topGenres(trendRows(genrePeriod), 1);
      selectedGenres = new Set(top.length ? top : [(payload.genreOrder || [])[0]].filter(Boolean));
      syncGenreChips();
      renderGenreChart();
    };
  }

  function renderGenreChart() {
    const rows = trendRows(genrePeriod);
    const genres = activeGenres();
    if (!genres.length) return;
    destroyChart("genre");
    charts.genre = new Chart(document.getElementById("genre-chart"), {
      type: "line",
      data: {
        labels: rows.map((r) => r.label),
        datasets: genres.map((g) => ({
          label: g,
          data: rows.map((r) => +((r.byGenreShare?.[g] || 0) * 100).toFixed(2)),
          borderColor: genreColor(g),
          backgroundColor: genreColor(g),
          tension: 0.25,
          pointRadius: genrePeriod === "yearly" ? 4 : 1,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#cfd8dc", font: chartFont() } },
          tooltip: {
            callbacks: {
              label(ctx) {
                return `${ctx.dataset.label}：${ctx.parsed.y}%`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#8b9cb0",
              font: chartFont(),
              maxRotation: 45,
              maxTicksLimit: genrePeriod === "monthly" ? 18 : 12,
            },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            title: { display: true, text: "片種占比 %", color: "#b0bec5", font: chartFont() },
            ticks: { color: "#8b9cb0", callback: (v) => v + "%" },
            grid: { color: "rgba(255,255,255,0.06)" },
            min: 0,
            max: 100,
          },
        },
      },
    });
  }

  async function loadMovieMeta() {
    const paths = ["movie_meta.json", "../data/bar_race_movie_meta.json"];
    for (const path of paths) {
      try {
        const res = await fetch(path);
        if (res.ok) {
          movieMeta = await res.json();
          return;
        }
      } catch {
        /* try next */
      }
    }
    movieMeta = {};
  }

  async function loadYearlyRankings() {
    const res = await fetch("yearly_rankings.json");
    if (!res.ok) throw new Error("yearly_rankings HTTP " + res.status);
    yearlyRankings = await res.json();
  }

  function moviesForRatingScope(scope) {
    if (!yearlyRankings) return [];
    let movies = [];
    if (scope === RATING_ALL) {
      movies = mergeMoviesByName(
        (yearlyRankings.years || []).flatMap((y) => yearlyRankings.movies?.[y] || [])
      );
    } else {
      movies = yearlyRankings.movies?.[scope] || [];
    }
    const selected = ratingCountryPicker ? ratingCountryPicker.getSelected() : new Set();
    if (!selected.size) return movies;
    return movies.filter((m) => matchesCountries(m.country, selected));
  }

  function allRatingCountries() {
    const set = new Set();
    (yearlyRankings?.years || []).forEach((year) => {
      (yearlyRankings.movies?.[year] || []).forEach((m) => {
        if (m.country) set.add(m.country);
      });
    });
    return sortCountries([...set]);
  }

  function refreshRatingCountryPicker() {
    const countries = allRatingCountries();
    const wrap = document.getElementById("rating-country-filter-wrap");
    if (wrap) wrap.style.display = countries.length ? "" : "none";
    if (ratingCountryPicker && countries.length) {
      ratingCountryPicker.setCountries(countries);
    }
  }

  function defaultTrendCountries(available) {
    const picked = PRIORITY_COUNTRIES.filter((c) => available.includes(c)).slice(0, 8);
    if (picked.length) return picked;
    return available.slice(0, Math.min(8, available.length));
  }

  function ensureRatingTrendSelection() {
    const available = allRatingCountries();
    ratingTrendCountries = new Set(
      [...ratingTrendCountries].filter((c) => available.includes(c))
    );
    if (!ratingTrendCountries.size) {
      defaultTrendCountries(available).forEach((c) => ratingTrendCountries.add(c));
    }
  }

  function syncRatingTrendChips() {
    document.querySelectorAll(".rating-trend-chip").forEach((btn) => {
      btn.classList.toggle(
        "analytics-genre-chip--active",
        ratingTrendCountries.has(btn.dataset.country)
      );
    });
  }

  function renderRatingTrendPicker() {
    ensureRatingTrendSelection();
    const wrap = document.getElementById("rating-trend-picker");
    if (!wrap) return;
    const countries = allRatingCountries();
    if (!countries.length) {
      wrap.innerHTML = '<p class="analytics-meta">尚無國別資料</p>';
      return;
    }

    const { primary, more } = splitCountriesForDisplay(countries);
    const moreSelected = more.filter((c) => ratingTrendCountries.has(c)).length;
    if (moreSelected > 0) ratingTrendMoreExpanded = true;

    const chipHtml = (c, i) => {
      const active = ratingTrendCountries.has(c) ? " analytics-genre-chip--active" : "";
      return `<button type="button" class="analytics-genre-chip rating-trend-chip${active}" data-country="${escapeHtml(c)}" style="--chip-color:${countryColor(c, i)}">${escapeHtml(c)}</button>`;
    };

    const moreBtn =
      more.length > 0
        ? `<button type="button" class="analytics-genre-chip rating-trend-chip analytics-country-chip--more${
            ratingTrendMoreExpanded ? " analytics-country-chip--more-open" : ""
          }${moreSelected ? " analytics-genre-chip--active" : ""}" data-action="toggle-more" aria-expanded="${
            ratingTrendMoreExpanded ? "true" : "false"
          }">更多國家 (${more.length})${moreSelected ? ` · 已選 ${moreSelected}` : ""}</button>`
        : "";

    const morePanel =
      more.length > 0
        ? `<div class="analytics-country-more" id="rating-trend-picker-more" role="group" aria-label="更多國別"${
            ratingTrendMoreExpanded ? "" : " hidden"
          }>${more.map((c, i) => chipHtml(c, primary.length + i)).join("")}</div>`
        : "";

    wrap.innerHTML = `
      <div class="analytics-country-primary">${primary.map(chipHtml).join("")}${moreBtn}</div>
      ${morePanel}`;

    wrap.querySelectorAll(".rating-trend-chip").forEach((btn) => {
      if (btn.dataset.action === "toggle-more") {
        btn.onclick = () => {
          ratingTrendMoreExpanded = !ratingTrendMoreExpanded;
          btn.classList.toggle("analytics-country-chip--more-open", ratingTrendMoreExpanded);
          btn.setAttribute("aria-expanded", ratingTrendMoreExpanded ? "true" : "false");
          const panel = document.getElementById("rating-trend-picker-more");
          if (panel) panel.hidden = !ratingTrendMoreExpanded;
        };
        return;
      }
      btn.onclick = () => {
        const c = btn.dataset.country;
        if (ratingTrendCountries.has(c)) ratingTrendCountries.delete(c);
        else ratingTrendCountries.add(c);
        syncRatingTrendChips();
        renderCountryRatingChart();
      };
    });
  }

  function avgCountryRatingInYear(country, year) {
    const movies = (yearlyRankings.movies?.[year] || []).filter((m) => m.country === country);
    const ratings = movies
      .map((m) => movieMeta[m.name]?.vote_average)
      .filter((r) => r != null && r > 0);
    if (!ratings.length) return null;
    return ratings.reduce((s, r) => s + r, 0) / ratings.length;
  }

  function renderCountryRatingChart() {
    if (!yearlyRankings) return;
    ensureRatingTrendSelection();
    renderRatingTrendPicker();

    const years = yearlyRankings.years || [];
    const countries = sortCountries([...ratingTrendCountries]);
    const metaEl = document.getElementById("rating-country-trend-meta");
    destroyChart("ratingCountry");

    if (!countries.length || !years.length) {
      if (metaEl) metaEl.textContent = "請至少選擇一個國別";
      return;
    }

    const datasets = countries.map((country, i) => ({
      label: country,
      data: years.map((year) => {
        const avg = avgCountryRatingInYear(country, year);
        return avg != null ? +avg.toFixed(2) : null;
      }),
      borderColor: countryColor(country, i),
      backgroundColor: countryColor(country, i),
      tension: 0.25,
      spanGaps: true,
      pointRadius: 4,
      pointHoverRadius: 6,
    }));

    const sampleNotes = countries
      .map((c) => {
        const n = years.filter((y) => avgCountryRatingInYear(c, y) != null).length;
        if (n === 0) {
          return `${c} 0 年（缺 TMDB 評分；該國片在台年度票房多未進 Top 30，尚未抓取）`;
        }
        return `${c} ${n} 年`;
      })
      .join(" · ");
    if (metaEl) {
      metaEl.textContent = `已選 ${countries.length} 國 · 各國有評分資料的年份數：${sampleNotes}`;
    }

    const canvas = document.getElementById("rating-country-chart");
    if (!canvas) return;

    charts.ratingCountry = new Chart(canvas, {
      type: "line",
      data: { labels: years, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            labels: { color: "#cfd8dc", font: chartFont(), boxWidth: 12 },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                if (ctx.parsed.y == null) return `${ctx.dataset.label}：無資料`;
                return `${ctx.dataset.label}：${ctx.parsed.y.toFixed(2)} 分`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#8b9cb0", font: chartFont() },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            title: {
              display: true,
              text: "平均 TMDB 評分",
              color: "#b0bec5",
              font: chartFont(),
            },
            ticks: { color: "#8b9cb0" },
            grid: { color: "rgba(255,255,255,0.06)" },
            suggestedMin: 4,
            suggestedMax: 10,
          },
        },
      },
    });
  }

  function fillRatingScopeSelect() {
    const sel = document.getElementById("rating-scope");
    if (!sel || !yearlyRankings) return;
    const years = yearlyRankings.years || [];
    sel.innerHTML =
      `<option value="${RATING_ALL}">歷年（${years[0] || ""}–${years[years.length - 1] || ""}）</option>` +
      years.map((y) => `<option value="${y}">${y} 年</option>`).join("");
    sel.value = ratingScope;
  }

  function renderRatingQuadrants(stats, total) {
    const el = document.getElementById("rating-quadrants");
    if (!el) return;
    const { counts } = stats;
    el.innerHTML = `
      <div class="rating-quadrant rating-quadrant--niche rating-quadrant--clickable" data-quadrant="niche" role="button" tabindex="0" aria-label="查看叫好不叫座排行">
        <span class="rating-quadrant-label">叫好不叫座</span>
        <strong>${counts.niche}</strong>
        <span class="rating-quadrant-note">低票房 · 高評分 · 點擊看排行</span>
      </div>
      <div class="rating-quadrant rating-quadrant--star rating-quadrant--clickable" data-quadrant="star" role="button" tabindex="0" aria-label="查看叫好又叫座排行">
        <span class="rating-quadrant-label">叫好又叫座</span>
        <strong>${counts.star}</strong>
        <span class="rating-quadrant-note">高票房 · 高評分 · 點擊看排行</span>
      </div>
      <div class="rating-quadrant rating-quadrant--flop rating-quadrant--clickable" data-quadrant="flop" role="button" tabindex="0" aria-label="查看雙低排行">
        <span class="rating-quadrant-label">雙低</span>
        <strong>${counts.flop}</strong>
        <span class="rating-quadrant-note">低票房 · 低評分 · 點擊看排行</span>
      </div>
      <div class="rating-quadrant rating-quadrant--hit rating-quadrant--clickable" data-quadrant="hit" role="button" tabindex="0" aria-label="查看高票房低口碑排行">
        <span class="rating-quadrant-label">高票房低口碑</span>
        <strong>${counts.hit}</strong>
        <span class="rating-quadrant-note">高票房 · 低評分 · 共 ${total} 片 · 點擊看排行</span>
      </div>`;

    el.querySelectorAll("[data-quadrant]").forEach((card) => {
      const open = () => showRatingQuadrantModal(card.dataset.quadrant);
      card.onclick = open;
      card.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      };
    });
  }

  function renderRatingOutliers(stats) {
    const el = document.getElementById("rating-outliers");
    if (!el) return;
    const hit = (stats.highlights?.hit || []).slice(0, 6);
    const niche = (stats.highlights?.niche || []).slice(0, 6);

    const rowHtml = (rows, title, note, quadrantKey) => {
      if (!rows.length) {
        return `<div class="rating-outlier-col"><h4>${title}</h4><p class="analytics-meta">${note}（此時段無明顯案例）</p></div>`;
      }
      const list = rows
        .map(
          (p) =>
            `<li><button type="button" class="rating-outlier-item" data-quadrant="${quadrantKey}" data-name="${escapeHtml(p.name)}"><strong>${ratingShortName(p.name)}</strong> · ${formatBoxOffice(p.x)} · ${p.y.toFixed(1)} 分</button></li>`
        )
        .join("");
      return `<div class="rating-outlier-col"><h4>${title}</h4><p class="analytics-meta">${note}</p><ul class="rating-outlier-list">${list}</ul></div>`;
    };

    el.innerHTML = `
      <div class="rating-outlier-head">
        <h3>快速預覽</h3>
        <p class="analytics-meta">點片名查看詳情，或點上方象限卡看完整排行</p>
      </div>
      <div class="rating-outlier-grid">
        ${rowHtml(hit, "高票房 · 低評分", "高票房低口碑候選", "hit")}
        ${rowHtml(niche, "低票房 · 高評分", "口碑佳但院線較弱", "niche")}
      </div>`;

    el.querySelectorAll(".rating-outlier-item").forEach((btn) => {
      btn.onclick = () => {
        const name = btn.dataset.name;
        const hitPoint = ratingScatterPoints.find((p) => p.name === name);
        if (hitPoint) {
          showRatingMovieModal(hitPoint.name, hitPoint.x, hitPoint.y, ratingScatterPoints);
          return;
        }
        if (btn.dataset.quadrant) showRatingQuadrantModal(btn.dataset.quadrant);
      };
    });
  }

  function renderRatingStats(scopeLabel, points, minValue, maxValue, r, stats) {
    const minNote = minValue ? `≥ ${formatBoxOffice(minValue)}` : "不限";
    const maxNote = maxValue ? `≤ ${formatBoxOffice(maxValue)}` : "不限";
    const rangeNote =
      minValue || maxValue ? `${minNote} · ${maxNote}` : "不限";
    const countrySel = ratingCountryPicker?.getSelected();
    const countryNote =
      countrySel?.size > 0
        ? `${countrySel.size} 國`
        : "全部";
    renderAnalyticsStatRow("rating-stats", [
      { label: "時段", value: scopeLabel },
      { label: "樣本", value: `${points.length} 部` },
      { label: "票房區間", value: rangeNote },
      { label: "國別", value: countryNote },
      { label: "相關係數", value: r != null ? `r = ${r.toFixed(2)}` : "—" },
      { label: "票房中位", value: formatBoxOffice(Math.round(stats.mx)) },
      { label: "評分中位", value: stats.my.toFixed(1) },
    ]);
  }

  function renderRatingPanel() {
    if (!yearlyRankings) return;
    const minValue = parseInt(document.getElementById("rating-min-value")?.value || "0", 10) || 0;
    const maxValue = parseInt(document.getElementById("rating-max-value")?.value || "0", 10) || 0;
    const movies = moviesForRatingScope(ratingScope);
    const points = buildScatterPoints(movies, movieMeta, minValue, maxValue);
    const r = pearsonR(points);
    const stats = quadrantStats(points);
    const scopeLabel =
      ratingScope === RATING_ALL
        ? `歷年 ${(yearlyRankings.years || []).length} 個年度`
        : `${ratingScope} 年`;

    renderRatingStats(scopeLabel, points, minValue, maxValue, r, stats);
    const corrNote = document.getElementById("rating-correlation-note");
    if (corrNote) corrNote.textContent = interpretCorrelation(r);
    renderRatingQuadrants(stats, points.length);
    ratingScatterPoints = points;
    ratingQuadrantStats = stats;
    renderRatingOutliers(stats);
    refreshRatingCountryPicker();
    renderCountryRatingChart();

    if (!ratingShowIntro) hideRatingIntroUi();

    destroyChart("rating");
    const canvas = document.getElementById("rating-chart");
    if (!canvas || !points.length) return;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const xMin = 0;
    const xMax = Math.max(...xs) * 1.05;
    const yMin = Math.max(0, Math.min(...ys) - 0.5);
    const yMax = Math.min(10, Math.max(...ys) + 0.3);

    charts.rating = new Chart(canvas, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "電影",
            data: points.map((p) => ({ x: p.x, y: p.y, name: p.name })),
            backgroundColor: "rgba(91,163,245,0.55)",
            borderColor: "#5ba3f5",
            pointRadius: 5,
            pointHoverRadius: 7,
            pointHitRadius: 12,
          },
          {
            label: "票房中位數",
            type: "line",
            data: [
              { x: stats.mx, y: yMin },
              { x: stats.mx, y: yMax },
            ],
            borderColor: "rgba(255,213,79,0.55)",
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
          },
          {
            label: "評分中位數",
            type: "line",
            data: [
              { x: xMin, y: stats.my },
              { x: xMax, y: stats.my },
            ],
            borderColor: "rgba(229,115,115,0.55)",
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick(_evt, elements) {
          if (!elements.length) return;
          const el = elements[0];
          if (el.datasetIndex !== 0) return;
          const raw = charts.rating.data.datasets[0].data[el.index] || {};
          if (!raw.name) return;
          showRatingMovieModal(raw.name, raw.x, raw.y, points);
        },
        plugins: {
          legend: {
            labels: { color: "#cfd8dc", font: { family: "'Noto Sans TC', sans-serif" } },
          },
          tooltip: ratingTooltipOptions(),
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "票房",
              color: "#8b9cb0",
              font: { family: "'Noto Sans TC', sans-serif" },
            },
            ticks: {
              color: "#8b9cb0",
              callback: (v) => formatBoxOfficeAxis(v),
            },
            grid: { color: "rgba(255,255,255,0.06)" },
            min: xMin,
          },
          y: {
            title: {
              display: true,
              text: "TMDB 評分",
              color: "#8b9cb0",
              font: { family: "'Noto Sans TC', sans-serif" },
            },
            ticks: { color: "#8b9cb0" },
            grid: { color: "rgba(255,255,255,0.06)" },
            min: yMin,
            max: yMax,
          },
        },
      },
    });

  }

  function showPanel(panelId) {
    document.querySelectorAll(".analytics-panel").forEach((p) => {
      p.hidden = p.id !== `panel-${panelId}`;
    });
    document.querySelectorAll(".analytics-tab").forEach((btn) => {
      btn.classList.toggle("analytics-tab--active", btn.dataset.panel === panelId);
    });
    if (panelId === "season") renderSeasonChart();
    if (panelId === "domestic") renderDomesticChart();
    if (panelId === "genre") renderGenreChart();
    if (panelId === "country") renderCountryPanel();
    if (panelId === "rating") renderRatingPanel();
  }

  function countryTrendRows() {
    return countryPeriod === "yearly" ? payload.yearlyTrends || [] : payload.monthlyTrends || [];
  }

  function countryColor(name, idx) {
    return COUNTRY_COLORS[idx % COUNTRY_COLORS.length];
  }

  function shortMovieName(name) {
    return (name || "").replace(/\s*\(\d{4}\)\s*$/, "");
  }

  function posterHtml(name) {
    const url = posters[name];
    if (url) {
      return `<img class="analytics-rep-poster" src="${url}" alt="" loading="lazy" />`;
    }
    return `<div class="analytics-rep-poster analytics-rep-poster--empty">🎬</div>`;
  }

  function topCountries(limit = 8, rows) {
    const totals = new Map();
    (rows || payload.monthlyTrends || []).forEach((row) => {
      (row.byCountry || []).forEach((c) => {
        totals.set(c.country, (totals.get(c.country) || 0) + c.value);
      });
    });
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([c]) => c);
  }

  function periodCountryRows() {
    const row = currentCountryPeriodRow();
    return (row?.byCountry || []).filter((c) => c.value > 0);
  }

  function countriesInPeriod() {
    const names = periodCountryRows().map((c) => c.country);
    return sortCountries([...new Set(names)]);
  }

  function topCountriesInPeriod(limit = 8) {
    return periodCountryRows()
      .sort((a, b) => b.value - a.value)
      .slice(0, limit)
      .map((c) => c.country);
  }

  function ensureCountrySelection() {
    const available = new Set(countriesInPeriod());
    selectedCountries = new Set([...selectedCountries].filter((c) => available.has(c)));
    if (!selectedCountries.size && available.size) {
      selectedCountries = new Set(topCountriesInPeriod(Math.min(8, available.size)));
    }
  }

  function activeCountries() {
    return countriesInPeriod().filter((c) => selectedCountries.has(c));
  }

  function syncCountryChips() {
    document.querySelectorAll(".analytics-country-chip").forEach((btn) => {
      if (btn.dataset.action === "toggle-more") return;
      btn.classList.toggle(
        "analytics-genre-chip--active",
        selectedCountries.has(btn.dataset.country)
      );
    });
    const moreBtn = document.querySelector(".analytics-country-chip--more");
    if (!moreBtn) return;
    const { more } = splitCountriesForDisplay(countriesInPeriod());
    const moreSelected = more.filter((c) => selectedCountries.has(c)).length;
    moreBtn.classList.toggle("analytics-country-chip--more-open", countryMoreExpanded);
    moreBtn.classList.toggle("analytics-genre-chip--active", moreSelected > 0);
    moreBtn.setAttribute("aria-expanded", countryMoreExpanded ? "true" : "false");
    moreBtn.textContent = `更多國家 (${more.length})${moreSelected ? ` · 已選 ${moreSelected}` : ""}`;
  }

  function bindCountryChip(btn) {
    if (btn.dataset.action === "toggle-more") {
      btn.onclick = () => {
        countryMoreExpanded = !countryMoreExpanded;
        syncCountryChips();
        const panel = document.getElementById("country-picker-more");
        if (panel) panel.hidden = !countryMoreExpanded;
      };
      return;
    }
    btn.onclick = () => {
      const c = btn.dataset.country;
      if (selectedCountries.has(c)) {
        if (selectedCountries.size <= 1) return;
        selectedCountries.delete(c);
      } else {
        selectedCountries.add(c);
      }
      syncCountryChips();
      renderCountryChart();
      renderCountryDetail();
    };
  }

  function renderCountryPicker() {
    ensureCountrySelection();
    const wrap = document.getElementById("country-picker");
    const countries = countriesInPeriod();
    const label = document.getElementById("country-picker-label");

    if (label) {
      label.textContent = countries.length
        ? `本時段 ${countries.length} 國（僅顯示有票房者）`
        : "本時段無國別資料";
    }

    if (!countries.length) {
      wrap.innerHTML = '<p class="analytics-meta">此時段沒有電影票房紀錄。</p>';
      return;
    }

    const { primary, more } = splitCountriesForDisplay(countries);
    const moreSelected = more.filter((c) => selectedCountries.has(c)).length;
    if (moreSelected > 0) countryMoreExpanded = true;

    const chipHtml = (c, i) => {
      const active = selectedCountries.has(c) ? " analytics-genre-chip--active" : "";
      return `<button type="button" class="analytics-genre-chip analytics-country-chip${active}" data-country="${escapeHtml(c)}" style="--chip-color:${countryColor(c, i)}">${escapeHtml(c)}</button>`;
    };

    const moreBtn =
      more.length > 0
        ? `<button type="button" class="analytics-genre-chip analytics-country-chip analytics-country-chip--more${
            countryMoreExpanded ? " analytics-country-chip--more-open" : ""
          }${moreSelected ? " analytics-genre-chip--active" : ""}" data-action="toggle-more" aria-expanded="${
            countryMoreExpanded ? "true" : "false"
          }">更多國家 (${more.length})${moreSelected ? ` · 已選 ${moreSelected}` : ""}</button>`
        : "";

    const morePanel =
      more.length > 0
        ? `<div class="analytics-country-more" id="country-picker-more" role="group" aria-label="更多國別"${
            countryMoreExpanded ? "" : " hidden"
          }>${more.map((c, i) => chipHtml(c, primary.length + i)).join("")}</div>`
        : "";

    wrap.innerHTML = `
      <div class="analytics-country-primary">${primary.map(chipHtml).join("")}${moreBtn}</div>
      ${morePanel}`;

    wrap.querySelectorAll(".analytics-country-chip").forEach(bindCountryChip);
  }

  function initCountryPickerEvents() {
    document.getElementById("country-preset-top8").onclick = () => {
      selectedCountries = new Set(topCountriesInPeriod(8));
      countryMoreExpanded = false;
      renderCountryPicker();
      renderCountryChart();
      renderCountryDetail();
    };
    document.getElementById("country-select-all").onclick = () => {
      selectedCountries = new Set(countriesInPeriod());
      countryMoreExpanded = true;
      renderCountryPicker();
      renderCountryChart();
      renderCountryDetail();
    };
    document.getElementById("country-clear-all").onclick = () => {
      const top = topCountriesInPeriod(1);
      selectedCountries = new Set(top.length ? top : countriesInPeriod().slice(0, 1));
      countryMoreExpanded = false;
      renderCountryPicker();
      renderCountryChart();
      renderCountryDetail();
    };
  }

  function initCountryYearSelect() {
    const sel = document.getElementById("country-year");
    const years = new Set();
    (payload.monthlyTrends || []).forEach((r) => {
      if (r.month) years.add(r.month.split("-")[0]);
    });
    (payload.yearlyTrends || []).forEach((r) => {
      if (r.year) years.add(r.year);
    });
    const sorted = [...years].sort();
    if (!selectedCountryYear || !sorted.includes(selectedCountryYear)) {
      selectedCountryYear = sorted[sorted.length - 1] || null;
    }
    sel.innerHTML = sorted.map((y) => `<option value="${y}">${y}</option>`).join("");
    sel.value = selectedCountryYear;
    sel.onchange = () => {
      selectedCountryYear = sel.value;
      renderCountryMonthPills();
      renderCountryPanel();
    };
  }

  function renderCountryMonthPills() {
    const wrap = document.getElementById("country-month-pills");
    if (countryPeriod === "yearly") {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const months = (payload.monthlyTrends || [])
      .filter((r) => r.month?.startsWith(selectedCountryYear + "-"))
      .map((r) => r.month.split("-")[1]);
    if (!selectedCountryMonth || !months.includes(selectedCountryMonth)) {
      selectedCountryMonth = months[months.length - 1] || null;
    }
    wrap.innerHTML = months
      .map((m) => {
        const active = m === selectedCountryMonth ? " month-pill--active" : "";
        return `<button type="button" class="month-pill${active}" data-month="${m}">${parseInt(m, 10)} 月</button>`;
      })
      .join("");
    wrap.querySelectorAll(".month-pill").forEach((btn) => {
      btn.onclick = () => {
        selectedCountryMonth = btn.dataset.month;
        renderCountryMonthPills();
        renderCountryPanel();
      };
    });
  }

  function currentCountryPeriodRow() {
    if (countryPeriod === "yearly") {
      return (payload.yearlyTrends || []).find((r) => r.year === selectedCountryYear) || null;
    }
    const key = `${selectedCountryYear}-${selectedCountryMonth}`;
    return (payload.monthlyTrends || []).find((r) => r.month === key) || null;
  }

  function chartRowsForCountries() {
    const countries = activeCountries();
    if (!countries.length) return { labels: [], datasets: [] };

    if (countryPeriod === "yearly") {
      const rows = payload.yearlyTrends || [];
      return {
        labels: rows.map((r) => r.label),
        rows,
        countries,
      };
    }

    const rows = (payload.monthlyTrends || []).filter((r) =>
      r.month?.startsWith(selectedCountryYear + "-")
    );
    return {
      labels: rows.map((r) => `${parseInt(r.month.split("-")[1], 10)}月`),
      rows,
      countries,
    };
  }

  function renderCountryChart() {
    const ctx = chartRowsForCountries();
    const countries = ctx.countries || [];
    destroyChart("country");
    if (!countries.length || !ctx.rows?.length) return;

    charts.country = new Chart(document.getElementById("country-chart"), {
      type: "line",
      data: {
        labels: ctx.labels,
        datasets: countries.map((c, i) => ({
          label: c,
          data: ctx.rows.map((row) => {
            const hit = (row.byCountry || []).find((x) => x.country === c);
            return hit ? hit.value : 0;
          }),
          borderColor: countryColor(c, i),
          backgroundColor: countryColor(c, i),
          tension: 0.25,
          pointRadius: countryPeriod === "yearly" ? 4 : 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#cfd8dc", font: chartFont() } },
          tooltip: {
            callbacks: {
              label(item) {
                return `${item.dataset.label}：${item.parsed.y.toLocaleString()} 萬元`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#8b9cb0", font: chartFont(), maxRotation: 45 },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            title: { display: true, text: "票房 / 萬元", color: "#b0bec5", font: chartFont() },
            ticks: { color: "#8b9cb0" },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
        },
      },
    });
  }

  function renderCountryDetail() {
    const el = document.getElementById("country-detail");
    const row = currentCountryPeriodRow();
    const suffix = (payload.valueSuffix || " 萬").trim();

    if (!row) {
      el.innerHTML = '<p class="analytics-meta">此期間無資料</p>';
      renderAnalyticsStatRow("country-stats", []);
      return;
    }

    if (!row.byCountry?.length) {
      el.innerHTML =
        '<p class="analytics-meta">此期間無國別資料。若為舊版 analytics.json，請執行 python -m scripts.build_bar_race_data 重新產生。</p>';
      renderAnalyticsStatRow("country-stats", [{ label: "期間", value: row.label }]);
      return;
    }

    const countries = activeCountries();
    const rows = (row.byCountry || [])
      .filter((c) => countries.includes(c.country))
      .sort((a, b) => b.value - a.value);

    renderAnalyticsStatRow("country-stats", [
      { label: "期間", value: row.label },
      { label: "總票房", value: `${row.totalValue.toLocaleString()} ${suffix}` },
      { label: "售票", value: `${row.totalTickets.toLocaleString()} 張` },
      { label: "顯示國別", value: `${rows.length} 國` },
    ]);

    const body = rows
      .map((c, i) => {
        const rep = c.rep;
        const repCell = rep
          ? `<div class="analytics-rep-cell">
              ${posterHtml(rep.name)}
              <div>
                <div class="analytics-rep-title" title="${rep.name}">${shortMovieName(rep.name)}</div>
                <div class="analytics-rep-sub">${rep.genre || "—"} · ${rep.value.toLocaleString()} ${suffix}</div>
              </div>
            </div>`
          : "—";
        return `
          <tr>
            <td>${i + 1}</td>
            <td>${c.country}</td>
            <td>${c.value.toLocaleString()} ${suffix}</td>
            <td>${pct(c.share)}</td>
            <td>${(c.tickets || 0).toLocaleString()} 張</td>
            <td>${repCell}</td>
          </tr>`;
      })
      .join("");

    el.innerHTML = `
      <h3>${row.label} 各國票房與代表作品</h3>
      <table class="analytics-table analytics-country-table">
        <thead>
          <tr>
            <th>#</th>
            <th>國別</th>
            <th>票房</th>
            <th>占比</th>
            <th>售票數</th>
            <th>代表作品</th>
          </tr>
        </thead>
        <tbody>${body || '<tr><td colspan="6">無符合篩選的國別資料</td></tr>'}</tbody>
      </table>`;
  }

  function renderCountryPanel() {
    renderCountryMonthPills();
    renderCountryPicker();
    renderCountryChart();
    renderCountryDetail();
  }

  async function init() {
    await Promise.all([
      loadAnalytics().then((d) => {
        payload = d;
      }),
      loadPosters(),
      loadMovieMeta(),
      loadYearlyRankings(),
    ]);
    document.getElementById("analytics-subtitle").textContent = payload.subtitle || "";
    fillRatingScopeSelect();
    ratingCountryPicker = new CountryMultiSelect("rating-country-picker", {
      onChange: renderRatingPanel,
    });
    refreshRatingCountryPicker();
    document.getElementById("rating-scope").onchange = (e) => {
      ratingScope = e.target.value;
      renderRatingPanel();
    };
    document.getElementById("rating-min-value").onchange = renderRatingPanel;
    document.getElementById("rating-max-value").onchange = renderRatingPanel;
    syncRatingIntroToggle();
    document.getElementById("rating-intro-toggle").onclick = () => {
      ratingShowIntro = !ratingShowIntro;
      if (!ratingShowIntro) hideRatingIntroUi();
      syncRatingIntroToggle();
      renderRatingPanel();
    };
    document.getElementById("rating-rank-modal-close").onclick = closeRatingModal;
    document.getElementById("rating-rank-modal-backdrop").onclick = closeRatingModal;
    document.getElementById("rating-trend-preset").onclick = () => {
      ratingTrendCountries = new Set(defaultTrendCountries(allRatingCountries()));
      ratingTrendMoreExpanded = false;
      renderCountryRatingChart();
    };
    document.getElementById("rating-trend-clear").onclick = () => {
      const available = allRatingCountries();
      ratingTrendCountries = new Set(available.slice(0, 1));
      ratingTrendMoreExpanded = false;
      renderCountryRatingChart();
    };
    initGenrePicker();
    initCountryPickerEvents();
    initCountryYearSelect();
    renderCountryMonthPills();

    setupSuggest("film-search", "film-suggest", renderFilmChart);
    setupSuggest("duel-a", "duel-suggest-a");
    setupSuggest("duel-b", "duel-suggest-b");

    document.getElementById("film-go").onclick = renderFilmChart;
    document.getElementById("film-mode").onchange = (e) => {
      filmMode = e.target.value;
      if (resolveMovie(document.getElementById("film-search").value)) renderFilmChart();
    };
    document.getElementById("film-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") renderFilmChart();
    });

    document.getElementById("duel-go").onclick = renderDuelChart;
    document.getElementById("duel-value-mode").onchange = (e) => {
      duelValueMode = e.target.value;
      if (duelContext) renderDuelChart();
    };

    document.querySelectorAll("[data-season]").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll("[data-season]").forEach((b) => {
          b.classList.toggle("analytics-toggle-btn--active", b === btn);
        });
        seasonKey = btn.dataset.season;
        selectedSeasonYear = null;
        renderSeasonChart();
      };
    });

    document.querySelectorAll("[data-period]").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll("[data-period]").forEach((b) => {
          b.classList.toggle("analytics-toggle-btn--active", b === btn);
        });
        domesticPeriod = btn.dataset.period;
        renderDomesticChart();
      };
    });

    document.querySelectorAll("[data-gperiod]").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll("[data-gperiod]").forEach((b) => {
          b.classList.toggle("analytics-toggle-btn--active", b === btn);
        });
        genrePeriod = btn.dataset.gperiod;
        renderGenreChart();
      };
    });

    document.querySelectorAll("[data-cperiod]").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll("[data-cperiod]").forEach((b) => {
          b.classList.toggle("analytics-toggle-btn--active", b === btn);
        });
        countryPeriod = btn.dataset.cperiod;
        renderCountryPanel();
      };
    });

    document.querySelectorAll(".analytics-tab").forEach((btn) => {
      btn.onclick = () => showPanel(btn.dataset.panel);
    });

    const defaultFilm =
      payload.movieList.find((n) => n.includes("1/2的魔法")) ||
      payload.movieList[0] ||
      "";
    if (defaultFilm) {
      document.getElementById("film-search").value = defaultFilm;
      renderFilmChart();
    }
  }

  init().catch((err) => {
    document.getElementById("analytics-subtitle").textContent =
      "無法載入 analytics.json：" + err.message;
  });
})();
