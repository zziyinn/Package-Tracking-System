// analytics.js — routes_analytics.html / drivers_analytics.html 通用 + 本页筛选器联动
// 说明：自定义多选（DSP/线路/状态/天数差）仅对本页表格 #tbody 生效。
// 采用 drivers 页面那套可靠顺序：先加载 CSV → 再初始化筛选器 → 首屏默认渲染（<2天）。

let ORDERS = [];
let pieChart = null;

// ↓↓↓ 新增：当前上下文（用于饼图点击下钻）
let CURRENT_MODE = "route";   // "route" | "driver"
let CURRENT_KEY  = "";        // 当前查询的线路号 / 司机号（若有）
let CURRENT_ROWS = [];        // 当前明细（作为下钻的基线）

const Q  = (sel) => document.querySelector(sel);
const QA = (sel) => Array.from(document.querySelectorAll(sel));

/* ========= 表头别名（自动适配中英文/大小写） ========= */
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
const norm = s => String(s||"").replace(/\s+/g,"").toLowerCase();
function pickHeader(cands){
  if (!ORDERS.length) return null;
  const keys = Object.keys(ORDERS[0] || {});
  for (const c of cands){
    const hit = keys.find(k => norm(k) === norm(c));
    if (hit) return hit;
  }
  return null;
}
// 取行字段的通用工具：优先候选表头，其次给定的兜底 key
function valByHeaders(row, cands, fallbackKey){
  if (!row) return "";
  for (const c of (pickHeader(cands) ? [pickHeader(cands)] : cands)) {
    if (c in row) return row[c];
  }
  if (fallbackKey && fallbackKey in row) return row[fallbackKey];
  return "";
}

/* ========= 工具 ========= */
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

/* ========= 唯一值 & 下拉填充 ========= */
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
// 填充仓库下拉（#warehouseSelect）
function populateWarehouseSelect(){
  const sel = Q("#warehouseSelect");
  if (!sel) return;
  const vals = uniqByHeaders(HEADERS.warehouse);
  sel.innerHTML = `<option value="">ALL</option>` + vals.map(v=>`<option value="${v}">${v}</option>`).join("");
}

/* ========= 统计 / 分组 ========= */
function groupByStatus(rows){
  const k = pickHeader(HEADERS.status) || "Latest Status";
  const map = new Map();
  rows.forEach(r=>{
    const key = r[k] || "未知";
    map.set(key, (map.get(key)||0)+1);
  });
  return map;
}
function groupByDriver(rows){
  const k = pickHeader(HEADERS.driver) || "Driver id";
  const map = new Map();
  rows.forEach(r=>{
    const key = r[k] || "未知司机";
    map.set(key, (map.get(key)||0)+1);
  });
  return map;
}

/* ========= 表格 / 摘要 ========= */
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

function renderSummaryForRoute(rows, routeText){
  const box = Q("#summary");
  if (!box) return;
  if (!rows.length){
    box.innerHTML = `<div class="empty">未找到与线路号 <b>${routeText||"（ALL）"}</b> 匹配的订单。</div>`;
    return;
  }
  const k = {
    status: pickHeader(HEADERS.status) || "Latest Status",
    time:   pickHeader(HEADERS.time)   || "Latest Update Time",
    driver: pickHeader(HEADERS.driver) || "Driver id",
    dsp:    pickHeader(HEADERS.dsp)    || "DSP",
    days:   pickHeader(HEADERS.days)   || "还剩/天断更"
  };
  const total = rows.length;
  const delivered = rows.filter(r => /delivered|投递|配送完成/i.test(r[k.status]||"")).length;
  const nums = rows.map(r => parseDays(r[k.days])).filter(d=>!isNaN(d));
  const avgDays = nums.length ? (nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(2) : '--';
  const lastUpdate  = rows.map(r => r[k.time] || "").sort().reverse()[0] || "--";
  const uniqDrivers = new Set(rows.map(r => r[k.driver]||"")).size;
  const uniqDSP     = new Set(rows.map(r => r[k.dsp]||"")).size;
  box.innerHTML = `
    <ul class="kpis">
      <li><span class="k">Selected Route</span><span class="v">${routeText || "ALL"}</span></li>
      <li><span class="k">Order Number</span><span class="v">${total}</span></li>
      <li><span class="k">Delivered</span><span class="v">${delivered} (${(delivered/total*100).toFixed(1)}%)</span></li>
      <li><span class="k">Average Days</span><span class="v">${avgDays}</span></li>
      <li><span class="k">Drivers</span><span class="v">${uniqDrivers}</span></li>
      <li><span class="k">DSP</span><span class="v">${uniqDSP}</span></li>
      <li><span class="k">Last Update</span><span class="v">${lastUpdate}</span></li>
    </ul>
  `;
}

/* ========= 图表（含点击下钻） ========= */
function renderStatusPie(statusMap){
  const labels = Array.from(statusMap.keys());
  const data = Array.from(statusMap.values());
  const ctx = Q("#pie")?.getContext("2d");
  if (!ctx) return;
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
      // ↓ 点击某个“状态”扇区 → 下钻当前司机的该状态明细
      onClick: (_, elements) => {
        if (!elements?.length) return;
        const idx   = elements[0].index;
        const label = labels[idx];
        drilldownFromPie(label);
      }
    }
  });
}

function renderDriverPieForRoute(rows){
  const map = groupByDriver(rows);
  const labels = Array.from(map.keys());
  const data   = labels.map(l => map.get(l));
  const ctx = Q("#pie")?.getContext("2d");
  if (!ctx) return;
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
      // ↓ 点击某个“司机号”扇区 → 下钻当前线路的该司机明细
      onClick: (_, elements) => {
        if (!elements?.length) return;
        const idx   = elements[0].index;
        const label = labels[idx];
        drilldownFromPie(label);
      }
    }
  });
}

/* ========= 下钻逻辑 ========= */
// 饼图点击后的下钻：
// - driver 模式：label=状态 → 过滤 CURRENT_ROWS（该司机）为该状态
// - route  模式：label=司机 → 过滤 CURRENT_ROWS（该线路）为该司机
function drilldownFromPie(label){
  if (!CURRENT_ROWS.length) return;

  let filtered = [];
  if ((CURRENT_MODE || "").toLowerCase() === "driver") {
    const statusKey = pickHeader(HEADERS.status) || "Latest Status";
    filtered = CURRENT_ROWS.filter(o => String(o?.[statusKey] || "") === label);
    addDrillBadge(`driver ${CURRENT_KEY || "（）"} · status：${label}`, () => {
      renderTable(CURRENT_ROWS);
      removeDrillBadge();
      scrollToDetail();
    });
  } else { // route
    const driverKey = pickHeader(HEADERS.driver) || "Driver id";
    filtered = CURRENT_ROWS.filter(o => String(o?.[driverKey] || "") === label);
    addDrillBadge(`route ${CURRENT_KEY || " "} · driver：${label}`, () => {
      renderTable(CURRENT_ROWS);
      removeDrillBadge();
      renderSummaryForRoute(CURRENT_ROWS, getSelectedRoutesText() || CURRENT_KEY || "ALL");
      scrollToDetail();
    });
  }

  renderTable(filtered);
  if ((CURRENT_MODE || "").toLowerCase() === "route") {
    renderSummaryForRoute(filtered, `${getSelectedRoutesText() || CURRENT_KEY || "ALL"}（下钻：${label}）`);
  }
  scrollToDetail();
}

// 简易“面包屑”条（显示下钻条件 & 一键清除）
function addDrillBadge(text, onClear){
  removeDrillBadge();
  const wrap = Q(".table-wrap") || Q("#tbody")?.closest(".panel") || document.body;
  const bar  = document.createElement("div");
  bar.id = "drillBadge";
  bar.style.cssText = "margin:8px 0 4px; font-size:13px; background:#f5f7fb; border:1px solid #e5e7eb; padding:6px 10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;";
  bar.innerHTML = `<span>🔎 Drilling down：${text}</span><a href="#" id="drillClear">Clear</a>`;
  wrap.parentNode.insertBefore(bar, wrap);
  bar.querySelector("#drillClear").addEventListener("click", (e)=>{
    e.preventDefault();
    onClear?.();
  });
}
function removeDrillBadge(){ Q("#drillBadge")?.remove(); }
function scrollToDetail(){
  const el = Q(".table-wrap") || Q("#tbody");
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ========= 颜色标注（天数差） ========= */
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

/* ========= 自定义多选（DSP / 线路 / 状态码 / 天数差） ========= */
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

  // 支持 initialItems：在表格未渲染前用 CSV 唯一值填充
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
          applyAllFilters(); // 触发刷新
        });
        list.appendChild(row);
      });
    }
    function updateBtn(){
      const n = state.selected.size;
      btn.textContent = n ? `SELECTED ${n}` : "ALL";
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

    // 首次填充 & 表格变更时刷新
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

    // 注册过滤器
    filters.push({
      apply(){
        if (state.selected.size===0) return; // 无选择不影响
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

  // 装配四个多选（初始项来自 CSV 唯一值）
  function bootMS(){
    const dspItems    = uniqByHeaders(HEADERS.dsp);
    const routeItems  = uniqByHeaders(HEADERS.route);
    const statusItems = uniqByHeaders(HEADERS.status);
    console.log("[MS] dsp/route/status counts:", dspItems.length, routeItems.length, statusItems.length);

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

  // 简单筛选：仓库选择 + 司机号输入
  function applySimpleFilters(){
    const wv = (Q("#warehouseSelect")?.value || "").trim();
    const driverKey = (Q("#driverInput")?.value || "").trim();
    const ths = Array.from(document.querySelectorAll("table thead th"));
    const wIdx = ths.findIndex(th => /仓库|warehouse/i.test(th.textContent||""));
    const dIdx = ths.findIndex(th => /司机|driver/i.test(th.textContent||""));
    const rows = Array.from(document.querySelectorAll("#tbody tr"));
    rows.forEach(tr=>{
      if (tr.hidden) return; // 已被多选隐藏就不再判断
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

  // 汇总：一次性应用所有过滤器
  function applyAllFilters(){
    const rows = Array.from(document.querySelectorAll("#tbody tr"));
    rows.forEach(tr=> tr.hidden = false);
    filters.forEach(f => f.apply());
    applySimpleFilters();
    filters.forEach(f => f.updateCount());
    refreshChartFromVisible();
  }

  // 根据可见行重画饼图 + 同步 CURRENT_ROWS
  function refreshChartFromVisible(){
    const mode = (document.body.getAttribute("data-mode") || "driver").toLowerCase();
    CURRENT_MODE = mode;

    const dataRows = [];
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
    QA("#tbody tr").forEach(tr=>{
      if (tr.hidden) return;
      dataRows.push({
        Tracking: tr.children[idxMap.tracking]?.textContent || "",
        Warehouse: tr.children[idxMap.wh]?.textContent || "",
        DSP: tr.children[idxMap.dsp]?.textContent || "",
        "Driver id": tr.children[idxMap.driver]?.textContent || "",
        "# Route": tr.children[idxMap.route]?.textContent || "",
        "Latest Status": tr.children[idxMap.status]?.textContent || "",
        "Latest Update Time": tr.children[idxMap.time]?.textContent || "",
        "还剩/天断更": tr.children[idxMap.days]?.textContent || "",
      });
    });

    // 同步当前可见行作为下钻基线
    CURRENT_ROWS = dataRows.slice();

    if (mode === "route") {
      renderDriverPieForRoute(dataRows);
      renderSummaryForRoute(dataRows, getSelectedRoutesText());
    } else {
      renderStatusPie(groupByStatus(dataRows));
    }
  }

  function getSelectedRoutesText(){
    const txt = Q("#routeMS .ms-toggle")?.textContent || "";
    const m = txt.match(/已选\s+(\d+)/);
    if (m) return `选中 ${m[1]} 条线路`;
    return "";
  }

  // 暴露：供外层在 CSV 加载后启动
  window.initPageFilters = function(){
    bootMS();
    // 简单控件：变更即应用
    Q("#warehouseSelect")?.addEventListener("change", applyAllFilters);
    Q("#driverInput")?.addEventListener("input",  applyAllFilters);
    // 刷新按钮
    Q("#refreshBtn")?.addEventListener("click", ()=> {
      refreshChartFromVisible();
      applyAllFilters();
    });
    // 复制可见订单号
    Q("#copyOrdersBtn")?.addEventListener("click", ()=>{
      const ids = QA("#tbody tr").filter(tr=>!tr.hidden)
        .map(tr=> (tr.children[0]?.textContent||"").trim()).filter(Boolean);
      if (!ids.length) { toast("没有可复制的单号"); return; }
      navigator.clipboard.writeText(ids.join("\n"))
        .then(()=>toast(`已复制 ${ids.length} 个单号`))
        .catch(()=>toast("复制失败"));
    });
    // 导出供内部调用
    window.__filters_applyAll = applyAllFilters;
  };
})();

/* ========= 首屏：默认展示断更 + 即将断更（天数差 < 2） ========= */
function initialRender(mode){
  CURRENT_MODE = mode;
  CURRENT_KEY  = "";
  const kDays = pickHeader(HEADERS.days) || "还剩/天断更";
  const rows = ORDERS.filter(o=>{
    const d = parseDays(o?.[kDays]);
    return !isNaN(d) && d < 2;
  });
  CURRENT_ROWS = rows.slice(); // 作为下钻基线
  renderTable(rows);
  if (mode === "route") {
    renderDriverPieForRoute(rows);
    renderSummaryForRoute(rows, "天数差<2");
  } else {
    renderStatusPie(groupByStatus(rows));
  }
  window.__filters_applyAll?.();
}

/* ========= 交互：分析（按线路/司机查询时可用） ========= */
function analyze(mode){
  const key = (Q("#keyInput")?.value || "").trim();
  if (!key) { toast(mode === "driver" ? "请输入司机号" : "请输入线路号"); return; }

  const kDriver = pickHeader(HEADERS.driver) || "Driver id";
  const kRoute  = pickHeader(HEADERS.route)  || "# Route";

  const rows = ORDERS.filter(o => {
    if (mode === "driver") return (o[kDriver]||"") === key;
    return (o[kRoute]||"") === key;
  });

  // 记录上下文（供饼图点击下钻）
  CURRENT_MODE = mode;
  CURRENT_KEY  = key;
  CURRENT_ROWS = rows.slice();

  renderTable(rows);

  if (mode === "driver") {
    renderStatusPie(groupByStatus(rows));
  } else {
    renderDriverPieForRoute(rows);
    renderSummaryForRoute(rows, key);
  }

  window.__filters_applyAll?.();
}

function toast(msg){
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>{ el.classList.add("hide"); setTimeout(()=>el.remove(), 300); }, 1600);
}

function setTitlesByMode(mode){
  const title = Q("#chartTitle");
  const hint  = Q("#chartHint");
  if (!title || !hint) return;

}

/* ========= 启动 ========= */
(async function boot(){
  const mode = (document.body.getAttribute("data-mode") || "route").toLowerCase(); // 当前页默认 route
  CURRENT_MODE = mode;

  try{
    await loadCSV();          // 先拿数据
  }catch(e){
    console.error(e);
    toast("加载 orders.csv 失败");
  }
  if (!ORDERS.length){
    console.warn("[CSV] 没有数据，检查路径或用本地服务器打开页面");
  }

  populateWarehouseSelect();
  setTitlesByMode(mode);

  // CSV 成功后再初始化多选
  if (typeof window.initPageFilters === "function") window.initPageFilters();

  // 首屏：断更 + 即将断更（天数差 < 2）
  initialRender(mode);
})();
更新于