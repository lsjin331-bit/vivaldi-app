"use strict";
// 출결표 — 원장 수기 출석부 표시법 그대로 (2026-10-13 원장 확정 디자인)
// 정규 = 회차 숫자(금색) · 그룹 = ①②(초록) · 당일 취소 = 빨간 ✕(회차 소진) · 사전·예외·강사 결석 = 회색 '결'
// 지난달분 보강 = '9월' · 휴강일 = 빗금 · 일요일 = 좁은 회색 · 오른쪽 개인 | 그룹 n/목표(채우면 ✔)
// 전환 기간 자료: 시트 시간표 칸(timetable_cells) + 결석·보강 기록(attendance_events)
const CIRC = n => n >= 1 && n <= 20 ? String.fromCharCode(0x245F + n) : "(" + n + ")";
const fmtN = n => Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString();
const ABSENT_MK = ["결석 · 사전 연락", "결석 · 당일 예외", "결석 · 강사 사정·휴일", "결석 · 기타"];

async function attendView() {
  const d = O.data, m = O.month, ms = m + "-01", me = monthEnd(ms), nd = Number(me.slice(8));
  const pmS = addDays(ms, -1).slice(0, 7) + "-01";
  const prevNotes = Object.fromEntries((await q(db.from("month_adjust").select("student_id,memo").eq("month", pmS))).filter(x => x.memo).map(x => [x.student_id, x.memo]));
  const [cells, ev0, adj, hol] = await Promise.all([
    q(monthCells(ms, me)),
    q(db.from("attendance_events").select("*").gte("event_date", ms).lte("event_date", me)),
    q(db.from("month_adjust").select("*").eq("month", ms)),
    q(db.from("holidays").select("day").gte("day", ms).lte("day", me))
  ]);
  // 달 밖 날짜인데 이 달 몫인 칸(8/31 = 9월 1회차, 10/2 = 9월 4회차) → 앞뒤에 칸을 더 붙인다
  const outDays = [...new Set(cells.filter(c => (c.lesson_date < ms || c.lesson_date > me) && cellMonth(c) === ms).map(c => c.lesson_date))].sort();
  const ev = outDays.length ? ev0.concat(await q(db.from("attendance_events").select("*").in("event_date", outDays))) : ev0;
  const holidays = new Set(hol.map(h => h.day));
  const A = Object.fromEntries(adj.map(a => [a.student_id, a]));
  const TODAY = ymd(new Date());
  const studs = d.students.filter(s => enrolled(s, m) || cells.some(c => c.student_id === s.id));
  // 그룹 칸의 짧은 이름(예: '예섬') → 학생 (이름 끝 두 글자가 유일할 때만)
  const short = {};
  studs.forEach(s => { const k = s.name.slice(-2); short[k] = short[k] === undefined ? s.id : null; });
  const days = [...outDays.filter(x => x < ms), ...Array.from({ length: nd }, (_, i) => ms.slice(0, 8) + String(i + 1).padStart(2, "0")), ...outDays.filter(x => x > me)];

  const rows = studs.map(s => {
    const slot = d.slots.find(x => x.student_id === s.id && x.kind === "개인");
    const per = slot ? slot.minutes : Number(((s.lesson_type || "").match(/개인\s*(\d+)\s*분/) || [])[1]) || 30;
    const a = A[s.id] || {};
    const memoN = Number(((a.memo || "").match(/월\s*(\d+)회/) || [])[1]);
    const pTarget = a.regular_count || memoN || (/주\s*2회|8회/.test(s.lesson_type || "") ? 8 : 4);
    const gTarget = /그룹|듀오/.test(s.lesson_type || "") || d.slots.some(x => x.student_id === s.id && x.kind !== "개인") ? 4 : 0;
    let p = 0, g = 0, carryUsed = 0, pp = 0, pg = 0;   // pp·pg = 오늘 이후 예정
    const marks = days.map(day => {
      const out = [], future = day > TODAY;
      const allCells = cells.filter(c => c.lesson_date === day && c.student_id === s.id);
      const myCells = allCells.filter(c => cellMonth(c) === ms);   // 다른 달 몫 칸은 '9월'·'10월'로만 표시
      allCells.filter(c => cellMonth(c) !== ms).forEach(c => out.push({ t: Number(cellMonth(c).slice(5, 7)) + "월", c: "prev" }));
      const evs = ev.filter(e => e.student_id === s.id && e.event_date === day);
      const absP = evs.find(e => e.form === "개인" && e.kind.startsWith("결석"));
      const mkPrev = evs.filter(e => e.kind === "보강" && e.form === "개인" && e.for_month && e.for_month < ms);
      if (future && myCells.length && !absP) { const ex = myCells.filter(c => c.minutes !== 30).map(c => c.minutes); pp += (ex.length ? Math.max(...ex) : myCells.length * 30) / per; out.push({ t: "·", c: "plan" }); }
      else if (myCells.length && !absP) {
        const ex = myCells.filter(c => c.minutes !== 30).map(c => c.minutes);
        let mins = ex.length ? Math.max(...ex) : myCells.length * 30;
        mkPrev.forEach(e => { const cm = Math.min(mins, e.minutes || per); mins -= cm; carryUsed += cm; out.push({ t: Number(e.for_month.slice(5, 7)) + "월", c: "prev" }); });
        if (mins > 0) { p += mins / per; out.push({ t: fmtN(p), c: evs.some(e => e.kind.startsWith("대강")) ? "sub" : evs.some(e => e.kind === "보강") ? "mk" : "p" }); }
      } else if (absP) {
        if (absP.kind.startsWith("결석 · 당일 취소")) { p += (absP.minutes || per) / per; out.push({ t: "✕", c: "x" }); }
        else out.push({ t: "결", c: "a" });
      }
      // 그룹·듀오
      const gc = cells.filter(c => c.lesson_date === day && c.is_group && (c.group_names || "").split(/\s+/).some(n => n === s.name || short[n] === s.id));
      const absG = evs.find(e => e.form !== "개인" && e.kind.startsWith("결석"));
      const mkPrevG = evs.find(e => e.kind === "보강" && e.form !== "개인" && e.for_month && e.for_month < ms);
      if (gc.length && !absG && mkPrevG) out.push({ t: Number(mkPrevG.for_month.slice(5, 7)) + "월", c: "prev" });   // 지난달 그룹 결석분 보충
      else if (gc.length && !absG && future) { pg += 1; out.push({ t: "·", c: "plan" }); }
      else if (gc.length && !absG) { g += 1; out.push({ t: CIRC(g), c: "g" }); }
      else if (absG) out.push({ t: "결", c: "a" });
      return out;
    });
    return { s, marks, p, g, pp, pg, pTarget, gTarget, carry: a.carry_minutes || 0, carryUsed, per, teacher: tname(s.teacher_id) };
  });
  const gkey = r => r.teacher === "원장" ? "0|원장 수업" : "1|" + String(INST_ORDER.indexOf(r.s.instrument)).padStart(2, "0") + "|" + r.s.instrument + " · " + r.teacher;
  rows.sort((a, b) => gkey(a) < gkey(b) ? -1 : gkey(a) > gkey(b) ? 1 : (a.s.name < b.s.name ? -1 : 1));

  const head = days.map(day => {
    const dt = new Date(day + "T00:00:00"), sun = dt.getDay() === 0, out = day < ms || day > me;
    return `<th class="${sun ? "sun" : ""}${holidays.has(day) ? " hol" : ""}${out ? " out" : ""}">${out ? Number(day.slice(5, 7)) + "/" : ""}${Number(day.slice(8))}<br><small>${"일월화수목금토"[dt.getDay()]}</small></th>`;
  }).join("");
  const sum = (n, t, f) => !t ? `<td class="sm na">—</td>` : `<td class="sm ${n >= t - 1e-9 ? "full" : n + f >= t - 1e-9 ? "ontrack" : "short"}">${fmtN(n)}/${t}${n >= t - 1e-9 ? " ✔" : ""}${f ? `<small>+${fmtN(f)} 예정</small>` : ""}</td>`;
  let body = "", last = "";
  rows.forEach(r => {
    const gk = gkey(r).split("|").pop();
    if (gk !== last) { body += `<tr class="grp"><td colspan="${nd + 3}">${esc(gk)}</td></tr>`; last = gk; }
    const carryTxt = r.carry ? `<small class="cy">${Number(ms.slice(5, 7)) - 1 || 12}월분 ${r.carryUsed}/${r.carry}분</small>` : "";
    const pn = prevNotes[r.s.id], pr = pn ? ((pn.match(/잔여:\s*([^|]*)/) || [])[1] || "넘어온 수업 없음").trim() : "";
    body += `<tr><td class="nm" ${ibar(r.s.instrument)}><b>${esc(r.s.name)}</b>${carryTxt}${pn ? `<small class="cy" title="${esc(pn)}" style="color:var(--blue)">${+pmS.slice(5, 7)}월→ ${esc(pr)}</small>` : ""}</td>` +
      r.marks.map((mk, i) => { const day = days[i], sun = new Date(day + "T00:00:00").getDay() === 0;
        return `<td class="${sun ? "sun" : ""}${holidays.has(day) ? " hol" : ""}${day < ms || day > me ? " out" : ""}">${mk.map(x => `<span class="${x.c}">${x.t}</span>`).join("")}</td>`; }).join("") +
      sum(r.p, r.pTarget, r.pp) + sum(r.g, r.gTarget, r.pg) + "</tr>";
  });
  $("#main").innerHTML = monthBar("출결표") +
    `<p class="m">금색 숫자 개인 회차 · 초록 ①② 그룹 · <span class="x">✕</span> 당일 취소 · <span class="a">결</span> 결석(보강 필요) · 파란 숫자 보강 · 청록 대강 · '9월' 다른 달 몫(세지 않음) · 빗금 휴강일 · 맨 앞·뒤 '8/31' 같은 칸 = 날짜는 달 밖이지만 이 달 회차 · 회색 · 앞으로 예정(아직 안 셈) · 오른쪽: 한 것/목표 (+예정)</p>
     <div class="attwrap"><table class="att"><thead><tr><th class="nm">학생</th>${head}<th class="sm">개인</th><th class="sm">그룹</th></tr></thead><tbody>${body}</tbody></table></div>`;
  bindMonth();
}
