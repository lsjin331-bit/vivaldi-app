"use strict";
// 비발디 통합 앱 — 1단계: 선생님 화면 (오늘 내 수업 · 출석·일지 · 결석 · 보강)
// 데이터는 Supabase. 권한은 서버(RLS)가 막는다: 선생님은 본인 학생만, 돈·상담은 아예 못 읽음.
const db = supabase.createClient(VIVALDI.url, VIVALDI.key);
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLOR = { 바이올린: "var(--vn)", 첼로: "var(--vc)", 플룻: "var(--fl)", 클라리넷: "var(--cl)", 비올라: "var(--va)" };
// 결석 종류(원장 2026-10-20 최종 문구). 고른 뒤 사유(선택) → [결석 기록]
const ABS = [["결석 · 사전 연락", "📞 사전 연락", "보강 진행"], ["결석 · 당일 취소(보강 없음)", "⛔ 당일 취소", "보강 불가"],
  ["결석 · 당일 예외", "🚑 예외적인 당일 취소", "보강 진행", "장례식 · 아픈 경우 · 천재지변 등"], ["결석 · 강사 사정·휴일", "🏫 선생님 사정 · 공휴일", "보강 진행"]];
// 선생님 앱 규칙(2026-10-20): 일지는 수업 당일 밤 10:30까지(선생님 앱 시작 10/13부터), 촬영 4주 지나면 노란불·5주 지나면 빨간불
const LOG_FROM = "2026-10-13", FILM_YELLOW = 28, FILM_RED = 35, NOTICE_UNTIL = "2026-10-27";
let RULES = { film: [], opened: [], plans: [], flex: [], hold: [] };
const NEEDS_MAKEUP = ["결석 · 사전 연락", "결석 · 당일 예외", "결석 · 강사 사정·휴일"];
let ME = null, STAFF = [], cur = new Date(), DAY = null, TEACHER_FILTER = null, TCH = [];
// 담당 변경 이력(teacher_changes): 그날의 담당 = 그날 이전 가장 최근 변경의 새 담당, 첫 변경 전이면 이전 담당
// 시간표 칸의 귀속월: 보관 칸은 for_month(8/31 = 9월 1회차 등), 나머지는 날짜의 달
const cellMonth = c => c.for_month || c.lesson_date.slice(0, 7) + "-01";
// 그 달 칸 = 날짜가 그 달이거나 귀속월이 그 달
const monthCells = (ms, me) => db.from("timetable_cells").select("*").or(`and(lesson_date.gte.${ms},lesson_date.lte.${me}),for_month.eq.${ms}`);
async function loadTeacherChanges() { const r = await db.from("teacher_changes").select("*").order("from_date"); TCH = r.data || []; }
function teacherOn(s, day) {
  const ch = TCH.filter(c => c.student_id === s.id);
  if (!ch.length) return s.teacher_id;
  const prev = ch.filter(c => c.from_date <= day);
  return prev.length ? prev[prev.length - 1].new_teacher_id : (ch[0].old_teacher_id || s.teacher_id);
}

function toast(t) { const e = $("#toast"); e.textContent = t; e.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("show"), 2600); }
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const label = s => { const d = new Date(s + "T00:00:00"); return (d.getMonth() + 1) + "/" + d.getDate() + "(" + "일월화수목금토"[d.getDay()] + ")"; };
const hm = t => String(t || "").slice(0, 5);
const wd = s => (new Date(s + "T00:00:00").getDay() + 6) % 7;   // 0=월 … 6=일
const monthStart = s => s.slice(0, 7) + "-01";
const monthEnd = s => { const d = new Date(s.slice(0, 7) + "-01T00:00:00"); d.setMonth(d.getMonth() + 1); d.setDate(0); return ymd(d); };
async function q(p) { const { data, error } = await p; if (error) throw new Error(error.message); return data; }

// ===== 로그인 =====
async function boot() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return loginView();
  const email = session.user.email.toLowerCase();
  // 본인 줄만 전체로 읽힌다(RLS). 다른 선생님은 이름·악기만 있는 staff_names로 본다.
  ME = (await q(db.from("staff").select("id,name,role,instrument,email").ilike("email", email)))[0];
  STAFF = await q(db.from("staff_names").select("id,name,role,instrument").order("sort"));
  if (!ME) { $("#main").innerHTML = `<div class="warn">이 이메일(${esc(email)})은 선생님 명단에 연결되어 있지 않아요. 원장님께 알려 주세요.</div>`; showLogout(); return; }
  await loadTeacherChanges();
  $("#who").textContent = ME.name + (ME.role === "teacher" ? " 선생님" : ME.role === "owner" ? " · 원장" : " · 실장");
  showLogout();
  if (ME.role !== "teacher") { TEACHER_FILTER = TEACHER_FILTER || STAFF.find(s => s.role === "teacher")?.id || ME.id; return ownerBoot(); }
  load();
}
function showLogout() { const b = $("#logout"); b.hidden = false; b.onclick = async () => { await db.auth.signOut(); location.reload(); }; }
function loginView() {
  $("#main").innerHTML = `<div class="card login"><h1>로그인</h1><p class="m">원장님께 받은 이메일과 비밀번호로 들어와요.</p>
    <form id="lf"><label>이메일<input id="em" type="email" autocomplete="username" required></label>
    <label>비밀번호<input id="pw" type="password" autocomplete="current-password" required></label>
    <p style="margin-top:14px"><button class="btn pri" style="width:100%">들어가기</button></p></form></div>`;
  $("#lf").onsubmit = async e => {
    e.preventDefault(); const b = e.submitter; b.disabled = true;
    const { error } = await db.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value });
    if (error) { toast("이메일 또는 비밀번호가 맞지 않아요"); b.disabled = false; return; }
    boot();
  };
}

// ===== 하루 수업 불러오기 =====
async function load() {
  const day = ymd(cur), today = ymd(new Date());
  $("#main").innerHTML = `<div class="loading">불러오는 중…</div>`;
  const teacherId = ME.role === "teacher" ? ME.id : TEACHER_FILTER;
  const ms = monthStart(day), me = monthEnd(day);
  const [slots, students, events, logs, hol, rules] = await Promise.all([
    q(db.from("regular_slots").select("*")),
    q(db.from("students").select("id,name,instrument,teacher_id,status")),
    q(db.from("attendance_events").select("*").gte("event_date", addDays(ms, -45)).lte("event_date", addDays(me, 45))),
    q(db.from("lesson_logs").select("id,lesson_date,student_id,piece,today,homework,new_book,video_song,talk").order("lesson_date", { ascending: false }).limit(800)),
    q(db.from("holidays").select("day,memo")),
    db.from("settings").select("value").eq("key", "teacher_rules").then(r => ((r.data || [])[0] || {}).value || null)
  ]);
  if (ymd(cur) !== day) return;   // 날짜를 빨리 넘기면 늦게 온 다른 날 결과는 버린다
  if (rules) RULES = Object.assign(RULES, rules);
  const S = Object.fromEntries(students.map(s => [s.id, s]));
  const holidays = new Set(hol.map(h => h.day));
  const valid = (s, d) => (!s.valid_from || s.valid_from <= d) && (!s.valid_to || s.valid_to >= d);
  const mySlots = slots.filter(s => s.teacher_id === teacherId && S[s.student_id] && S[s.student_id].status === "재원");

  // 전환 기간: 그날 시트 시간표 칸이 있으면 그 칸을 그대로 쓴다(기존 선생님 링크와 같은 목록).
  const cells = await q(db.from("timetable_cells").select("*").eq("lesson_date", day).order("start_time"));
  const list = cells.length ? cellLessons(cells, events, S, slots, teacherId, day) : [];
  if (!cells.length && !holidays.has(day)) mySlots.filter(s => s.weekday === wd(day) && valid(s, day)).forEach(s => list.push({ kind: s.kind, sid: s.student_id, time: hm(s.start_time), min: s.minutes, room: s.room, regular: true }));
  if (!cells.length) events.filter(e => e.event_date === day && (e.kind === "보강" || e.kind.startsWith("대강") || e.kind === "체험") && (e.teacher_id === teacherId))
    .forEach(e => { if (!list.some(l => l.sid === e.student_id && !l.regular && l.ev === e.id)) list.push({ kind: e.form, sid: e.student_id, time: hm(e.start_time) || "", min: e.minutes || 30, extra: e.kind, ev: e.id }); });
  list.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));

  // 회차: 이 달 정규 수업(지난 날·결석 제외, 당일 취소는 소진) + 이 달 귀속 보강
  const count = sid => {
    const ss = mySlots.filter(s => s.student_id === sid && s.kind === "개인");
    const target = ss.length * 4;
    const dates = [];
    for (let d = ms; d <= me; d = addDays(d, 1)) if (!holidays.has(d) && ss.some(s => s.weekday === wd(d) && valid(s, d))) dates.push(d);
    const ev = events.filter(e => e.student_id === sid && e.form === "개인");
    const used = d => !ev.some(e => e.event_date === d && NEEDS_MAKEUP.includes(e.kind));
    const mk = ev.filter(e => e.kind === "보강" && (e.for_month || "").slice(0, 7) === ms.slice(0, 7)).map(e => e.event_date);
    const seq = [...dates.filter(used), ...mk].sort();
    return { target, seq };
  };
  list.forEach(l => {
    const s = S[l.sid] || {};
    l.name = l.group || s.name || "?"; l.instrument = s.instrument;
    l.recs = events.filter(e => e.student_id === l.sid && e.event_date === day && e.kind !== "보강" && !e.kind.startsWith("대강") && e.kind !== "체험").map(e => e.kind);
    if (l.extra) l.recs.unshift(l.extra.startsWith("대강") ? "대강" : l.extra);
    l.log = logs.find(g => g.student_id === l.sid && g.lesson_date === day);
    l.hasMk = events.some(e => e.student_id === l.sid && e.event_date === day && e.kind === "보강");
    l.flex = RULES.flex.includes(l.name);
    l.plan = (RULES.plans.find(p => p.day === day && p.name === l.name) || {}).link || "";
    l.opened = RULES.opened.includes(day + "|" + l.name);
    const late = new Date().getHours() * 60 + new Date().getMinutes() >= 22 * 60 + 30;
    l.future = day > today && !l.log;
    l.locked = ME.role === "teacher" && !l.log && l.kind !== "그룹" && day >= LOG_FROM && (day < today || (day === today && late)) && !l.opened;
    l.film = filmOf(l, logs, day);
    if (l.kind === "개인") { const c = count(l.sid); l.target = c.target; l.nth = c.seq.filter(d => d <= day).length; }
    // 보강 안 된 결석 (보강 연결 후보)
    const linked = new Set(events.filter(e => e.student_id === l.sid && e.kind === "보강" && e.linked_date).map(e => e.linked_date));
    l.open = events.filter(e => e.student_id === l.sid && NEEDS_MAKEUP.includes(e.kind) && e.event_date < day && !linked.has(e.event_date))
      .sort((a, b) => b.event_date.localeCompare(a.event_date));
  });
  // 오늘까지 입력 안 된 내 수업 (최근 7일)
  const missing = [];
  for (let d = addDays(today, -7); d < today; d = addDays(d, 1)) {
    if (holidays.has(d)) continue;
    mySlots.filter(s => s.kind === "개인" && s.weekday === wd(d) && valid(s, d)).forEach(s => {
      const done = logs.some(g => g.student_id === s.student_id && g.lesson_date === d) || events.some(e => e.student_id === s.student_id && e.event_date === d && e.kind.startsWith("결석"));
      if (!done) missing.push({ d, name: (S[s.student_id] || {}).name, time: hm(s.start_time) });
    });
  }
  if (ymd(cur) !== day) return;
  DAY = { day, today, list, missing, holiday: holidays.has(day) ? (hol.find(h => h.day === day).memo || "휴강일") : "" };
  render();
}
// 시간표 칸 → 수업: 같은 방에서 이어지는 같은 학생 칸을 한 수업으로 합친다(기존 선생님 링크와 같은 규칙)
function cellLessons(cells, events, S, slots, teacherId, day) {
  const toMin = t => { const [h, m] = hm(t).split(":").map(Number); return h * 60 + m; };
  const cover = {};
  events.filter(e => e.event_date === day && e.kind.startsWith("대강") && e.teacher_id).forEach(e => cover[e.student_id] = e.teacher_id);
  const ownerIds = new Set(STAFF.filter(s => s.role === "owner").map(s => s.id));
  const open = {}; let out = [];
  cells.slice().sort((a, b) => (a.room || "").localeCompare(b.room || "") || toMin(a.start_time) - toMin(b.start_time)).forEach(c => {
    const key = (c.room || "") + "|" + (c.student_id || c.group_names), st = toMin(c.start_time), last = open[key];
    if (last && st === last.end) { last.end = st + 30; last.cells++; if (c.minutes !== 30) last.explicit = Math.max(last.explicit, c.minutes); return; }
    open[key] = { sid: c.student_id, tid: c.teacher_id, group: c.is_group ? c.group_names : null, room: c.room, start: st, end: st + 30, cells: 1, explicit: c.minutes !== 30 ? c.minutes : 0, shoot: /촬영/.test(c.raw_text || "") };
    out.push(open[key]);
  });
  const w = wd(day);
  // 촬영 자리(이름(촬영)만 있는 칸)는 같은 날 그 학생의 다른 수업이 있으면 수업이 아님
  out = out.filter(l => !l.shoot || l.group || !out.some(o => o !== l && o.sid === l.sid && !o.shoot));
  return out.filter(l => {
    if (l.group) return ownerIds.has(teacherId);
    const s = S[l.sid]; if (!s) return false;
    return (cover[l.sid] || l.tid || teacherOn(s, day)) === teacherId;
  }).map(l => ({
    kind: l.group ? "그룹" : "개인", sid: l.sid, group: l.group, time: String(Math.floor(l.start / 60)).padStart(2, "0") + ":" + String(l.start % 60).padStart(2, "0"),
    min: l.explicit || l.cells * 30, room: l.room, extra: cover[l.sid] ? "대강" : null,
    regular: slots.some(x => x.student_id === l.sid && x.weekday === w)
  })).sort((a, b) => a.time.localeCompare(b.time));
}
function addDays(s, n) { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); }

function render() {
  const d = DAY;
  let h = `<div class="nav"><button class="btn" id="prev">‹</button><div><h1>${label(d.day)}${d.day === d.today ? " 오늘" : ""}</h1><div class="m">내 수업</div></div><button class="btn" id="next">›</button></div>`;
  if (ME.role !== "teacher") h += `<label>선생님 보기<select id="tf">${STAFF.filter(s => s.role !== "owner" || true).map(s => `<option value="${s.id}" ${s.id === TEACHER_FILTER ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label><p></p>`;
  if (d.today <= NOTICE_UNTIL) h += NOTICE;
  if (d.missing.length) h += `<div class="warn"><b>🔴 일지 누락 ${d.missing.length}건</b> <span class="m">(최근 7일 · 수업 당일 밤 10시 30분이 지나면 입력 창이 닫혀요)</span><br>${d.missing.map(x => `<button class="btn" style="margin:6px 6px 0 0;font-size:13px" data-go="${x.d}">${label(x.d)} ${esc(x.time)} ${esc(x.name)}</button>`).join("")}</div>`;
  if (d.holiday) h += `<div class="note">🏖 ${esc(d.holiday)} — 정규 수업이 없는 날이에요.</div>`;
  if (!d.list.length) h += `<div class="card m">이 날은 내 수업이 없어요.</div>`;
  d.list.forEach((l, i) => {
    const st = (l.recs.length ? `<span class="tag ${l.recs.some(r => r.startsWith("결석")) ? "red" : "blue"}">${esc(l.recs.join(", "))}</span> ` : "") + (l.log ? `<span class="tag ok">일지 완료</span>` : "");
    const cnt = l.target ? ` · ${new Date(d.day).getMonth() + 1}월 ${l.nth}/${l.target}회` : "";
    h += `<div class="card inst" style="--c:${COLOR[l.instrument] || "var(--blue)"}"><div class="top"><span><b>${esc(l.time)} ${esc(l.name)}</b> <span class="m">${l.min}분${l.kind !== "개인" ? " · " + l.kind : ""}${cnt}</span></span>${st}</div>
      ${l.plan && !l.hasMk ? `<div class="note" style="margin:8px 0 0">🔁 ${label(l.plan)} 결석분 보강 (미리 잡은 수업)</div>` : ""}
      ${l.opened && !l.log ? `<div class="note" style="margin:8px 0 0">🔓 원장님이 일지를 다시 열어 주셨어요 · 지금 적어 주세요</div>` : ""}
      ${filmLine(l.film)}
      <p style="margin:6px 0"><button class="btn" style="font-size:12px;padding:3px 10px" data-h="${i}">지난 일지</button></p>
      <div class="row3">${l.future ? `<button class="btn" disabled>수업 날 적을 수 있어요</button>` : l.locked ? `<button class="btn" disabled>입력 마감</button>` : `<button class="btn pri" data-i="${i}" data-a="log">${l.log ? "일지 수정" : "출석 · 일지"}</button>`}<button class="btn" data-i="${i}" data-a="abs">결석</button><button class="btn" data-i="${i}" data-a="mk">보강</button></div></div>`;
  });
  $("#main").innerHTML = h;
  $("#prev").onclick = () => { cur.setDate(cur.getDate() - 1); load(); };
  $("#next").onclick = () => { cur.setDate(cur.getDate() + 1); load(); };
  if ($("#tf")) $("#tf").onchange = e => { TEACHER_FILTER = e.target.value; load(); };
  document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { cur = new Date(b.dataset.go + "T00:00:00"); load(); });
  document.querySelectorAll("[data-a]").forEach(b => b.onclick = () => ({ log: logForm, abs: absForm, mk: mkForm })[b.dataset.a](DAY.list[+b.dataset.i]));
  document.querySelectorAll("[data-h]").forEach(b => b.onclick = () => histView(DAY.list[+b.dataset.h]));
}
const head = (l, t) => `<p><button class="btn" id="bk">‹ 목록</button></p><div class="card"><h1>${esc(l.name)} ${t}</h1><div class="m">${label(DAY.day)} ${esc(l.time)} · ${l.min}분</div>`;
const back = () => { render(); window.scrollTo(0, 0); };

// ===== 출석·일지 (선생님 앱과 같은 규칙, 원장 2026-10-20) =====
// 한 줄 = 교재 · 곡 · 레슨 내용. 지난번 것을 미리 넣지 않는다. 그룹은 공통 내용 + 학생별 한 줄.
// 수업 종류: 정규·유동·미리 잡은 보강·이미 보강 기록이면 묻지 않음. 그 밖에 정규 요일이 아니면 저장 전에 꼭 고르기.
function logForm(l) {
  const g = l.log || {}, items = [], extra = [];
  const songs = String(g.piece || "").split(/\s*,\s*/).filter(Boolean);
  String(g.today || "").split(/\s*\/\s*(?=•|개별:)|\n/).forEach(x => {
    x = x.replace(/^\s*•\s*/, "").trim(); if (!x || /^개별:/.test(x)) return;
    x = x.replace(/^\[(추가 수업|요일 이동[^\]]*)\]\s*/, "");
    const m = x.match(/^([^:：]{1,60})[:：]\s*(.*)$/);
    if (m) {
      const hd = m[1].split(" · ");
      if (hd.length > 1) { items.push({ b: hd[0].trim(), s: hd.slice(1).join(" · ").trim(), c: m[2] }); return; }
      if (songs.includes(m[1].trim())) { items.push({ b: "", s: m[1].trim(), c: m[2] }); return; }
    }
    extra.push(x);
  });
  songs.forEach(sg => { const p = sg.split(" · "), it = p.length > 1 ? { b: p[0], s: p.slice(1).join(" · ") } : { b: "", s: sg }; if (!items.some(x => x.s === it.s)) items.push({ ...it, c: "" }); });
  if (!items.length) items.push({ b: "", s: "", c: "" });
  if (extra.length) items[0].c = (items[0].c ? items[0].c + " " : "") + extra.join(" ");
  while (items.length < 2) items.push({ b: "", s: "", c: "" });
  const gmem = l.kind === "그룹" ? String(l.name).replace(/^\d{1,2}:\d{2}\s*/, "").replace(/\(.*?\)/g, "").trim().split(/\s+/) : [], gnote = {};
  ((String(g.today || "").match(/개별:\s*(.*)$/) || [])[1] || "").split(" / ").forEach(x => { const m = x.match(/^([^:：]+)[:：]\s*(.*)$/); if (m) gnote[m[1].trim()] = m[2]; });
  const needAsk = l.kind === "개인" && !l.hasMk && !l.plan && !l.regular && !l.flex;
  let kd = "";
  const row = it => `<div class="srow"><div class="srow2"><input class="sbook" value="${esc(it.b)}" placeholder="교재"><input class="sname" value="${esc(it.s)}" placeholder="곡"><button type="button" class="btn sdel" title="이 줄 지우기">✕</button></div><textarea class="scont" rows="2" placeholder="레슨 내용 · 예) 3~8마디 포지션 이동 음정, 메트로놈 60으로 4마디씩">${esc(it.c || "")}</textarea></div>`;
  $("#main").innerHTML = head(l, "레슨일지") +
    (l.hasMk ? `<div class="note">🔁 이 수업은 보강으로 기록돼 있어요</div>` : l.plan ? `<div class="note">🔁 ${label(l.plan)} 결석분 보강 (미리 잡은 수업) · 저장하면 보강도 함께 기록돼요</div>` :
     needAsk ? `<div class="warn">이 날은 <b>${esc(l.name)}</b> 정규 수업일이 아니에요. 어떤 수업인가요?<div class="chips" style="margin-top:8px"><button type="button" data-kd="mk">🔁 보강</button><button type="button" data-kd="extra">➕ 추가 수업</button><button type="button" data-kd="move">📅 이번 주만 요일 이동</button></div>
       <div id="kmk" style="display:none"><label>어느 결석분인가요?<select id="mklink">${l.open.map(a => `<option value="${a.event_date}">${label(a.event_date)} 결석분</option>`).join("")}<option value="">다른 날짜 직접 고르기</option></select></label><input type="date" id="mkdate" style="display:${l.open.length ? "none" : "block"}"></div>
       <div id="kmove" style="display:none"><label>원래 수업일<input type="date" id="mvfrom"></label></div></div>` : "") +
    `<div class="lbl">교재 · 곡 · 레슨 내용</div><div id="songs">${items.map(row).join("")}</div><p><button type="button" class="btn" id="sadd">＋ 곡 추가</button></p>` +
    (gmem.length ? `<div class="lbl">학생별 한 줄 <span class="m">(위 내용은 모두에게 같이 남아요)</span></div>${gmem.map(n => `<div class="srow2" style="align-items:center;margin:4px 0"><b style="flex:0 0 56px">${esc(n)}</b><input class="gm" data-n="${esc(n)}" value="${esc(gnote[n] || "")}" placeholder="예) 활 방향 자주 틀림"></div>`).join("")}` : "") +
    `<label>숙제<input id="hw" class="hwin" value="${esc(g.homework)}" placeholder="예) 3~4마디 하루 10번 · 그룹 수업 학생은 부족한 부분이 있을 때만"></label>
    <div class="chips"><button type="button" id="cb" class="${g.new_book ? "on" : ""}">📕 새 교재</button><button type="button" id="cv" class="${g.video_song ? "on" : ""}">🎥 촬영함</button><button type="button" id="ct" class="${g.talk ? "on" : ""}">💬 원장님 상담 요청</button></div>
    <div id="xb"><label>📕 어떤 교재를 줬나요?<input id="book" value="${esc(g.new_book)}" placeholder="예) 스즈키 바이올린 3권"></label></div>
    <div id="xv"><label>🎥 어떤 곡을 찍었나요?<input id="vsong" value="${esc(g.video_song)}" placeholder="예) 스즈키 2권 가보트"></label></div>
    <div id="xt"><label>원장님께 전할 말<input id="talk" value="${esc(g.talk)}" placeholder="예) 연습을 너무 안 해요"></label></div>
    <p style="margin-top:14px"><button class="btn pri" id="save" style="width:100%">저장</button></p><p class="m">🎥 촬영한 영상은 원장님께 보내 주세요.</p></div>`;
  $("#bk").onclick = back;
  const bindRows = () => document.querySelectorAll("#songs .sdel").forEach(b => b.onclick = () => { const r = b.closest(".srow"); if ($("#songs").children.length > 1) r.remove(); else r.querySelectorAll("input,textarea").forEach(x => x.value = ""); });
  bindRows();
  $("#sadd").onclick = () => { const lb = [...document.querySelectorAll("#songs .sbook")].map(x => x.value.trim()).filter(Boolean).pop() || ""; $("#songs").insertAdjacentHTML("beforeend", row({ b: lb, s: "", c: "" })); bindRows(); $("#songs").lastElementChild.querySelector(lb ? ".sname" : ".sbook").focus(); };
  document.querySelectorAll("[data-kd]").forEach(b => b.onclick = () => { kd = b.dataset.kd; document.querySelectorAll("[data-kd]").forEach(x => x.classList.toggle("on", x === b)); $("#kmk").style.display = kd === "mk" ? "block" : "none"; $("#kmove").style.display = kd === "move" ? "block" : "none"; });
  if ($("#mklink")) $("#mklink").onchange = e => $("#mkdate").style.display = e.target.value ? "none" : "block";
  [["#cb", "#xb"], ["#cv", "#xv"], ["#ct", "#xt"]].forEach(([b, x]) => {
    const show = () => $(x).style.display = $(b).classList.contains("on") ? "block" : "none";
    $(b).onclick = () => { $(b).classList.toggle("on"); show(); }; show();
  });
  $("#save").onclick = async e => {
    const on = id => $(id).classList.contains("on");
    const rows = [...document.querySelectorAll("#songs .srow")].map(r => ({ b: r.querySelector(".sbook").value.trim(), s: r.querySelector(".sname").value.trim(), c: r.querySelector(".scont").value.trim().replace(/\s*\n+\s*/g, " "), el: r })).filter(x => x.b || x.s || x.c);
    if (!rows.length) return toast("교재와 곡을 한 줄 이상 적어 주세요");
    const vague = /^(연습|복습|잘함|잘했음|했음|함|진도|레슨|수업|동일|같음|ok)[함음다요.\s!]*$/i;
    const bad = rows.find(x => !x.b || !x.s || x.c.length < 10 || vague.test(x.c));
    if (bad) { toast(!bad.b ? "교재를 적어 주세요" : !bad.s ? "곡을 적어 주세요" : "조금만 더 자세히 적어 주세요 · 예) 3~8마디 포지션 이동 음정, 메트로놈 60으로 4마디씩"); return bad.el.querySelector(!bad.b ? ".sbook" : !bad.s ? ".sname" : ".scont").focus(); }
    if (needAsk && !kd) return toast("어떤 수업인지 골라 주세요 (보강 · 추가 수업 · 요일 이동)");
    const mk = !!l.plan || kd === "mk", mkl = l.plan || (kd === "mk" ? ($("#mklink").value || $("#mkdate").value) : "");
    if (mk && !mkl) return toast("어느 결석의 보강인지 골라 주세요");
    if (kd === "move" && !$("#mvfrom").value) return toast("원래 수업일을 골라 주세요");
    if (on("#cb") && !$("#book").value.trim()) return toast("어떤 교재를 줬는지 적어 주세요");
    if (on("#cv") && !$("#vsong").value.trim()) return toast("어떤 곡을 찍었는지 적어 주세요");
    const each = [...document.querySelectorAll(".gm")].filter(x => x.value.trim()).map(x => x.dataset.n + ": " + x.value.trim());
    const pre = kd === "extra" ? "[추가 수업] " : kd === "move" ? `[요일 이동 · 원래 ${$("#mvfrom").value}] ` : "";
    const row = { lesson_date: DAY.day, start_time: l.time || null, student_id: l.sid, teacher_id: ME.role === "teacher" ? ME.id : TEACHER_FILTER,
      piece: rows.map(x => x.b + " · " + x.s).join(", "), today: pre + rows.map(x => "• " + x.b + " · " + x.s + ": " + x.c).join(" / ") + (each.length ? " / 개별: " + each.join(" / ") : ""),
      homework: $("#hw").value.trim() || null, new_book: on("#cb") ? $("#book").value.trim() : null, video_song: on("#cv") ? $("#vsong").value.trim() : null,
      talk: on("#ct") ? ($("#talk").value.trim() || "연락 부탁") : null, source_kind: "app" };
    e.target.disabled = true; e.target.textContent = "저장 중…";
    try {
      if (l.log) await q(db.from("lesson_logs").update(row).eq("id", l.log.id));
      else await q(db.from("lesson_logs").insert(row));
      if (mk && !l.hasMk) await addEvent(l, "보강", { linked_date: mkl, memo: "일지 저장 때 함께 기록" });
      toast("저장했어요"); load();
    } catch (err) { toast("저장 실패: " + err.message); e.target.disabled = false; e.target.textContent = "저장"; }
  };
}
// 지난 일지: 쓴 그대로
async function histView(l) {
  $("#main").innerHTML = `<p><button class="btn" id="bk">‹ 목록</button></p><div class="card"><h1>${esc(l.name)} 지난 일지</h1><div class="loading">불러오는 중…</div></div>`;
  $("#bk").onclick = back;
  const rows = l.sid ? await q(db.from("lesson_logs").select("lesson_date,piece,today,homework,new_book,video_song,talk,raw").eq("student_id", l.sid).order("lesson_date", { ascending: false }).limit(30)) : [];
  const t = r => r.raw || [r.piece && "곡: " + r.piece, r.today && "오늘: " + r.today, r.homework && "숙제: " + r.homework, r.new_book && "+교재 " + r.new_book, r.video_song && "+촬영 " + r.video_song, r.talk && "+상담 " + r.talk].filter(Boolean).join("\n");
  $("#main .card").innerHTML = `<h1>${esc(l.name)} 지난 일지</h1>` + (rows.length ? rows.map(r => `<div style="border-top:1px solid var(--line);padding:10px 0"><b>${label(r.lesson_date)}</b><div style="white-space:pre-wrap;font-size:14px;margin-top:4px">${esc(t(r))}</div></div>`).join("") : `<p class="m">아직 남은 일지가 없어요.</p>`);
}
// 영상 촬영: 촬영기록(선생님 앱) + 일지 '촬영함' 중 가장 늦은 날
function filmOf(l, logs, day) {
  if (l.kind !== "개인") return null;
  const f = RULES.film.find(x => x.name === l.name) || {};
  const lg = (logs.find(g => g.student_id === l.sid && g.video_song && g.lesson_date <= day) || {}).lesson_date || "";
  const last = [f.last || "", lg].sort().pop();
  const days = last ? Math.round((new Date(day + "T00:00:00") - new Date(last + "T00:00:00")) / 864e5) : null;
  let level = /제외/.test(f.by || "") ? "except" : /원장/.test(f.by || "") && ME.role === "teacher" ? "owner" : !last ? "unknown" : days >= FILM_RED ? "red" : days >= FILM_YELLOW ? "yellow" : "ok";
  if (f.later && f.later.base === last && /^(red|yellow|unknown)$/.test(level) && f.later.plan >= day) level = "later";
  return { last, days, week: last ? Math.floor(days / 7) + 1 : null, level, memo: f.memo, later: f.later };
}
function filmLine(f) {
  if (!f) return "";
  const m = f.last ? `마지막 촬영 ${label(f.last)} (${f.days}일 전)` : "";
  return f.level === "except" ? `<div class="m">🎥 촬영 쉬는 중 · ${esc(f.memo || "")}</div>` : f.level === "owner" ? `<div class="m">🎥 촬영: 원장님 그룹 수업에서</div>` :
    f.level === "unknown" ? `<div class="film y">🎥 마지막 촬영 날짜를 몰라요</div>` : f.level === "later" ? `<div class="film y">🎥 ${label(f.later.plan)} 촬영 예정 · 사유: ${esc(f.later.why)}</div>` :
    f.level === "red" ? `<div class="film">🎥 ${f.week}주차 · ${m} · 이번 수업에 꼭 찍어 주세요</div>` : f.level === "yellow" ? `<div class="film y">🎥 ${f.week}주차 · ${m} · 이번 주에 찍어 주세요</div>` : `<div class="m">🎥 ${m} · ${f.week}주차</div>`;
}
const NOTICE = `<div class="note notice"><b>📢 레슨일지 작성 규칙 안내</b> <span class="m">(이 글은 10/27까지 볼 수 있습니다.)</span><br>
  <b>1. 언제까지</b><br>· 수업 당일 <b>밤 10시 30분까지</b> 적을 수 있고 그 이후에는 입력 창이 닫힙니다.<br>· 기록 누락은 결석으로 간주합니다.
  <div style="height:10px"></div><b>2. 영상 촬영</b><br>· 촬영 주기: 학생마다 4~6주에 한 번 찍어요.<br>&nbsp;&nbsp;* 마지막 촬영 뒤 4주가 지나면(5주차) 노란불, 6주차부터 빨간불이 떠요.<br>· 일지에서 "🎥 촬영함"을 누르면 그날이 마지막 촬영일이 돼요.<br>· 마지막 촬영 날짜를 입력해 주셔야 합니다.
  <div style="height:10px"></div><b>3. 새 교재를 지급했을 때</b><br>· 일지 아래 [📕 새 교재]를 누르고 교재 이름을 적어 주세요. (예: 스즈키 바이올린 3권)
  <div style="height:10px"></div><b>4. 면담이 필요할 때</b><br>· 일지 아래 [💬 원장님 상담 요청]을 누르고 전할 말을 짧게 적어 주세요. (예: 연습을 너무 안해요. 요즘 사춘기인지 말을 잘 안 들어요.)<br>· 확인 후 선생님, 학부모님과 상담해요.</div>`;
async function addEvent(l, kind, extra = {}) {
  const forMonth = extra.linked_date ? monthStart(extra.linked_date) : monthStart(DAY.day);
  return q(db.from("attendance_events").insert({ event_date: DAY.day, start_time: l.time || null, student_id: l.sid, kind, minutes: extra.minutes || l.min,
    form: l.kind || "개인", teacher_id: ME.role === "teacher" ? ME.id : TEACHER_FILTER, created_by: ME.id, for_month: forMonth,
    linked_date: extra.linked_date || null, memo: extra.memo || null, source_kind: "app" }));
}

// '오늘 한 것' 곡별 • 글머리: 비어 있을 때 누르면 곡마다 '• 곡: ' 미리 채움, 엔터 → 다음 줄 '• '
function bulletize(ta, pieces) {
  ta.addEventListener("focus", () => { if (ta.value.trim()) return; const ps = String(pieces() || "").split(/[/,·]/).map(x => x.trim()).filter(Boolean); ta.value = ps.length ? ps.map(x => "• " + x + ": ").join("\n") : "• "; });
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + "\n• " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = p + 3; } });
}

// ===== 결석 ===== ① 종류 고르기 → ② 사유(모르면 비워도 됨) → [결석 기록]
function absForm(l) {
  let pick = -1;
  $("#main").innerHTML = head(l, "결석") +
    `<p class="m">① 해당하는 것을 골라 주세요. (${l.min}분 · 시간표 시트에서 이름은 회색으로 바뀌어요)</p>
    ${ABS.map((o, i) => `<button class="btn big1" data-k="${i}"><b>${o[1]}</b><span class="m"> : ${o[2]}</span>${o[3] ? `<br><span class="m" style="font-size:12px">${o[3]}</span>` : ""}</button>`).join("")}
    <label style="margin-top:12px">② 결석 사유<input id="memo" placeholder="예) 학교 행사, 감기, 가족 여행"></label>
    <p style="margin-top:12px"><button class="btn pri" id="absok" style="width:100%" disabled>결석 기록</button></p></div>`;
  $("#bk").onclick = back;
  document.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { pick = +b.dataset.k; document.querySelectorAll("[data-k]").forEach(x => { x.classList.toggle("on", x === b); x.style.outline = x === b ? "2px solid var(--blue)" : ""; }); $("#absok").disabled = false; });
  $("#absok").onclick = async e => {
    if (pick < 0) return toast("결석 종류를 골라 주세요");
    e.target.disabled = true; e.target.textContent = "기록 중…";
    try { await addEvent(l, ABS[pick][0], { memo: $("#memo").value.trim() || "사유 모름" }); toast("결석 기록 완료"); load(); }
    catch (err) { toast("저장 실패: " + err.message); e.target.disabled = false; e.target.textContent = "결석 기록"; }
  };
}

// ===== 보강 =====
function mkForm(l) {
  $("#main").innerHTML = head(l, "보강") +
    (l.open.length ? `<p class="m">어느 결석의 보강인가요? 누르면 바로 기록돼요.</p>${l.open.map((a, i) => `<button class="btn big1" data-o="${i}"><b>${label(a.event_date)} 결석분</b><span class="m"> · 오늘 ${l.min}분 수업으로 보강</span></button>`).join("")}`
      : `<p class="m">보강이 안 잡힌 결석 기록이 없어요. 원래 수업일을 직접 골라 주세요.</p>`) +
    `<details ${l.open.length ? "" : "open"} style="margin-top:10px"><summary class="m">다른 날짜 직접 고르기</summary>
     <label>원래 수업일<input id="link" type="date"></label><label>보강한 분<input id="min" type="number" value="${l.min}"></label>
     <p><button class="btn pri" id="save" style="width:100%">보강 기록</button></p></details></div>`;
  $("#bk").onclick = back;
  const go = async (link, min) => {
    document.querySelectorAll("#main button").forEach(x => x.disabled = true);
    try { await addEvent(l, "보강", { linked_date: link, minutes: Number(min) }); toast("보강 기록 완료"); load(); }
    catch (err) { toast("저장 실패: " + err.message); document.querySelectorAll("#main button").forEach(x => x.disabled = false); }
  };
  document.querySelectorAll("[data-o]").forEach(b => b.onclick = () => go(l.open[+b.dataset.o].event_date, l.min));
  $("#save").onclick = () => $("#link").value ? go($("#link").value, $("#min").value) : toast("원래 수업일을 골라 주세요");
}

boot().catch(e => { $("#main").innerHTML = `<div class="warn">연결 오류: ${esc(e.message)}</div>`; });
