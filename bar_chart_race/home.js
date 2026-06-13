(function () {
  let payload = null;
  let chart = null;
  let period = "monthly";

  async function loadMarket() {
    const res = await fetch("market.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function rows() {
    return period === "weekly" ? payload.weekly || [] : payload.monthly || [];
  }

  function renderChart() {
    const list = rows();
    if (chart) {
      chart.destroy();
      chart = null;
    }
    if (!list.length) return;

    chart = new Chart(document.getElementById("hub-market-chart"), {
      type: "bar",
      data: {
        labels: list.map((r) => r.label || r.date),
        datasets: [
          {
            label: "院線總票房",
            data: list.map((r) => r.totalValue),
            backgroundColor: "rgba(91,163,245,0.72)",
            borderRadius: 4,
            yAxisID: "y",
            order: 2,
          },
          {
            label: "平均票價",
            data: list.map((r) => r.avgPrice),
            type: "line",
            borderColor: "#ffb74d",
            backgroundColor: "#ffb74d",
            borderWidth: 2.5,
            pointRadius: period === "weekly" ? 0 : 3,
            spanGaps: true,
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
            labels: { color: "#cfd8dc", font: { family: "'Noto Sans TC', sans-serif" } },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                if (ctx.dataset.yAxisID === "y1") {
                  return ctx.parsed.y != null
                    ? `平均票價：${ctx.parsed.y.toLocaleString()} 元／張`
                    : "平均票價：—";
                }
                return `總票房：${window.BCR_FILTER?.formatBoxOffice?.(ctx.parsed.y) ?? `${ctx.parsed.y.toLocaleString()} 萬`}`;
              },
              afterBody(items) {
                const row = list[items[0].dataIndex];
                if (row?.totalTickets) {
                  return [`售票：${row.totalTickets.toLocaleString()} 張`];
                }
                return [];
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#8b9cb0",
              maxRotation: 45,
              maxTicksLimit: period === "weekly" ? 16 : 14,
              font: { family: "'Noto Sans TC', sans-serif", size: 10 },
            },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            title: {
              display: true,
              text: "總票房",
              color: "#b0bec5",
              font: { family: "'Noto Sans TC', sans-serif", size: 11 },
            },
            ticks: {
              color: "#8b9cb0",
              callback: (v) => window.BCR_FILTER?.formatBoxOfficeAxis?.(v) ?? v,
            },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y1: {
            position: "right",
            title: {
              display: true,
              text: "平均票價 / 元",
              color: "#b0bec5",
              font: { family: "'Noto Sans TC', sans-serif", size: 11 },
            },
            ticks: { color: "#8b9cb0" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  async function init() {
    payload = await loadMarket();
    const cov = payload.coverage || {};
    document.getElementById("hub-subtitle").textContent =
      `${payload.subtitle || ""}｜${cov.start || ""} → ${cov.end || ""}（${cov.weeks || 0} 週）`;
    document.getElementById("hub-market-note").textContent = payload.avgPriceNote || "";

    document.querySelectorAll("[data-market]").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll("[data-market]").forEach((b) => {
          b.classList.toggle("analytics-toggle-btn--active", b === btn);
        });
        period = btn.dataset.market;
        renderChart();
      };
    });

    renderChart();
  }

  init().catch((err) => {
    document.getElementById("hub-subtitle").textContent =
      "無法載入 market.json：" + err.message;
  });
})();
