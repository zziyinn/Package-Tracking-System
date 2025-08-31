let orders = [];

async function loadOrders() {
  const res = await fetch("orders.csv");
  const csvText = await res.text();
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  orders = parsed.data;
  initFilters();
  renderOrders();
}

function getFreshnessClass(days) {
  const d = parseFloat(days);
  if (isNaN(d)) return "";
  if (d > 5) return "dead";
  if (d <= 3) return "warn";
  return "ok";
}

function renderOrders() {
  const warehouse = document.getElementById("warehouseSelect").value;
  const dsp = document.getElementById("dspSelect").value;
  const tbody = document.getElementById("ordersBody");
  tbody.innerHTML = "";

  orders
    .filter(o => (!warehouse || o.Warehouse === warehouse))
    .filter(o => (!dsp || o.DSP === dsp))
    .forEach(o => {
      const tr = document.createElement("tr");
      tr.className = getFreshnessClass(o["还剩/天断更"]);

      tr.innerHTML = `
        <td>${o.Tracking}</td>
        <td>${o.Warehouse}</td>
        <td>${o.DSP}</td>
        <td>${o["Driver id"]}</td>
        <td>${o["# Route"]}</td>
        <td>${o["Latest Status"]}</td>
        <td>${o["Latest Update Time"] || o["最后一次状态时间"]}</td>
        <td>${o["还剩/天断更"]}</td>
        <td>${tr.className === "dead" ? "已断更" : tr.className === "warn" ? "即将断更" : "正常"}</td>
      `;
      tbody.appendChild(tr);
    });

  document.getElementById("refresh-info").innerText = "更新于: " + new Date().toLocaleString();
}

function initFilters() {
  const warehouses = [...new Set(orders.map(o => o.Warehouse))];
  const dsps = [...new Set(orders.map(o => o.DSP))];

  const wSelect = document.getElementById("warehouseSelect");
  warehouses.forEach(w => {
    if (!w) return;
    const opt = document.createElement("option");
    opt.value = w;
    opt.text = w;
    wSelect.appendChild(opt);
  });

  const dSelect = document.getElementById("dspSelect");
  dsps.forEach(d => {
    if (!d) return;
    const opt = document.createElement("option");
    opt.value = d;
    opt.text = d;
    dSelect.appendChild(opt);
  });
}

document.getElementById("refreshBtn").addEventListener("click", renderOrders);

// 初始化
loadOrders();
