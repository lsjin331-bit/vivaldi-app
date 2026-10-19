"use strict";
// 수입·지출 · 구독료 · 재고 (원장·실장 전용)
// 수강료 매출 = 그 달(수강월)에 납부한 학생들의 그 달 원비 · 강사비 = 실지급(설정 탭) 기록
let MV = "money";

async function moneyView() {
  const d = O.data, m = O.month, ms = m + "-01", me = monthEnd(ms);
  const [money, cats, subs, items, moves, actual] = await Promise.all([
    q(db.from("money").select("*").gte("day", ms).lte("day", me).order("day", { ascending: false })),
    q(db.from("money_categories").select("*").order("sort")),
    q(db.from("subscriptions").select("*")),
    q(db.from("stock_items").select("*")),
    q(db.from("stock_moves").select("*").order("day", { ascending: false }).limit(200)),
    q(db.from("payroll_actual").select("*").eq("month", ms))
  ]);
  const kindOf = item => (cats.find(c => c.name === item) || {}).kind || (/(수입|교재비|대여|특강|연주회)/.test(item || "") ? "수입" : "지출");
  const tuition = d.students.filter(s => enrolled(s, m)).reduce((a, s) => { const p = payOf(s.id, m), f = feeOf(s.id, m); return a + (p ? (p.amount ?? f ?? 0) : 0); }, 0);
  const otherIn = money.filter(x => kindOf(x.item) === "수입").reduce((a, x) => a + x.amount, 0);
  const out = money.filter(x => kindOf(x.item) === "지출").reduce((a, x) => a + x.amount, 0);
  const teacher = actual.reduce((a, x) => a + x.amount, 0);
  const tabs = `<div class="chips">${[["money", "수입·지출"], ["subs", "구독료"], ["stock", "재고"]].map(([k, t]) => `<button class="${MV === k ? "on" : ""}" data-mv="${k}">${t}</button>`).join("")}</div><p></p>`;
  let body = "";
  if (MV === "money") {
    const byCat = {}; money.forEach(x => { const k = x.item || "기타"; byCat[k] = (byCat[k] || 0) + x.amount; });
    body = `<div class="kpis">${kpi("수강료 매출", won(tuition) + "원", "수강월 기준 납부분")}${kpi("기타 수입", won(otherIn) + "원", "")}
        ${kpi("지출", won(out + teacher) + "원", "강사비 " + (teacher ? won(teacher) : "미확정") + " 포함")}${kpi("순수익", won(tuition + otherIn - out - teacher) + "원", teacher ? "" : "강사비 확정 전", tuition + otherIn - out - teacher < 0 ? "red" : "")}</div>
      <div class="card"><h2>새 기록</h2>
        <div class="row2"><input id="m1" type="date" value="${ymd(new Date())}" style="max-width:150px"><select id="m2">${cats.map(c => `<option>${esc(c.name)}</option>`).join("")}</select></div>
        <div class="row2"><input id="m3" placeholder="내용"><input id="m4" placeholder="금액" inputmode="numeric" style="max-width:120px"></div>
        <input id="m5" placeholder="홍보 채널(홍보비일 때)">
        <p style="margin-top:8px"><button class="btn pri" id="msave">저장</button></p></div>
      <h2 class="sec2">항목별</h2><div class="card">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="top"><span>${esc(k)} <span class="m">${kindOf(k)}</span></span><b>${won(v)}원</b></div>`).join("") || '<div class="m">이 달 기록 없음</div>'}</div>
      <h2 class="sec2">기록 ${money.length}건</h2>${money.map(x => `<div class="card"><div class="top"><span>${x.day.slice(5).replace("-", "/")} · <b>${esc(x.item || "")}</b> <span class="m">${esc(x.content || "")}${x.channel ? " · " + esc(x.channel) : ""}</span></span><b style="color:${kindOf(x.item) === "수입" ? "var(--ok)" : "var(--ink)"}">${kindOf(x.item) === "수입" ? "+" : "−"}${won(x.amount)}</b></div></div>`).join("")}`;
  } else if (MV === "subs") {
    const total = subs.reduce((a, x) => a + (x.amount || 0), 0);
    body = `<div class="kpis">${kpi("매달 구독료", won(total) + "원", subs.filter(x => !x.amount).length ? "금액 미입력 " + subs.filter(x => !x.amount).length + "개" : "")}</div>
      ${subs.map(x => `<div class="card"><div class="top"><b>${esc(x.name)}</b><b>${x.amount ? won(x.amount) + "원" : '<span class="tag red">금액 미입력</span>'}</b></div><div class="m">${esc(x.memo || "")}</div></div>`).join("")}`;
  } else {
    const stock = items.map(it => {
      const mv = moves.filter(x => x.item === it.name);
      const qty = mv.reduce((a, x) => a + (/주문|입고|매입/.test(x.kind || "") ? 1 : /지급|판매|사용/.test(x.kind || "") ? -1 : 0) * (x.qty || 0), 0);
      const unpaid = mv.filter(x => /미수|미결제/.test(x.student_paid || "")).length;
      return { it, qty, unpaid };
    });
    body = `<div class="card"><h2>새 기록</h2>
        <div class="row2"><input id="s1" type="date" value="${ymd(new Date())}" style="max-width:150px"><select id="s2">${items.map(i => `<option>${esc(i.name)}</option>`).join("")}</select></div>
        <div class="row2"><select id="s3"><option>지급</option><option>주문</option><option>사용</option></select><input id="s4" placeholder="수량" inputmode="numeric" style="max-width:90px"><input id="s5" placeholder="학생(지급일 때)"></div>
        <div class="row2"><input id="s6" placeholder="판매 금액" inputmode="numeric"><select id="s7"><option value="">학생 결제</option><option>결제 완료</option><option>미수</option></select></div>
        <p style="margin-top:8px"><button class="btn pri" id="ssave">저장</button></p></div>
      ${stock.map(x => `<div class="card"><div class="top"><span><b>${esc(x.it.name)}</b> <span class="m">${esc(x.it.kind || "")} · 판매가 ${x.it.price ? won(x.it.price) + "원" : "—"}</span></span><b>재고 ${x.qty}</b></div>${x.unpaid ? `<div class="m" style="color:var(--red)">미수 ${x.unpaid}건</div>` : ""}<div class="m">${esc(x.it.memo || "")}</div></div>`).join("")}
      <h2 class="sec2">최근 기록</h2>${moves.slice(0, 20).map(x => `<div class="card m">${x.day.slice(5).replace("-", "/")} · ${esc(x.item)} · ${esc(x.kind || "")} ${x.qty || ""} ${esc(x.student_name || "")} ${x.sale_amount ? won(x.sale_amount) + "원" : ""} ${esc(x.student_paid || "")}</div>`).join("") || '<div class="card m">아직 없어요</div>'}`;
  }
  $("#main").innerHTML = monthBar("돈 · 재고") + tabs + body +
    '<p class="m" style="margin-top:12px">전환 기간: 시트에서 온 기록은 시트가 원본이에요. 여기서 새로 적은 기록은 새 앱에만 저장돼요.</p>';
  bindMonth();
  document.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => { MV = b.dataset.mv; moneyView(); });
  const save = async (table, row, btn) => {
    btn.disabled = true;
    const { error } = await db.from(table).insert({ ...row, source_kind: "app" });
    btn.disabled = false;
    if (error) return toast("저장 실패: " + error.message);
    toast("저장했어요"); moneyView();
  };
  if ($("#msave")) $("#msave").onclick = e => {
    const amt = Number(($("#m4").value || "").replace(/[^0-9]/g, ""));
    if (!amt) return toast("금액을 적어 주세요");
    save("money", { day: $("#m1").value, item: $("#m2").value, content: $("#m3").value.trim() || null, channel: $("#m5").value.trim() || null, amount: amt }, e.target);
  };
  if ($("#ssave")) $("#ssave").onclick = e => {
    const qty = Number($("#s4").value || 0);
    if (!qty) return toast("수량을 적어 주세요");
    save("stock_moves", { day: $("#s1").value, item: $("#s2").value, kind: $("#s3").value, qty, student_name: $("#s5").value.trim() || null,
      sale_amount: Number(($("#s6").value || "").replace(/[^0-9]/g, "")) || null, student_paid: $("#s7").value || null }, e.target);
  };
}
