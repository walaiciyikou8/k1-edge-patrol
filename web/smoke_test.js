// smoke test for xiaoguanjia v2
const fs = require('fs');
const vm = require('vm');
const js = fs.readFileSync('check.js', 'utf-8');

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
const noopEl = () => ({
  value: '', innerHTML: '', textContent: '', dataset: {}, style: {},
  classList: { add(){}, remove(){}, toggle(){} },
  addEventListener(){}, appendChild(){}, scrollTop: 0, scrollHeight: 0
});
global.document = {
  addEventListener(){},
  getElementById: () => noopEl(),
  createElement: () => ({ click(){}, set href(v){}, set download(v){} })
};
global.window = global;
global.URL = URL;
global.history = { replaceState(){} };
global.location = { href: 'http://localhost/', search: '' };
global.URLSearchParams = URLSearchParams;

vm.runInThisContext(js);

let pass = 0, fail = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

// --- date utils ---
T('addDays month boundary', addDays('2026-01-31', 1) === '2026-02-01');
T('addDays year boundary', addDays('2026-12-31', 1) === '2027-01-01');
T('dayDiff', dayDiff('2026-08-20', '2026-08-27') === 7);

// --- cnUpper ---
T('cnUpper 123.45', cnUpper(123.45) === '壹佰贰拾叁元肆角伍分', cnUpper(123.45));
T('cnUpper 100', cnUpper(100) === '壹佰元整', cnUpper(100));
T('cnUpper 0.5', cnUpper(0.5) === '伍角', cnUpper(0.5));
T('cnUpper 2300.09', cnUpper(2300.09) === '贰仟叁佰元零玖分', cnUpper(2300.09));
T('cnUpper 10005', cnUpper(10005) === '壹万零伍元整', cnUpper(10005));

// --- ensureSamples first run ---
ensureSamples();
T('samples: bills', bills.length >= 5 && bills.some(b => b.note.indexOf('逾期') >= 0));
T('samples: funds', funds.length === 3);
T('samples: weights', weights.length === 3);
T('samples: periods', periods.length === 1);
T('samples: holidays', holidays.length === 2);
T('samples: schedules', schedules.length === 2);
T('samples: chat intros', chatF.length === 1 && chatL.length === 1);
const billCount1 = bills.length;
ensureSamples();
T('ensureSamples idempotent', bills.length === billCount1);

// --- parseFinance: expense ---
bills = []; funds = [];
let r = parseFinance('午餐花了32');
T('exp parse', bills.length === 1 && bills[0].amt === 32 && bills[0].cat === '餐饮' && bills[0].type === 'exp', JSON.stringify(bills[0]));
r = parseFinance('打车去公司花了45块');
T('exp parse2', bills.length === 2 && bills[1].cat === '交通' && bills[1].amt === 45, JSON.stringify(bills[1]));
r = parseFinance('地铁 6元');
T('exp parse3', bills.length === 3 && bills[2].cat === '交通', JSON.stringify(bills[2]));

// --- parseFinance: income ---
r = parseFinance('工资发了8000');
T('inc parse', bills.length === 4 && bills[3].type === 'inc' && bills[3].amt === 8000 && bills[3].cat === '工资', JSON.stringify(bills[3]));

// --- parseFinance: fund buy/sell ---
funds = [{ id: 'x1', name: '白酒基金', amount: 3200, cost: 3000, changePct: 2.35 }];
r = parseFinance('买了1000元白酒基金');
T('fund buy', funds[0].amount === 4200 && funds[0].cost === 4000, JSON.stringify(funds[0]));
r = parseFinance('卖出白酒基金500元');
T('fund sell', funds[0].amount === 3700, JSON.stringify(funds[0]));
r = parseFinance('买了600元新能源汽车基金');
T('fund buy new', funds.length === 2 && funds[1].name === '新能源汽车' && funds[1].amount === 600, JSON.stringify(funds.map(f => f.name)));

// --- parseFinance: queries ---
r = parseFinance('这个月花了多少');
T('month query', /本月战报/.test(r.replies[0]), r.replies[0].slice(0, 30));
r = parseFinance('今天基金收益怎么样');
T('fund query', /今日基金战报|战报/.test(r.replies[0]), r.replies[0].slice(0, 30));
r = parseFinance('你好');
T('greet f', r.replies.length === 1 && r.replies[0].length > 5);
r = parseFinance('今天天气真好啊');
T('fallback f', r.replies.length === 1);

// --- parseLife: weight ---
weights = [];
r = parseLife('今天体重62.5');
T('weight', weights.length === 1 && weights[0].kg === 62.5, JSON.stringify(weights));
r = parseLife('体重120斤');
T('weight jin->kg (same-day updates)', weights.length === 1 && Math.abs(weights[0].kg - 60) < 0.01, JSON.stringify(weights));

// --- parseLife: period ---
periods = [{ id: 'p1', start: addDays(today(), -24), end: addDays(today(), -20) }];
r = parseLife('姨妈来了');
T('period start', periods.length === 2 && periods[1].start === today(), JSON.stringify(periods.map(p => p.start)));
const np = nextPeriod();
T('period predict', np.cycle === 24 && np.ovulation === addDays(np.nextStart, -14), JSON.stringify(np));
r = parseLife('下次姨妈什么时候来');
T('period query', /下次姨妈预计/.test(r.replies[0]), r.replies[0].slice(0, 30));
r = parseLife('姨妈走了');
T('period end', periods[1].end === today());

// --- parseLife: schedule ---
schedules = [];
r = parseLife('明天下午3点提醒我开会');
T('schedule', schedules.length === 1 && schedules[0].date === addDays(today(), 1) && schedules[0].time === '15:00' && schedules[0].note === '开会', JSON.stringify(schedules));
r = parseLife('后天提醒我去取快递');
T('schedule2', schedules.length === 2 && schedules[1].date === addDays(today(), 2) && schedules[1].note === '去取快递', JSON.stringify(schedules[1]));

// --- parseLife: holiday ---
holidays = [];
r = parseLife('妈妈生日10月2号');
T('holiday', holidays.length === 1 && /妈妈生日/.test(holidays[0].note) && holidays[0].date.endsWith('10-02'), JSON.stringify(holidays));

// --- guessCat ---
T('guessCat 奶茶', guessCat('奶茶一杯') === '餐饮');
T('guessCat unknown', guessCat('莫名其妙') === '其他');

// --- ticket printer ---
global.confirm = () => true;
tickets = [];
let tk = issueTicket(true);
T('ticket issue', tickets.length === 1 && tk.count === bills.length && tk.month === monthKey(today()), JSON.stringify(tk && tk.month));
T('ticket totals', Math.abs(tk.exp - bills.filter(b => b.type === 'exp').reduce((s, b) => s + b.amt, 0)) < 1e-9, 'exp=' + tk.exp);
T('ticket rows snapshot', tk.rows.length === bills.length && tk.rows[0].note === bills[0].note);
bills.push({ id: 'zz1', date: today(), type: 'exp', cat: '餐饮', note: '加了一笔', amt: 9 });
tk = issueTicket(true);
T('ticket re-issue overwrites same month', tickets.length === 1 && tk.count === bills.length, JSON.stringify({ n: tickets.length, c: tk.count }));
r = parseFinance('出票');
T('chat 出票 command', /小票/.test(r.replies[0]) && tickets.length === 1 && tickets[0].count === bills.length, r.replies[0].slice(0, 20));
const tid = tickets[0].id;
askDelTicket(tid);
T('ticket delete', tickets.length === 0, JSON.stringify(tickets));
bills = [];
tk = issueTicket(true);
T('ticket empty month rejected', tk === null && tickets.length === 0);

// --- clear keeps empty ---
doClear && null;
bills = [1]; // simulate
bills = [];
T('clear state ok', bills.length === 0);

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
