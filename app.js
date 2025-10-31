// app.js - Mobile-optimized behavior (complete)
const BRAIN_KEY = "rex_brain_v1";
const CONFIG_KEY = "rex_config_v1";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function $(id){ return document.getElementById(id); }

let state = { apiKey: "", model: "deepseek/deepseek-r1-0528-qwen3-8b:free", brain: {} };

function loadState(){
  const cfg = localStorage.getItem(CONFIG_KEY);
  if(cfg){
    try{ const parsed = JSON.parse(cfg); state.apiKey = parsed.apiKey || ""; state.model = parsed.model || state.model; }catch(e){}
  }
  try{ state.brain = JSON.parse(localStorage.getItem(BRAIN_KEY) || "{}"); }catch(e){ state.brain = {}; }
}

function saveConfig(){ localStorage.setItem(CONFIG_KEY, JSON.stringify({apiKey:state.apiKey, model:state.model})); renderStatus(); }
function saveBrain(){ localStorage.setItem(BRAIN_KEY, JSON.stringify(state.brain)); renderStatus(); }
function nowISO(){ return new Date().toISOString(); }

function cleanQuery(q){
  const patterns = [/^who is\s+/i, /^what is\s+/i, /^what are\s+/i, /^where is\s+/i, /^when is\s+/i, /^why is\s+/i, /^how is\s+/i,
    /^who are\s+/i, /^where are\s+/i, /^when are\s+/i, /^why are\s+/i, /^how are\s+/i,
    /^tell me about\s+/i, /^can you tell me\s+/i, /^do you know\s+/i, /^i want to know about\s+/i,
    /^search for\s+/i, /^find\s+/i, /^look up\s+/i, /^define\s+/i, /^what does\s+/i, /^how does\s+/i, /^what do\s+/i];
  let c = (q||"").trim().toLowerCase();
  for(const p of patterns) c = c.replace(p,"");
  return c.replace(/\s+/g," ").trim();
}

function renderStatus(){
  $("statusModel").textContent = state.model;
  $("statusApi").textContent = state.apiKey ? "set" : "not set";
  $("statusBrain").textContent = Object.keys(state.brain).length;
}

function appendMessage(kind, text){
  const display = $("chatDisplay");
  const wrap = document.createElement("div");
  wrap.className = `msg ${kind}`;
  const who = document.createElement("div");
  who.className="who";
  who.textContent = kind === "bot" ? "REX AI:" : kind === "error" ? "ERROR:" : "You:";
  const body = document.createElement("div");
  body.className = "body";
  body.textContent = text;
  wrap.appendChild(who);
  wrap.appendChild(body);
  display.appendChild(wrap);
  setTimeout(()=> display.scrollTop = display.scrollHeight, 50);
}

function searchBrain(query){
  const cleaned = cleanQuery(query);
  if(!cleaned) return null;
  if(state.brain[cleaned]) return state.brain[cleaned];
  for(const k of Object.keys(state.brain)){ if(k.includes(cleaned) || cleaned.includes(k)) return state.brain[k]; }
  return null;
}

function storeInBrain(query, responseData){
  const cleaned = cleanQuery(query) || query.toLowerCase().trim();
  state.brain[cleaned] = {
    original_query: query,
    response: responseData.response || "",
    source: responseData.source || "OpenRouter",
    timestamp: responseData.timestamp || nowISO(),
    success: !!responseData.success
  };
  saveBrain();
}

async function askOpenRouter(query){
  if(!state.apiKey) return {success:false, error:`No API key set. Save your key in configuration.`};
  const payload = { model: state.model, messages: [{role:"user", content: query}], max_tokens: 1000, temperature: 0.7 };
  try{
    const resp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {"Authorization": `Bearer ${state.apiKey}`, "Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });
    if(!resp.ok){ const text = await resp.text(); return {success:false, error:`API Error ${resp.status}: ${text}`}; }
    const data = await resp.json();
    const aiText = data.choices?.[0]?.message?.content || "";
    const usage = data.usage ? `(Tokens: ${data.usage.total_tokens || "N/A"})` : "";
    return {success:true, response: aiText, source:"GPT-4o via OpenRouter", timestamp: nowISO(), token_info: usage};
  }catch(e){
    return {success:false, error:`Error: ${e.message}`};
  }
}

function showLoading(){ $("loading").classList.remove("hidden"); }
function hideLoading(){ $("loading").classList.add("hidden"); }

function createModal(title, bodyElem, footerElem){
  const root = $("modalRoot"); root.innerHTML = "";
  const container = document.createElement("div"); container.className = "modal";
  const h = document.createElement("div"); h.style.display="flex"; h.style.justifyContent="space-between"; h.style.alignItems="center";
  const t = document.createElement("div"); t.textContent = title; t.style.fontWeight=700;
  const closeBtn = document.createElement("button"); closeBtn.className="link-btn"; closeBtn.textContent="Close";
  closeBtn.onclick = ()=> root.innerHTML = "";
  h.appendChild(t); h.appendChild(closeBtn);
  container.appendChild(h);
  const body = document.createElement("div"); body.className="modal-body"; body.appendChild(bodyElem);
  container.appendChild(body);
  if(footerElem) container.appendChild(footerElem);
  root.appendChild(container);
}

function openHistory(){
  const wrap = document.createElement("div");
  const search = document.createElement("input"); search.placeholder="Filter..."; search.style.width="100%"; search.style.padding="8px"; search.style.marginBottom="8px";
  wrap.appendChild(search);
  const list = document.createElement("div"); list.style.maxHeight="55vh"; list.style.overflow="auto";
  wrap.appendChild(list);

  function refresh(){
    const q = (search.value||"").trim().toLowerCase();
    list.innerHTML = "";
    const keys = Object.keys(state.brain).sort((a,b)=>(state.brain[b].timestamp||"").localeCompare(state.brain[a].timestamp||""));
    for(const k of keys){
      const entry = state.brain[k];
      const label = entry.original_query || k;
      if(q && !k.includes(q) && !label.toLowerCase().includes(q)) continue;
      const item = document.createElement("div");
      item.style.padding="10px"; item.style.borderBottom="1px solid rgba(255,255,255,0.03)";
      item.textContent = `${label} — ${entry.timestamp||""}`;
      item.onclick = ()=>{
        const detail = `Original Query: ${entry.original_query || ""}\nTimestamp: ${entry.timestamp || ""}\nSource: ${entry.source || ""}\nSuccess: ${entry.success}\n\nResponse:\n${entry.response || ""}`;
        createModal("Entry Details", document.createTextNode(detail), null);
      };
      item.oncontextmenu = (ev)=>{ ev.preventDefault(); if(confirm("Delete this entry?")){ delete state.brain[k]; saveBrain(); refresh(); } };
      list.appendChild(item);
    }
  }
  search.oninput = refresh;
  refresh();

  const footer = document.createElement("div");
  const exportBtn = document.createElement("button"); exportBtn.className="btn primary wide"; exportBtn.textContent="Export Keys";
  exportBtn.onclick = ()=>{
    const keys = Object.keys(state.brain);
    if(!keys.length){ alert("No keys to export."); return; }
    const txt = keys.join("\n");
    const out = window.open("", "_blank");
    out.document.write(`<pre>${txt.replace(/</g,"&lt;")}</pre>`);
  };
  footer.appendChild(exportBtn);
  createModal("History — Brain Entries", wrap, footer);
}

function openBrainManager(){
  const wrap = document.createElement("div");
  const search = document.createElement("input"); search.placeholder="Filter..."; search.style.width="100%"; search.style.padding="8px"; search.style.marginBottom="8px";
  wrap.appendChild(search);
  const list = document.createElement("div"); list.style.maxHeight="55vh"; list.style.overflow="auto";
  wrap.appendChild(list);

  function refresh(){
    const q = (search.value||"").trim().toLowerCase();
    list.innerHTML = "";
    const keys = Object.keys(state.brain).sort((a,b)=>(state.brain[b].timestamp||"").localeCompare(state.brain[a].timestamp||""));
    keys.forEach(k=>{
      const entry = state.brain[k];
      const label = entry.original_query || k;
      if(q && !k.includes(q) && !label.toLowerCase().includes(q)) return;
      const row = document.createElement("div"); row.style.display="flex"; row.style.justifyContent="space-between"; row.style.alignItems="center"; row.style.padding="10px"; row.style.borderBottom="1px solid rgba(255,255,255,0.03)";
      const left = document.createElement("div"); left.textContent = `${label} — ${entry.timestamp||""}`; left.style.flex="1";
      const del = document.createElement("button"); del.className="btn"; del.textContent="Delete"; del.onclick = ()=>{ if(confirm("Delete selected brain entry?")){ delete state.brain[k]; saveBrain(); refresh(); } };
      row.appendChild(left); row.appendChild(del); list.appendChild(row);
    });
  }
  search.oninput = refresh;

  const footer = document.createElement("div");
  const deleteAll = document.createElement("button"); deleteAll.className="btn"; deleteAll.style.background="var(--error)"; deleteAll.style.color="#101010"; deleteAll.textContent="Delete All";
  deleteAll.onclick = ()=>{ if(!Object.keys(state.brain).length){ alert("Brain is already empty."); return; } if(confirm("Delete ALL entries in brain? This cannot be undone.")){ state.brain = {}; saveBrain(); refresh(); } };
  footer.appendChild(deleteAll);
  refresh();
  createModal("Manage Brain", wrap, footer);
}

/* New helper: prompt user to paste API key */
function promptForApiKey(){
  // Open config panel and focus the API key input so user can paste their key
  const cfg = $("config");
  if (cfg) cfg.classList.remove("hidden");
  const apiInput = $("apiKey");
  if (apiInput) {
    apiInput.focus();
    // On mobile some browsers need a small timeout to focus properly after panel opens
    setTimeout(()=> apiInput.focus(), 100);
  }
  const msg = document.createElement("div");
  msg.style.padding = "8px";
  msg.textContent = "Please paste your OpenRouter API key into the API Key field and click Save before sending requests.";
  createModal("API Key Required", msg, null);
}

/* Robust event wiring for config toggle and close buttons */
function wireConfigButtons(){
  const toggleBtn = $("toggleCfg");
  const closeBtn = $("closeCfg");
  const configPanel = $("config");

  if (!toggleBtn) {
    console.error("toggleCfg button not found in DOM");
  } else {
    toggleBtn.addEventListener("click", (e) => {
      if (!configPanel) {
        console.error("config panel element not found");
        return;
      }
      configPanel.classList.toggle("hidden");
      // ensure focus goes to API input when opening
      if (!configPanel.classList.contains("hidden")) {
        const apiInput = $("apiKey");
        if (apiInput) {
          apiInput.focus();
          setTimeout(()=> apiInput.focus(), 100);
        }
      }
    });
  }

  if (!closeBtn) {
    console.error("closeCfg button not found in DOM");
  } else {
    closeBtn.addEventListener("click", (e) => {
      if (!configPanel) {
        console.error("config panel element not found");
        return;
      }
      configPanel.classList.add("hidden");
    });
  }
}

function init(){
  loadState();
  const apiEl = $("apiKey");
  const modelEl = $("modelName");
  if (apiEl) apiEl.value = state.apiKey;
  if (modelEl) modelEl.value = state.model;
  renderStatus();

  // Wire config toggles robustly
  wireConfigButtons();

  // Save config
  const saveBtn = $("saveConfig");
  if (saveBtn) {
    saveBtn.addEventListener("click", ()=>{
      const apiInput = $("apiKey");
      const modelInput = $("modelName");
      state.apiKey = apiInput ? apiInput.value.trim() : state.apiKey;
      state.model = modelInput ? (modelInput.value.trim() || state.model) : state.model;
      saveConfig();
      alert("Configuration saved.");
      const cfg = $("config"); if (cfg) cfg.classList.add("hidden");
    });
  }

  const viewHistoryBtn = $("viewHistory");
  if (viewHistoryBtn) viewHistoryBtn.addEventListener("click", ()=>{ openHistory(); const cfg = $("config"); if(cfg) cfg.classList.add("hidden"); });

  const manageBrainBtn = $("manageBrain");
  if (manageBrainBtn) manageBrainBtn.addEventListener("click", ()=>{ openBrainManager(); const cfg = $("config"); if(cfg) cfg.classList.add("hidden"); });

  const sendBtn = $("sendBtn");
  if (sendBtn) sendBtn.addEventListener("click", onSend);

  const userInput = $("userInput");
  if (userInput) userInput.addEventListener("keydown", (e)=>{ if(e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } });

  appendMessage("bot","Hello. I am REX AI. Ask me anything.");
}

async function onSend(){
  // Block sending if API key missing; guide user to paste key
  if(!state.apiKey){
    // If there's a value in the visible input but not saved to state, prefer that (helps copy/paste flows)
    const maybeKeyEl = $("apiKey");
    const maybeKey = maybeKeyEl && maybeKeyEl.value && maybeKeyEl.value.trim();
    if(maybeKey){
      state.apiKey = maybeKey;
      saveConfig();
      renderStatus();
    } else {
      promptForApiKey();
      return;
    }
  }

  const qEl = $("userInput");
  const q = qEl ? qEl.value.trim() : "";
  if(!q) return;
  appendMessage("user", q);
  if (qEl) qEl.value = "";
  const hit = searchBrain(q);
  if(hit){ appendMessage("bot", "[FROM MEMORY] " + (hit.response||"")); renderStatus(); return; }
  showLoading();
  const resp = await askOpenRouter(q);
  hideLoading();
  if(resp.success){ appendMessage("bot", resp.response); storeInBrain(q, resp); }
  else{ appendMessage("error", resp.error || "Unknown error"); const prev = $("statusBar").textContent; $("statusBar").textContent = "Error contacting API"; setTimeout(()=>{ renderStatus(); }, 2500); }
}

document.addEventListener("DOMContentLoaded", init);
