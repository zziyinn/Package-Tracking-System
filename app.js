let orders = [];

async function loadOrders() {
  const res = await fetch("orders.csv");
  const csvText = await res.text();
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  orders = parsed.data;
  initFilters();
  renderOrders();
}

/* 原有新鲜度类（保留） */
function getFreshnessClass(days) {
  const d = parseFloat(days);
  if (isNaN(d)) return "";
  if (d > 5) return "dead";
  if (d <= 3) return "warn";
  return "ok";
}

/* ========= 工具：多选读取（兼容旧 select；当前主要用自定义多选） ========= */
function getMultiSelectedValues(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return [];
  const vals = Array.from(sel.selectedOptions).map(o => o.value);
  return vals.filter(v => v !== "" && v !== "all");
}

/* ========= 天数差解析 ========= */
function parseDays(text) {
  if (!text) return NaN;
  const m = String(text).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

/* ========= 原有渲染：保持小改动 ========= */
function renderOrders() {
  const warehouse = document.getElementById("warehouseSelect").value;
  // 旧的多选（隐藏后通常为空，不会干扰）
  const dspMulti = getMultiSelectedValues("dspSelect");
  const routeMulti = getMultiSelectedValues("routeSelect");
  const statusMulti = getMultiSelectedValues("statusSelect");
  const daysMulti = getMultiSelectedValues("daysBucketSelect");
  const driverInput = document.getElementById("driverInput").value.trim().toLowerCase();

  const tbody = document.getElementById("ordersBody");
  tbody.innerHTML = "";

  orders
    .filter(o => (!warehouse || o.Warehouse === warehouse))
    .filter(o => (dspMulti.length === 0 || dspMulti.includes(o.DSP)))
    .filter(o => (routeMulti.length === 0 || routeMulti.includes(o["# Route"])))
    .filter(o => (statusMulti.length === 0 || statusMulti.includes(o["Latest Status"])))
    .filter(o => {
      if (!driverInput) return true;
      const v = (o["Driver id"] || "").toString().toLowerCase();
      return v.includes(driverInput);
    })
    .filter(o => {
      if (daysMulti.length === 0) return true;
      const d = parseDays(o["还剩/天断更"]);
      // 兼容旧 select：<0, <1, 1, 2, 3
      return daysMulti.some(bucket => {
        if (bucket === "<0") return !isNaN(d) && d < 0;
        if (bucket === "<1") return !isNaN(d) && d >= 0 && d < 1;
        const n = parseInt(bucket, 10);
        return !isNaN(d) && !isNaN(n) && Math.floor(d) === n;
      });
    })
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
      `;
      document.getElementById("ordersBody").appendChild(tr);
    });

  document.getElementById("refresh-info").innerText =
    "UPDATE: " + new Date().toLocaleString();
}

/* ========= 初始化基础下拉（用于填充“仓库”等） ========= */
function initFilters() {
  const addOptions = (id, values) => {
    const select = document.getElementById(id);
    const existed = new Set(Array.from(select.options).map(o=>o.value)); // 保留“全部/默认”
    [...new Set(values)].filter(v => v && !existed.has(v)).forEach(v => {
      const opt = document.createElement("option");
      opt.value = v; opt.text = v;
      select.appendChild(opt);
    });
  };
  addOptions("warehouseSelect", orders.map(o => o.Warehouse));
  addOptions("dspSelect", orders.map(o => o.DSP));
  addOptions("routeSelect", orders.map(o => o["# Route"]));
  addOptions("statusSelect", orders.map(o => o["Latest Status"]));
}

/* ========= 复制当前可见订单号（toast 提示） ========= */
(function () {
  function findColumnIndexByHeader(keys) {
    const ths = Array.from(document.querySelectorAll("table thead th"));
    for (let i = 0; i < ths.length; i++) {
      const t = (ths[i].textContent || "").trim();
      if (keys.some(k => new RegExp(k, "i").test(t))) return i;
    }
    return -1;
  }

  function showToast(msg) {
    let toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.position = "fixed";
    toast.style.bottom = "30px";
    toast.style.right = "30px";
    toast.style.background = "rgba(0,0,0,0.78)";
    toast.style.color = "#fff";
    toast.style.padding = "10px 16px";
    toast.style.borderRadius = "8px";
    toast.style.fontSize = "14px";
    toast.style.zIndex = 9999;
    toast.style.border = "1px solid #d1d5db"; /* 细边框 */
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "opacity 0.5s, transform 0.2s";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(4px)";
      setTimeout(() => document.body.removeChild(toast), 500);
    }, 2000);
  }

  function copyVisibleOrderIds() {
    const idx = findColumnIndexByHeader(["订单号","单号","Order","Tracking","#\\s*Order","AWB","Shipment"]);
    if (idx < 0) { showToast("未找到“订单号/Order”列"); return; }
    const rows = Array.from(document.querySelectorAll("#ordersBody tr"));
    const ids = rows
      .filter(tr => tr.offsetParent !== null)
      .map(tr => (tr.children[idx]?.textContent || "").trim())
      .filter(Boolean);
    const text = ids.join("\n");

    navigator.clipboard.writeText(text).then(() => {
      showToast(`已复制 ${ids.length} 个单号`);
    }).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast(`已复制 ${ids.length} 个单号`);
    });
  }

  const btn = document.getElementById("copyOrdersBtn");
  if (btn) btn.addEventListener("click", copyVisibleOrderIds);
})();

/* ========= 行配色（天数差） ========= */
(function () {
  function classForDaysColoring(d) {
    if (isNaN(d)) return "days-green";     // 无时间：绿，仅着色
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
    const rows = Array.from(document.querySelectorAll("#ordersBody tr"));
    rows.forEach(tr => {
      tr.classList.remove("days-purple","days-red-strong","days-pink","days-orange","days-green");
      const d = parseDays(tr.children[daysIdx]?.textContent || "");
      tr.classList.add(classForDaysColoring(d));
    });
  }
  const tb = document.getElementById("ordersBody");
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
    const rows = Array.from(document.querySelectorAll("#ordersBody tr"));
    const vals = rows.map(tr => (tr.children[colIdx]?.textContent || "").trim());
    const set = new Set(vals);
    const arr = Array.from(set);
    const blanks = arr.filter(v=>!v);
    const non = arr.filter(v=>v);
    return (blanks.length?["(Blanks)"]:[]).concat(non.sort((a,b)=>a.localeCompare(b)));
  }

  function attachMultiSelect({rootId, headerKeys, fixedItems, predicate}) {
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
      countEl.textContent = `Displaying ${filtered.length}`;
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
          renderOrders(); // 触发刷新（随后叠加过滤）
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

    // 头部操作
    panel.querySelector("[data-act='selectAll']").addEventListener("click",(e)=>{
      e.preventDefault();
      state.items.forEach(label => state.selected.add(label==="(Blanks)"?"":label));
      renderList(); updateBtn(); renderOrders();
    });
    panel.querySelector("[data-act='clear']").addEventListener("click",(e)=>{
      e.preventDefault();
      state.selected.clear(); renderList(); updateBtn(); renderOrders();
    });
    input.addEventListener("input", ()=>{ state.search=input.value||""; renderList(); });

    // 首次填充
    function rebuild(){
      state.items = fixedItems ? fixedItems.slice()
                  : collectUnique(findCol(headerKeys));
      renderList(); updateBtn();
    }
    rebuild();
    // 表格变更时刷新
    const tb = document.getElementById("ordersBody");
    if (tb) new MutationObserver(rebuild).observe(tb,{childList:true});

    // 注册过滤器
    filters.push({
      apply(){
        if (state.selected.size===0) return; // 没选就不影响
        const col = fixedItems ? findCol(["天数差","days","剩余","差"]) : findCol(headerKeys);
        const rows = Array.from(document.querySelectorAll("#ordersBody tr"));
        rows.forEach(tr=>{
          if (tr.style.display==="none") return; // 已被其它条件隐藏
          if (fixedItems){
            // 天数差：使用分桶 predicate
            const d = parseDays(tr.children[col]?.textContent || "");
            tr.style.display = predicate(d, state.selected) ? "" : "none";
          }else{
            const v = (tr.children[col]?.textContent || "").trim();
            tr.style.display = state.selected.has(v) ? "" : "none";
          }
        });
      },
      updateCount(){
        const visible = Array.from(document.querySelectorAll("#ordersBody tr")).filter(tr => tr.offsetParent !== null).length;
        countEl.textContent = `Displaying ${visible}`;
      }
    });
  }

  // 附加四个多选：DSP / 线路 / 状态码 / 天数差
  function bootMS(){
    attachMultiSelect({ rootId:"dspMS",    headerKeys:["DSP"] });
    attachMultiSelect({ rootId:"routeMS",  headerKeys:["线路","Route","Line"] });
    attachMultiSelect({ rootId:"statusMS", headerKeys:["状态码","状态","Status"] });
    attachMultiSelect({
      rootId:"daysMS",
      headerKeys:["天数差","days","剩余","差"],
      fixedItems:["<0","<1","1","2","3"],             // ✅ 你的要求
      predicate: (d, set)=>{
        if (isNaN(d)) return false;
        for (const v of set){
          if (v === "<0" && d < 0) return true;
          if (v === "<1" && d >= 0 && d < 1) return true;
          const n = parseInt(v, 10);
          if (!isNaN(n) && Math.floor(d) === n) return true; // 1/2/3
        }
        return false;
      }
    });
  }

  // 包一层：在原 renderOrders 之后叠加多选过滤，并更新计数
  const _render = renderOrders;
  renderOrders = function(){
    _render();
    filters.forEach(f => f.apply());
    filters.forEach(f => f.updateCount());
  };

  if (document.readyState==="loading") {
    document.addEventListener("DOMContentLoaded", bootMS);
  } else {
    bootMS();
  }
})();

/* ========= 事件：刷新 ========= */
document.getElementById("refreshBtn").addEventListener("click", renderOrders);

/* ========= 初始化 ========= */
loadOrders();

/* ========= Footer 占位自动化：按实际高度给 body 预留空间 ========= */
(function keepFooterVisible(){
  function applyFooterPadding(){
    const f = document.querySelector('.footer');
    if (!f) return;
    const h = f.offsetHeight + 12; // 额外 12px 缓冲
    document.body.style.paddingBottom = h + 'px';
  }
  window.addEventListener('load', applyFooterPadding);
  window.addEventListener('resize', applyFooterPadding);
  const ro = new ResizeObserver(applyFooterPadding);
  ro.observe(document.body);
})();
