"use strict";
// 상담 (원장·실장 전용) — 시트 상담 탭과 같은 칸: 문의일·이름·타겟·과목·유입경로·상태·등록일·후속 연락일·메모
const C_STATUS = ["문의", "상담", "체험", "보류", "등록", "미등록"];   // 대시보드 설정 탭 '상담 상태'와 같게
const C_SOURCE = ["블로그", "플레이스", "검색(일반)", "인스타그램", "유튜브", "당근", "간판", "지인 추천", "기타"];   // '무엇을 보고 왔나' 기준(원장 결정 2026-10-20) · 검색창(네이버·다음·AI)은 메모에
const C_TARGET = ["미취학", "초등 저학년", "초등 고학년", "중학생", "고등학생", "성인"];
let CF = "진행 중";

function consultView() {
  const d = O.data, today = ymd(new Date());
  const done = c => /^(등록|미등록)$/.test(c.status || "") || /등록 완료|종료/.test(c.status || "");
  const list = d.consults.filter(c => CF === "전체" ? true : CF === "진행 중" ? !done(c) : done(c));
  const year = d.consults.filter(c => (c.asked_on || "") >= today.slice(0, 4));
  const reg = year.filter(c => c.status === "등록").length;
  const src = {}; year.forEach(c => { const k = c.source || "미입력"; src[k] = (src[k] || 0) + 1; });
  $("#main").innerHTML = `<div class="nav"><h1>상담 CRM</h1><button class="btn pri" id="cnew">+ 새 상담</button></div>
    <div class="kpis">${kpi("올해 상담", year.length + "건", "")}${kpi("등록", reg + "건", year.length ? Math.round(reg / year.length * 100) + "% 전환" : "")}
      ${kpi("후속 연락", d.consults.filter(c => c.follow_on && c.follow_on <= today && !done(c)).length + "건", "오늘까지", "red")}
      ${kpi("유입경로", Object.keys(src).length + "종", Object.entries(src).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0] + " " + x[1]).join(" · "))}</div>
    <div class="chips">${["진행 중", "완료", "전체"].map(v => `<button class="${CF === v ? "on" : ""}" data-cf="${v}">${v}</button>`).join("")}</div><p></p>
    ${list.map((c, i) => monthHead(list, i) + `<div class="card clickable" data-ci="${d.consults.indexOf(c)}"><div class="top"><span><b>${esc(c.name)}</b> <span class="m">${esc([c.target, c.subject, c.source].filter(Boolean).join(" · "))}</span></span>
      <span class="tag ${c.status === "등록" ? "ok" : c.follow_on && c.follow_on <= today && !done(c) ? "red" : ""}">${esc(c.status || "")}${c.follow_on && !done(c) ? " · 연락 " + c.follow_on.slice(5).replace("-", "/") : ""}</span></div>
      <div class="m">${esc((c.asked_on || "").slice(5).replace("-", "/"))} 문의</div>${timeline(c.memo)}</div>`).join("") || '<div class="card m">없어요</div>'}`;
  document.querySelectorAll("[data-cf]").forEach(b => b.onclick = () => { CF = b.dataset.cf; consultView(); });
  document.querySelectorAll("[data-ci]").forEach(c => c.onclick = () => consultForm(d.consults[+c.dataset.ci]));
  $("#cnew").onclick = () => consultForm(null);
}
// 달이 바뀌는 곳에 '2026년 10월 · 상담 n · 등록 n · 전환 %' 머리줄
function monthHead(list, i) {
  const m = (list[i].asked_on || "").slice(0, 7); if (i && (list[i - 1].asked_on || "").slice(0, 7) === m) return "";
  const a = list.filter(c => (c.asked_on || "").startsWith(m)), r = a.filter(c => c.status === "등록").length;
  return `<h2 class="sec2" style="border-bottom:2px solid var(--gold);padding-bottom:4px">${m ? +m.slice(0, 4) + "년 " + +m.slice(5) + "월" : "날짜 없음"} <span class="m" style="font-weight:400">· 상담 ${a.length} · 등록 ${r} · 전환 ${a.length ? Math.round(r / a.length * 100) : 0}%</span></h2>`;
}
// 메모의 '[10/19 19:30] 노쇼: …' 진행 기록을 시간 줄로
function timeline(memo) {
  if (!memo) return "";
  return `<ul style="list-style:none;margin:6px 0 0;padding-left:10px;border-left:2px solid var(--line);font-size:13px;color:var(--ink2)">${String(memo).split(" · ").slice(0, 8).map(x => { const t = x.match(/^\[([^\]]+)\]\s*(.*)$/); return t ? `<li><b style="color:var(--gold);display:inline-block;min-width:78px">${esc(t[1])}</b>${esc(t[2])}</li>` : `<li>${esc(x)}</li>`; }).join("")}</ul>`;
}
function consultForm(c) {
  const v = c || { asked_on: ymd(new Date()), status: "문의" };
  const sel = (id, opts, val) => `<select id="${id}"><option value=""></option>${opts.map(o => `<option ${o === val ? "selected" : ""}>${o}</option>`).join("")}${val && !opts.includes(val) ? `<option selected>${esc(val)}</option>` : ""}</select>`;
  $("#main").innerHTML = `<p><button class="btn" id="bk">‹ 상담</button></p><div class="card"><h1>${c ? esc(c.name) : "새 상담"}</h1>
    <div class="row2"><label style="flex:1">문의일<input id="f1" type="date" value="${esc(v.asked_on)}"></label><label style="flex:1">이름<input id="f2" value="${esc(v.name)}"></label></div>
    <div class="row2"><label style="flex:1">대상${sel("f3", C_TARGET, v.target)}</label><label style="flex:1">과목${sel("f4", INST_ORDER, v.subject)}</label></div>
    <label>유입경로${sel("f5", C_SOURCE, v.source)}</label>
    <div class="row2"><label style="flex:1">상태${sel("f6", C_STATUS, v.status)}</label><label style="flex:1">후속 연락일<input id="f7" type="date" value="${esc(v.follow_on || "")}"></label></div>
    <label>등록일<input id="f8" type="date" value="${esc(v.registered_on || "")}"></label>
    <label>메모 <span class="m">(상담 내용 · 전화 기록 붙여넣기)</span><textarea id="f9" rows="8">${esc(v.memo || "")}</textarea></label>
    <p style="margin-top:12px"><button class="btn pri" id="fs" style="width:100%">저장</button></p>
    ${c && c.source_kind === "sheet" ? '<p class="m">시트에서 온 상담이에요. 전환 전까지는 여기서 고쳐도 시트 내용으로 다시 덮여요. 기존 앱(시트)에서 고쳐 주세요.</p>' : ""}</div>`;
  $("#bk").onclick = () => consultView();
  $("#fs").onclick = async e => {
    const row = { asked_on: $("#f1").value || null, name: $("#f2").value.trim(), target: $("#f3").value || null, subject: $("#f4").value || null,
      source: $("#f5").value || null, status: $("#f6").value || null, follow_on: $("#f7").value || null, registered_on: $("#f8").value || null, memo: $("#f9").value.trim() || null };
    if (!row.name) return toast("이름을 적어 주세요");
    e.target.disabled = true;
    const r = c && c.id ? await db.from("consults").update(row).eq("id", c.id) : await db.from("consults").insert({ ...row, source_kind: "app" });
    if (r.error) { e.target.disabled = false; return toast("저장 실패: " + r.error.message); }
    await loadAll(true); toast("저장했어요"); consultView();
  };
}

// 오늘 일지 현황: 오늘 시간표에 있는 개인 수업 중 일지·결석 기록이 없는 학생 (선생님별)
function todayLogsCard() {
  const d = O.data, today = ymd(new Date());
  const sids = [...new Set((d.todayCells || []).filter(c => !c.is_group && c.student_id).map(c => c.student_id))];
  if (!sids.length) return "";
  const byT = {};
  sids.forEach(sid => {
    const s = d.students.find(x => x.id === sid); if (!s) return;
    const cover = d.events.find(e => e.student_id === sid && e.event_date === today && e.kind.startsWith("대강"));
    const t = tname(cover ? cover.teacher_id : teacherOn(s, today)) || "?";
    const done = d.logs.some(l => l.student_id === sid && l.lesson_date === today) || d.events.some(e => e.student_id === sid && e.event_date === today && e.kind.startsWith("결석"));
    byT[t] = byT[t] || { done: 0, miss: [] };
    if (done) byT[t].done++; else byT[t].miss.push(s.name);
  });
  const lines = Object.entries(byT).map(([t, v]) => `<div>${esc(t)} · 완료 ${v.done}${v.miss.length ? ` · <span style="color:var(--red)">아직 ${v.miss.map(esc).join(", ")}</span>` : " ✔"}</div>`).join("");
  return `<div class="card"><b>오늘 일지 현황</b> <span class="m">(1시간마다 시트에서 갱신)</span><div class="m" style="margin-top:4px">${lines}</div></div>`;
}
// 진도 정체: 같은 곡이 6주 넘게 이어지는 학생
const STAG_DAYS = 42;
function stagnationCard() {
  const d = O.data, by = {};
  (d.logs || []).forEach(l => { if (l.student_id && l.piece) (by[l.student_id] = by[l.student_id] || []).push(l); });
  const norm = p => String(p).replace(/\s+/g, "").toLowerCase();
  const hits = [];
  Object.entries(by).forEach(([sid, ls]) => {
    const p = norm(ls[0].piece); let first = ls[0].lesson_date;
    for (const l of ls) { if (norm(l.piece) !== p) break; first = l.lesson_date; }
    const days = Math.round((new Date(ls[0].lesson_date) - new Date(first)) / 864e5);
    if (days >= STAG_DAYS) { const s = d.students.find(x => x.id === sid); if (s) hits.push(`${esc(s.name)} · ${esc(ls[0].piece)} ${Math.floor(days / 7)}주째`); }
  });
  return hits.length ? `<div class="card"><b>진도 정체 ${hits.length}명</b> <span class="m">(같은 곡 ${STAG_DAYS / 7}주 이상)</span><div class="m">${hits.join("<br>")}</div></div>` : "";
}
