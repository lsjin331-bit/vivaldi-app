"use strict";
// 비발디 통합 앱 — 2단계: 원장·실장 화면 (홈 · 학생 · 수납 · 수업[선생님 화면])
// 원장 전용 표(원비·수납·상담·연락처)는 서버 권한(RLS)으로 원장·실장만 읽힌다.
const won = n => (Number(n) || 0).toLocaleString("ko-KR");
const INST_ORDER = ["바이올린", "첼로", "클라리넷", "플룻", "비올라"];
const thisMonth = () => ymd(new Date()).slice(0, 7);
let O = { tab: "home", month: thisMonth(), data: null, filter: "재원", inst: "전체", sel: null };

// 왼쪽 묶음 메뉴 + 하위 탭 (원장 결정 2026-10-20: 기존 운영실 앱 · Polaris · 학원 OS 구성)
// 메뉴: 업무 단위로 묶음 → 화면 (ARCO 구성 · 선 아이콘)
const MENU = [
  { k: "ops", t: "대시보드", sub: [["home", "오늘의 학원", "dashboard"], ["overview", "운영 현황", "money"], ["calendar", "일정 · 업무 일지", "calendar"]] },
  { k: "stu", t: "원생", sub: [["students", "원생 관리", "students"], ["attend", "출결 관리", "attendance"], ["lessons", "수업 · 레슨 일지", "classes"]] },
  { k: "fee", t: "수납 · 소통", sub: [["tuition", "수업료 · 미납", "fees"], ["notify", "알림 · 발송", "workflow"]] },
  { k: "grow", t: "성장", sub: [["consult", "상담 CRM", "crm"], ["marketing", "마케팅", "content"]] },
  { k: "fin", t: "재무 · 인사", sub: [["payroll", "강사 급여 · 원천세", "payroll"], ["money", "수입 · 지출 · 재고", "money"]] }
];
const ICON = {   // ARCO 선 아이콘 (24px 기준)
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  students: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  attendance: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 5 3 3 5-5"/>',
  classes: '<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  fees: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h3"/>',
  crm: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3l2 5-2.1 2.1a16 16 0 0 0 5.9 5.9L16 14Z"/>',
  content: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 7h10M7 11h10M7 15h6"/>',
  payroll: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M19 8v6M16 11h6"/>',
  money: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
  workflow: '<rect x="8" y="2" width="8" height="6" rx="1"/><rect x="2" y="16" width="8" height="6" rx="1"/><rect x="14" y="16" width="8" height="6" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>'
};
const ico = n => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ""}</svg>`;
const secOf = tab => MENU.find(m => m.sub.some(s => s[0] === tab)) || MENU[0];
function ownerBoot() { ownerNav(); go(O.tab); }
function ownerNav() {
  document.body.classList.add("owner");
  let side = $("#side");
  if (!side) {
    side = document.createElement("aside"); side.id = "side"; side.className = "side"; document.body.prepend(side);
    const st = document.createElement("div"); st.id = "subt"; st.className = "subt"; $("#main").before(st);
  }
  const sec = secOf(O.tab);
  side.innerHTML = `<div class="sbrand"><span class="mk">V</span><span>VIVALDI<small>ACADEMY MANAGER</small></span></div>
    <div class="sbig">${MENU.map(m => `<button data-big="${m.k}" class="${m === sec ? "on" : ""}">${m.t}</button>`).join("")}</div>
    <div class="sgroups">${MENU.map(m => `<div class="ssec">${m.t}</div>` + m.sub.map(([k, t, ic]) => `<button data-t="${k}" class="${O.tab === k ? "on" : ""}">${ico(ic)}<span>${t}</span></button>`).join("")).join("")}</div>
    <div class="sfoot"><div class="dot"></div><div>${esc(ME ? ME.name + (ME.role === "owner" ? " · 원장" : " · 실장") : "")}<small>Supabase 서버에 저장</small></div><button id="slog">로그아웃</button></div>`;
  let top = $("#otop");
  if (!top) { top = document.createElement("header"); top.id = "otop"; top.className = "otop"; $("#subt").before(top); }
  const d0 = new Date();
  top.innerHTML = `<div class="ac"><span class="tl"></span>비발디 관현악학원</div><div class="rt">${d0.getMonth() + 1}월 ${d0.getDate()}일 (${"일월화수목금토"[d0.getDay()]})<div class="av">${esc((ME && ME.name || "원").slice(0, 1))}</div></div>`;
  $("#subt").innerHTML = sec.sub.length > 1 ? sec.sub.map(([k, t]) => `<button data-t="${k}" class="${O.tab === k ? "on" : ""}">${t}</button>`).join("") : "";
  document.querySelectorAll("#side [data-t], #subt [data-t]").forEach(b => b.onclick = () => go(b.dataset.t));
  side.querySelectorAll("[data-big]").forEach(b => b.onclick = () => go(MENU.find(m => m.k === b.dataset.big).sub[0][0]));
  $("#slog").onclick = async () => { await db.auth.signOut(); location.reload(); };
}
async function go(tab) {
  O.tab = tab; ownerNav(); document.body.classList.toggle("wide", tab === "attend");
  if (tab === "lessons") return load();          // 선생님 화면(선생님 골라 보기)
  $("#main").innerHTML = `<div class="loading">불러오는 중…</div>`;
  try { await loadAll(); // 화면 함수는 이름으로 찾음(다른 파일이 아직 안 읽혔을 때 '정의되지 않음' 오류가 나지 않게, 잠깐 기다렸다 다시 찾음)
    const fn = { home: "homeView", overview: "overviewView", notify: "notifyView", students: "studentsView", tuition: "tuitionView", attend: "attendView", consult: "consultView", payroll: "payrollView", money: "moneyView", calendar: "calendarView", marketing: "marketingView" }[tab];
    for (let i = 0; i < 20 && typeof window[fn] !== "function"; i++) await new Promise(r => setTimeout(r, 100));
    await window[fn](); }
  catch (e) { $("#main").innerHTML = `<div class="warn">불러오지 못했어요: ${esc(e.message)}</div>`; }
}

// ===== 자료 한 번에 읽기 =====
async function loadAll(force) {
  // (출결표는 달마다 따로 읽음: attendView)
  if (O.data && !force && O.data.at > Date.now() - 60000) return O.data;
  const [students, staff, fees, pays, consults, events, slots, contacts, logs, todayCells] = await Promise.all([
    q(db.from("students").select("*").order("id")),
    q(db.from("staff").select("id,name,role,instrument,pay_kind,pay_amount,active,sort").order("sort")),
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
// 그 달 '잔액사용'(선납 잔액으로 낼 돈을 줄임) → 낼 돈 = 원비 − 잔액사용
const useOf = (sid, month) => O.data.fees.filter(f => f.student_id === sid && f.kind === "잔액사용" && f.from_month === month + "-01").reduce((a, f) => a + (f.amount || 0), 0);
const dueOf = (sid, month) => Math.max(0, (feeOf(sid, month) || 0) - useOf(sid, month));
function copyText(t) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("복사했어요 · 카톡이나 문자에 붙여 넣으세요"), () => prompt("길게 눌러 복사하세요", t)); }
const tname = id => (O.data.T[id] || {}).name || "";
const ibar = inst => `style="--c:${COLOR[inst] || "var(--blue)"}"`;

// ===== 홈 =====
function homeView() {
  const d = O.data, m = O.month, today = ymd(new Date());
  const act = d.students.filter(s => enrolled(s, m));
  const due = act.map(s => ({ s, fee: dueOf(s.id, m), pay: payOf(s.id, m) })).filter(x => x.fee > 0);
  const unpaid = due.filter(x => !x.pay);
  const paidSum = due.filter(x => x.pay).reduce((a, x) => a + (x.pay.amount ?? x.fee), 0);
  const cMonth = d.consults.filter(c => (c.asked_on || "").startsWith(m));
  const follow = d.consults.filter(c => c.follow_on && c.follow_on <= today && !/등록|미등록/.test(c.status || ""));
  const linked = new Set(d.events.filter(e => e.kind === "보강" && e.linked_date).map(e => e.student_id + "|" + e.linked_date));
  const noMk = d.events.filter(e => e.event_date >= m + "-01" && ["결석 · 사전 연락", "결석 · 당일 예외", "결석 · 강사 사정·휴일"].includes(e.kind) && e.form === "개인" && !linked.has(e.student_id + "|" + e.event_date));   // 정산 끝난 지난달은 빼고 이 달만
  const name = id => (d.students.find(s => s.id === id) || {}).name || id;
  const byInst = INST_ORDER.map(i => [i, act.filter(s => s.instrument === i).length]);
  $("#main").innerHTML = monthBar("홈") + `
    <div class="kpis">
      ${kpi("재원생", act.length + "명", byInst.filter(x => x[1]).map(x => x[0] + " " + x[1]).join(" · "))}
      ${kpi("수강료 납부", won(paidSum) + "원", `${due.length - unpaid.length}/${due.length}명 납부`)}
      ${kpi("미납", unpaid.length + "명", won(unpaid.reduce((a, x) => a + x.fee, 0)) + "원", unpaid.length ? "red" : "")}
      ${kpi("이달 상담", cMonth.length + "건", "등록 " + cMonth.filter(c => /등록/.test(c.status || "") && !/미등록/.test(c.status || "")).length + "건")}
    </div>
    ${diagCard(act, m)}
    <h2 class="sec2">확인할 것</h2>
    <div id="autochk"></div>
    ${todayLogsCard()}${stagnationCard()}
    ${unpaid.length ? `<div class="card clickable" data-go="tuition"><b>미납 ${unpaid.length}명</b><div class="m">${unpaid.map(x => esc(x.s.name)).join(", ")}</div></div>` : ""}
    ${follow.length ? `<div class="card"><b>상담 후속 연락 ${follow.length}건</b><div class="m">${follow.map(c => esc(c.name) + " (" + c.follow_on.slice(5).replace("-", "/") + ")").join(", ")}</div></div>` : ""}
    ${noMk.length ? `<div class="card"><b>보강 날짜 없는 결석 ${noMk.length}건</b><div class="m">${noMk.map(e => esc(name(e.student_id)) + " " + label(e.event_date)).join(", ")}</div></div>` : ""}
    ${!unpaid.length && !follow.length && !noMk.length ? `<div class="card m">오늘 확인할 것이 없어요 </div>` : ""}
    <p class="m" style="margin-top:14px">자료는 매일 밤 시트에서 복사돼요. 지금은 시트가 원본이라 새 앱에서 바꾼 내용은 시트에 자동으로 들어가지 않아요.</p>`;
  bindMonth(); document.querySelectorAll("[data-go]").forEach(c => c.onclick = () => go(c.dataset.go));
  autoChecks();
}
// 자동 대조 (원장 요청 2026-10-20: 네 곳이 어긋나면 먼저 알려 주기)
// ① 시간표 알림칸(회차 부족·초과) ② 상담 '등록'인데 원생 명부에 없음 ③ 정규 요일인데 지난 7일 시간표·기록 모두 없음 ④ 앞으로 시간표에 명부에 없는 이름·휴원·퇴원생
async function autoChecks() {
  const el = $("#autochk"); if (!el) return;
  const d = O.data, today = ymd(new Date()), from = addDays(today, -7), to = addDays(today, 21);
  const [alertRow, cells] = await Promise.all([
    db.from("settings").select("value").eq("key", "timetable_alert").then(r => (r.data || [])[0]),
    q(db.from("timetable_cells").select("lesson_date,student_id,is_group,raw_text,group_names").gte("lesson_date", from).lte("lesson_date", to))
  ]);
  const items = [], S = Object.fromEntries(d.students.map(s => [s.id, s])), names = new Set(d.students.map(s => s.name));
  const a = alertRow && alertRow.value, ex = (a && a.exclude) || [];
  if (a && a.check) items.push(["회차", "시간표 회차 확인 (선생님 시간표 알림칸)", a.check.replace(/\n/g, "<br>")]);
  const regGone = d.consults.filter(c => c.status === "등록" && c.asked_on >= addDays(today, -45) && !names.has(c.name) && !c.with_name);
  if (regGone.length) items.push(["명부", `상담은 '등록'인데 원생 명부에 없음 ${regGone.length}명`, regGone.map(c => esc(c.name) + " (" + (c.asked_on || "").slice(5).replace("-", "/") + " 상담)").join(", ")]);
  const hol = new Set((await q(db.from("holidays").select("day").gte("day", from).lte("day", today))).map(h => h.day));
  const miss = [];
  for (let day = from; day < today; day = addDays(day, 1)) {
    if (hol.has(day)) continue;
    d.slots.filter(x => x.kind === "개인" && x.weekday === wd(day) && (!x.valid_from || x.valid_from <= day) && (!x.valid_to || x.valid_to >= day)).forEach(x => {
      const s = S[x.student_id]; if (!s || !enrolled(s, day.slice(0, 7)) || (s.start_month && s.start_month > day)) return;
      if (ex.some(([n, dt]) => n === s.name && (!dt || dt === day))) return;   // 시간표 '알림 제외 학생'(예: 김성훈 10월 2회만)
      const has = cells.some(c => c.student_id === x.student_id && c.lesson_date === day) || d.events.some(e => e.student_id === x.student_id && e.event_date === day);
      if (!has) miss.push(`${label(day)} ${esc(s.name)}`);
    });
  }
  if (miss.length) items.push(["시간표", `정규 수업인데 시간표·기록에 없음 ${miss.length}건 (지난 7일)`, miss.join(", ")]);
  const odd = [...new Set(cells.filter(c => c.lesson_date >= today && !c.is_group && (!c.student_id || (S[c.student_id] && S[c.student_id].status !== "재원"))).map(c => `${label(c.lesson_date)} ${esc(c.student_id ? S[c.student_id].name + "(" + S[c.student_id].status + ")" : (c.raw_text || "").replace(/\(.*$/, ""))}`))];
  if (odd.length) items.push(["시간표", `앞으로 시간표에 명부에 없거나 휴원·퇴원인 이름 ${odd.length}건`, odd.join(", ")]);
  el.innerHTML = items.length ? `<div class="card"><b>자동 대조 · 어긋난 곳 ${items.length}가지</b> <span class="m">${a && a.at ? "시간표 알림 " + esc(a.at) + " 기준" : ""}</span>
    ${items.map(([k, t, x]) => `<div style="margin-top:10px"><span class="tag">${k}</span> <b>${t}</b><div class="m" style="margin-top:2px">${x}</div></div>`).join("")}</div>` : "";
}
// 지금 상황 한 줄 진단 (기존 앱 '운영 현황'과 같은 내용): 재원 증감 · 상담→등록 · 유입경로 모름
function diagCard(act, m) {
  const d = O.data, pm = addDays(m + "-01", -1).slice(0, 7), prev = d.students.filter(s => enrolled(s, pm)).length;
  const joined = act.filter(s => (s.start_month || "").startsWith(m)).length;
  const gone = d.students.filter(s => enrolled(s, pm) && !enrolled(s, m));
  const cs = mm => d.consults.filter(c => (c.asked_on || "").startsWith(mm) && !c.with_name);
  const cm = cs(m), cp = cs(pm), reg = a => a.filter(c => c.status === "등록").length;
  const unk = d.consults.filter(c => !c.source).length;
  const line = (c, t, s) => `<div style="border-left:4px solid var(--${c});padding:4px 10px;margin:6px 0"><div>${t}</div><div class="m">${s}</div></div>`;
  return `<div class="card"><b>지금 상황 한눈에</b>
    ${line(act.length >= prev ? "ok" : "red", `재원생 <b>${act.length}명</b> · 지난달보다 ${act.length - prev >= 0 ? "+" : ""}${act.length - prev}명`, `신규 ${joined} · 빠짐 ${gone.length}${gone.length ? " (" + gone.map(s => esc(s.name) + " " + esc(s.end_kind || s.status)).join(", ") + ")" : ""}`)}
    ${line(cm.length && reg(cm) / cm.length >= .5 ? "ok" : "gold", `${+m.slice(5)}월 상담 <b>${cm.length}건 → 등록 ${reg(cm)}명</b>`, `지난달 ${cp.length}건 → ${reg(cp)}명`)}
    ${unk ? line("gold", `유입경로 모르는 상담 <b>${unk}건</b>`, "어디서 왔는지 적어야 어느 홍보에 힘을 줄지 정할 수 있어요") : ""}</div>`;
}
const kpi = (t, v, sub, cls = "") => `<div class="kpi ${cls}"><span>${t}</span><b>${v}</b><small>${esc(sub)}</small></div>`;
function monthBar(title) {
  // 화면 제목 = 메뉴 이름 (예: '홈' → '오늘의 학원'); 숫자 같은 덧붙임은 뒤에
  const name = (MENU.flatMap(m => m.sub).find(x => x[0] === O.tab) || [])[1];
  if (name && ["홈", "수납 · 미납", "출결표", "강사 급여", "캘린더 · 일지", "상담", "마케팅", "돈 · 재고"].includes(title)) title = name;
  else if (name && /^학생 \d+명$/.test(title)) title = name + ` <small class="m" style="font-size:15px;font-weight:600">${title.replace("학생 ", "")}</small>`;
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
    ${teacherChangeCard(s)}
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
  bindTeacherChange(s);
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
  rows.forEach(r => { r.use = useOf(r.s.id, m); r.due = dueOf(r.s.id, m); });
  const un = rows.filter(r => !r.pay), pd = rows.filter(r => r.pay);
  const sum = a => a.reduce((x, r) => x + r.due, 0), today = ymd(new Date());
  const late = (m < today.slice(0, 7) || (m === today.slice(0, 7) && +today.slice(8) > 1)) ? un.length : 0;   // 납부 기간 = 전달 마지막 주
  const card = r => `<div class="card inst" ${ibar(r.s.instrument)}><div class="top"><span><b>${esc(r.s.name)}</b> <span class="m">${esc(r.s.instrument)} · ${esc(tname(r.s.teacher_id))} · ${r.use ? `원비 ${won(r.fee)} − 잔액 ${won(r.use)} = <b>낼 돈 ${won(r.due)}원</b>` : won(r.fee) + "원"}</span></span>
    ${r.pay ? `<span class="tag ok">${r.pay.paid_on ? r.pay.paid_on.slice(5).replace("-", "/") + " " : ""}${esc(r.pay.method || "○")} 납부</span>` :
      `<span class="row2" style="flex-wrap:wrap;justify-content:flex-end"><button class="btn" data-msg="${r.s.id}">안내</button><input type="date" class="pd" value="${ymd(new Date())}" style="width:auto;margin:0"><button class="btn pri" data-pay="${r.s.id}" data-m="카드">카드</button><button class="btn" data-pay="${r.s.id}" data-m="이체">이체</button></span>`}</div></div>`;
  $("#main").innerHTML = monthBar("수납 · 미납") +
    `<div class="kpis">${kpi("청구액", won(sum(rows)) + "원", rows.length + "명")}${kpi("납부 완료", won(sum(pd)) + "원", pd.length + "명")}${kpi("미납", won(sum(un)) + "원", un.length + "명", un.length ? "red" : "")}${kpi("기한 지남", late + "명", "납부 기간: 전달 마지막 주")}</div>
     <h2 class="sec2">미납 ${un.length}명</h2>${un.map(card).join("") || '<div class="card m">없어요</div>'}
     <h2 class="sec2">납부 ${pd.length}명</h2>${pd.map(card).join("")}`;
  bindMonth();
  document.querySelectorAll("[data-msg]").forEach(b => b.onclick = () => { const r = rows.find(x => x.s.id === b.dataset.msg);
    copyText(`안녕하세요, 비발디 관현악학원입니다 \n${r.s.name} ${+m.slice(5)}월 교육비(${won(r.due)}원) 안내드려요.\n이미 납부하셨다면 이 메시지는 넘겨 주세요. 납부가 어려우시면 편하게 말씀 주세요. 감사합니다.`); });
  document.querySelectorAll("[data-pay]").forEach(b => b.onclick = async () => {
    const r = rows.find(x => x.s.id === b.dataset.pay), day = b.parentNode.querySelector(".pd").value;
    if (!day) return toast("납부 날짜를 골라 주세요");
    if (!confirm(`${r.s.name} ${m} 수강료 ${won(r.due)}원\n${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 ${b.dataset.m} 납부로 기록할까요?`)) return;
    b.disabled = true;
    const row = { student_id: r.s.id, month: m + "-01", method: b.dataset.m, paid_on: day, source_kind: "app", memo: "새 앱 기록" };
    const { error } = await db.from("payments").insert(row);
    if (error) { b.disabled = false; return toast("저장 실패: " + error.message); }
    d.pays.push(row); toast(r.s.name + " 납부 기록 완료"); tuitionView();
  });
}

// ===== 담당 선생님 변경 (적용일부터 자동) =====
function teacherChangeCard(s) {
  const d = O.data, ch = TCH.filter(c => c.student_id === s.id);
  const opts = d.staff.filter(t => t.pay_kind !== undefined).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  return `<div class="card"><h2>담당 선생님</h2>
    <div>오늘 담당: <b>${esc(tname(teacherOn(s, ymd(new Date()))))}</b></div>
    ${ch.map(c => `<div class="m">${c.from_date.slice(5).replace("-", "/")}부터 ${esc(tname(c.old_teacher_id))} → <b>${esc(tname(c.new_teacher_id))}</b> ${esc(c.memo || "")}</div>`).join("")}
    <details style="margin-top:6px"><summary class="m">담당 바꾸기</summary>
      <div class="row2"><label style="flex:1">적용일<input id="tc1" type="date" value="${ymd(new Date())}"></label><label style="flex:1">새 담당<select id="tc2">${opts}</select></label></div>
      <input id="tc3" placeholder="메모(선택)">
      <p class="m">적용일부터 자동으로 바뀌는 곳: 선생님 화면 '내 수업' · 일지 현황 · 강사 급여(적용일 전 수업은 이전 선생님, 이후는 새 선생님)</p>
      <button class="btn pri" id="tcs">변경 저장</button></details></div>`;
}
function bindTeacherChange(s) {
  const b = $("#tcs"); if (!b) return;
  b.onclick = async () => {
    const day = $("#tc1").value, nt = $("#tc2").value;
    if (!day || !nt) return toast("적용일과 새 담당을 골라 주세요");
    const old = teacherOn(s, addDays(day, -1));
    if (old === nt) return toast("이미 그 선생님 담당이에요");
    if (!confirm(`${s.name} 담당을 ${day.slice(5).replace("-", "/")}부터 ${tname(old)} → ${tname(nt)}로 바꿀까요?`)) return;
    b.disabled = true;
    const { error } = await db.from("teacher_changes").insert({ student_id: s.id, from_date: day, old_teacher_id: old, new_teacher_id: nt, memo: $("#tc3").value.trim() || null });
    b.disabled = false;
    if (error) return toast(/teacher_changes/.test(error.message) ? "변경 이력 표가 아직 없어요(06 SQL 실행 필요)" : "저장 실패: " + error.message);
    await loadTeacherChanges(); toast("담당 변경을 저장했어요"); studentDetail(s.id);
  };
}
