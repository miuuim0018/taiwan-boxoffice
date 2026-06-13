/**
 * 年度票房排行：多維 Top 10、海報、國別／片種篩選
 */
(function () {
  const TOP_N = 10;
  const DETAIL_TOP_N = 15;
  const ALL_YEARS = "all";
  const BAR_COLORS = [
    "linear-gradient(90deg,#ffd54f,#ffb300)",
    "linear-gradient(90deg,#e0e0e0,#bdbdbd)",
    "linear-gradient(90deg,#cd9b6a,#a67c52)",
    "linear-gradient(90deg,#5ba3f5,#3d7dd6)",
    "linear-gradient(90deg,#7e8cff,#5c6bc0)",
  ];

  const RANK_MODES = {
    boxoffice: {
      label: "票房最高",
      sortKey: "value",
      tieKey: "tickets",
      head: "全年票房",
      subtitle: "全年週票房加總最高",
      metric(item) {
        return boText(item.value);
      },
      sub(item, suffix) {
        const parts = [];
        if (item.tickets > 0) parts.push(`${item.tickets.toLocaleString()} 張`);
        if (item.weeks > 0) parts.push(`在映 ${item.weeks} 週`);
        return parts.length
          ? `<span class="champ-tickets">${parts.join(" · ")}</span>`
          : "";
      },
      summaryTop(item) {
        return item ? shortName(item.name) : "—";
      },
      summaryExtra(item, suffix) {
        return item ? boText(item.value) : "—";
      },
    },
    longestRun: {
      label: "上映最久",
      sortKey: "weeks",
      tieKey: "value",
      head: "在映週數",
      subtitle: "該年度有售票紀錄的週數最多",
      metric(item) {
        return `${item.weeks}<small> 週</small>`;
      },
      sub(item, suffix) {
        return `<span class="champ-tickets">票房 ${boText(item.value)}</span>`;
      },
      summaryTop(item) {
        return item ? shortName(item.name) : "—";
      },
      summaryExtra(item) {
        return item ? `${item.weeks} 週` : "—";
      },
    },
    weeklyStreak: {
      label: "蟬聯週冠",
      sortKey: "streak",
      tieKey: "value",
      head: "最長連冠",
      subtitle: "連續奪下單週票房第一的最長週數",
      metric(item) {
        return `${item.streak}<small> 週</small>`;
      },
      sub(item, suffix) {
        const crown =
          item.crownWeeks > 0 ? `共 ${item.crownWeeks} 週奪冠 · ` : "";
        return `<span class="champ-tickets">${crown}票房 ${boText(item.value)}</span>`;
      },
      summaryTop(item) {
        return item ? shortName(item.name) : "—";
      },
      summaryExtra(item) {
        return item ? `${item.streak} 週連冠` : "—";
      },
    },
    crownWeeks: {
      label: "週冠次數",
      sortKey: "crownWeeks",
      tieKey: "value",
      head: "奪冠週數",
      subtitle: "年度內奪下單週票房第一的總週數",
      metric(item) {
        return `${item.crownWeeks}<small> 週</small>`;
      },
      sub(item, suffix) {
        const streak = item.streak > 0 ? `最長連冠 ${item.streak} 週 · ` : "";
        return `<span class="champ-tickets">${streak}票房 ${boText(item.value)}</span>`;
      },
      summaryTop(item) {
        return item ? shortName(item.name) : "—";
      },
      summaryExtra(item) {
        return item ? `${item.crownWeeks} 週奪冠` : "—";
      },
    },
    rating: {
      label: "TMDB 評分最高",
      sortKey: "rating",
      tieKey: "value",
      head: "TMDB 評分",
      subtitle: "該時段有票房且能配對 TMDB 者（10 分制）",
      metric(item) {
        return `${item.rating.toFixed(1)}<small> / 10</small>`;
      },
      sub(item, suffix) {
        return `<span class="champ-tickets">票房 ${boText(item.value)}</span>`;
      },
      summaryTop(item) {
        return item ? shortName(item.name) : "—";
      },
      summaryExtra(item) {
        return item ? `${item.rating.toFixed(1)} 分` : "—";
      },
    },
  };

  let rankings = null;
  let posters = {};
  let movieMeta = {};
  let selectedYear = null;
  let currentView = "ranking";
  let currentRank = "boxoffice";
  let selectedMovieName = null;
  let countryPicker = null;

  const { matchesCountries, formatCountryFilterNote, CountryMultiSelect, collectCountries, collectGenres, mergeMoviesByName, formatBoxOffice } =
    window.BCR_FILTER;

  function boText(value) {
    return formatBoxOffice(value);
  }
  const { attachRating } = window.BCR_RATING;

  async function loadRankings() {
    const res = await fetch("yearly_rankings.json");
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

  function posterUrl(name) {
    const meta = movieMeta[name];
    if (meta && meta.poster) return meta.poster;
    return posters[name] || "";
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

  function posterHtml(name) {
    const url = posterUrl(name);
    if (url) {
      return `<div class="champ-poster-wrap"><img class="champ-poster" src="${url}" alt="" loading="lazy" /></div>`;
    }
    return `<div class="champ-poster-wrap champ-poster-wrap--empty"><span>🎬</span></div>`;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
        <h3 class="champ-info-title" id="champ-info-modal-title">${escapeHtml(displayTitle)}</h3>
        ${official ? `<p class="champ-info-official">官方片名：${escapeHtml(official)}</p>` : ""}
        ${tags.length ? `<div class="champ-info-meta">${tags.join("")}</div>` : ""}
        ${overviewHtml}
      </div>`;
  }

  function openMovieInfoModal(name) {
    if (!name) return;
    const body = document.getElementById("champ-info-modal-body");
    const modal = document.getElementById("champ-info-modal");
    if (!body || !modal) return;
    body.innerHTML = buildMovieInfoHtml(name);
    modal.hidden = false;
    document.body.classList.add("champ-info-modal-open");
  }

  function closeMovieInfoModal() {
    const modal = document.getElementById("champ-info-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("champ-info-modal-open");
  }

  function highlightSelectedRow(listEl, name) {
    if (!listEl) return;
    listEl.querySelectorAll(".champ-rank-row").forEach((row) => {
      row.classList.toggle("champ-rank-row--selected", row.dataset.movieName === name);
    });
  }

  function bindRankingRowClicks(listEl) {
    if (!listEl) return;

    listEl.querySelectorAll(".champ-rank-row--clickable").forEach((row) => {
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
  }

  function tagHtml(item) {
    const parts = [];
    if (item.genre) {
      parts.push(`<span class="month-tag month-tag--genre">${item.genre}</span>`);
    }
    if (item.country) {
      parts.push(`<span class="month-tag month-tag--country">${item.country}</span>`);
    }
    return parts.length ? `<div class="month-tags">${parts.join("")}</div>` : "";
  }

  function barBg(rank) {
    return BAR_COLORS[Math.min(rank - 1, BAR_COLORS.length - 1)];
  }

  function shortName(name) {
    return name.replace(/\s*\(\d{4}\)\s*$/, "");
  }

  function isAllYears() {
    return selectedYear === ALL_YEARS;
  }

  function yearLabel() {
    if (!isAllYears()) return `${selectedYear} 年`;
    const years = rankings.years || [];
    if (years.length >= 2) {
      return `${years[0]}–${years[years.length - 1]} 歷年`;
    }
    return "歷年";
  }

  function rawMoviesForYear(year) {
    if (year === ALL_YEARS) {
      return mergeMoviesByName(
        (rankings.years || []).flatMap((y) => rankings.movies?.[y] || [])
      );
    }
    return rankings.movies?.[year] || [];
  }

  function getFilters() {
    return {
      countries: countryPicker ? countryPicker.getSelected() : new Set(),
      genre: document.getElementById("champ-genre").value,
    };
  }

  function filterItems(items, filters) {
    return items.filter((item) => {
      if (!matchesCountries(item.country, filters.countries)) return false;
      if (filters.genre !== "all" && item.genre !== filters.genre) return false;
      return true;
    });
  }

  function sortItems(items, mode) {
    const cfg = RANK_MODES[mode];
    return [...items].sort((a, b) => {
      const av = a[cfg.sortKey] || 0;
      const bv = b[cfg.sortKey] || 0;
      if (bv !== av) return bv - av;
      return (b[cfg.tieKey] || 0) - (a[cfg.tieKey] || 0);
    });
  }

  function yearItems(year, filters) {
    const raw = attachRating(rawMoviesForYear(year), movieMeta);
    return sortItems(filterItems(raw, filters), currentRank);
  }

  function championsByField(items, field) {
    const map = new Map();
    items.forEach((item) => {
      const key = (item[field] || "").trim() || "其他";
      if (!map.has(key) || item.value > map.get(key).value) {
        map.set(key, item);
      }
    });
    return [...map.entries()]
      .map(([key, item]) => ({ key, item }))
      .sort((a, b) => b.item.value - a.item.value);
  }

  function renderYearNav() {
    const nav = document.getElementById("champ-years");
    const years = rankings.years || [];
    if (
      !selectedYear ||
      (selectedYear !== ALL_YEARS && !years.includes(selectedYear))
    ) {
      selectedYear = years[years.length - 1] || null;
    }

    const allActive = selectedYear === ALL_YEARS ? " champ-year-btn--active" : "";
    nav.innerHTML =
      `<button type="button" class="champ-year-btn champ-year-btn--all${allActive}" data-year="${ALL_YEARS}">歷年</button>` +
      years
        .map((y) => {
          const active = y === selectedYear ? " champ-year-btn--active" : "";
          return `<button type="button" class="champ-year-btn${active}" data-year="${y}">${y}</button>`;
        })
        .join("");
    nav.querySelectorAll(".champ-year-btn").forEach((btn) => {
      btn.onclick = () => {
        selectedYear = btn.dataset.year;
        renderYearNav();
        refreshFilterOptions();
        renderAll();
      };
    });
  }

  function renderSummary(items, modeCfg, label) {
    const suffix = (rankings.valueSuffix || " 萬").trim();
    const top = items[0];
    const el = document.getElementById("champ-summary");
    el.innerHTML = `
      <div class="champ-stat">
        <span class="champ-stat-label">${modeCfg.label}榜首</span>
        <strong>${modeCfg.summaryTop(top)}</strong>
      </div>
      <div class="champ-stat">
        <span class="champ-stat-label">${label}指標</span>
        <strong>${modeCfg.summaryExtra(top, suffix)}</strong>
      </div>
      <div class="champ-stat">
        <span class="champ-stat-label">符合條件片數</span>
        <strong>${items.length.toLocaleString()}</strong>
      </div>`;
  }

  function renderRankingList(items, modeCfg, limit, targetId = "champ-list", options = {}) {
    const list = document.getElementById(targetId);
    const suffix = (rankings.valueSuffix || " 萬").trim();
    const ranked = items.slice(0, limit);
    const sortKey = modeCfg.sortKey;
    const maxVal = Math.max(...ranked.map((i) => i[sortKey] || 0), 1);
    const clickable = Boolean(options.clickable);

    if (!ranked.length) {
      list.innerHTML = '<p class="month-empty">此篩選條件下無資料</p>';
      return;
    }

    list.innerHTML = ranked
      .map((item, idx) => {
        const rank = idx + 1;
        const pct = ((item[sortKey] || 0) / maxVal) * 100;
        const clickCls = clickable ? " champ-rank-row--clickable" : "";
        const tabIdx = clickable ? ' tabindex="0" role="button"' : "";
        const dataName = clickable
          ? ` data-movie-name="${item.name.replace(/"/g, "&quot;")}"`
          : "";
        return `
          <div class="champ-rank-row${clickCls}"${dataName}${tabIdx} aria-label="查看 ${shortName(item.name)} 介紹">
            <div class="champ-rank-num champ-rank-num--${Math.min(rank, 3)}">${rank}</div>
            ${posterHtml(item.name)}
            <div class="champ-rank-body">
              <div class="month-title-line">
                <span class="month-name" title="${item.name}">${shortName(item.name)}</span>
                ${tagHtml(item)}
              </div>
              <div class="month-bar-wrap">
                <div class="month-bar" style="width:${Math.max(4, pct)}%;background:${barBg(rank)}"></div>
              </div>
              ${modeCfg.sub(item, suffix)}
            </div>
            <div class="month-value champ-rank-value champ-rank-metric">
              ${modeCfg.metric(item, suffix)}
            </div>
          </div>`;
      })
      .join("");

    if (clickable) {
      bindRankingRowClicks(list);
    }
  }

  function itemsForGroup(field, key, filters) {
    const base = filterItems(rawMoviesForYear(selectedYear), filters);
    return sortItems(
      base.filter((item) => {
        const k = (item[field] || "").trim() || "其他";
        return k === key && (item.value || 0) > 0;
      }),
      "boxoffice"
    );
  }

  function openDetailModal(field, key) {
    const filters = getFilters();
    const items = itemsForGroup(field, key, filters);
    const groupLabel = field === "genre" ? "片種" : "國別";
    const note = filterNote(filters);

    document.getElementById("champ-modal-title").textContent =
      `${yearLabel()} · ${key}`;
    document.getElementById("champ-modal-note").textContent =
      `${groupLabel}票房排行 Top ${Math.min(DETAIL_TOP_N, items.length)}${note} · 依${isAllYears() ? "歷年" : "全年"}週票房加總`;

    renderRankingList(items, RANK_MODES.boxoffice, DETAIL_TOP_N, "champ-modal-list", {
      clickable: true,
    });

    const modal = document.getElementById("champ-modal");
    modal.hidden = false;
    document.body.classList.add("champ-modal-open");
  }

  function closeDetailModal() {
    document.getElementById("champ-modal").hidden = true;
    document.body.classList.remove("champ-modal-open");
  }

  function bindChampionCardClicks(field) {
    document.querySelectorAll(".champ-champion-card").forEach((card) => {
      const open = () => openDetailModal(field, card.dataset.key);
      card.onclick = open;
      card.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      };
    });
  }

  function renderChampionCards(groups, labelPrefix, field) {
    const list = document.getElementById("champ-list");
    const suffix = (rankings.valueSuffix || " 萬").trim();

    if (!groups.length) {
      list.innerHTML = '<p class="month-empty">此篩選條件下無資料</p>';
      return;
    }

    list.innerHTML = `<div class="champ-champion-grid">${groups
      .map(({ key, item }) => {
        return `
          <article class="champ-champion-card champ-champion-card--clickable" data-key="${key.replace(/"/g, "&quot;")}" tabindex="0" role="button" aria-label="查看 ${key} 詳細排行">
            <div class="champ-champion-badge">#1 ${labelPrefix}</div>
            <div class="champ-champion-label">${key}</div>
            ${posterHtml(item.name)}
            <div class="champ-champion-title" title="${item.name}">${shortName(item.name)}</div>
            ${tagHtml(item)}
            <div class="champ-champion-value">${boText(item.value)}</div>
            <div class="champ-champion-hint">點擊查看 Top ${DETAIL_TOP_N}</div>
          </article>`;
      })
      .join("")}</div>`;
    bindChampionCardClicks(field);
  }

  function filterNote(filters) {
    const parts = [];
    if (filters.countries?.size) {
      parts.push(formatCountryFilterNote(filters.countries).slice(1, -1));
    }
    if (filters.genre !== "all") parts.push(filters.genre);
    if (!parts.length) return "";
    return `（${parts.join(" · ")}）`;
  }

  function renderAll() {
    closeMovieInfoModal();
    closeDetailModal();
    const filters = getFilters();
    const suffix = (rankings.valueSuffix || " 萬").trim();
    const note = filterNote(filters);
    const modeCfg = RANK_MODES[currentRank];
    const head = document.getElementById("champ-chart-head");
    const panel = document.getElementById("champ-panel");
    const rankModes = document.getElementById("champ-rank-modes");

    rankModes.style.display = currentView === "ranking" ? "" : "none";

    if (currentView === "ranking") {
      const items = yearItems(selectedYear, filters).filter((item) => {
        if (currentRank === "rating") return (item.rating || 0) > 0;
        const key = modeCfg.sortKey;
        return (item[key] || 0) > 0;
      });

      head.style.display = "";
      panel.classList.remove("champ-panel--cards");
      document.getElementById("champ-value-head").textContent = modeCfg.head;
      renderSummary(items, modeCfg, yearLabel());
      document.getElementById("champ-subtitle").textContent =
        `${yearLabel()} · ${modeCfg.subtitle}${note} · 點選排行列查看電影介紹`;
      renderRankingList(items, modeCfg, TOP_N, "champ-list", {
        clickable: true,
      });
      return;
    }

    head.style.display = "none";
    panel.classList.add("champ-panel--cards");

    const base = filterItems(rawMoviesForYear(selectedYear), filters);
    const boxCfg = RANK_MODES.boxoffice;

    if (currentView === "genre") {
      const groups = championsByField(base, "genre");
      renderSummary(sortItems(base, "boxoffice"), boxCfg, yearLabel() + note);
      document.getElementById("champ-subtitle").textContent =
        `${yearLabel()}各片種票房冠軍${note} · 點卡片查看該片種詳細排行`;
      renderChampionCards(groups, "片種", "genre");
      return;
    }

    const groups = championsByField(base, "country");
    renderSummary(sortItems(base, "boxoffice"), boxCfg, yearLabel() + note);
    document.getElementById("champ-subtitle").textContent =
      `${yearLabel()}各國別票房冠軍${note} · 點卡片查看該國別詳細排行`;
    renderChampionCards(groups, "國別", "country");
  }

  function refreshFilterOptions() {
    const movies = rawMoviesForYear(selectedYear);
    const countries = collectCountries(movies);
    const genres = collectGenres(movies);
    const wrap = document.getElementById("champ-country-wrap");

    if (countryPicker) {
      countryPicker.setCountries(countries);
    }
    if (wrap) {
      wrap.style.display = countries.length ? "" : "none";
    }
    fillSelect("champ-genre", genres, "全部片種");
  }

  function setView(view) {
    currentView = view;
    document.querySelectorAll(".champ-view-btn").forEach((btn) => {
      btn.classList.toggle("champ-view-btn--active", btn.dataset.view === view);
    });
    renderAll();
  }

  function setRank(rank) {
    currentRank = rank;
    document.querySelectorAll(".champ-rank-btn").forEach((btn) => {
      btn.classList.toggle("champ-rank-btn--active", btn.dataset.rank === rank);
    });
    renderAll();
  }

  async function init() {
    await Promise.all([
      loadRankings().then((d) => {
        rankings = d;
      }),
      loadPosters(),
      loadMovieMeta(),
    ]);
    countryPicker = new CountryMultiSelect("champ-country-picker", { onChange: renderAll });
    renderYearNav();
    refreshFilterOptions();
    renderAll();

    document.getElementById("champ-genre").onchange = renderAll;
    document.querySelectorAll(".champ-view-btn").forEach((btn) => {
      btn.onclick = () => setView(btn.dataset.view);
    });
    document.querySelectorAll(".champ-rank-btn").forEach((btn) => {
      btn.onclick = () => setRank(btn.dataset.rank);
    });

    document.getElementById("champ-modal-close").onclick = closeDetailModal;
    document.getElementById("champ-modal-backdrop").onclick = closeDetailModal;
    document.getElementById("champ-info-modal-close").onclick = closeMovieInfoModal;
    document.getElementById("champ-info-modal-backdrop").onclick = closeMovieInfoModal;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const infoModal = document.getElementById("champ-info-modal");
      if (infoModal && !infoModal.hidden) {
        closeMovieInfoModal();
        return;
      }
      closeDetailModal();
    });
  }

  init().catch((err) => {
    document.getElementById("champ-title").textContent = "無法載入資料";
    document.getElementById("champ-subtitle").textContent =
      err.message + "（請用本機伺服器開啟，並執行 python -m scripts.build_bar_race_data）";
  });
})();
