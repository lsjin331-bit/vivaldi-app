"use strict";
// 강사 급여 (원장·실장 전용) — 확정 규칙(2026-10 원장 확인)
// · 개인 수업만 계산(그룹·듀오는 원장 진행이라 제외) · 30분 단가 × 수업 분/30 · 이혜숙 월 고정 · 원장 제외
// · 결석(사전·예외·강사 사정)은 0 · 당일 취소는 50% · 대강은 실제 수업한 선생님에게 · 보강은 그날 칸으로 계산
// · 3.3%: 소득세 3%·지방소득세 0.3% 각각 10원 미만 버림 · 실지급(설정 탭 기록)과 비교
// 전환 기간 자료: 시트 시간표 칸(timetable_cells) + 결석·보강·대강 기록(attendance_events)
const floor10 = n => Math.floor(n / 10) * 10;

async function payrollView() {
  const d = O.data, m = O.month, ms = m + "-01", me = monthEnd(ms);
  const [cells, ev, actual, tax] = await Promise.all([
    q(db.from("timetable_cells").select("*").gte("lesson_date", ms).lte("lesson_date", me)),
    q(db.from("attendance_events").select("*").gte("event_date", ms).lte("event_date", me)),
    q(db.from("payroll_actual").select("*").eq("month", ms)),
    q(db.from("tax_filings").select("*").order("paid_month", { ascending: false }))
  ]);
  const S = Object.fromEntries(d.students.map(s => [s.id, s]));
  // 학생·날짜별 수업 분(시트 표기: '(40')' 같은 명시 분이 있으면 그 값, 없으면 칸 수 × 30)
  const byDay = {};
  cells.filter(c => !c.is_group && c.student_id).forEach(c => {
    const k = c.student_id + "|" + c.lesson_date;
    const x = byDay[k] = byDay[k] || { sid: c.student_id, day: c.lesson_date, n: 0, ex: 0 };
    x.n++; if (c.minutes !== 30) x.ex = Math.max(x.ex, c.minutes);
  });
  const T = {}; // 선생님별 집계
  const add = (tid, key, mins, line) => {
    if (!tid) return;
    const t = T[tid] = T[tid] || { tid, normal: 0, half: 0, cover: 0, lines: [] };
    t[key] += mins; if (line) t.lines.push(line);
  };
  Object.values(byDay).forEach(x => {
    const s = S[x.sid]; if (!s) return;
    const mins = x.ex || x.n * 30;
    const evs = ev.filter(e => e.student_id === x.sid && e.event_date === x.day && e.form === "개인");
    if (evs.some(e => e.kind.startsWith("결석") && !e.kind.startsWith("결석 · 당일 취소"))) return;   // 이름이 남아 있어도 결석이면 0
    const cover = evs.find(e => e.kind.startsWith("대강") && e.teacher_id);
    if (cover) add(cover.teacher_id, "cover", mins, `${label(x.day)} ${s.name} ${mins}분 (대강)`);
    else add(teacherOn(s, x.day), "normal", mins);
  });
  // 당일 취소(보강 없음): 칸이 지워져 있어도 50% 지급
  ev.filter(e => e.form === "개인" && e.kind.startsWith("결석 · 당일 취소")).forEach(e => {
    const s = S[e.student_id]; if (!s) return;
    const mins = e.minutes || 30;
    add(e.teacher_id || teacherOn(s, e.event_date), "half", mins / 2, `${label(e.event_date)} ${s.name} 당일 취소 ${mins}분 → 50%`);
  });

  const staff = d.staff.filter(s => s.role !== "owner" && s.pay_kind !== "none");
  const rows = staff.map(st => {
    const t = T[st.id] || { normal: 0, half: 0, cover: 0, lines: [] };
    const mins = t.normal + t.cover + t.half;
    const pay = st.pay_kind === "fixed" ? st.pay_amount : Math.round(mins / 30 * st.pay_amount);
    const act = actual.find(a => a.staff_id === st.id);
    const it = floor10(pay * 0.03), lt = floor10(pay * 0.003);
    return { st, t, mins, pay, act, it, lt };
  });
  const sum = k => rows.reduce((a, r) => a + (typeof k === "function" ? k(r) : r[k]), 0);
  const today = ymd(new Date());
  $("#main").innerHTML = monthBar("강사 급여") +
    `<p class="m">${m} 시간표 기준 예상 · 개인 수업만(그룹·듀오 제외) · 당일 취소 50% · 대강은 실제 수업한 선생님 · 실지급은 설정 탭 기록</p>
    <div class="kpis">${kpi("예상 합계(세전)", won(sum("pay")) + "원", "")}${kpi("3.3%", won(sum(r => r.it + r.lt)) + "원", "소득세 " + won(sum("it")) + " · 지방 " + won(sum("lt")))}
      ${kpi("실지급 합계", won(sum(r => r.act ? r.act.amount : 0)) + "원", rows.filter(r => r.act).length + "/" + rows.length + "명 입력")}
      ${kpi("이체할 금액", won(sum("pay") - sum(r => r.it + r.lt)) + "원", "예상 기준")}</div>
    ${me >= today ? '<div class="note">이번 달은 아직 끝나지 않아서, 남은 날짜는 시간표에 적힌 수업까지 포함한 예상이에요.</div>' : ""}
    ${rows.map(r => {
      const diff = r.act ? r.act.amount - r.pay : null;
      return `<div class="card"><div class="top"><span><b>${esc(r.st.name)}</b> <span class="m">${r.st.pay_kind === "fixed" ? "월 고정 " + won(r.st.pay_amount) : "30분 " + won(r.st.pay_amount)}원</span></span>
        <b>${won(r.pay)}원</b></div>
        <div class="m">${r.st.pay_kind === "fixed" ? "월 고정급" : `수업 ${r.t.normal}분 · 대강 ${r.t.cover}분 · 당일 취소 50% ${r.t.half}분 = ${r.mins}분`}</div>
        <div class="m">3.3% ${won(r.it + r.lt)}원 (소득세 ${won(r.it)} · 지방 ${won(r.lt)}) → 이체 ${won(r.pay - r.it - r.lt)}원</div>
        ${r.act ? `<div class="m">실지급 ${won(r.act.amount)}원 · <b style="color:${diff === 0 ? "var(--ok)" : "var(--red)"}">${diff === 0 ? "일치 ✓" : "차이 " + (diff > 0 ? "+" : "") + won(diff) + "원"}</b> ${esc(r.act.memo || "")}</div>` : ""}
        ${r.t.lines.length ? `<details><summary class="m">대강·당일 취소 ${r.t.lines.length}건</summary><div class="m">${r.t.lines.map(esc).join("<br>")}</div></details>` : ""}</div>`;
    }).join("")}
    <h2 class="sec2">원천세 신고 기록</h2>
    <div class="card">${tax.slice(0, 8).map(x => `<div>${x.paid_month.slice(0, 7)} 이체분 · ${esc(x.kind)} · ${esc(x.memo || "")}</div>`).join("") || '<div class="m">없음</div>'}
      <div class="m" style="margin-top:6px">기한: 원천세·지방소득세 다음 달 10일 · 간이지급명세서 다음 달 말일</div></div>`;
  bindMonth();
}
