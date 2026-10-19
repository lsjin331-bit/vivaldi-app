"use strict";
// 비발디 통합 앱 — 1단계: 선생님 화면 (오늘 내 수업 · 출석·일지 · 결석 · 보강)
// 데이터는 Supabase. 권한은 서버(RLS)가 막는다: 선생님은 본인 학생만, 돈·상담은 아예 못 읽음.
const db = supabase.createClient(VIVALDI.url, VIVALDI.key);
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLOR = { 바이올린: "var(--vn)", 첼로: "var(--vc)", 플룻: "var(--fl)", 클라리넷: "var(--cl)", 비올라: "var(--va)" };
const ABS = [["결석 · 사전 연락", "📞 미리 연락 옴", "보강 해 줘요"], ["결석 · 당일 취소(보강 없음)", "⛔ 당일 취소", "보강 없음"],
  ["결석 · 당일 예외", "🕯 당일 예외 (질병·장례)", "원장님과 상의"], ["결석 · 강사 사정·휴일", "🏫 선생님 사정 · 휴일", "보강 해 줘요"]];
const NEEDS_MAKEUP = ["결석 · 사전 연락", "결석 · 당일 예외", "결석 · 강사 사정·휴일"];
let ME = null, STAFF = [], cur = new Date(), DAY = null, TEACHER_FILTER = null, TCH = [];
// 담당 변경 이력(teacher_changes): 그날의 담당 = 그날 이전 가장 최근 변경의 새 담당, 첫 변경 전이면 이전 담당
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
  const [slots, students, events, logs, hol] = await Promise.all([
    q(db.from("regular_slots").select("*")),
    q(db.from("students").select("id,name,instrument,teacher_id,status")),
    q(db.from("attendance_events").select("*").gte("event_date", addDays(ms, -45)).lte("event_date", addDays(me, 45))),
    q(db.from("lesson_logs").select("id,lesson_date,student_id,piece,today,homework,new_book,video_song,talk").order("lesson_date", { ascending: false }).limit(800)),
    q(db.from("holidays").select("day,memo"))
  ]);
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
    l.lastPiece = (logs.find(g => g.student_id === l.sid && g.lesson_date < day && g.piece) || {}).piece || "";
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
      const done = logs.some(g => g.student_id === s.student_id && g.lesson_date === d) || events.some(e => e.student_id === s.student_id && e.event_date === d);
      if (!done) missing.push({ d, name: (S[s.student_id] || {}).name, time: hm(s.start_time) });
    });
  }
  DAY = { day, today, list, missing, holiday: holidays.has(day) ? (hol.find(h => h.day === day).memo || "휴강일") : "" };
  render();
}
// 시간표 칸 → 수업: 같은 방에서 이어지는 같은 학생 칸을 한 수업으로 합친다(기존 선생님 링크와 같은 규칙)
function cellLessons(cells, events, S, slots, teacherId, day) {
  const toMin = t => { const [h, m] = hm(t).split(":").map(Number); return h * 60 + m; };
  const cover = {};
  events.filter(e => e.event_date === day && e.kind.startsWith("대강") && e.teacher_id).forEach(e => cover[e.student_id] = e.teacher_id);
  const ownerIds = new Set(STAFF.filter(s => s.role === "owner").map(s => s.id));
  const open = {}, out = [];
  cells.slice().sort((a, b) => (a.room || "").localeCompare(b.room || "") || toMin(a.start_time) - toMin(b.start_time)).forEach(c => {
    const key = (c.room || "") + "|" + (c.student_id || c.group_names), st = toMin(c.start_time), last = open[key];
    if (last && st === last.end) { last.end = st + 30; last.cells++; if (c.minutes !== 30) last.explicit = Math.max(last.explicit, c.minutes); return; }
    open[key] = { sid: c.student_id, group: c.is_group ? c.group_names : null, room: c.room, start: st, end: st + 30, cells: 1, explicit: c.minutes !== 30 ? c.minutes : 0 };
    out.push(open[key]);
  });
  const w = wd(day);
  return out.filter(l => {
    if (l.group) return ownerIds.has(teacherId);
    const s = S[l.sid]; if (!s) return false;
    return (cover[l.sid] || teacherOn(s, day)) === teacherId;
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
  if (d.missing.length) h += `<div class="warn"><b>🔴 입력 안 된 수업 ${d.missing.length}건</b> <span class="m">(최근 7일)</span><br>${d.missing.map(x => `<button class="btn" style="margin:6px 6px 0 0;font-size:13px" data-go="${x.d}">${label(x.d)} ${esc(x.time)} ${esc(x.name)}</button>`).join("")}</div>`;
  if (d.holiday) h += `<div class="note">🏖 ${esc(d.holiday)} — 정규 수업이 없는 날이에요.</div>`;
  if (!d.list.length) h += `<div class="card m">이 날은 내 수업이 없어요.</div>`;
  d.list.forEach((l, i) => {
    const st = (l.recs.length ? `<span class="tag ${l.recs.some(r => r.startsWith("결석")) ? "red" : "blue"}">${esc(l.recs.join(", "))}</span> ` : "") + (l.log ? `<span class="tag ok">일지 완료</span>` : "");
    const cnt = l.target ? ` · ${new Date(d.day).getMonth() + 1}월 ${l.nth}/${l.target}회` : "";
    h += `<div class="card inst" style="--c:${COLOR[l.instrument] || "var(--blue)"}"><div class="top"><span><b>${esc(l.time)} ${esc(l.name)}</b> <span class="m">${l.min}분${l.kind !== "개인" ? " · " + l.kind : ""}${cnt}</span></span>${st}</div>
      ${l.open.length && !l.regular ? `<div class="note" style="margin:8px 0 0">🔁 보강 수업 같아요 · ${label(l.open[0].event_date)} 결석분</div>` : ""}
      <div class="row3"><button class="btn pri" data-i="${i}" data-a="log">${l.log ? "일지 수정" : "출석 · 일지"}</button><button class="btn" data-i="${i}" data-a="abs">결석</button><button class="btn" data-i="${i}" data-a="mk">보강</button></div></div>`;
  });
  $("#main").innerHTML = h;
  $("#prev").onclick = () => { cur.setDate(cur.getDate() - 1); load(); };
  $("#next").onclick = () => { cur.setDate(cur.getDate() + 1); load(); };
  if ($("#tf")) $("#tf").onchange = e => { TEACHER_FILTER = e.target.value; load(); };
  document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { cur = new Date(b.dataset.go + "T00:00:00"); load(); });
  document.querySelectorAll("[data-a]").forEach(b => b.onclick = () => ({ log: logForm, abs: absForm, mk: mkForm })[b.dataset.a](DAY.list[+b.dataset.i]));
}
const head = (l, t) => `<p><button class="btn" id="bk">‹ 목록</button></p><div class="card"><h1>${esc(l.name)} ${t}</h1><div class="m">${label(DAY.day)} ${esc(l.time)} · ${l.min}분</div>`;
const back = () => { render(); window.scrollTo(0, 0); };

// ===== 출석·일지 =====
function logForm(l) {
  const g = l.log || {};
  $("#main").innerHTML = head(l, "레슨일지") +
    `<label>곡·교재${!g.piece && l.lastPiece ? ' <span class="m">(지난번 그대로)</span>' : ""}<input id="piece" value="${esc(g.piece || l.lastPiece)}"></label>
    <label>오늘 한 것 <span class="m">(무엇을, 어떻게)</span><textarea id="today" rows="3" placeholder="• 사단조 3악장: 포지션 이동 음정, 메트로놈 60으로 4마디씩&#10;• 컨트리댄스: 활 힘 빼고 가볍게">${esc(g.today)}</textarea></label>
    <label>숙제 <span class="m">(선택)</span><input id="hw" value="${esc(g.homework)}" placeholder="원장님이 내주시면 비워 두세요"></label>
    <div class="chips"><button type="button" id="cb" class="${g.new_book ? "on" : ""}">📕 새 교재</button><button type="button" id="cv" class="${g.video_song ? "on" : ""}">🎥 촬영함</button><button type="button" id="ct" class="${g.talk ? "on" : ""}">💬 원장님 상담 요청</button></div>
    <div id="xb"><label>📕 어떤 교재를 줬나요?<input id="book" value="${esc(g.new_book)}" placeholder="예) 스즈키 바이올린 2권"></label></div>
    <div id="xv"><label>🎥 어떤 곡을 찍었나요?<input id="vsong" value="${esc(g.video_song)}" placeholder="예) 스즈키 2권 가보트"></label></div>
    <div id="xt"><label>원장님께 전할 말<input id="talk" value="${esc(g.talk)}" placeholder="예) 연습을 거의 안 해요"></label></div>
    ${l.open.length && !l.regular ? `<label class="ck"><input type="checkbox" id="mkc" checked> 🔁 <b>보강으로 기록</b> · ${label(l.open[0].event_date)} 결석분 ${l.min}분</label>` : ""}
    <p style="margin-top:14px"><button class="btn pri" id="save" style="width:100%">저장</button></p><p class="m">🎥 촬영한 영상은 원장님께 보내 주세요.</p></div>`;
  $("#bk").onclick = back;
  bulletize($("#today"), () => $("#piece").value);
  [["#cb", "#xb"], ["#cv", "#xv"], ["#ct", "#xt"]].forEach(([b, x]) => {
    const show = () => $(x).style.display = $(b).classList.contains("on") ? "block" : "none";
    $(b).onclick = () => { $(b).classList.toggle("on"); show(); }; show();
  });
  $("#save").onclick = async e => {
    const on = id => $(id).classList.contains("on");
    const row = { lesson_date: DAY.day, start_time: l.time || null, student_id: l.sid, teacher_id: ME.role === "teacher" ? ME.id : TEACHER_FILTER,
      piece: $("#piece").value.trim() || null, today: $("#today").value.trim() || null, homework: $("#hw").value.trim() || null,
      new_book: on("#cb") ? $("#book").value.trim() : null, video_song: on("#cv") ? $("#vsong").value.trim() : null,
      talk: on("#ct") ? ($("#talk").value.trim() || "연락 부탁") : null, source_kind: "app" };
    if (!row.piece && !row.today) return toast("곡이나 오늘 한 것을 적어 주세요");
    if (on("#cb") && !row.new_book) return toast("어떤 교재를 줬는지 적어 주세요");
    if (on("#cv") && !row.video_song) return toast("어떤 곡을 찍었는지 적어 주세요");
    e.target.disabled = true;
    try {
      if (l.log) await q(db.from("lesson_logs").update(row).eq("id", l.log.id));
      else await q(db.from("lesson_logs").insert(row));
      if ($("#mkc") && $("#mkc").checked) await addEvent(l, "보강", { linked_date: l.open[0].event_date, memo: "일지 저장 때 함께 기록" });
      toast("저장했어요"); load();
    } catch (err) { toast("저장 실패: " + err.message); e.target.disabled = false; }
  };
}
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

// ===== 결석 =====
function absForm(l) {
  $("#main").innerHTML = head(l, "결석") +
    `<label>① 결석 사유 <span class="m">(꼭 적어 주세요)</span><input id="memo" placeholder="예) 학교 행사, 감기, 가족 여행"></label>
    <p class="m" style="margin-top:12px">② 해당하는 것을 누르면 바로 기록돼요. (${l.min}분)</p>
    ${ABS.map((o, i) => `<button class="btn big1" data-k="${i}"><b>${o[1]}</b><span class="m"> · ${o[2]}</span></button>`).join("")}
    <p class="m">수업 24시간 전 연락 = 미리 연락 · 수업 당일 연락 = 당일 취소</p></div>`;
  $("#bk").onclick = back;
  document.querySelectorAll("[data-k]").forEach(b => b.onclick = async () => {
    const memo = $("#memo").value.trim();
    if (!memo) { toast("결석 사유를 먼저 적어 주세요"); return $("#memo").focus(); }
    document.querySelectorAll("[data-k]").forEach(x => x.disabled = true);
    try { await addEvent(l, ABS[+b.dataset.k][0], { memo }); toast("결석 기록 완료"); load(); }
    catch (err) { toast("저장 실패: " + err.message); document.querySelectorAll("[data-k]").forEach(x => x.disabled = false); }
  });
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
