/**
 * 月票房：橫向排行 + 觀影排名雙軸長條圖
 */
(function () {
  const BAR_COLORS = [
    "linear-gradient(90deg,#ffd54f,#ffb300)",
    "linear-gradient(90deg,#e0e0e0,#bdbdbd)",
    "linear-gradient(90deg,#cd9b6a,#a67c52)",
    "linear-gradient(90deg,#5ba3f5,#3d7dd6)",
    "linear-gradient(90deg,#7e8cff,#5c6bc0)",
  ];

  const COLUMN_BAR_COLORS = [
    "#8fa3b8",
    "#c9a8a8",
    "#8b7355",
    "#7a8fa8",
    "#a8a0c9",
    "#9eb8a8",
    "#b8a898",
    "#8899aa",
    "#a89090",
    "#7d8fa3",
  ];

  let payload = null;
  let posters = {};
  let movieMeta = {};
  let selectedMonth = null;
  let currentView = "rank";
  let columnChart = null;
  let pieChart = null;
  let selectedPieCountry = null;
  let currentPieRows = [];
  let currentByCountryMovies = {};
  let currentPieLabel = "";
  let countryPicker = null;
  let selectedMovieName = null;

  const { matchesCountries, CountryMultiSelect, collectCountries, collectGenres } = window.BCR_FILTER;
  const { attachRating, sortByRating } = window.BCR_RATING;

  const PIE_COLORS = [
    "#5ba3f5", "#ffb74d", "#81c784", "#e57373", "#ba68c8",
    "#4dd0e1", "#fff176", "#a1887f", "#90a4ae", "#f06292",
    "#7986cb", "#aed581", "#ff8a65", "#9575cd", "#4db6ac",
  ];

  async function loadMonthly() {
    const res = await fetch("monthly.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
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

  function allMonthMovies(monthData) {
    const map = new Map();
    const put = (item) => {
      if (!item?.name) return;
      const prev = map.get(item.name);
      if (!prev || (item.value || 0) > (prev.value || 0)) map.set(item.name, item);
    };
    (monthData?.items || []).forEach(put);
    Object.values(monthData?.byCountryMovies || {}).forEach((list) => list.forEach(put));
    return [...map.values()];
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
    try {
      const res = await fetch("data.json");
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      Object.values(data.modes || {}).forEach((mode) => {
        (mode.frames || []).forEach((frame) => {
          (frame.items || []).forEach((item) => {
            if (item.name && item.poster) map[item.name] = item.poster;
          });
        });
      });
      posters = map;
    } catch {
      posters = {};
    }
  }

  function posterUrl(name) {
    return posters[name] || "";
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(text) {
    return String(text).replace(/"/g, "&quot;");
  }

  function shortName(name) {
    return (name || "").replace(/\s*\(\d{4}\)\s*$/, "");
  }

  function buildMovieInfoHtml(name) {
    if (!name) return "";

    const meta = movieMeta[name] || {};
    const url = posterUrl(name);
    const displayTitle = meta.title || shortName(name);
    const official = meta.title && meta.title !== shortName(name) ? shortName(name) : "";
    const tags = [];

    if (meta.vote_average != null && meta.vote_average > 0) {
      tags.push(
        `<span class="champ-info-tag champ-info-tag--rating">TMDB ${meta.vote_average.toFixed(1)}</span>`
      );
    }
    if (meta.runtime > 0) {
      tags.push(`<span class="champ-info-tag">${meta.runtime} 分鐘</span>`);
    }
    if (meta.release_date) {
      tags.push(`<span class="champ-info-tag">${meta.release_date}</span>`);
    }

    const posterBlock = url
      ? `<div class="champ-info-poster"><img src="${escapeHtml(url)}" alt="" loading="lazy" /></div>`
      : `<div class="champ-info-poster champ-info-poster--empty">🎬</div>`;

    const overview = (meta.overview || "").trim();
    const overviewHtml = overview
      ? `<p class="champ-info-overview">${escapeHtml(overview)}</p>`
      : `<p class="champ-info-empty">此片暫無 TMDB 劇情簡介</p>`;

    return `
      ${posterBlock}
      <div class="champ-info-body">
        <h3 class="champ-info-title" id="month-info-modal-title">${escapeHtml(displayTitle)}</h3>
        ${official ? `<p class="champ-info-official">官方片名：${escapeHtml(official)}</p>` : ""}
        ${tags.length ? `<div class="champ-info-meta">${tags.join("")}</div>` : ""}
        ${overviewHtml}
      </div>`;
  }

  function openMovieInfoModal(name) {
    if (!name) return;
    const body = document.getElementById("month-info-modal-body");
    const modal = document.getElementById("month-info-modal");
    if (!body || !modal) return;
    body.innerHTML = buildMovieInfoHtml(name);
    modal.hidden = false;
    document.body.classList.add("champ-info-modal-open");
  }

  function closeMovieInfoModal() {
    const modal = document.getElementById("month-info-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("champ-info-modal-open");
  }

  function highlightSelectedRow(listEl, name) {
    if (!listEl) return;
    listEl.querySelectorAll(".month-row--clickable").forEach((row) => {
      row.classList.toggle("month-row--selected", row.dataset.movieName === name);
    });
  }

  function bindMovieRowClicks(listEl) {
    if (!listEl) return;

    listEl.querySelectorAll(".month-row--clickable").forEach((row) => {
      const pick = () => {
        const name = row.dataset.movieName;
        if (!name) return;
        selectedMovieName = name;
        highlightSelectedRow(listEl, name);
        openMovieInfoModal(name);
      };
      row.onclick = pick;
      row.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      };
    });

    if (selectedMovieName) highlightSelectedRow(listEl, selectedMovieName);
  }

  function posterHtml(name) {
    const url = posters[name];
    if (url) {
      return `<div class="month-poster-wrap"><img class="month-poster" src="${url}" alt="" loading="lazy" /></div>`;
    }
    return `<div class="month-poster-wrap month-poster-wrap--empty"><span>🎬</span></div>`;
  }

  function fillSelect(id, values, allLabel) {
    const el = document.getElementById(id);
    const cur = el.value;
    el.innerHTML = `<option value="all">${allLabel}</option>`;
    values.forEach((v) => {
      el.innerHTML += `<option value="${v}">${v}</option>`;
    });
    if (cur !== "all" && values.includes(cur)) el.value = cur;
  }

  function monthOptionsForYear(year) {
    return Object.keys(payload.months?.[year] || {}).sort(
      (a, b) => parseInt(a, 10) - parseInt(b, 10)
    );
  }

  function refreshMetaFilters(year, month) {
    const monthData = payload.months?.[year]?.[month];
    const items = monthData?.items || [];
    const countries = collectCountries(items);
    const genres = collectGenres(items);

    const countryWrap = document.getElementById("month-country-wrap");
    const genreWrap = document.getElementById("month-genre-wrap");
    countryWrap.style.display = countries.length ? "" : "none";
    genreWrap.style.display = genres.length ? "" : "none";

    if (countries.length && countryPicker) {
      countryPicker.setCountries(countries);
    }
    if (genres.length) fillSelect("month-genre", genres, "全部片種");
  }

  function renderPills(year) {
    const pills = document.getElementById("month-pills");
    const months = monthOptionsForYear(year);
    if (!selectedMonth || !months.includes(selectedMonth)) {
      selectedMonth = months[months.length - 1] || null;
    }
    pills.innerHTML = months
      .map((m) => {
        const active = m === selectedMonth ? " month-pill--active" : "";
        return `<button type="button" class="month-pill${active}" data-month="${m}">${parseInt(m, 10)} 月</button>`;
      })
      .join("");
    pills.querySelectorAll(".month-pill").forEach((btn) => {
      btn.onclick = () => {
        selectedMonth = btn.dataset.month;
        renderPills(year);
        renderAll();
      };
    });
  }

  function filterItems(items) {
    const countries = countryPicker ? countryPicker.getSelected() : new Set();
    const genre = document.getElementById("month-genre").value;
    return items.filter((item) => {
      if (!matchesCountries(item.country, countries)) return false;
      if (genre !== "all" && item.genre !== genre) return false;
      return item.value > 0 || (item.tickets || 0) > 0;
    });
  }

  function barBg(rank) {
    return BAR_COLORS[Math.min(rank - 1, BAR_COLORS.length - 1)];
  }

  function shortLabel(name, maxLen = 14) {
    const plain = name.replace(/\s*\(\d{4}\)\s*$/, "");
    return plain.length > maxLen ? plain.slice(0, maxLen) + "…" : plain;
  }

  function updateStats(items) {
    const suffix = payload.valueSuffix || " 萬";
    const total = items.reduce((s, i) => s + i.value, 0);
    document.getElementById("stat-total").textContent = total.toLocaleString() + suffix.trim();
    document.getElementById("stat-top").textContent = items[0]?.name || "—";
    document.getElementById("stat-count").textContent = String(items.length);
  }

  function renderCountryMovieList(items, targetId, options = {}) {
    const chart = document.getElementById(targetId);
    const suffix = payload.valueSuffix || " 萬";
    const mode = options.mode || "boxoffice";
    const clickable = options.clickable !== false;
    const ranked =
      mode === "rating"
        ? sortByRating(attachRating(items, movieMeta)).slice(0, 15)
        : [...items].sort((a, b) => b.value - a.value).slice(0, 15);
    const maxVal =
      mode === "rating"
        ? Math.max(...ranked.map((i) => i.rating || 0), 1)
        : Math.max(...ranked.map((i) => i.value), 1);

    if (!ranked.length) {
      chart.innerHTML =
        mode === "rating"
          ? '<p class="month-empty">此月份無可配對 TMDB 評分的電影</p>'
          : '<p class="month-empty">此國別無符合條件的電影</p>';
      return;
    }

    if (selectedMovieName && !ranked.some((i) => i.name === selectedMovieName)) {
      selectedMovieName = null;
    }

    chart.innerHTML = ranked
      .map((item, idx) => {
        const rank = idx + 1;
        const pct =
          mode === "rating"
            ? ((item.rating || 0) / maxVal) * 100
            : (item.value / maxVal) * 100;
        const genreTag = item.genre
          ? `<span class="month-tag month-tag--genre">${item.genre}</span>`
          : "";
        const ticketNote =
          item.tickets > 0
            ? `<span class="month-tag month-tag--country">${item.tickets.toLocaleString()} 張</span>`
            : "";
        const metric =
          mode === "rating"
            ? `${item.rating.toFixed(1)}<small> / 10</small>`
            : `${item.value.toLocaleString()}<small>${suffix.trim()}</small>`;
        const barColor = mode === "rating" ? "linear-gradient(90deg,#ffd54f,#ffb300)" : barBg(rank);
        const subLine =
          mode === "rating"
            ? `<span class="month-tickets">票房 ${item.value.toLocaleString()}${suffix.trim()}</span>`
            : "";
        const clickCls = clickable ? " month-row--clickable" : "";
        const selectedCls =
          clickable && item.name === selectedMovieName ? " month-row--selected" : "";
        const dataName = clickable
          ? ` data-movie-name="${escapeAttr(item.name)}" tabindex="0" role="button" aria-label="查看 ${escapeAttr(shortName(item.name))} 介紹"`
          : "";
        return `
          <div class="month-row${clickCls}${selectedCls}"${dataName}>
            <div class="month-rank month-rank--${Math.min(rank, 3)}">${rank}</div>
            ${posterHtml(item.name)}
            <div class="month-row-body">
              <div class="month-title-line">
                <span class="month-name">${escapeHtml(item.name)}</span>
                <div class="month-tags">${genreTag}${mode === "rating" ? "" : ticketNote}</div>
              </div>
              <div class="month-bar-wrap">
                <div class="month-bar" style="width:${Math.max(4, pct)}%;background:${barColor}"></div>
              </div>
              ${subLine}
            </div>
            <div class="month-value">${metric}</div>
          </div>`;
      })
      .join("");

    if (clickable) bindMovieRowClicks(chart);
  }

  function renderRatingChart(items) {
    if (!items.length) {
      document.getElementById("month-chart").innerHTML = '<p class="month-empty">篩選條件下無資料</p>';
      return;
    }
    renderCountryMovieList(items, "month-chart", { mode: "rating" });
  }

  function renderRankChart(items) {
    if (!items.length) {
      document.getElementById("month-chart").innerHTML = '<p class="month-empty">篩選條件下無資料</p>';
      return;
    }
    renderCountryMovieList(
      [...items].sort((a, b) => b.value - a.value).slice(0, 15),
      "month-chart"
    );
  }

  function pieGenreFilter(items) {
    const genre = document.getElementById("month-genre").value;
    if (genre === "all") return items;
    return items.filter((item) => item.genre === genre);
  }

  function moviesForCountry(country) {
    let list = currentByCountryMovies[country];
    if (!list) {
      const monthData = payload.months?.[document.getElementById("month-year").value]?.[selectedMonth];
      list = (monthData?.items || []).filter((item) => (item.country || "其他") === country);
    } else {
      list = [...list];
    }
    return pieGenreFilter(list).sort((a, b) => b.value - a.value);
  }

  function syncPieLegendActive() {
    document.querySelectorAll(".month-pie-legend-item").forEach((el) => {
      el.classList.toggle("month-pie-legend-item--active", el.dataset.country === selectedPieCountry);
    });
  }

  function closePieDetail() {
    selectedPieCountry = null;
    syncPieLegendActive();
    document.getElementById("month-pie-detail").hidden = true;
  }

  function openPieDetail(country) {
    selectedPieCountry = country;
    syncPieLegendActive();

    const movies = moviesForCountry(country);
    const suffix = (payload.valueSuffix || " 萬").trim();
    const total = movies.reduce((s, m) => s + m.value, 0);
    const row = currentPieRows.find((r) => r.country === country);
    const pieTotal = currentPieRows.reduce((s, r) => s + r.value, 0);
    const share = row && pieTotal ? ((row.value / pieTotal) * 100).toFixed(1) : null;

    document.getElementById("month-pie-detail-title").textContent =
      `${currentPieLabel} · ${country}`;
    document.getElementById("month-pie-detail-note").textContent =
      `共 ${movies.length} 部｜合計 ${total.toLocaleString()} ${suffix}${share ? `（占當月 ${share}%）` : ""}`;

    renderCountryMovieList(movies, "month-pie-detail-list");
    const panel = document.getElementById("month-pie-detail");
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPieChart(byCountry, monthData, label) {
    const canvas = document.getElementById("month-pie-chart");
    const legend = document.getElementById("month-pie-legend");
    const suffix = payload.valueSuffix || " 萬";

    if (pieChart) {
      pieChart.destroy();
      pieChart = null;
    }

    currentByCountryMovies = monthData?.byCountryMovies || {};
    currentPieLabel = label || "";
    const prevCountry = selectedPieCountry;
    selectedPieCountry = null;
    closePieDetail();

    const genre = document.getElementById("month-genre").value;
    let rows = (byCountry || []).filter((r) => r.value > 0);
    if (genre !== "all" && Object.keys(currentByCountryMovies).length) {
      const map = new Map();
      Object.entries(currentByCountryMovies).forEach(([country, movies]) => {
        const sum = pieGenreFilter(movies).reduce((s, m) => s + m.value, 0);
        if (sum > 0) map.set(country, sum);
      });
      rows = [...map.entries()]
        .map(([country, value]) => ({ country, value }))
        .sort((a, b) => b.value - a.value);
    }
    currentPieRows = rows;
    const total = rows.reduce((s, r) => s + r.value, 0);

    if (!rows.length) {
      legend.innerHTML = '<p class="month-empty">此月份無國別資料</p>';
      return;
    }

    pieChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: rows.map((r) => r.country),
        datasets: [
          {
            data: rows.map((r) => r.value),
            backgroundColor: rows.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
            borderWidth: 2,
            borderColor: "#1a2233",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "52%",
        onClick(_evt, elements) {
          if (!elements.length) return;
          openPieDetail(rows[elements[0].index].country);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                return `${ctx.label}：${ctx.parsed.toLocaleString()}${suffix.trim()}（${pct}%）`;
              },
              afterLabel(ctx) {
                return "點擊查看片單";
              },
            },
          },
        },
      },
    });

    legend.innerHTML = rows
      .map((row, i) => {
        const pct = total ? ((row.value / total) * 100).toFixed(1) : 0;
        const color = PIE_COLORS[i % PIE_COLORS.length];
        return `
          <button type="button" class="month-pie-legend-item" data-country="${row.country.replace(/"/g, "&quot;")}">
            <div class="month-pie-legend-main">
              <span class="month-pie-swatch" style="background:${color}"></span>
              <strong>${row.country}</strong>
            </div>
            <span>${row.value.toLocaleString()}${suffix.trim()} · ${pct}%</span>
          </button>`;
      })
      .join("");

    legend.querySelectorAll(".month-pie-legend-item").forEach((btn) => {
      btn.onclick = () => openPieDetail(btn.dataset.country);
    });

    if (prevCountry && rows.some((r) => r.country === prevCountry)) {
      openPieDetail(prevCountry);
    }
  }

  function renderColumnChart(items) {
    const canvas = document.getElementById("month-column-chart");
    const sorted = [...items]
      .sort((a, b) => (b.tickets || 0) - (a.tickets || 0) || b.value - a.value)
      .slice(0, 10);

    if (columnChart) {
      columnChart.destroy();
      columnChart = null;
    }

    if (!sorted.length) return;

    const labels = sorted.map((i) => shortLabel(i.name, 16));
    const tickets = sorted.map((i) => i.tickets || 0);
    const values = sorted.map((i) => i.value);

    columnChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "銷售票數",
            data: tickets,
            backgroundColor: sorted.map((_, i) => COLUMN_BAR_COLORS[i % COLUMN_BAR_COLORS.length]),
            borderRadius: 4,
            yAxisID: "y",
            order: 2,
          },
          {
            label: "銷售金額（萬元）",
            data: values,
            type: "line",
            borderColor: "#f58220",
            backgroundColor: "#f58220",
            borderWidth: 2.5,
            pointRadius: 5,
            pointBackgroundColor: "#fff",
            pointBorderColor: "#f58220",
            pointBorderWidth: 2,
            tension: 0.25,
            yAxisID: "y1",
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: { color: "#4a5568", font: { family: "'Noto Sans TC', sans-serif", size: 12 } },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                if (ctx.dataset.yAxisID === "y1") {
                  return `銷售金額：${ctx.parsed.y.toLocaleString()} 萬元`;
                }
                return `銷售票數：${ctx.parsed.y.toLocaleString()} 張`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#4a5568",
              font: { family: "'Noto Sans TC', sans-serif", size: 11 },
              maxRotation: 45,
              minRotation: 35,
            },
            grid: { display: false },
          },
          y: {
            position: "left",
            title: {
              display: true,
              text: "銷售票數 / 張",
              color: "#5a6578",
              font: { family: "'Noto Sans TC', sans-serif", size: 12 },
            },
            ticks: { color: "#6b7280" },
            grid: { color: "rgba(0,0,0,0.06)" },
          },
          y1: {
            position: "right",
            title: {
              display: true,
              text: "銷售金額 / 萬元",
              color: "#5a6578",
              font: { family: "'Noto Sans TC', sans-serif", size: 12 },
            },
            ticks: { color: "#6b7280" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  function renderAll() {
    const year = document.getElementById("month-year").value;
    const month = selectedMonth;
    const suffix = payload.valueSuffix || " 萬";

    if (!month) return;

    refreshMetaFilters(year, month);
    const monthData = payload.months?.[year]?.[month];

    document.getElementById("month-title").textContent =
      `${year} 年 ${parseInt(month, 10)} 月票房排行`;

    if (!monthData) {
      document.getElementById("month-chart").innerHTML = '<p class="month-empty">此月份無資料</p>';
      updateStats([]);
      return;
    }

    const items = filterItems(
      currentView === "rating" ? monthData.items || [] : allMonthMovies(monthData)
    );
    const ranked = [...items].sort((a, b) => b.value - a.value);
    updateStats(ranked.slice(0, 15));

    if (currentView === "rating") {
      document.querySelector(".month-chart-head span:last-child").textContent = "TMDB 評分";
      renderRatingChart(items);
    } else {
      document.querySelector(".month-chart-head span:last-child").textContent = "票房（萬元）";
      renderRankChart(items);
    }

    const rankHint = document.getElementById("month-rank-hint");
    if (rankHint) {
      rankHint.hidden = !ranked.length || (currentView !== "rank" && currentView !== "rating");
    }

    renderColumnChart(items);
    const pieLabel = `${year} 年 ${parseInt(month, 10)} 月`;
    renderPieChart(monthData.byCountry || buildByCountryFromItems(monthData.items || []), monthData, pieLabel);
  }

  function buildByCountryFromItems(items) {
    const map = new Map();
    items.forEach((item) => {
      const c = item.country || "其他";
      map.set(c, (map.get(c) || 0) + item.value);
    });
    return [...map.entries()]
      .map(([country, value]) => ({ country, value }))
      .sort((a, b) => b.value - a.value);
  }

  function setView(view) {
    currentView = view;
    document.querySelectorAll(".month-view-btn").forEach((btn) => {
      btn.classList.toggle("month-view-btn--active", btn.dataset.view === view);
    });
    document.getElementById("panel-rank").hidden = view !== "rank" && view !== "rating";
    document.getElementById("panel-column").hidden = view !== "column";
    document.getElementById("panel-pie").hidden = view !== "pie";
    if (view === "column" || view === "pie" || view === "rating") renderAll();
  }

  async function init() {
    const [monthlyData] = await Promise.all([loadMonthly(), loadPosters(), loadMovieMeta()]);
    payload = monthlyData;
    document.getElementById("month-subtitle").textContent = payload.subtitle || "";

    const yearSel = document.getElementById("month-year");
    (payload.years || []).forEach((y) => {
      yearSel.innerHTML += `<option value="${y}">${y} 年</option>`;
    });

    countryPicker = new CountryMultiSelect("month-country-picker", { onChange: renderAll });

    const defaultYear = payload.years?.[payload.years.length - 1] || "";
    yearSel.value = defaultYear;
    renderPills(defaultYear);
    renderAll();

    yearSel.onchange = () => {
      renderPills(yearSel.value);
      renderAll();
    };
    document.getElementById("month-genre").onchange = renderAll;

    document.querySelectorAll(".month-view-btn").forEach((btn) => {
      btn.onclick = () => setView(btn.dataset.view);
    });

    document.getElementById("month-pie-detail-close").onclick = closePieDetail;

    document.getElementById("month-info-modal-close").onclick = closeMovieInfoModal;
    document.getElementById("month-info-modal-backdrop").onclick = closeMovieInfoModal;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMovieInfoModal();
    });
  }

  init().catch((err) => {
    document.getElementById("month-title").textContent = "無法載入 monthly.json";
    document.getElementById("month-subtitle").textContent = err.message;
  });
})();
