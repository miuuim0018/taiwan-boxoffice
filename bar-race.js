/**

 * BarChartRace — 橫向排行榜動畫（僅維護 Top N 列）

 */

class BarChartRace {

  constructor(container, options = {}) {

    this.container = container;

    this.title = options.title || "";

    this.subtitle = options.subtitle || "每日總量";

    this.frames = options.frames || [];

    this.topN = options.topN ?? 12;

    this.dayDuration = options.dayDuration ?? 800;

    this.rowHeight = options.rowHeight ?? 44;

    this.valueSuffix = options.valueSuffix ?? "";

    this.onDayChange = options.onDayChange || null;



    this.filterCountries = null;

    this.filterGenre = "all";

    this.filterYear = "all";

    this.filterStartDate = "";

    this.filterEndDate = "";



    this.dayIndex = 0;

    this.playing = false;

    this.rafId = null;

    this.startTime = 0;

    this.posterMap = new Map();

    this.rowEls = new Map();

    this.maxScale = 1;

    this._lastAxisMax = 0;

    this._activeFrames = [];

    this._frameTops = [];



    this.frames.forEach((f) =>

      f.items.forEach((i) => {

        if (i.poster) this.posterMap.set(i.name, i.poster);

      })

    );



    this._buildDOM();

    this._rebuildActiveFrames();

    if (this._activeFrames.length) {

      this._applyPair(0, 0, 1);

    }

  }



  _buildDOM() {

    this.container.innerHTML = "";

    this.container.className = "bcr-chart";

    this.container.style.height = `${this.topN * this.rowHeight}px`;



    this.stage = this.container.parentElement;

    if (this.stage) {

      this.stage.style.minHeight = `${this.topN * this.rowHeight + 120}px`;

      this.stage.classList.toggle("bcr-stage--scroll", this.topN > 20);

    }



    this.dateEl = document.createElement("div");

    this.dateEl.className = "bcr-date-badge";

    this.stage.appendChild(this.dateEl);



    this.totalEl = document.createElement("div");

    this.totalEl.className = "bcr-total-badge";

    this.stage.appendChild(this.totalEl);



    this.axisEl = document.createElement("div");

    this.axisEl.className = "bcr-axis";

    this.stage.insertBefore(this.axisEl, this.container);

  }



  _applyItemFilters(frame) {

    let items = frame.items || [];

    if (this.filterCountries && this.filterCountries.size > 0) {

      items = items.filter((i) => this.filterCountries.has(i.country));

    }

    if (this.filterGenre !== "all") {

      items = items.filter((i) => i.genre === this.filterGenre);

    }

    return { ...frame, items };

  }



  _rebuildActiveFrames() {

    let list = this.frames;

    if (this.filterYear !== "all") {

      list = list.filter((f) => f.date.startsWith(this.filterYear + "/"));

    }

    if (this.filterStartDate) {

      list = list.filter((f) => f.date >= this.filterStartDate);

    }

    if (this.filterEndDate) {

      list = list.filter((f) => f.date <= this.filterEndDate);

    }

    if (!list.length) list = this.frames;

    this._activeFrames = list;

    this._frameTops = this._activeFrames.map((f) =>

      this._topItems(this._applyItemFilters(f))

    );

    if (this.dayIndex >= this._activeFrames.length) {

      this.dayIndex = Math.max(0, this._activeFrames.length - 1);

    }

  }



  setFilters({ country, countries, genre, year, start, end } = {}) {

    this.pause();

    if (countries !== undefined) {

      this.filterCountries =

        countries && countries.size > 0 ? new Set(countries) : null;

    } else if (country !== undefined) {

      this.filterCountries =

        country && country !== "all" ? new Set([country]) : null;

    }

    if (genre !== undefined) this.filterGenre = genre || "all";

    if (year !== undefined) this.filterYear = year || "all";

    if (start !== undefined) this.filterStartDate = start || "";

    if (end !== undefined) this.filterEndDate = end || "";

    this.dayIndex = 0;

    this.rowEls.forEach((row) => row.el.remove());

    this.rowEls.clear();

    this._lastAxisMax = 0;

    this._rebuildActiveFrames();

    if (this._activeFrames.length) {

      this._applyPair(0, 0, 1);

      this._emitProgress(0);

    }

  }



  jumpToEnd() {

    if (!this._activeFrames.length) return;

    this.pause();

    this.dayIndex = this._activeFrames.length - 1;

    this.rowEls.forEach((row) => row.el.remove());

    this.rowEls.clear();

    this._lastAxisMax = 0;

    this._applyPair(this.dayIndex, this.dayIndex, 1);

    this._emitProgress(1);

  }



  _ease(t) {
    // cubic-bezier(0.22, 1, 0.36, 1) — smooth ease-out
    return 1 - Math.pow(1 - t, 2.8);
  }



  _lerp(a, b, t) {

    return a + (b - a) * t;

  }



  _topItems(frame) {

    return frame.items

      .filter((i) => i.value > 0)

      .sort((a, b) => b.value - a.value)

      .slice(0, this.topN);

  }



  _rankMap(items) {

    const map = new Map();

    items.forEach((item, i) => map.set(item.name, i));

    return map;

  }



  _maxValue(items) {

    const m = Math.max(...items.map((i) => i.value), 1);

    if (m <= 500) return Math.ceil(m / 50) * 50;

    if (m <= 5000) return Math.ceil(m / 500) * 500;

    if (m <= 50000) return Math.ceil(m / 5000) * 5000;

    return Math.ceil(m / 10000) * 10000;

  }



  _formatValue(n) {
    const v = Math.max(0, n);
    return Math.round(v).toLocaleString() + this.valueSuffix;
  }

  _formatValueAnimated(n) {
    const v = Math.max(0, n);
    return Math.floor(v).toLocaleString() + this.valueSuffix;
  }



  _ensureRow(name) {

    if (this.rowEls.has(name)) return this.rowEls.get(name);



    const row = document.createElement("div");
    row.className = "bcr-row";
    row.dataset.name = name;
    row.style.height = `${this.rowHeight}px`;
    row.innerHTML = `
      <div class="bcr-rank"></div>
      <div class="bcr-poster-wrap"><img class="bcr-poster" alt="" /></div>
      <div class="bcr-bar-track">
        <div class="bcr-bar"></div>
        <span class="bcr-name"></span>
      </div>
      <div class="bcr-value">0</div>
    `;

    this.container.appendChild(row);



    const state = {

      el: row,

      rank: row.querySelector(".bcr-rank"),

      poster: row.querySelector(".bcr-poster"),

      bar: row.querySelector(".bcr-bar"),

      name: row.querySelector(".bcr-name"),

      value: row.querySelector(".bcr-value"),

      valueNum: 0,
      displayValue: 0,
      barScale: 0,
      imgSrc: "",
    };

    this.rowEls.set(name, state);

    return state;

  }



  _setPoster(state, item) {

    const url = item.poster || this.posterMap.get(item.name) || "";

    if (url && state.imgSrc !== url) {

      state.poster.src = url;

      state.imgSrc = url;

      state.poster.style.display = "";

    } else if (!url) {

      state.poster.removeAttribute("src");

      state.poster.style.display = "none";

    }

  }



  _updateAxis(maxVal) {

    if (Math.abs(maxVal - this._lastAxisMax) / maxVal < 0.02 && this._lastAxisMax) return;

    this._lastAxisMax = maxVal;

    this.maxScale = maxVal;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxVal * t));

    this.axisEl.innerHTML = ticks

      .map((v) => `<span>${v.toLocaleString()}</span>`)

      .join("");

  }



  _updateDateBadge(fromDate, toDate, progress) {
    if (!this.dateEl) return;
    const animating = progress > 0 && progress < 1 && fromDate !== toDate;
    if (!animating) {
      this.dateEl.textContent = toDate || fromDate || "";
      this.dateEl.style.opacity = "1";
      this.dateEl.style.transform = "translate3d(0,0,0)";
      return;
    }
    if (progress < 0.45) {
      this.dateEl.textContent = fromDate || "";
      this.dateEl.style.opacity = String(1 - progress / 0.45);
      this.dateEl.style.transform = `translate3d(0,${-6 * (progress / 0.45)}px,0)`;
    } else {
      this.dateEl.textContent = toDate || "";
      const t = (progress - 0.45) / 0.55;
      this.dateEl.style.opacity = String(t);
      this.dateEl.style.transform = `translate3d(0,${6 * (1 - t)}px,0)`;
    }
  }

  _updateTotalBadge(fromTotal, toTotal, eased) {
    if (!this.totalEl) return;
    const total = this._lerp(fromTotal, toTotal, eased);
    this.totalEl.textContent = `${this.subtitle}：${Math.round(total).toLocaleString()}`;
  }

  _applyPair(fromIdx, toIdx, progress = 1) {
    const eased = this._ease(progress);
    const animating = progress > 0 && progress < 1;
    const fromItems = this._frameTops[fromIdx] || [];
    const toItems = this._frameTops[toIdx] || [];
    const fromMap = new Map(fromItems.map((i) => [i.name, i]));
    const toMap = new Map(toItems.map((i) => [i.name, i]));
    const fromRank = this._rankMap(fromItems);
    const toRank = this._rankMap(toItems);

    const names = new Set([...fromMap.keys(), ...toMap.keys()]);
    const blended = [];

    names.forEach((name) => {
      const a = fromMap.get(name) || { name, value: 0, color: "#5b8def" };
      const b = toMap.get(name) || {
        name,
        value: 0,
        color: a.color,
        avatar: a.avatar,
      };
      blended.push({
        name,
        value: this._lerp(a.value, b.value, eased),
        color: b.color || a.color,
        poster: b.poster || a.poster || this.posterMap.get(name),
      });
    });

    blended.sort((a, b) => b.value - a.value);

    const maxVal = this._maxValue(
      blended.length ? blended.slice(0, this.topN) : toItems
    );
    this._updateAxis(maxVal);

    const visible = new Set();
    const offY = (this.topN + 0.85) * this.rowHeight;

    blended.forEach((item, sortIdx) => {
      const name = item.name;
      const fr = fromRank.has(name) ? fromRank.get(name) : this.topN + 2;
      const tr = toRank.has(name) ? toRank.get(name) : this.topN + 2;
      const inFrom = fr < this.topN;
      const inTo = tr < this.topN;
      const inNow = sortIdx < this.topN;

      if (!inFrom && !inTo && !inNow) {
        if (progress >= 1) return;
      }

      visible.add(name);
      const row = this._ensureRow(name);

      let y;
      let opacity = 1;

      if (inNow) {
        y = sortIdx * this.rowHeight;
        if (!inFrom) opacity = Math.min(1, eased * 2.2);
        if (!inTo) opacity = Math.min(opacity, Math.max(0.12, 1 - (1 - eased) * 1.8));
      } else if (inFrom || inTo) {
        const startY = inFrom ? fr * this.rowHeight : offY;
        const endY = inTo ? tr * this.rowHeight : offY;
        y = this._lerp(startY, endY, eased);
        if (sortIdx >= this.topN) {
          y = this._lerp(fr < this.topN ? fr * this.rowHeight : offY, offY, eased);
        }
        opacity = Math.max(0, 1 - Math.max(0, sortIdx - this.topN + 1) * 0.35);
        if (!inTo) opacity = Math.min(opacity, Math.max(0, 1 - eased * 1.2));
        if (!inFrom) opacity = Math.min(1, Math.max(opacity, eased * 1.5));
      } else {
        y = offY;
        opacity = 0;
      }

      row.el.style.transform = `translate3d(0,${y}px,0)`;
      row.el.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      row.el.style.zIndex = String(200 - sortIdx);

      const displayRank = inNow ? sortIdx + 1 : inFrom && !inTo ? fr + 1 : 0;
      if (displayRank > 0) {
        row.rank.textContent = displayRank;
        row.rank.className =
          "bcr-rank" + (displayRank <= 3 ? ` bcr-rank--${displayRank}` : "");
      } else {
        row.rank.textContent = "";
        row.rank.className = "bcr-rank";
      }

      row.name.textContent = name;

      const targetValue = item.value;
      if (row.displayValue === undefined || !animating) {
        row.displayValue = targetValue;
      } else {
        row.displayValue = this._lerp(row.displayValue, targetValue, 0.22);
      }
      row.valueNum = row.displayValue;
      row.value.textContent = animating
        ? this._formatValueAnimated(row.displayValue)
        : this._formatValue(row.displayValue);

      const pct = maxVal > 0 ? item.value / maxVal : 0;
      const targetScale = Math.max(0.006, pct);
      if (row.barScale === undefined || !animating) {
        row.barScale = targetScale;
      } else {
        row.barScale = this._lerp(row.barScale, targetScale, 0.18);
      }
      row.bar.style.width = "100%";
      row.bar.style.transform = `scaleX(${row.barScale})`;
      row.bar.style.background = item.color;
      this._setPoster(row, item);
    });

    this.rowEls.forEach((row, name) => {
      if (!visible.has(name)) {
        row.el.remove();
        this.rowEls.delete(name);
      }
    });

    const fromF = this._activeFrames[fromIdx] || {};
    const toF = this._activeFrames[toIdx] || {};
    const fromTotal = fromF.total ?? 0;
    const toTotal = toF.total ?? 0;

    this._updateDateBadge(fromF.date || "", toF.date || "", progress);
    this._updateTotalBadge(fromTotal, toTotal, eased);

    const frame = this._activeFrames[toIdx] || this._activeFrames[fromIdx];
    const ranked = blended.slice(0, this.topN);

    if (this.onDayChange) {
      this.onDayChange({
        date: frame?.date,
        total: Math.round(this._lerp(fromTotal, toTotal, eased)),
        ranked,
      });
    }
  }



  _animateStep(timestamp) {

    if (!this.playing) return;

    if (!this.startTime) this.startTime = timestamp;

    const elapsed = timestamp - this.startTime;

    const progress = Math.min(1, elapsed / this.dayDuration);



    this._applyPair(this.dayIndex, this.dayIndex + 1, progress);



    if (progress >= 1) {

      this.dayIndex++;

      this.startTime = 0;



      if (this.dayIndex >= this._activeFrames.length - 1) {

        this.playing = false;

        this._emitProgress(1);

        return;

      }

      this._emitProgress(this.dayIndex / (this._activeFrames.length - 1));

    }



    this.rafId = requestAnimationFrame((ts) => this._animateStep(ts));

  }



  _emitProgress(ratio) {

    const maxIdx = Math.max(0, this._activeFrames.length - 1);

    this.container.dispatchEvent(

      new CustomEvent("bcr-progress", {

        detail: {

          ratio,

          frameIndex: this.dayIndex,

          frameCount: this._activeFrames.length,

          maxIndex: maxIdx,

          date: this._activeFrames[this.dayIndex]?.date || "",

        },

      })

    );

  }



  goToFrame(index) {

    if (!this._activeFrames.length) return;

    this.pause();

    const max = this._activeFrames.length - 1;

    this.dayIndex = Math.max(0, Math.min(index, max));

    this.rowEls.forEach((row) => row.el.remove());

    this.rowEls.clear();

    this._lastAxisMax = 0;

    this._applyPair(this.dayIndex, this.dayIndex, 1);

    this._emitProgress(max > 0 ? this.dayIndex / max : 1);

  }



  seekToRatio(ratio) {

    if (!this._activeFrames.length) return;

    const max = this._activeFrames.length - 1;

    const idx = Math.round(Math.max(0, Math.min(1, ratio)) * max);

    this.goToFrame(idx);

  }



  setTopN(n) {

    this.pause();

    this.topN = Math.max(1, Math.min(100, n));

    this.container.style.height = `${this.topN * this.rowHeight}px`;

    if (this.stage) {

      this.stage.style.minHeight = `${this.topN * this.rowHeight + 120}px`;

      this.stage.classList.toggle("bcr-stage--scroll", this.topN > 20);

    }

    this.rowEls.forEach((row) => row.el.remove());

    this.rowEls.clear();

    this._lastAxisMax = 0;

    this._rebuildActiveFrames();

    if (this._activeFrames.length) {

      const max = this._activeFrames.length - 1;

      if (this.dayIndex > max) this.dayIndex = max;

      this._applyPair(this.dayIndex, this.dayIndex, 1);

      this._emitProgress(max > 0 ? this.dayIndex / max : 1);

    }

  }



  play() {

    if (!this._activeFrames.length || this._activeFrames.length < 2) return;

    if (this.dayIndex >= this._activeFrames.length - 1) this.reset();

    this.playing = true;

    this.startTime = 0;

    cancelAnimationFrame(this.rafId);

    this.rafId = requestAnimationFrame((ts) => this._animateStep(ts));

  }



  pause() {

    this.playing = false;

    cancelAnimationFrame(this.rafId);

  }



  reset() {

    this.pause();

    this.dayIndex = 0;

    this.rowEls.forEach((row) => row.el.remove());

    this.rowEls.clear();

    this._lastAxisMax = 0;

    this._applyPair(0, 0, 1);

    this._emitProgress(0);

  }



  setSpeed(ms) {

    this.dayDuration = ms;

  }



  destroy() {

    this.pause();

    this.dateEl?.remove();

    this.totalEl?.remove();

    this.axisEl?.remove();

    this.container.innerHTML = "";

    this.rowEls.clear();

  }

}



if (typeof module !== "undefined" && module.exports) {

  module.exports = { BarChartRace };

}


