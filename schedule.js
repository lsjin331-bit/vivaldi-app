"use strict";
// 수업 · 시간표 (ARCO '수업 정보') — 정규 수업을 요일 × 시간으로 한 장에. 선생님·악기 거르기, 선생님별 학생 수·주간 시간
// 같이 쓰는 기간에는 정규 시간·담당 바꾸기를 기존 운영실 앱(학생 화면)에서 하고, 여기서는 바로 확인만.
let SC = { t: "전체" };
const DAYS7 = ["월", "화", "수", "목", "금", "토"];

function scheduleView() {
  const d = O.data, m = thisMonth();
  const S = Object.fromEntries(d.students.map(s => [s.id, s]));
  const slots = d.slots.filter(x => { const s = S[x.student_id]; return s && enrolled(s, m) && (!x.valid_to || x.valid_to >= ymd(new Date())); });
  const tOf = x => x.kind === "개인" ? x.teacher_id : (d.staff.find(t => t.role === "owner") || {}).id;
  const teachers = [...new Set(slots.map(tOf))].map(id => d.T[id]).filter(Boolean).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const shown = slots.filter(x => SC.t === "전체" || tname(tOf(x)) === SC.t);
  // 그룹·듀오는 같은 요일·시간·방을 한 칸으로
  const cells = {};
  shown.forEach(x => {
    const k = x.weekday + "|" + hm(x.start_time) + "|" + (x.kind === "개인" ? x.student_id : x.kind + x.room);
    const c = cells[k] = cells[k] || { wd: x.weekday, time: hm(x.start_time), min: x.minutes, room: x.room, kind: x.kind, t: tOf(x), names: [] };
    c.names.push(S[x.student_id].name);
  });
  const sum = teachers.map(t => { const mine = slots.filter(x => tOf(x) === t.id);
    return { t, n: new Set(mine.map(x => x.student_id)).size, min: mine.reduce((a, x) => a + (x.kind === "개인" ? x.minutes : 0), 0) }; });
  const col = id => COLOR[(d.T[id] || {}).instrument] || "var(--blue)";
  $("#main").innerHTML = `<div class="nav"><h1>수업 · 시간표</h1><span class="m">정규 수업 기준 · 이번 주 보강·결석은 출결 관리에서</span></div>
    <div class="kpis">${kpi("정규 수업", Object.keys(cells).length + "개", "개인 " + shown.filter(x => x.kind === "개인").length + " · 그룹·듀오 " + new Set(shown.filter(x => x.kind !== "개인").map(x => x.weekday + x.start_time)).size)}
      ${kpi("선생님", teachers.length + "명", "")}${kpi("주간 개인 레슨", Math.round(sum.reduce((a, x) => a + x.min, 0) / 60) + "시간", "강사료 기준 시간")}${kpi("강의실", "4개", "돌체 · 에스프레시보 · 브릴란테 · 앙상블")}</div>
    <div class="chips">${["전체", ...teachers.map(t => t.name)].map(v => `<button class="${SC.t === v ? "on" : ""}" data-sc="${esc(v)}">${esc(v)}</button>`).join("")}</div><p></p>
    <div class="card" style="overflow:auto"><div class="scg">${DAYS7.map((dn, w) => `<div class="scd"><div class="sch">${dn}</div>${Object.values(cells).filter(c => c.wd === w).sort((a, b) => a.time < b.time ? -1 : 1)
      .map(c => `<div class="scc" style="border-left-color:${col(c.t)}"><b>${c.time}</b> <span class="m">${c.min}분 · ${esc(c.room || "")}</span><div>${c.kind === "개인" ? esc(c.names[0]) : `<span class="tag">${c.kind}</span> ${c.names.map(esc).join(" ")}`}</div>${SC.t === "전체" ? `<small class="m">${esc(tname(c.t))}</small>` : ""}</div>`).join("") || '<div class="m">-</div>'}</div>`).join("")}</div></div>
    <h2 class="sec2">선생님별</h2><div class="card"><table class="tbl"><tr><th>선생님</th><th>학생</th><th>주간 개인 레슨</th></tr>${sum.map(x => `<tr><td><b>${esc(x.t.name)}</b> <span class="m">${esc(x.t.instrument || "")}</span></td><td>${x.n}명</td><td>${Math.floor(x.min / 60)}시간 ${x.min % 60 ? (x.min % 60) + "분" : ""}</td></tr>`).join("")}</table>
      <p class="m" style="margin-top:8px">정규 요일·시간이나 담당이 바뀌면 → 지금은 기존 운영실 앱 › 학생 › [정규 수업 시간] · [담당 바꾸기]에서 고쳐 주세요. 한 시간 안에 여기 반영돼요.</p></div>`;
  document.querySelectorAll("[data-sc]").forEach(b => b.onclick = () => { SC.t = b.dataset.sc; scheduleView(); });
}
