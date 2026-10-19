"use strict";
// 운영 현황 (원장·실장 전용) — 기존 운영실 앱 '운영 현황'과 같은 내용: 한 줄 진단 → 그래프 3개(제목이 곧 결론) → 유입경로 표
// 집계 시작월 2026-09 (설정 탭). 수강료 = 그 달 납부분, 강사비 = 실지급 기록, 기타 수입·지출 = 수입지출
const OV_START = "2026-09";

function svgBars(labels, series, opt = {}) {
  const W = 560, H = opt.h || 190, P = 28, B = 24, n = labels.length;
  let max = 1; series.forEach(s => s.values.forEach(v => { if (v > max) max = v; }));
  const gw = (W - P * 2) / Math.max(n, 1), bw = Math.min(30, (gw - 12) / series.length), fmt = opt.fmt || String;
  let g = "";
  labels.forEach((l, i) => {
    const x0 = P + gw * i + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = s.values[i]; if (v == null) return;
      const h = (H - B - 18) * v / max, x = x0 + bw * j, y = H - B - h;
      g += `<rect x="${x}" y="${y}" width="${bw - 4}" height="${h}" rx="4" fill="${s.color}"><title>${s.name} ${fmt(v)}</title></rect>
        <text x="${x + bw / 2 - 2}" y="${y - 4}" font-size="10" text-anchor="middle" fill="#8791a2">${fmt(v)}</text>`;
    });
    g += `<text x="${P + gw * i + gw / 2}" y="${H - 6}" font-size="12" text-anchor="middle" fill="#8791a2">${esc(l)}</text>`;
  });
  return `<div class="m" style="display:flex;gap:12px">${series.map(s => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${s.color};margin-right:4px"></i>${s.name}</span>`).join("")}</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img"><line x1="${P}" x2="${W - P}" y1="${H - B}" y2="${H - B}" stroke="#e9edf3"/>${g}</svg>`;
}
const man = n => n >= 10000 ? Math.round(n / 10000).toLocaleString() + "만" : String(Math.round(n));

async function overviewView() {
  const d = O.data, now = thisMonth();
  const [money, cats, actual] = await Promise.all([
    q(db.from("money").select("day,item,amount").gte("day", OV_START + "-01")),
    q(db.from("money_categories").select("*")),
    q(db.from("payroll_actual").select("month,amount").gte("month", OV_START + "-01"))
  ]);
  const kindOf = item => (cats.find(c => c.name === item) || {}).kind || (/(수입|교재비|대여|특강|연주회)/.test(item || "") ? "수입" : "지출");
  const months = []; for (let m = OV_START; m <= now; m = addDays(m + "-28", 7).slice(0, 7)) months.push(m);
  const rows = months.map(m => {
    const act = d.students.filter(s => enrolled(s, m));
    const tuition = act.reduce((a, s) => { const p = payOf(s.id, m); return a + (p ? (p.amount ?? dueOf(s.id, m)) : 0); }, 0);
    const mm = money.filter(x => x.day.startsWith(m));
    const inc = mm.filter(x => kindOf(x.item) === "수입").reduce((a, x) => a + x.amount, 0), out = mm.filter(x => kindOf(x.item) === "지출").reduce((a, x) => a + x.amount, 0);
    const teacher = actual.filter(x => x.month.startsWith(m)).reduce((a, x) => a + x.amount, 0);
    return { m, students: act.length, joined: act.filter(s => (s.start_month || "").startsWith(m)).length,
      left: d.students.filter(s => (s.end_month || "").startsWith(m) && s.end_kind === "퇴원").length,
      paused: d.students.filter(s => (s.end_month || "").startsWith(m) && s.end_kind === "휴원").length,
      income: tuition + inc, expense: teacher ? out + teacher : null, profit: teacher ? tuition + inc - out - teacher : null, tuition };
  });
  const cm = []; for (let m = "2026-05"; m <= now; m = addDays(m + "-28", 7).slice(0, 7)) {
    const a = d.consults.filter(c => (c.asked_on || "").startsWith(m) && !c.with_name); cm.push({ m, ask: a.length, reg: a.filter(c => c.status === "등록").length });
  }
  const src = {}; d.consults.filter(c => !c.with_name).forEach(c => { const k = c.source || "모름(안 적음)"; src[k] = src[k] || { ask: 0, reg: 0 }; src[k].ask++; if (c.status === "등록") src[k].reg++; });
  const srcs = Object.entries(src).sort((a, b) => b[1].ask - a[1].ask), pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const last = rows[rows.length - 1] || {}, prev = rows[rows.length - 2] || {}, cl = cm[cm.length - 1] || {}, cp = cm[cm.length - 2] || {};
  const lbl = m => +m.slice(5) + "월", fm = n => (Number(n) || 0).toLocaleString("ko-KR");
  const unpaid = d.students.filter(s => enrolled(s, now) && dueOf(s.id, now) > 0 && !payOf(s.id, now));
  const lastProfit = rows.filter(r => r.profit != null).pop();
  const line = (c, t, s, go) => `<div class="clickable" data-go="${go}" style="border-left:4px solid var(--${c});padding:6px 12px;margin:8px 0"><div style="font-size:15px">${t}</div><div class="m">${s}</div></div>`;
  $("#main").innerHTML = `<div class="nav"><h1>운영 현황</h1><span class="m">${+OV_START.slice(0, 4)}년 ${+OV_START.slice(5)}월부터 · 위에서부터 읽으면 돼요</span></div>
    <div class="card"><b>지금 상황 한눈에</b>
      ${line(last.students >= (prev.students || 0) ? "ok" : "red", `재원생 <b>${last.students}명</b>${prev.students ? ` · ${lbl(prev.m)}보다 ${last.students - prev.students >= 0 ? "+" : ""}${last.students - prev.students}명` : ""}`, `신규 ${last.joined} · 퇴원 ${last.left} · 휴원 ${last.paused}`, "students")}
      ${line(unpaid.length ? "gold" : "ok", `${lbl(now)} 수강료 납부 <b>${man(last.tuition)}원</b>${prev.tuition ? ` · ${lbl(prev.m)} 대비 ${Math.round((last.tuition - prev.tuition) / prev.tuition * 100)}%` : ""}`, unpaid.length ? `아직 안 낸 ${unpaid.length}명 · ${fm(unpaid.reduce((a, s) => a + dueOf(s.id, now), 0))}원` : "전원 납부", "tuition")}
      ${line(cl.ask && pct(cl.reg, cl.ask) >= 50 ? "ok" : "gold", `${lbl(now)} 상담 <b>${cl.ask}건 → 등록 ${cl.reg}명</b> (${pct(cl.reg, cl.ask)}%)`, `${cp.m ? lbl(cp.m) : ""} ${cp.ask}건 → ${cp.reg}명`, "consult")}
      ${lastProfit ? line(lastProfit.profit > 0 ? "ok" : "red", `${lbl(lastProfit.m)} 순수익 <b>${man(lastProfit.profit)}원</b>`, `수입 ${man(lastProfit.income)} − 지출 ${man(lastProfit.expense)}${last.profit == null ? ` · ${lbl(now)}은 강사비 정산 뒤 나와요` : ""}`, "money") : ""}
      ${src["모름(안 적음)"] ? line("gold", `유입경로 모르는 상담 <b>${src["모름(안 적음)"].ask}건</b>`, "어디서 왔는지 적어야 어느 홍보에 힘을 줄지 정할 수 있어요", "consult") : ""}</div>
    <div class="ovg">
      <div class="card"><h2>수입 · 지출 · ${last.expense == null ? lbl(now) + " 지출은 강사비 정산 뒤 확정" : "순수익 " + man(last.profit) + "원"}</h2>
        ${svgBars(rows.map(r => lbl(r.m)), [{ name: "수입", color: "#2864e8", values: rows.map(r => r.income) }, { name: "지출", color: "#c9d6ee", values: rows.map(r => r.expense) }], { fmt: man })}
        <table class="tbl"><tr><th>월</th><th>수입</th><th>지출</th><th>순수익</th></tr>${rows.map(r => `<tr><td>${lbl(r.m)}</td><td>${fm(r.income)}</td><td>${r.expense == null ? '<span class="m">정산 전</span>' : fm(r.expense)}</td><td><b>${r.profit == null ? "-" : fm(r.profit)}</b></td></tr>`).join("")}</table></div>
      <div class="card"><h2>원생 흐름 · 재원 ${last.students}명</h2>
        ${svgBars(rows.map(r => lbl(r.m)), [{ name: "재원생", color: "#2864e8", values: rows.map(r => r.students) }], { h: 150 })}
        <table class="tbl"><tr><th>월</th><th>신규</th><th>퇴원</th><th>휴원</th></tr>${rows.map(r => `<tr><td>${lbl(r.m)}</td><td style="color:var(--ok)">+${r.joined}</td><td style="color:var(--red)">−${r.left}</td><td class="m">${r.paused}</td></tr>`).join("")}</table></div>
      <div class="card"><h2>상담 → 등록 · ${lbl(now)} ${pct(cl.reg, cl.ask)}%</h2>
        ${svgBars(cm.map(c => lbl(c.m)), [{ name: "상담", color: "#c9d6ee", values: cm.map(c => c.ask) }, { name: "등록", color: "#2864e8", values: cm.map(c => c.reg) }])}
        <div class="m">${cm.map(c => lbl(c.m) + " " + pct(c.reg, c.ask) + "%").join(" · ")}</div></div>
      <div class="card"><h2>어디서 알고 왔나 · 상담 ${srcs.reduce((a, x) => a + x[1].ask, 0)}건</h2>
        <table class="tbl"><tr><th>경로</th><th>상담</th><th>등록</th><th>전환율</th></tr>${srcs.map(([k, v]) => `<tr${k.startsWith("모름") ? ' style="color:var(--red)"' : ""}><td>${esc(k)}</td><td>${v.ask}</td><td>${v.reg}</td><td>${pct(v.reg, v.ask)}%</td></tr>`).join("")}</table></div>
    </div>`;
  document.querySelectorAll("[data-go]").forEach(c => c.onclick = () => go(c.dataset.go));
}
