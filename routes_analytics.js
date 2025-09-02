
// ============== analytics.js ==============
// 通用：drivers_analytics.html / routes_analytics.html 共用
// 依据 <body data-mode="driver|route"> 自动选择饼图聚合维度：
//  - driver  → 按 Driver id 分布
//  - route   → 按 # Route 分布
// 首屏：默认展示 “天数差 < 2” 的订单

let ORDERS = [];
let pieChart = null;

const Q  = (sel) => document.querySelector(sel);
const QA = (sel) => Array.from(document.querySelectorAll(sel));
const norm = s => String(s||"").replace(/\s+/g,"").toLowerCase();

/* ---- 表头别名（中/英/大小写自适配） ---- */
const HEADERS = {
  warehouse: ["Warehouse","仓库"],
  dsp:       ["DSP","Dsp","承运商","配送商","Carrier"],
  route:     ["# Route","Route","线路","线路号","Line"],
  status:    ["Latest Status","Status","状态码","状态","最新状态"],
  driver:    ["Driver id","Driver","司机","司机号"],
  time:      ["Latest Update Time","最后一次状态时间","最后更新时间","Date"],
  tracking:  ["Tracking","订单号","运单号","Waybill"],
  days:      ["还剩/天断更","天数差","Days Left","剩余天数","剩余/天断更"]
};
function pickHeader(cands){
  if (!ORDERS.length) return null;
  const keys = Object.keys(ORDERS[0] || {});
  for (const c of cands){
    const hit = keys.find(k => norm(k) === norm(c));
    if (hit) return hit;
  }
  return null;
}

/* ---- 工具 ---- */
function parseDays(text){
  if (!text) return NaN;
  const m = String(text).replace(/,/g,'').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}
function updateTime(){
  const el = Q("#refresh-info");
  if (el) el.textContent = "Updated: " + new Date().toLocaleString();
}
async function loadCSV() {
  const res = await fetch("orders.csv", {cache:"no-store"});
  if (!res.ok) throw new Error(`CSV HTTP ${res.status}`);
  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  ORDERS = parsed.data || [];
  console.log("[CSV] rows:", ORDERS.length, "headers:", Object.keys(ORDERS[0]||{}));
  updateTime();
}
function uniqByHeaders(cands){
  const key = pickHeader(cands);
  if (!key) return [];
  const vals = new Set();
  for (const o of ORDERS) {
    const v = String(o?.[key] ?? "").trim();
    if (v) vals.add(v);
  }
  return [...vals].sort((a,b)=>a.localeCompare(b));
}

/* ---- 下拉/多选 初始填充 ---- */
function populateWarehouseSelect(){
  const sel = Q("#warehouseSelect");
  if (!sel) return;
  const vals = uniqByHeaders(HEADERS.warehouse);
  sel.innerHTML = `<option value="">ALL</option>` + vals.map(v=>`<option value="${v}">${v}</option>`).join("");
}

/* ---- 分组统计 ---- */
function groupByField(rows, fieldKey){
  const m = new Map();
  rows.forEach(r=>{
    const k = r[fieldKey] || "(空)";
    m.set(k, (m.get(k)||0)+1);
  });
  return m;
}
function groupByStatus(rows){
  const k = pickHeader(HEADERS.status) || "Latest Status";
  return groupByField(rows, k);
}

/* ---- 表格/概要 ---- */
function renderTable(rows){
  const tb = Q("#tbody");
  if (!tb) return;
  const k = {
    tracking: pickHeader(HEADERS.tracking) || "Tracking",
    wh:       pickHeader(HEADERS.warehouse) || "Warehouse",
    dsp:      pickHeader(HEADERS.dsp) || "DSP",
    driver:   pickHeader(HEADERS.driver) || "Driver id",
    route:    pickHeader(HEADERS.route) || "# Route",
    status:   pickHeader(HEADERS.status) || "Latest Status",
    time:     pickHeader(HEADERS.time) || "Latest Update Time",
    days:     pickHeader(HEADERS.days) || "还剩/天断更",
  };
  tb.innerHTML = rows.map(o=>`
    <tr>
      <td>${o[k.tracking] || ""}</td>
      <td>${o[k.wh] || ""}</td>
      <td>${o[k.dsp] || ""}</td>
      <td>${o[k.driver] || ""}</td>
      <td>${o[k.route] || ""}</td>
      <td>${o[k.status] || ""}</td>
      <td>${o[k.time] || ""}</td>
      <td>${o[k.days] || ""}</td>
    </tr>
  `).join("");
}
function renderSummaryOverall(rows, label){
  const box = Q("#summary"); if(!box) return;
  if (!rows.length){ box.innerHTML = `<div class="empty">无数据</div>`; return; }
  const k = {
    status: pickHeader(HEADERS.status) || "Latest Status",
    time:   pickHeader(HEADERS.time)   || "Latest Update Time",
    driver: pickHeader(HEADERS.driver) || "Driver id",
    dsp:    pickHeader(HEADERS.dsp)    || "DSP",
    route:  pickHeader(HEADERS.route)  || "# Route",
    days:   pickHeader(HEADERS.days)   || "还剩/天断更"
  };
  const total = rows.length;
  const delivered = rows.filter(r => /delivered|投递|配送完成/i.test(r[k.status]||"")).length;
  const nums = rows.map(r => parseDays(r[k.days])).filter(d=>!isNaN(d));
  const avgDays = nums.length ? (nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(2) : '--';
  const lastUpdate = rows.map(r => r[k.time] || "").sort().reverse()[0] || "--";
  const uniqDrivers = new Set(rows.map(r => r[k.driver]||"")).size;
  const uniqRoutes  = new Set(rows.map(r => r[k.route]||"")).size;
  const uniqDSP     = new Set(rows.map(r => r[k.dsp]||"")).size;
  box.innerHTML = `
    <ul class="kpis">
      <li><span class="k">Selected</span><span class="v">${label||"ALL"}</span></li>
      <li><span class="k">Order Number</span><span class="v">${total}</span></li>
      <li><span class="k">Delivered</span><span class="v">${delivered} (${(delivered/total*100).toFixed(1)}%)</span></li>
      <li><span class="k">Average Days</span><span class="v">${avgDays}</span></li>
      <li><span class="k">Drivers</span><span class="v">${uniqDrivers}</span></li>
      <li><span class="k">Routes</span><span class="v">${uniqRoutes}</span></li>
      <li><span class="k">DSP</span><span class="v">${uniqDSP}</span></li>
      <li><span class="k">Last Update</span><span class="v">${lastUpdate}</span></li>
    </ul>
  `;
}
function renderSummaryForDriver(rows, driver){
  renderSummaryOverall(rows, `司机 ${driver}`);
}
function renderSummaryForRoute(rows, route){
  renderSummaryOverall(rows, `线路 ${route}`);
}

/* ---- 天数差配色（行级） ---- */
(function () {
  function classForDaysColoring(d) {
    if (isNaN(d)) return "days-green";
    if (d < 0) return "days-purple";
    if (d >= 0 && d < 1) return "days-red-strong";
    if (d >= 1 && d < 2) return "days-pink";
    if (d >= 2 && d <= 5) return "days-orange";
    return "days-green";
  }
  function colorize() {
    const ths = Array.from(document.querySelectorAll("table thead th"));
    const daysIdx = ths.findIndex(th => /天数差|days|剩余|差/i.test(th.textContent || ""));
    if (daysIdx < 0) return;
    const rows = Array.from(document.querySelectorAll("#tbody tr"));
    rows.forEach(tr => {
      tr.classList.remove("days-purple","days-red-strong","days-pink","days-orange","days-green");
      const d = parseDays(tr.children[daysIdx]?.textContent || "");
      tr.classList.add(classForDaysColoring(d));
    });
  }
  const tb = document.getElementById("tbody");
  if (tb) new MutationObserver(colorize).observe(tb, { childList: true });
})();

/* ---- 多选（DSP / 线路 / 状态 / 天数差） + 简单筛选 ---- */
(function(){
  const filters = [];

  function findCol(keys){
    const ths = Array.from(document.querySelectorAll("table thead th"));
    for (let i=0;i<ths.length;i++){
      const t=(ths[i].textContent||"").trim();
      if (keys.some(k=>new RegExp(k,"i").test(t))) return i;
    }
    return -1;
  }
  function collectUnique(colIdx){
    if (colIdx<0) return [];
    const rows = Array.from(document.querySelectorAll("#tbody tr"));
    const vals = rows.map(tr => (tr.children[colIdx]?.textContent || "").trim());
    const set = new Set(vals);
    const arr = Array.from(set);
    const blanks = arr.filter(v=>!v);
    const non = arr.filter(v=>v);
    return (blanks.length?["(Blanks)"]:[]).concat(non.sort((a,b)=>a.localeCompare(b)));
  }

  function attachMultiSelect({rootId, headerKeys, fixedItems, predicate, initialItems}) {
    const root = document.getElementById(rootId);
    if (!root) return;
    const state = { selected: new Set(), search: "", items: [] };
    const btn   = root.querySelector(".ms-toggle");
    const panel = root.querySelector(".ms-panel");
    const input = root.querySelector(".ms-input");
    const list  = root.querySelector(".ms-list");
    const countEl = root.querySelector(".ms-count");

    function renderList(){
      list.innerHTML = "";
      const q = state.search.trim().toLowerCase();
      const filtered = state.items.filter(v => v.toLowerCase().includes(q));
      if (countEl) countEl.textContent = `Displaying ${filtered.length}`;
      if (!filtered.length){
        const d=document.createElement("div"); d.className="ms-empty"; d.textContent="No results"; list.appendChild(d); return;
      }
      filtered.forEach(label=>{
        const real = (label==="(Blanks)")?"":label;
        const id = rootId+"_"+btoa(unescape(encodeURIComponent(label))).replace(/=+$/,"");
        const row = document.createElement("label");
        row.className="ms-item";
        row.innerHTML = `<input type="checkbox" id="${id}"><span class="ms-label">${label}</span>`;
        const cb = row.querySelector("input");
        cb.checked = state.selected.has(real);
        cb.addEventListener("change", ()=>{
          if (cb.checked) state.selected.add(real); else state.selected.delete(real);
          updateBtn();
          applyAllFilters();
        });
        list.appendChild(row);
      });
    }
    function updateBtn(){
      const n = state.selected.size;
      btn.textContent = n ? `已选 ${n}` : "ALL";
      const care = document.createElementNS("http://www.w3.org/2000/svg","svg");
      care.setAttribute("viewBox","0 0 20 20"); care.setAttribute("width","14"); care.setAttribute("height","14");
      care.classList.add("ms-caret");
      const path = document.createElementNS("http://www.w3.org/2000/svg","path");
      path.setAttribute("d","M5 7l5 6 5-6"); path.setAttribute("fill","currentColor");
      care.appendChild(path); btn.appendChild(care);
    }
    function togglePanel(show){ panel.hidden=!show; document.body.classList.toggle("ms-open", show); }
    document.addEventListener("click",(e)=>{ if(!root.contains(e.target)) togglePanel(false); });
    btn.addEventListener("click",(e)=>{ e.stopPropagation(); togglePanel(panel.hidden); if(!panel.hidden) input?.focus(); });
    input?.addEventListener("input", ()=>{ state.search = input.value; renderList(); });
    const head = root.querySelector(".ms-head");
    head?.addEventListener("click",(e)=>{
      const act = e.target?.getAttribute?.("data-act");
      if(!act) return;
      e.preventDefault();
      if (act==="selectAll") { state.items.forEach(v=>state.selected.add(v==="(Blanks)"?"":v)); }
      if (act==="clear") state.selected.clear();
      updateBtn(); renderList(); applyAllFilters();
    });

    function rebuild(){
      state.items = fixedItems
        ? fixedItems.slice()
        : (initialItems && initialItems.length ? initialItems.slice()
           : collectUnique(findCol(headerKeys)));
      renderList(); updateBtn();
    }
    rebuild();
    const tb = document.getElementById("tbody");
    if (tb) new MutationObserver(rebuild).observe(tb,{childList:true});

    filters.push({
      apply(){
        if (state.selected.size===0) return;
        const rows = Array.from(document.querySelectorAll("#tbody tr"));
        if (fixedItems && predicate){
          const col = findCol(HEADERS.days);
          rows.forEach(tr=>{
            const d = parseDays(tr.children[col]?.textContent || "");
            const keep = predicate(d, state.selected);
            tr.hidden = tr.hidden || !keep;
          });
        } else {
          const col = findCol(headerKeys);
          rows.forEach(tr=>{
            const text = (tr.children[col]?.textContent || "").trim();
            const real = text || "";
            if (!state.selected.has(real)) tr.hidden = true;
          });
        }
      },
      updateCount(){
        const rows = Array.from(document.querySelectorAll("#tbody tr"));
        const visible = rows.filter(tr=>!tr.hidden).length;
        if (countEl) countEl.textContent = `Displaying ${visible}`;
      }
    });
  }

  function bootMS(){
    const dspItems    = uniqByHeaders(HEADERS.dsp);
    const routeItems  = uniqByHeaders(HEADERS.route);
    const statusItems = uniqByHeaders(HEADERS.status);
    attachMultiSelect({ rootId:"dspMS",    headerKeys:HEADERS.dsp,    initialItems: dspItems });
    attachMultiSelect({ rootId:"routeMS",  headerKeys:HEADERS.route,  initialItems: routeItems });
    attachMultiSelect({ rootId:"statusMS", headerKeys:HEADERS.status, initialItems: statusItems });
    attachMultiSelect({
      rootId:"daysMS",
      headerKeys:HEADERS.days,
      fixedItems:["<0","<1","1","2","3"],
      predicate: (d, set)=>{
        if (isNaN(d)) return false;
        for (const v of set){
          if (v === "<0" && d < 0) return true;
          if (v === "<1" && d >= 0 && d < 1) return true;
          const n = parseInt(v, 10);
          if (!isNaN(n) && Math.floor(d) === n) return true;
        }
        return false;
      }
    });
  }

  function applySimpleFilters(){
    const wv = (Q("#warehouseSelect")?.value || "").trim();
    const driverKey = (Q("#driverInput")?.value || "").trim();
    const ths = Array.from(document.querySelectorAll("table thead th"));
    const wIdx = ths.findIndex(th => /仓库|warehouse/i.test(th.textContent||""));
    const dIdx = ths.findIndex(th => /司机|driver/i.test(th.textContent||""));
    const rows = Array.from(document.querySelectorAll("#tbody tr"));
    rows.forEach(tr=>{
      if (tr.hidden) return;
      let ok = true;
      if (wv) {
        const txt = (tr.children[wIdx]?.textContent || "").trim();
        ok = ok && (txt === wv);
      }
      if (driverKey) {
        const txt = (tr.children[dIdx]?.textContent || "").trim();
        ok = ok && (txt === driverKey);
      }
      if (!ok) tr.hidden = true;
    });
  }

  function applyAllFilters(){
    const rows = Array.from(document.querySelectorAll("#tbody tr"));
    rows.forEach(tr=> tr.hidden = false);
    filters.forEach(f => f.apply());
    applySimpleFilters();
    filters.forEach(f => f.updateCount());
    refreshChartFromVisible();
  }

  window.__filters_applyAll = applyAllFilters;

  function startAfterCSV(){
    bootMS();
    Q("#warehouseSelect")?.addEventListener("change", applyAllFilters);
    Q("#driverInput")?.addEventListener("input",  applyAllFilters);
    Q("#refreshBtn")?.addEventListener("click", ()=>{ refreshChartFromVisible(); applyAllFilters(); });
    Q("#copyOrdersBtn")?.addEventListener("click", ()=>{
      const ids = QA("#tbody tr").filter(tr=>!tr.hidden)
        .map(tr=> (tr.children[0]?.textContent||"").trim()).filter(Boolean);
      if (!ids.length) { toast("没有可复制的单号"); return; }
      navigator.clipboard.writeText(ids.join("\n"))
        .then(()=>toast(`已复制 ${ids.length} 个单号`))
        .catch(()=>toast("复制失败"));
    });
  }

  if (document.readyState==="loading") {
    document.addEventListener("DOMContentLoaded", startAfterCSV);
  } else {
    startAfterCSV();
  }
})();

/* ---- 饼图（按当前模式的维度聚合） + 点击钻取 ---- */
function renderPieByField(rows, fieldKey, mode){
  const ctx = Q("#pie")?.getContext("2d");
  if (!ctx) return;
  // 分组
  const m = groupByField(rows, fieldKey);
  const labels = Array.from(m.keys());
  const data   = labels.map(l => m.get(l));

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: "pie",
    data: { labels, datasets: [{ data, borderWidth: 1 }] },
    options: {
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: {
          label: (ctx)=>{
            const total = data.reduce((a,b)=>a+b,0);
            const v = ctx.parsed;
            const p = total? ((v/total)*100).toFixed(1):0;
            return `${ctx.label}: ${v} (${p}%)`;
          }
        } }
      },
      onClick: (evt, elements) => {
        if (!elements || !elements.length) return;
        const idx = elements[0].index;
        const chosen = labels[idx];
        const subset = rows.filter(r => (r[fieldKey]||"(空)") === chosen);
        renderTable(subset);
        if (mode === "driver") {
          renderSummaryForDriver(subset, chosen);
        } else {
          renderSummaryForRoute(subset, chosen);
        }
        window.__filters_applyAll?.(); // 与筛选器/配色再联动一次
      }
    }
  });
}

function refreshChartFromVisible(){
  const mode = (document.body.getAttribute("data-mode") || "driver").toLowerCase();
  // 从当前可见行收集数据
  const ths = Array.from(document.querySelectorAll("table thead th"));
  const idxMap = {
    tracking: ths.findIndex(th => /订单号|tracking|waybill/i.test(th.textContent||"")),
    wh:       ths.findIndex(th => /仓库|warehouse/i.test(th.textContent||"")),
    dsp:      ths.findIndex(th => /dsp|承运|配送/i.test(th.textContent||"")),
    driver:   ths.findIndex(th => /司机|driver/i.test(th.textContent||"")),
    route:    ths.findIndex(th => /线路|route|line/i.test(th.textContent||"")),
    status:   ths.findIndex(th => /状态码|状态|status/i.test(th.textContent||"")),
    time:     ths.findIndex(th => /最后|latest update|date/i.test(th.textContent||"")),
    days:     ths.findIndex(th => /天数差|days|剩余|差/i.test(th.textContent||"")),
  };
  const rows = [];
  QA("#tbody tr").forEach(tr=>{
    if (tr.hidden) return;
    rows.push({
      [pickHeader(HEADERS.tracking) || "Tracking"]: tr.children[idxMap.tracking]?.textContent || "",
      [pickHeader(HEADERS.warehouse) || "Warehouse"]: tr.children[idxMap.wh]?.textContent || "",
      [pickHeader(HEADERS.dsp) || "DSP"]: tr.children[idxMap.dsp]?.textContent || "",
      [pickHeader(HEADERS.driver) || "Driver id"]: tr.children[idxMap.driver]?.textContent || "",
      [pickHeader(HEADERS.route) || "# Route"]: tr.children[idxMap.route]?.textContent || "",
      [pickHeader(HEADERS.status) || "Latest Status"]: tr.children[idxMap.status]?.textContent || "",
      [pickHeader(HEADERS.time) || "Latest Update Time"]: tr.children[idxMap.time]?.textContent || "",
      [pickHeader(HEADERS.days) || "还剩/天断更"]: tr.children[idxMap.days]?.textContent || "",
    });
  });

  // 选择聚合维度
  const fieldKey = (mode === "driver")
    ? (pickHeader(HEADERS.driver) || "Driver id")
    : (pickHeader(HEADERS.route)  || "# Route");

  renderPieByField(rows, fieldKey, mode);

  // 概要（整体）
  if (mode === "driver") {
    renderSummaryOverall(rows, "ALL");
  } else {
    renderSummaryOverall(rows, "ALL");
  }
}

/* ---- 首屏：默认渲染“天数差 < 2” ---- */
function initialRender(mode){
  const kDays = pickHeader(HEADERS.days) || "还剩/天断更";
  const rows = ORDERS.filter(o=>{
    const d = parseDays(o?.[kDays]);
    return !isNaN(d) && d < 2;
  });
  renderTable(rows);

  const fieldKey = (mode === "driver")
    ? (pickHeader(HEADERS.driver) || "Driver id")
    : (pickHeader(HEADERS.route)  || "# Route");

  renderPieByField(rows, fieldKey, mode);
  renderSummaryOverall(rows, mode === "driver" ? "全部司机(天数差<2)" : "全部线路(天数差<2)");
  window.__filters_applyAll?.();
}

/* ---- UI 文案 ---- */
function setTitlesByMode(mode){
  const title = Q("#chartTitle");
  const hint  = Q("#chartHint");
  if (!title || !hint) return;
  if (mode === "driver"){
    title.textContent = "司机分布（Driver id）";
    hint.textContent  = "* 订单按「Driver id」分布";
  }else{
    title.textContent = "线路分布（# Route）";
    hint.textContent  = "* 订单按「# Route」分布";
  }
}

function toast(msg){
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>{ el.classList.add("hide"); setTimeout(()=>el.remove(), 300); }, 1600);
}

/* ---- 启动 ---- */
(async function boot(){
  const mode = (document.body.getAttribute("data-mode") || "driver").toLowerCase();
  try{ await loadCSV(); }catch(e){ console.error(e); toast("加载 orders.csv 失败"); }
  if (!ORDERS.length) console.warn("[CSV] 没有数据，路径或本地服务有误？");

  populateWarehouseSelect();
  setTitlesByMode(mode);

  // 初始化多选/按钮，然后首屏渲染
  typeof window.__filters_applyAll; // 预热
  if (typeof window.__filters_applyAll === "function") {
    // no-op
  }
  initialRender(mode);
})();

