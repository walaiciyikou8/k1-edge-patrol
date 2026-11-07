import base64

with open(r'C:\Users\22072\WorkBuddy\2026-08-27-15-09-20\mascot.base64', 'r', encoding='utf-8') as f:
    mascot_b64 = f.read()

mascot_url = 'data:image/jpeg;base64,' + mascot_b64

html = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>小管家工作台</title>
<!-- 本工作台为本地单文件 HTML + localStorage 存储方案（资料库 skill 加载失败时使用） -->
<style>
:root {
  --pink: #FFB6C1;
  --pink-dark: #FF9AAE;
  --blue: #B6E2FF;
  --blue-dark: #8FD1F8;
  --bg: linear-gradient(135deg, #FFF0F5 0%, #F0F8FF 100%);
  --card: rgba(255,255,255,0.92);
  --text: #334155;
  --text-light: #64748B;
  --border: rgba(0,0,0,0.06);
  --shadow: 0 4px 20px rgba(0,0,0,0.06);
  --radius: 18px;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; padding: 0; min-height: 100%; overflow-x: hidden; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg); color: var(--text); line-height: 1.5;
  padding-bottom: calc(70px + env(safe-area-inset-bottom));
}
button { font-family: inherit; cursor: pointer; border: none; }
input, select { font-family: inherit; font-size: 16px; }
.page { display: none; max-width: 760px; margin: 0 auto; padding: 16px; }
.page.active { display: block; }
.header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 16px; flex-wrap: wrap; gap: 10px;
}
.header h1 { font-size: 22px; margin: 0; color: #475569; }
.backup-btns { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-start; max-width: 100%; flex: 1; min-width: 0; }
.backup-btns button {
  background: #fff; border: 1px solid var(--border); border-radius: 16px;
  padding: 5px 10px; font-size: 12px; color: var(--text-light); box-shadow: var(--shadow);
}
.card {
  background: var(--card); border-radius: var(--radius); padding: 16px;
  box-shadow: var(--shadow); margin-bottom: 16px; border: 1px solid var(--border);
}
.card-title { font-size: 17px; font-weight: 700; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
.mascot-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.mascot-bar img {
  width: 64px; height: 64px; object-fit: cover; object-position: center;
  border-radius: 50%; border: 3px solid #fff; box-shadow: var(--shadow);
  background: #fff;
}
.mascot-bar .bubble {
  flex: 1; background: #fff; border-radius: 16px; border-bottom-left-radius: 4px;
  padding: 12px 14px; box-shadow: var(--shadow); font-size: 14px; color: var(--text);
}
.section-title { font-size: 15px; font-weight: 700; margin: 0 0 10px; color: #475569; }

/* Today section */
.today-section { background: linear-gradient(135deg, #FFF5F7 0%, #F0F9FF 100%); border: 1px solid rgba(255,182,193,0.3); }
.today-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed var(--border); }
.today-item:last-child { border-bottom: none; }
.today-item.overdue .today-text { color: #EF4444; font-weight: 700; }
.today-text { font-size: 14px; }
.today-action {
  background: var(--pink); color: #fff; border-radius: 14px; padding: 5px 12px;
  font-size: 12px; font-weight: 600; white-space: nowrap;
}
.today-empty { color: var(--text-light); font-size: 14px; text-align: center; padding: 16px; }

/* Home cards */
.home-grid { display: grid; grid-template-columns: repeat(2, calc(50% - 7px)); gap: 14px; width: 100%; }
.big-card {
  background: var(--card); border-radius: var(--radius); padding: 18px;
  box-shadow: var(--shadow); text-align: center; cursor: pointer; transition: transform .15s;
  border: 1px solid var(--border); min-width: 0; overflow-wrap: break-word;
}
.big-card:active { transform: scale(0.98); }
.big-card .icon { width: 44px; height: 44px; margin: 0 auto 10px; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
.big-card.finance .icon { background: linear-gradient(135deg, #FFE4E8, #FFF0F5); }
.big-card.life .icon { background: linear-gradient(135deg, #E0F2FE, #F0F9FF); }
.big-card h3 { margin: 0 0 4px; font-size: 15px; }
.big-card p { margin: 0; font-size: 11px; color: var(--text-light); }

/* Tabs */
.bottom-tabs {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: rgba(255,255,255,0.95); backdrop-filter: blur(10px);
  border-top: 1px solid var(--border); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-bottom: env(safe-area-inset-bottom); z-index: 100; box-sizing: border-box;
}
.tab-btn { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 10px 0; background: none; color: var(--text-light); font-size: 12px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.tab-btn svg { width: 22px; height: 22px; flex-shrink: 0; }
.tab-btn svg { width: 22px; height: 22px; flex-shrink: 0; }
.tab-btn svg { width: 24px; height: 24px; }
.tab-btn.active { color: var(--pink-dark); }
.tab-btn.active svg { fill: var(--pink-dark); }

/* Form controls */
.form-row { display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.form-row > * { flex: 1 1 0; min-width: 0; max-width: 100%; }
.form-row > button { flex: 0 0 auto; }
.form-row input, .form-row select {
  padding: 10px 12px; border: 1px solid var(--border);
  border-radius: 12px; background: #fff; outline: none;
}
.form-row input[type="date"] { min-width: 0; }
.btn-primary {
  background: linear-gradient(135deg, var(--pink), var(--pink-dark));
  color: #fff; padding: 10px 18px; border-radius: 12px; font-weight: 600; font-size: 14px;
}
.btn-blue {
  background: linear-gradient(135deg, var(--blue), var(--blue-dark));
  color: #1E3A5F; padding: 10px 18px; border-radius: 12px; font-weight: 600; font-size: 14px;
}
.btn-small { padding: 6px 10px; font-size: 12px; border-radius: 8px; }

/* Chat记账 */
.chat-box { background: #F8FAFC; border-radius: 16px; padding: 12px; margin-bottom: 12px; max-height: 240px; overflow-y: auto; }
.chat-msg { display: flex; margin-bottom: 10px; }
.chat-msg.me { justify-content: flex-end; }
.chat-msg.me .chat-bubble { background: var(--pink); color: #fff; border-bottom-right-radius: 4px; }
.chat-bubble { background: #fff; padding: 8px 12px; border-radius: 14px; border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); font-size: 13px; max-width: 80%; }
.chat-input-row { display: flex; gap: 8px; }
.chat-input-row input { flex: 1; padding: 12px; border-radius: 20px; border: 1px solid var(--border); }

/* Lists */
.list-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
.list-item:last-child { border-bottom: none; }
.list-main { font-size: 14px; }
.list-sub { font-size: 12px; color: var(--text-light); }
.amount-expense { color: #EF4444; font-weight: 700; }
.amount-income { color: #22C55E; font-weight: 700; }
.tag {
  display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: #F1F5F9; color: var(--text-light); margin-left: 6px;
}

/* Charts */
.pie-chart { width: 160px; height: 160px; margin: 0 auto; }
.line-chart { width: 100%; height: 160px; }

/* Invoice */
.invoice-card {
  background: linear-gradient(135deg, #FFF5F7, #F0F9FF);
  border: 2px dashed var(--pink); border-radius: var(--radius);
  padding: 20px; text-align: center; position: relative; overflow: hidden;
}
.invoice-card h4 { margin: 0 0 8px; font-size: 18px; color: var(--pink-dark); }
.invoice-card .amount { font-size: 28px; font-weight: 800; color: var(--text); }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: none; align-items: center; justify-content: center; z-index: 200;
  padding: 16px;
}
.modal-overlay.active { display: flex; }
.modal {
  background: #fff; border-radius: var(--radius); padding: 20px;
  max-width: 420px; width: 100%; max-height: 80vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.modal h3 { margin: 0 0 14px; }
.modal-btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }

/* Calendar */
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; }
.cal-cell { padding: 8px 0; border-radius: 10px; font-size: 12px; background: #fff; }
.cal-cell.header { background: transparent; color: var(--text-light); font-weight: 600; }
.cal-cell.period { background: var(--pink); color: #fff; }
.cal-cell.ovulation { background: #CFFAFE; color: #0E7490; }
.cal-cell.predict { background: #FCE7F3; color: #BE185D; border: 1px dashed var(--pink-dark); }

/* Utility */
.text-center { text-align: center; }
.text-sm { font-size: 12px; }
.text-gray { color: var(--text-light); }
.mt-2 { margin-top: 8px; }
.mb-2 { margin-bottom: 8px; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }

@media (min-width: 768px) {
  .home-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mascot-bar img { width: 80px; height: 80px; }
}
@media (max-width: 480px) {
  .header { flex-direction: column !important; align-items: stretch; }
  .header h1 { margin-bottom: 8px; }
  .backup-btns { justify-content: flex-start; }
  .big-card { padding: 14px; }
}
</style>
</head>
<body>

<div id="page-home" class="page active">
  <div class="header">
    <h1>小管家工作台</h1>
    <div class="backup-btns">
      <button onclick="exportData()">导出备份</button>
      <button onclick="document.getElementById('importFile').click()">导入恢复</button>
      <input type="file" id="importFile" accept=".json" style="display:none" onchange="importData(this)">
      <button onclick="clearAll()">清空</button>
    </div>
  </div>
  <div class="mascot-bar">
    <img src="''' + mascot_url + '''" alt="小管家">
    <div class="bubble" id="greeting">你好呀～今天我是你的专属小管家，财务和生活都交给我吧！</div>
  </div>
  <div class="card today-section">
    <div class="card-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg>今天要处理</div>
    <div id="todayList"><div class="today-empty">加载中…</div></div>
  </div>
  <div class="home-grid">
    <div class="big-card finance" onclick="switchTab('finance')">
      <div class="icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF9AAE" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      <h3>财务管家</h3>
      <p>记账 · 基金 · 发票</p>
    </div>
    <div class="big-card life" onclick="switchTab('life')">
      <div class="icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8FD1F8" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>
      <h3>生活管家</h3>
      <p>减肥 · 姨妈 · 节日</p>
    </div>
  </div>
</div>

<div id="page-finance" class="page">
  <div class="header"><h1>财务管家</h1><button class="btn-small btn-blue" onclick="switchTab('home')">回首页</button></div>
  <div class="mascot-bar"><img src="''' + mascot_url + '''"><div class="bubble" id="financeTip">省钱就是赚钱，今天也要记账哦～</div></div>

  <div class="card">
    <div class="card-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF9AAE" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>聊天记账</div>
    <div class="chat-box" id="chatBox"></div>
    <div class="chat-input-row">
      <input type="text" id="chatInput" placeholder="例如：午餐30、打车15" onkeydown="if(event.key==='Enter')sendChat()">
      <button class="btn-primary" onclick="sendChat()">发送</button>
    </div>
    <div class="form-row mt-2">
      <select id="billType"><option value="expense">支出</option><option value="income">收入</option></select>
      <select id="billCategory">
        <option value="餐饮">餐饮</option><option value="交通">交通</option><option value="购物">购物</option>
        <option value="娱乐">娱乐</option><option value="居住">居住</option><option value="医疗">医疗</option><option value="其他">其他</option>
      </select>
      <input type="number" id="billAmount" placeholder="金额">
      <button class="btn-blue" onclick="addBillManual()">记账</button>
    </div>
    <div id="billList"></div>
  </div>

  <div class="card">
    <div class="card-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF9AAE" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>本月支出饼图</div>
    <div id="expensePie"></div>
  </div>

  <div class="card">
    <div class="card-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF9AAE" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>我的月度发票</div>
    <div id="invoiceBox" class="invoice-card">
      <h4>🧾 本月生活发票</h4>
      <div class="amount" id="invoiceAmount">¥0.00</div>
      <p class="text-gray text-sm" id="invoicePeriod">--</p>
    </div>
    <button class="btn-primary btn-small mt-2" onclick="generateInvoice()">生成/刷新发票</button>
  </div>

  <div class="card">
    <div class="card-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF9AAE" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-2-2-4 4"/></svg>我的基金</div>
    <div class="form-row">
      <input type="text" id="fundName" placeholder="基金名称">
      <input type="text" id="fundCode" placeholder="代码">
      <input type="number" id="fundShare" placeholder="持有份额">
      <input type="number" id="fundNav" placeholder="最新净值">
    </div>
    <div class="form-row">
      <input type="number" id="fundCost" placeholder="成本价">
      <button class="btn-primary" onclick="addFund()">添加基金</button>
    </div>
    <div id="fundList"></div>
    <div class="card" style="background:#F0FDF4; border-color:#86EFAC;">
      <div class="section-title">💡 投资建议</div>
      <div id="fundAdvice" class="text-sm">添加基金后我会给出建议哦～</div>
    </div>
    <div class="card" style="background:#EFF6FF; border-color:#BFDBFE;">
      <div class="section-title">📰 基金相关快讯</div>
      <div id="fundNews" class="text-sm"></div>
    </div>
  </div>
</div>

<div id="page-life" class="page">
  <div class="header"><h1>生活管家</h1><button class="btn-small btn-blue" onclick="switchTab('home')">回首页</button></div>
  <div class="mascot-bar"><img src="''' + mascot_url + '''"><div class="bubble" id="lifeTip">健康生活，从记录开始～</div></div>

  <div class="card">
    <div class="card-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8FD1F8" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>减肥记录</div>
    <div class="form-row">
      <input type="date" id="weightDate">
      <input type="number" id="weightValue" placeholder="体重 kg" step="0.1">
      <button class="btn-blue" onclick="addWeight()">记录</button>
    </div>
    <div id="weightChart"></div>
    <div id="weightList"></div>
  </div>

  <div class="card">
    <div class="card-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF9AAE" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/></svg>姨妈期记录</div>
    <div class="form-row">
      <input type="date" id="periodStart" placeholder="开始日期">
      <input type="date" id="periodEnd" placeholder="结束日期">
      <button class="btn-primary" onclick="addPeriod()">记录经期</button>
    </div>
    <div id="periodPrediction"></div>
    <div class="section-title mt-2">本月预测</div>
    <div class="cal-grid" id="periodCal"></div>
  </div>

  <div class="card">
    <div class="card-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>重要节日提醒</div>
    <div class="form-row">
      <input type="text" id="holidayName" placeholder="节日/事件名称">
      <input type="date" id="holidayDate">
      <button class="btn-primary" onclick="addHoliday()">添加</button>
    </div>
    <div id="holidayList"></div>
  </div>
</div>

<div class="bottom-tabs">
  <button class="tab-btn active" id="tab-home" onclick="switchTab('home')">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
    首页
  </button>
  <button class="tab-btn" id="tab-finance" onclick="switchTab('finance')">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
    财务
  </button>
  <button class="tab-btn" id="tab-life" onclick="switchTab('life')">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
    生活
  </button>
</div>

<div class="modal-overlay" id="modal">
  <div class="modal">
    <h3 id="modalTitle">提示</h3>
    <div id="modalBody"></div>
    <div class="modal-btns">
      <button class="btn-small" style="background:#F1F5F9;color:#475569" onclick="closeModal()">取消</button>
      <button class="btn-primary btn-small" id="modalConfirm" onclick="closeModal()">确定</button>
    </div>
  </div>
</div>

<script>
const PREFIX = 'wb_butler_';
const today = () => { const d = new Date(); return d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0'); };
const fmtDate = d => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
const addDays = (str, n) => { const d = new Date(str); d.setDate(d.getDate()+n); return fmtDate(d); };
const diffDays = (a, b) => Math.round((new Date(b)-new Date(a))/(1000*60*60*24));

let state = {
  bills: [], funds: [], weights: [], periods: [], holidays: []
};

function loadAll() {
  state.bills = JSON.parse(localStorage.getItem(PREFIX+'bills')||'[]');
  state.funds = JSON.parse(localStorage.getItem(PREFIX+'funds')||'[]');
  state.weights = JSON.parse(localStorage.getItem(PREFIX+'weights')||'[]');
  state.periods = JSON.parse(localStorage.getItem(PREFIX+'periods')||'[]');
  state.holidays = JSON.parse(localStorage.getItem(PREFIX+'holidays')||'[]');
  ensureSamples();
}

function saveAll() {
  localStorage.setItem(PREFIX+'bills', JSON.stringify(state.bills));
  localStorage.setItem(PREFIX+'funds', JSON.stringify(state.funds));
  localStorage.setItem(PREFIX+'weights', JSON.stringify(state.weights));
  localStorage.setItem(PREFIX+'periods', JSON.stringify(state.periods));
  localStorage.setItem(PREFIX+'holidays', JSON.stringify(state.holidays));
  refreshAll();
}

function ensureSamples() {
  // 仅首次打开时填充示例数据；用户清空后不再重复填充
  if (localStorage.getItem(PREFIX+'inited') === '1') return;
  let changed = false;
  const t = today();
  if (!state.bills.length) {
    state.bills = [
      {id:1, date:addDays(t,-30), type:'expense', category:'居住', amount:1200, note:'房租（已逾期）'},
      {id:2, date:t, type:'expense', category:'餐饮', amount:28, note:'早餐'},
      {id:3, date:t, type:'expense', category:'交通', amount:15, note:'地铁'},
      {id:4, date:t, type:'income', category:'工资', amount:5000, note:'工资'}
    ]; changed = true;
  }
  if (!state.funds.length) {
    state.funds = [
      {id:1, name:'沪深300指数', code:'000300', share:1000, nav:4.2, cost:4.0}
    ]; changed = true;
  }
  if (!state.weights.length) {
    state.weights = [
      {id:1, date:addDays(t,-7), value:55.5},
      {id:2, date:addDays(t,-3), value:55.2},
      {id:3, date:t, value:54.8}
    ]; changed = true;
  }
  if (!state.periods.length) {
    state.periods = [
      {id:1, start:addDays(t,-24), end:addDays(t,-20)}
    ]; changed = true;
  }
  if (!state.holidays.length) {
    state.holidays = [
      {id:1, name:'妈妈生日', date:addDays(t,2)},
      {id:2, name:'纪念日', date:addDays(t,35)}
    ]; changed = true;
  }
  if (changed) {
    localStorage.setItem(PREFIX+'inited','1');
    saveAll();
  }
}

function refreshAll() {
  renderToday();
  renderBills();
  renderPie();
  renderInvoice();
  renderFunds();
  renderFundAdvice();
  renderFundNews();
  renderWeights();
  renderPeriod();
  renderHolidays();
  setGreeting();
}

function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+tab).classList.add('active');
  document.getElementById('tab-'+tab).classList.add('active');
  refreshAll();
}

function setGreeting() {
  const h = new Date().getHours();
  const greet = h<12 ? '早上好' : h<18 ? '下午好' : '晚上好';
  document.getElementById('greeting').textContent = `${greet}～今天我是你的专属小管家，财务和生活都交给我吧！`;
}

function renderToday() {
  const list = [];
  const t = today();
  state.bills.forEach(b => {
    if (b.type==='expense' && b.date <= t && b.note && b.note.includes('逾期')) {
      list.push({text: `账单逾期：${b.note} ¥${b.amount}`, overdue: true, action: '去记账', goto: 'finance'});
    }
  });
  state.holidays.forEach(h => {
    const d = diffDays(t, h.date);
    if (d >= 0 && d <= 7) {
      list.push({text: `${h.name}还有 ${d} 天`, overdue: d===0, action: d===0?'查看':'去添加', goto: 'life'});
    }
  });
  const pred = predictNextPeriod();
  if (pred.next) {
    const d = diffDays(t, pred.next);
    if (d >= 0 && d <= 5) {
      list.push({text: `预测姨妈将在 ${d} 天后到访`, overdue: d===0, action: '记录', goto: 'life'});
    }
  }
  const totalIncome = state.bills.filter(b => b.type==='income' && b.date.startsWith(t.slice(0,7))).reduce((s,b)=>s+b.amount,0);
  const totalExpense = state.bills.filter(b => b.type==='expense' && b.date.startsWith(t.slice(0,7))).reduce((s,b)=>s+b.amount,0);
  list.push({text: `今日收支：收入 ¥${totalIncome.toFixed(2)} / 支出 ¥${totalExpense.toFixed(2)}`, overdue: false, action: '记账', goto: 'finance'});

  const el = document.getElementById('todayList');
  if (!list.length) { el.innerHTML = '<div class="today-empty">今天没有特别要处理的，休息一下吧～</div>'; return; }
  el.innerHTML = list.map(item => `<div class="today-item ${item.overdue?'overdue':''}">
    <div class="today-text">${item.text}</div>
    <button class="today-action" data-goto="${item.goto}">${item.action}</button>
  </div>`).join('');
}

// Bills
function addBillManual() {
  const type = document.getElementById('billType').value;
  const category = document.getElementById('billCategory').value;
  const amount = parseFloat(document.getElementById('billAmount').value);
  if (!amount || amount <= 0) return alert('请输入金额');
  state.bills.unshift({id:Date.now(), date:today(), type, category, amount, note:''});
  saveAll();
  document.getElementById('billAmount').value = '';
}

function parseChat(text) {
  const map = { '餐':'餐饮', '饭':'餐饮', '吃':'餐饮', '午':'餐饮', '早':'餐饮', '晚':'餐饮',
    '车':'交通', '地铁':'交通', '公交':'交通', '打':'交通', '油':'交通',
    '买':'购物', '衣':'购物', '包':'购物', '鞋':'购物', '化':'购物',
    '玩':'娱乐', '电':'娱乐', '影':'娱乐', '歌':'娱乐',
    '房':'居住', '租':'居住', '水':'居住', '电':'居住', '气':'居住',
    '药':'医疗', '医':'医疗', '病':'医疗' };
  const m = text.match(/(\\d+(?:\\.\\d+)?)/);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  let category = '其他';
  for (const k in map) if (text.includes(k)) { category = map[k]; break; }
  return { amount, category, note: text };
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  const box = document.getElementById('chatBox');
  appendChat('me', text);
  input.value = '';
  const p = parseChat(text);
  if (!p) { setTimeout(()=>appendChat('bot','没听清金额呢，可以再说一次吗？'), 300); return; }
  state.bills.unshift({id:Date.now(), date:today(), type:'expense', category:p.category, amount:p.amount, note:p.note});
  saveAll();
  setTimeout(()=>appendChat('bot',`已记一笔${p.category}支出 ¥${p.amount}～`), 300);
}

function appendChat(who, text) {
  const box = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'chat-msg '+who;
  div.innerHTML = `<div class="chat-bubble">${esc(text)}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function renderBills() {
  const el = document.getElementById('billList');
  if (!state.bills.length) { el.innerHTML = '<div class="text-center text-gray text-sm">还没有账单</div>'; return; }
  el.innerHTML = '<div class="section-title">最近账单</div>' + state.bills.slice(0,10).map(b => `<div class="list-item">
    <div><div class="list-main">${esc(b.note||b.category)} <span class="tag">${b.category}</span></div><div class="list-sub">${b.date}</div></div>
    <div class="${b.type==='expense'?'amount-expense':'amount-income'}">${b.type==='expense'?'-':'+'}¥${b.amount.toFixed(2)}</div>
  </div>`).join('');
}

function renderPie() {
  const data = {};
  state.bills.filter(b => b.type==='expense' && b.date.startsWith(today().slice(0,7))).forEach(b => {
    data[b.category] = (data[b.category]||0) + b.amount;
  });
  const total = Object.values(data).reduce((a,b)=>a+b,0);
  const colors = ['#FF9AAE','#8FD1F8','#FCD34D','#A78BFA','#34D399','#FB923C','#94A3B8'];
  let svg = `<svg viewBox="0 0 160 160" class="pie-chart">`;
  if (!total) {
    svg += `<circle cx="80" cy="80" r="60" fill="none" stroke="#E2E8F0" stroke-width="30"/><text x="80" y="85" text-anchor="middle" fill="#94A3B8" font-size="12">暂无支出</text>`;
  } else {
    let start = 0;
    const entries = Object.entries(data);
    entries.forEach(([cat, val], i) => {
      const pct = val/total;
      const end = start + pct*360;
      const path = describeArc(80,80,50,start,end);
      svg += `<path d="${path}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="30" />`;
      start = end;
    });
  }
  svg += `</svg>`;
  const legend = Object.entries(data).map(([cat,val],i) =>
    `<span class="tag" style="background:${colors[i%colors.length]}22;color:${colors[i%colors.length]};margin:2px;">${cat} ¥${val.toFixed(0)}</span>`
  ).join('');
  document.getElementById('expensePie').innerHTML = svg + `<div class="text-center mt-2">${legend}</div>`;
}

function describeArc(x,y,r,start,end) {
  const rad = deg => (deg-90)*Math.PI/180;
  const x1 = x + r*Math.cos(rad(start)), y1 = y + r*Math.sin(rad(start));
  const x2 = x + r*Math.cos(rad(end)), y2 = y + r*Math.sin(rad(end));
  const large = end-start > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function renderInvoice() {
  const month = today().slice(0,7);
  const total = state.bills.filter(b => b.type==='expense' && b.date.startsWith(month)).reduce((s,b)=>s+b.amount,0);
  document.getElementById('invoiceAmount').textContent = '¥'+total.toFixed(2);
  document.getElementById('invoicePeriod').textContent = month.replace('-','年') + '月发票';
}

function generateInvoice() {
  renderInvoice();
  const box = document.getElementById('invoiceBox');
  box.style.transform = 'scale(0.95)';
  setTimeout(()=>box.style.transform='scale(1)', 150);
}

// Funds
function addFund() {
  const name = document.getElementById('fundName').value.trim();
  const code = document.getElementById('fundCode').value.trim();
  const share = parseFloat(document.getElementById('fundShare').value);
  const nav = parseFloat(document.getElementById('fundNav').value);
  const cost = parseFloat(document.getElementById('fundCost').value);
  if (!name || !share || !nav || !cost) return alert('请填写完整');
  state.funds.unshift({id:Date.now(), name, code, share, nav, cost});
  saveAll();
  ['fundName','fundCode','fundShare','fundNav','fundCost'].forEach(id=>document.getElementById(id).value='');
}

function renderFunds() {
  const el = document.getElementById('fundList');
  if (!state.funds.length) { el.innerHTML = '<div class="text-center text-gray text-sm">还没有基金</div>'; return; }
  el.innerHTML = state.funds.map(f => {
    const profit = (f.nav - f.cost) * f.share;
    const rate = f.cost ? ((f.nav - f.cost)/f.cost*100) : 0;
    return `<div class="list-item">
      <div><div class="list-main">${esc(f.name)} ${f.code?`<span class="tag">${f.code}</span>`:''}</div>
      <div class="list-sub">持有 ${f.share} 份 · 净值 ${f.nav}</div></div>
      <div class="${profit>=0?'amount-income':'amount-expense'}">${profit>=0?'+':''}¥${profit.toFixed(2)}<br><span class="text-sm">${rate>=0?'+':''}${rate.toFixed(2)}%</span></div>
    </div>`;
  }).join('');
}

function renderFundAdvice() {
  if (!state.funds.length) { document.getElementById('fundAdvice').textContent = '添加基金后我会给出建议哦～'; return; }
  const totalProfit = state.funds.reduce((s,f)=>s+(f.nav-f.cost)*f.share,0);
  const up = state.funds.filter(f => f.nav > f.cost).length;
  const down = state.funds.length - up;
  let text = '';
  if (totalProfit > 0) text = `当前整体盈利 ¥${totalProfit.toFixed(2)}，${up}只基金上涨。建议：可考虑分批止盈，落袋为安一部分。`;
  else if (totalProfit < 0) text = `当前整体亏损 ¥${Math.abs(totalProfit).toFixed(2)}，${down}只基金下跌。建议：市场波动很正常，坚持定投或暂停加仓，别恐慌割肉。`;
  else text = '目前持平，建议继续观察，保持定投纪律。';
  document.getElementById('fundAdvice').textContent = text;
}

function renderFundNews() {
  const news = [
    '今日大盘震荡整理，科技板块表现活跃。',
    '央行维持流动性合理充裕，市场情绪偏暖。',
    '消费板块迎来季节性回暖，可关注相关基金。',
    '海外市场波动加剧，建议控制仓位。',
    '新能源赛道政策利好频出，长期价值仍被看好。'
  ];
  const n = news.slice(0,3).map(t => `• ${t}`).join('<br>');
  document.getElementById('fundNews').innerHTML = n;
}

// Weight
function addWeight() {
  const date = document.getElementById('weightDate').value || today();
  const value = parseFloat(document.getElementById('weightValue').value);
  if (!value || value <= 0) return alert('请输入体重');
  state.weights = state.weights.filter(w => w.date !== date);
  state.weights.unshift({id:Date.now(), date, value});
  state.weights.sort((a,b)=>b.date.localeCompare(a.date));
  saveAll();
  document.getElementById('weightValue').value = '';
}

function renderWeights() {
  document.getElementById('weightDate').value = today();
  const list = [...state.weights].sort((a,b)=>a.date.localeCompare(b.date));
  const el = document.getElementById('weightList');
  el.innerHTML = list.length ? '<div class="section-title mt-2">记录明细</div>' + list.slice(-5).map(w =>
    `<div class="list-item"><div class="list-main">${w.date}</div><div class="list-sub">${w.value} kg</div></div>`
  ).reverse().join('') : '';

  const chart = document.getElementById('weightChart');
  if (list.length < 2) { chart.innerHTML = '<div class="text-center text-gray text-sm">多记录几次就能看趋势图啦</div>'; return; }
  const min = Math.min(...list.map(w=>w.value)) - 0.5;
  const max = Math.max(...list.map(w=>w.value)) + 0.5;
  const W = 300, H = 140, pad = 24;
  const x = i => pad + i*(W-2*pad)/(list.length-1);
  const y = v => H - pad - (v-min)/(max-min)*(H-2*pad);
  let path = `M ${x(0)} ${y(list[0].value)}`;
  list.forEach((w,i)=>{ if(i) path += ` L ${x(i)} ${y(w.value)}`; });
  let dots = list.map((w,i)=>`<circle cx="${x(i)}" cy="${y(w.value)}" r="3" fill="#8FD1F8"/>`).join('');
  let labels = list.map((w,i)=>`<text x="${x(i)}" y="${H-4}" text-anchor="middle" font-size="9" fill="#94A3B8">${w.date.slice(5)}</text>`).join('');
  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="line-chart"><path d="${path}" fill="none" stroke="#8FD1F8" stroke-width="2"/>${dots}${labels}</svg>`;
}

// Period
function addPeriod() {
  const start = document.getElementById('periodStart').value;
  const end = document.getElementById('periodEnd').value;
  if (!start || !end) return alert('请选择开始和结束日期');
  if (end < start) return alert('结束日期不能早于开始日期');
  state.periods.unshift({id:Date.now(), start, end});
  state.periods.sort((a,b)=>b.start.localeCompare(a.start));
  saveAll();
  document.getElementById('periodStart').value = '';
  document.getElementById('periodEnd').value = '';
}

function predictNextPeriod() {
  if (!state.periods.length) return { next: null, ovulation: null };
  const sorted = [...state.periods].sort((a,b)=>b.start.localeCompare(a.start));
  const lastStart = sorted[0].start;
  const lastLen = diffDays(sorted[0].start, sorted[0].end) + 1;
  let cycle = 28;
  if (sorted.length >= 2) {
    const diffs = [];
    for (let i=0;i<sorted.length-1;i++) diffs.push(diffDays(sorted[i+1].start, sorted[i].start));
    cycle = Math.round(diffs.reduce((a,b)=>a+b,0)/diffs.length);
  }
  const next = addDays(lastStart, cycle);
  const ovulation = addDays(next, -14);
  return { next, ovulation, cycle, lastLen };
}

function renderPeriod() {
  const pred = predictNextPeriod();
  const el = document.getElementById('periodPrediction');
  if (!pred.next) { el.innerHTML = '<div class="text-gray text-sm">记录经期后即可预测下一次</div>'; }
  else { el.innerHTML = `<div class="flex-between"><span>预测下次姨妈</span><strong>${pred.next}</strong></div>
    <div class="flex-between mt-2"><span>预测排卵期</span><strong>${pred.ovulation}</strong></div>
    <div class="flex-between mt-2"><span>周期约 ${pred.cycle} 天</span></div>`; }

  const cal = document.getElementById('periodCal');
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month+1, 0).getDate();
  const startWeek = first.getDay();
  const headers = ['日','一','二','三','四','五','六'];
  let html = headers.map(h=>`<div class="cal-cell header">${h}</div>`).join('');
  for (let i=0;i<startWeek;i++) html += `<div class="cal-cell"></div>`;
  for (let d=1; d<=days; d++) {
    const ds = `${year}-${(month+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
    let cls = 'cal-cell';
    const inPeriod = state.periods.some(p => ds >= p.start && ds <= p.end);
    const isOvulation = pred.ovulation && ds === pred.ovulation;
    const isPredict = pred.next && ds === pred.next;
    if (inPeriod) cls += ' period';
    else if (isOvulation) cls += ' ovulation';
    else if (isPredict) cls += ' predict';
    html += `<div class="${cls}">${d}</div>`;
  }
  cal.innerHTML = html;
}

// Holidays
function addHoliday() {
  const name = document.getElementById('holidayName').value.trim();
  const date = document.getElementById('holidayDate').value;
  if (!name || !date) return alert('请填写完整');
  state.holidays.unshift({id:Date.now(), name, date});
  state.holidays.sort((a,b)=>a.date.localeCompare(b.date));
  saveAll();
  document.getElementById('holidayName').value = '';
  document.getElementById('holidayDate').value = '';
}

function renderHolidays() {
  const el = document.getElementById('holidayList');
  const t = today();
  const sorted = [...state.holidays].sort((a,b)=>a.date.localeCompare(b.date));
  if (!sorted.length) { el.innerHTML = '<div class="text-center text-gray text-sm">还没有节日提醒</div>'; return; }
  el.innerHTML = sorted.map(h => {
    const d = diffDays(t, h.date);
    return `<div class="list-item">
      <div><div class="list-main">${esc(h.name)}</div><div class="list-sub">${h.date}</div></div>
      <div class="text-sm ${d<0?'text-gray':'amount-income'}">${d<0?'已过去':d===0?'就是今天':`还有 ${d} 天`}</div>
    </div>`;
  }).join('');
}

// Backup
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '小管家工作台备份_'+today()+'.json';
  a.click();
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.bills) state.bills = data.bills;
      if (data.funds) state.funds = data.funds;
      if (data.weights) state.weights = data.weights;
      if (data.periods) state.periods = data.periods;
      if (data.holidays) state.holidays = data.holidays;
      saveAll();
      alert('导入成功！');
    } catch (err) { alert('导入失败，文件格式不对'); }
  };
  reader.readAsText(file);
  input.value = '';
}

function clearAll() {
  const modal = document.getElementById('modal');
  document.getElementById('modalTitle').textContent = '确认清空';
  document.getElementById('modalBody').innerHTML = '<p>确定要清空所有数据吗？清空后无法恢复，请先导出备份。</p>';
  const confirm = document.getElementById('modalConfirm');
  confirm.onclick = () => {
    state = { bills:[], funds:[], weights:[], periods:[], holidays:[] };
    localStorage.removeItem(PREFIX+'bills');
    localStorage.removeItem(PREFIX+'funds');
    localStorage.removeItem(PREFIX+'weights');
    localStorage.removeItem(PREFIX+'periods');
    localStorage.removeItem(PREFIX+'holidays');
    refreshAll();
    closeModal();
  };
  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.addEventListener('DOMContentLoaded', () => {
  loadAll();
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (tab && ['home','finance','life'].includes(tab)) switchTab(tab);
  else refreshAll();
  // 事件委托：今日待处理跳转按钮（避免渲染函数内绑定回调形成调用环）
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]');
    if (g) switchTab(g.getAttribute('data-goto'));
  });
});
</script>
</body>
</html>'''

with open(r'C:\Users\22072\WorkBuddy\2026-08-27-15-09-20\index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('OK')
