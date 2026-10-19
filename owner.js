"use strict";
// 비발디 통합 앱 — 2단계: 원장·실장 화면 (홈 · 학생 · 수납 · 수업[선생님 화면])
// 원장 전용 표(원비·수납·상담·연락처)는 서버 권한(RLS)으로 원장·실장만 읽힌다.
const won = n => (Number(n) || 0).toLocaleString("ko-KR");
const INST_ORDER = ["바이올린", "첼로", "클라리넷", "플룻", "비올라"];
const thisMonth = () => ymd(new Date()).slice(0, 7);
let O = { tab: "home", month: thisMonth(), data: null, filter: "재원", inst: "전체", sel: null };

const TABS = [["home", "홈"], ["attend", "출결표"], ["students", "학생"], ["tuition", "수납"], ["consult", "상담"], ["payroll", "급여"], ["money", "돈·재고"], ["lessons", "수업"]];
function ownerBoot() { ownerNav(); go(O.tab); }
function ownerNav() {
  let nav = $("#onav");
  if (!nav) { nav = document.createElement("nav"); nav.id = "onav"; nav.className = "onav"; $(".bar").after(nav); }
  nav.innerHTML = TABS.map(([k, t]) => `<button data-t="${k}" class="${O.tab === k ? "on" : ""}">${t}</button>`).join("");
  nav.querySelectorAll("button").forEach(b => b.onclick = () => go(b.dataset.t));
  document.body.classList.add("owner");
}
async function go(tab) {
  O.tab = tab; ownerNav(); document.body.classList.toggle("wide", tab === "attend");
  if (tab === "lessons") return load();          // 선생님 화면(선생님 골라 보기)
  $("#main").innerHTML = `<div class="loading">불러오는 중…</div>`;
  try { await loadAll(); await ({ home: homeView, students: studentsView, tuition: tuitionView, attend: attendView, consult: consultView, payroll: payrollView, money: moneyView })[tab](); }
  catch (e) { $("#main").innerHTML = `<div class="warn">불러오지 못했어요: ${esc(e.message)}</div>`; }
}

// ===== 자료 한 번에 읽기 =====
async function loadAll(force) {
  // (출결표는 달마다 따로 읽음: attendView)
  if (O.data && !force && O.data.at > Date.now() - 60000) return O.data;
  const [students, staff, fees, pays, consults, events, slots, contacts, logs, todayCells] = await Promise.all([
    q(db.from("students").select("*").order("id")),
    q(db.from("staff").select("id,name,role,instrument,pay_kind,pay_amount,sort").order("sort")),
    q(db.from("fee_changes").select("*")),
    q(db.from("payments").select("*")),
    q(db.from("consults").select("*").order("asked_on", { ascending: false })),
    q(db.from("attendance_events").select("*").gte("event_date", addDays(ymd(new Date()), -60))),
    q(db.from("regular_slots").select("*")),
    db.from("contacts").select("*").then(r => r.data || []),    // 05 SQL 실행 전이면 빈 목록
    q(db.from("lesson_logs").select("lesson_date,student_id,teacher_id,piece").gte("lesson_date", addDays(ymd(new Date()), -120)).order("lesson_date", { ascending: false })),
    q(db.from("timetable_cells").select("lesson_date,student_id,is_group,start_time").eq("lesson_date", ymd(new Date())))
  ]);
  const T = Object.fromEntries(staff.map(s => [s.id, s]));
  O.data = { students, staff, T, fees, pays, consults, events, slots, contacts, logs, todayCells, at: Date.now() };
  return O.data;
}
// 그 달 원비: 적용월이 그 달 이전인 '원비변경' 중 가장 최근
function feeOf(sid, month) {
  const m = month + "-01";
  const list = O.data.fees.filter(f => f.student_id === sid && f.kind === "원비변경" && f.from_month <= m).sort((a, b) => a.from_month < b.from_month ? 1 : -1);
  return list.length ? list[0].amount : null;
}
// 그 달에 다니는 학생: 재원이고 입학월 ≤ 그 달 < 종료월
function enrolled(s, month) {
  const m = month + "-01";
  if (s.start_month && s.start_month > m) return false;
  if (s.end_month && s.end_month <= m) return false;
  return s.status === "재원" || (s.end_month && s.end_month > m);
}
const payOf = (sid, month) => O.data.pays.find(p => p.student_id === sid && p.month === month + "-01");
const tname = id => (O.data.T[id] || {}).name || "";
const ibar = inst => `style="--c:${COLOR[inst] || "var(--blue)"}"`;

// ===== 홈 =====
function homeView() {
  const d = O.data, m = O.month, today = ymd(new Date());
  const act = d.students.filter(s => enrolled(s, m));
  const due = act.map(s => ({ s, fee: feeOf(s.id, m), pay: payOf(s.id, m) })).filter(x => x.fee > 0);
  const unpaid = due.filter(x => !x.pay);
  const paidSum = due.filter(x => x.pay).reduce((a, x) => a + (x.pay.amount ?? x.fee), 0);
  const cMonth = d.consults.filter(c => (c.asked_on || "").startsWith(m));
  const follow = d.consults.filter(c => c.follow_on && c.follow_on <= today && !/등록|미등록/.test(c.status || ""));
  const linked = new Set(d.events.filter(e => e.kind === "보강" && e.linked_date).map(e => e.student_id + "|" + e.linked_date));
  const noMk = d.events.filter(e => ["결석 · 사전 연락", "결석 · 당일 예외", "결석 · 강사 사정·휴일"].includes(e.kind) && e.form === "개인" && !linked.has(e.student_id + "|" + e.event_date));
  const name = id => (d.students.find(s => s.id === id) || {}).name || id;
  const byInst = INST_ORDER.map(i => [i, act.filter(s => s.instrument === i).length]);
  $("#main").innerHTML = monthBar("홈") + `
    <div class="kpis">
      ${kpi("재원생", act.length + "명", byInst.filter(x => x[1]).map(x => x[0] + " " + x[1]).join(" · "))}
      ${kpi("수강료 납부", won(paidSum) + "원", `${due.length - unpaid.length}/${due.length}명 납부`)}
      ${kpi("미납", unpaid.length + "명", won(unpaid.reduce((a, x) => a + x.fee, 0)) + "원", unpaid.length ? "red" : "")}
      ${kpi("이달 상담", cMonth.length + "건", "등록 " + cMonth.filter(c => /등록/.test(c.status || "") && !/미등록/.test(c.status || "")).length + "건")}
    </div>
    <h2 class="sec2">✅ 확인할 것</h2>
    ${todayLogsCard()}${stagnationCard()}
    ${unpaid.length ? `<div class="card clickable" data-go="tuition"><b>💳 미납 ${unpaid.length}명</b><div class="m">${unpaid.map(x => esc(x.s.name)).join(", ")}</div></div>` : ""}
    ${follow.length ? `<div class="card"><b>📞 상담 후속 연락 ${follow.length}건</b><div class="m">${follow.map(c => esc(c.name) + " (" + c.follow_on.slice(5).replace("-", "/") + ")").join(", ")}</div></div>` : ""}
    ${noMk.length ? `<div class="card"><b>🔁 보강 날짜 없는 결석 ${noMk.length}건</b><div class="m">${noMk.map(e => esc(name(e.student_id)) + " " + label(e.event_date)).join(", ")}</div></div>` : ""}
    ${!unpaid.length && !follow.length && !noMk.length ? `<div class="card m">오늘 확인할 것이 없어요 👍</div>` : ""}
    <p class="m" style="margin-top:14px">자료는 매일 밤 시트에서 복사돼요. 지금은 시트가 원본이라 새 앱에서 바꾼 내용은 시트에 자동으로 들어가지 않아요.</p>`;
  bindMonth(); document.querySelectorAll("[data-go]").forEach(c => c.onclick = () => go(c.dataset.go));
}
const kpi = (t, v, sub, cls = "") => `<div class="kpi ${cls}"><span>${t}</span><b>${v}</b><small>${esc(sub)}</small></div>`;
function monthBar(title) {
  return `<div class="nav"><h1>${title}</h1><input type="month" id="om" value="${O.month}" style="width:auto;margin:0"></div>`;
}
function bindMonth() { const i = $("#om"); if (i) i.onchange = () => { O.month = i.value; go(O.tab); }; }

// ===== 학생 =====
function studentsView() {
  const d = O.data, m = O.month;
  let list = d.students.filter(s => O.filter === "전체" ? true : O.filter === "재원" ? enrolled(s, m) : (s.status !== "재원" || (s.end_month && s.end_month <= m + "-01")));
  if (O.inst !== "전체") list = list.filter(s => s.instrument === O.inst);
  const order = s => [s.teacher_id && tname(s.teacher_id) === "원장" ? 0 : 1, INST_ORDER.indexOf(s.instrument), tname(s.teacher_id), s.name];
  list.sort((a, b) => { const x = order(a), y = order(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; });
  const chips = (key, vals) => vals.map(v => `<button class="${O[key] === v ? "on" : ""}" data-${key}="${v}">${v}</button>`).join("");
  let h = monthBar("학생 " + list.length + "명") +
    `<div class="chips">${chips("filter", ["재원", "휴원·퇴원", "전체"])}</div><div class="chips">${chips("inst", ["전체", ...INST_ORDER])}</div><p></p>`;
  let last = "";
  list.forEach(s => {
    const grp = (tname(s.teacher_id) === "원장" ? "원장 수업" : s.instrument + " · " + tname(s.teacher_id));
    if (grp !== last) { h += `<h2 class="sec2">${esc(grp)}</h2>`; last = grp; }
    const f = feeOf(s.id, m), p = payOf(s.id, m);
    h += `<div class="card inst clickable" ${ibar(s.instrument)} data-s="${s.id}"><div class="top"><span><b>${esc(s.name)}</b> <span class="m">${esc(s.lesson_type || "")}${s.age_group ? " · " + esc(s.age_group) : ""}</span></span>
      <span class="tag ${p ? "ok" : f ? "red" : ""}">${f ? won(f) + "원 " + (p ? "납부" : "미납") : esc(s.status)}</span></div></div>`;
  });
  $("#main").innerHTML = h;
  bindMonth();
  document.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { O.filter = b.dataset.filter; studentsView(); });
  document.querySelectorAll("[data-inst]").forEach(b => b.onclick = () => { O.inst = b.dataset.inst; studentsView(); });
  document.querySelectorAll("[data-s]").forEach(c => c.onclick = () => studentDetail(c.dataset.s));
}
function studentDetail(sid) {
  const d = O.data, s = d.students.find(x => x.id === sid), m = O.month;
  const ct = d.contacts.find(c => c.student_id === sid) || {};
  const slots = d.slots.filter(x => x.student_id === sid).sort((a, b) => a.weekday - b.weekday || (a.start_time < b.start_time ? -1 : 1));
  const fees = d.fees.filter(f => f.student_id === sid).sort((a, b) => a.from_month < b.from_month ? -1 : 1);
  const ev = d.events.filter(e => e.student_id === sid).sort((a, b) => a.event_date < b.event_date ? 1 : -1).slice(0, 8);
  const pays = d.pays.filter(p => p.student_id === sid).sort((a, b) => a.month < b.month ? 1 : -1);
  $("#main").innerHTML = `<p><button class="btn" id="bk">‹ 학생</button></p>
    <div class="card inst" ${ibar(s.instrument)}><div class="top"><h1>${esc(s.name)}</h1><span class="tag">${esc(s.status)}</span></div>
      <div class="m">${esc(s.instrument || "")} · ${esc(tname(s.teacher_id))} · ${esc(s.lesson_type || "")} · ${esc(s.age_group || "")} · 학생번호 ${esc(s.id)}</div>
      ${s.memo ? `<div class="note" style="margin-top:8px">${esc(s.memo)}</div>` : ""}</div>
    <div class="card"><h2>정규 수업</h2>${slots.map(x => `<div>${"월화수목금토일"[x.weekday]} ${hm(x.start_time)} · ${x.minutes}분 · ${esc(x.room || "")} · ${x.kind} · ${esc(tname(x.teacher_id))}</div>`).join("") || '<div class="m">없음</div>'}</div>
    <div class="card"><h2>연락처 <span class="m">(원장·실장만)</span></h2>
      <label>학생 연락처<input id="c1" value="${esc(ct.student_phone)}" inputmode="tel"></label>
      <label>보호자 이름 · 관계<div class="row2"><input id="c2" value="${esc(ct.guardian_name)}" placeholder="이름"><input id="c3" value="${esc(ct.guardian_relation)}" placeholder="관계" style="max-width:110px"></div></label>
      <label>보호자 연락처<input id="c4" value="${esc(ct.guardian_phone)}" inputmode="tel"></label>
      <label>주소<input id="c5" value="${esc(ct.address)}"></label>
      <p style="margin-top:10px"><button class="btn pri" id="csave">연락처 저장</button></p></div>
    <div class="card"><h2>원비</h2>${fees.map(f => `<div>${f.from_month.slice(0, 7)}부터 · ${f.kind} ${won(f.amount)}원 <span class="m">${esc(f.memo || "")}</span></div>`).join("") || '<div class="m">없음</div>'}
      <div class="m" style="margin-top:6px">${m} 원비: ${feeOf(sid, m) != null ? won(feeOf(sid, m)) + "원" : "—"}</div></div>
    <div class="card"><h2>수납</h2>${pays.map(p => `<div>${p.month.slice(0, 7)} · ${esc(p.method || "○")}${p.paid_on ? " · " + p.paid_on.slice(5).replace("-", "/") : ""}${p.amount ? " · " + won(p.amount) + "원" : ""}</div>`).join("") || '<div class="m">기록 없음</div>'}</div>
    <div class="card"><h2>최근 결석·보강</h2>${ev.map(e => `<div>${label(e.event_date)} · ${esc(e.kind)} ${e.minutes || ""}분 <span class="m">${esc(e.memo || "")}</span></div>`).join("") || '<div class="m">없음</div>'}</div>`;
  $("#bk").onclick = () => studentsView();
  $("#csave").onclick = async e => {
    e.target.disabled = true;
    const row = { student_id: sid, student_phone: $("#c1").value.trim() || null, guardian_name: $("#c2").value.trim() || null, guardian_relation: $("#c3").value.trim() || null,
      guardian_phone: $("#c4").value.trim() || null, address: $("#c5").value.trim() || null, updated_at: new Date().toISOString() };
    const { error } = await db.from("contacts").upsert(row);
    e.target.disabled = false;
    if (error) return toast(/contacts/.test(error.message) ? "연락처 표가 아직 없어요(05 SQL 실행 필요)" : "저장 실패: " + error.message);
    const i = d.contacts.findIndex(c => c.student_id === sid); i >= 0 ? d.contacts[i] = row : d.contacts.push(row);
    toast("연락처를 저장했어요");
  };
}

// ===== 수납 =====
function tuitionView() {
  const d = O.data, m = O.month;
  const rows = d.students.filter(s => enrolled(s, m)).map(s => ({ s, fee: feeOf(s.id, m), pay: payOf(s.id, m) })).filter(x => x.fee > 0)
    .sort((a, b) => (a.pay ? 1 : 0) - (b.pay ? 1 : 0) || INST_ORDER.indexOf(a.s.instrument) - INST_ORDER.indexOf(b.s.instrument) || (a.s.name < b.s.name ? -1 : 1));
  const un = rows.filter(r => !r.pay), pd = rows.filter(r => r.pay);
  const card = r => `<div class="card inst" ${ibar(r.s.instrument)}><div class="top"><span><b>${esc(r.s.name)}</b> <span class="m">${esc(r.s.instrument)} · ${esc(tname(r.s.teacher_id))} · ${won(r.fee)}원</span></span>
    ${r.pay ? `<span class="tag ok">${r.pay.paid_on ? r.pay.paid_on.slice(5).replace("-", "/") + " " : ""}${esc(r.pay.method || "○")} 납부</span>` :
      `<span class="row2" style="flex-wrap:nowrap"><input type="date" class="pd" value="${ymd(new Date())}" style="width:auto;margin:0"><button class="btn pri" data-pay="${r.s.id}" data-m="카드">카드</button><button class="btn" data-pay="${r.s.id}" data-m="이체">이체</button></span>`}</div></div>`;
  $("#main").innerHTML = monthBar("수납 · 미납") +
    `<p class="m">${m} 수강료 · 납부 ${pd.length}/${rows.length}명 · 미납 ${won(un.reduce((a, r) => a + r.fee, 0))}원</p>
     <h2 class="sec2">미납 ${un.length}명</h2>${un.map(card).join("") || '<div class="card m">없어요</div>'}
     <h2 class="sec2">납부 ${pd.length}명</h2>${pd.map(card).join("")}`;
  bindMonth();
  document.querySelectorAll("[data-pay]").forEach(b => b.onclick = async () => {
    const r = rows.find(x => x.s.id === b.dataset.pay), day = b.parentNode.querySelector(".pd").value;
    if (!day) return toast("납부 날짜를 골라 주세요");
    if (!confirm(`${r.s.name} ${m} 수강료 ${won(r.fee)}원\n${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 ${b.dataset.m} 납부로 기록할까요?`)) return;
    b.disabled = true;
    const row = { student_id: r.s.id, month: m + "-01", method: b.dataset.m, paid_on: day, source_kind: "app", memo: "새 앱 기록" };
    const { error } = await db.from("payments").insert(row);
    if (error) { b.disabled = false; return toast("저장 실패: " + error.message); }
    d.pays.push(row); toast(r.s.name + " 납부 기록 완료"); tuitionView();
  });
}
