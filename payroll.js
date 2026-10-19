"use strict";
// 강사 급여 (원장·실장 전용) — 확정 규칙(2026-10 원장 확인)
// · 개인 수업만 계산(그룹·듀오는 원장 진행이라 제외) · 30분 단가 × 수업 분/30 · 이혜숙 월 고정 · 원장 제외
// · 결석(사전·예외·강사 사정)은 0 · 당일 취소는 50% · 대강은 실제 수업한 선생님에게 · 보강은 그날 칸으로 계산
// · 3.3%: 소득세 3%·지방소득세 0.3% 각각 10원 미만 버림 · 실지급(설정 탭 기록)과 비교
// 전환 기간 자료: 시트 시간표 칸(timetable_cells) + 결석·보강·대강 기록(attendance_events)
const floor10 = n => Math.floor(n / 10) * 10;

async function payrollView() {
  const d = O.data, m = O.month, ms = m + "-01", me = monthEnd(ms);
  const [cells0, ev0, actual, tax] = await Promise.all([
    q(monthCells(ms, me)),
    q(db.from("attendance_events").select("*").gte("event_date", ms).lte("event_date", me)),
    q(db.from("payroll_actual").select("*").eq("month", ms)),
    q(db.from("tax_filings").select("*").order("paid_month", { ascending: false }))
  ]);
  // 급여는 수업한 날짜 기준(9월 정산으로 확인: 8/31 수업은 8월 급여, 9/28 미리 한 10/5분은 9월 급여, 10/2 9월 4회차는 10월 급여)
  // 회차(출결표)만 귀속월(for_month)을 따른다
  // 예외: 원장 확인으로 급여 달이 다른 수업은 칸에 [급여 YYYY-MM] (예: 최현희 8/31 = 9월 급여, 9/28 = 10월 급여)
  const payMonth = c => { const m = (c.raw_text || "").match(/\[급여 (\d{4}-\d{2})\]/); return m ? m[1] + "-01" : c.lesson_date.slice(0, 7) + "-01"; };
  const cells = cells0.filter(c => payMonth(c) === ms);
  const outDays = [...new Set(cells.filter(c => c.lesson_date < ms || c.lesson_date > me).map(c => c.lesson_date))];
  const ev = outDays.length ? ev0.concat(await q(db.from("attendance_events").select("*").in("event_date", outDays))) : ev0;
  const S = Object.fromEntries(d.students.map(s => [s.id, s]));
  // 학생·날짜별 수업 분(시트 표기: '(40')' 같은 명시 분이 있으면 그 값, 없으면 칸 수 × 30)
  const byDay = {};
  cells.filter(c => !c.is_group && c.student_id).forEach(c => {
    const k = c.student_id + "|" + c.lesson_date;
    const x = byDay[k] = byDay[k] || { sid: c.student_id, day: c.lesson_date, n: 0, ex: 0, tid: c.teacher_id };
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
    else add(x.tid || teacherOn(s, x.day), "normal", mins);   // 보관 칸은 그날 실제 담당(9월 클라리넷 이수경 등)
  });
  // 당일 취소(보강 없음): 칸이 지워져 있어도 50% 지급
  ev.filter(e => e.form === "개인" && e.kind.startsWith("결석 · 당일 취소")).forEach(e => {
    const s = S[e.student_id]; if (!s) return;
    if (/급여 없음|미지급/.test(e.memo || "")) return;   // 원장 협의로 예외(예: 장지원 9/5 조윤정)
    const mins = e.minutes || 30;
    add(e.teacher_id || teacherOn(s, e.event_date), "half", mins / 2, `${label(e.event_date)} ${s.name} 당일 취소 ${mins}분 → 50%`);
  });

  // 지금 강사 + 그 달에 수업·실지급이 있었던 예전 강사(이수경 등: 강사표에 없어 계산 제외, 실지급만)
  // 체험 수업(분홍): 30분 단가대로 지급(9월 급여지급표 확인: 권입분·임예진·신수빈). 같은 날 시간표 칸이 있으면 그 칸으로 이미 셈
  ev.filter(e => e.kind === "체험" && e.form === "개인").forEach(e => {
    const s = S[e.student_id];   // 등록 전 체험생은 학생 없이 선생님만(이름은 메모 앞)
    if (s ? byDay[e.student_id + "|" + e.event_date] : !e.teacher_id) return;
    add(e.teacher_id || teacherOn(s, e.event_date), "normal", e.minutes || 30, `${label(e.event_date)} ${s ? s.name : (e.memo || "").split(" · ")[0]} 체험 ${e.minutes || 30}분`);
  });
  const staff = d.staff.filter(s => s.role !== "owner" && ((s.pay_kind !== "none" && s.active !== false) || T[s.id] || actual.some(a => a.staff_id === s.id)));
  const rows = staff.map(st => {
    const t = T[st.id] || { normal: 0, half: 0, cover: 0, lines: [] };
    const mins = t.normal + t.cover + t.half;
    const pay = st.pay_kind === "fixed" ? st.pay_amount : st.pay_kind === "none" ? 0 : Math.round(mins / 30 * st.pay_amount);
    // 같은 달 실지급이 여러 줄이면 합친다(예: 임동희 9월 1,015,000 + 10월 추가 10,000)
    const acts = actual.filter(a => a.staff_id === st.id);
    const act = acts.length ? { amount: acts.reduce((a, x) => a + x.amount, 0), memo: acts.map(x => x.memo).filter(Boolean).join(" / ") } : null;
    const it = floor10(pay * 0.03), lt = floor10(pay * 0.003);
    return { st, t, mins, pay, act, it, lt };
  });
  const sum = k => rows.reduce((a, r) => a + (typeof k === "function" ? k(r) : r[k]), 0);
  const today = ymd(new Date());
  // 보낼 돈: 비고에 '예정'이 있고 '이체 완료'가 없는 실지급 줄(전체 달) — 예: 임동희 9월분 10,000원 10월 이체 예정
  const pend = (await q(db.from("payroll_actual").select("*"))).filter(a => /예정/.test(a.memo || "") && !/이체 완료/.test(a.memo || ""));
  $("#main").innerHTML = monthBar("강사 급여") +
    `<p class="m">${m} 시간표 기준 예상 · 개인 수업만(그룹·듀오 제외) · 당일 취소 50% · 대강은 실제 수업한 선생님 · 실지급은 설정 탭 기록</p>
    <div class="kpis">${kpi("예상 합계(세전)", won(sum("pay")) + "원", "")}${kpi("3.3%", won(sum(r => r.it + r.lt)) + "원", "소득세 " + won(sum("it")) + " · 지방 " + won(sum("lt")))}
      ${kpi("실지급 합계", won(sum(r => r.act ? r.act.amount : 0)) + "원", rows.filter(r => r.act).length + "/" + rows.length + "명 입력")}
      ${kpi("이체할 금액", won(sum("pay") - sum(r => r.it + r.lt)) + "원", "예상 기준")}</div>
    ${me >= today ? '<div class="note">이번 달은 아직 끝나지 않아서, 남은 날짜는 시간표에 적힌 수업까지 포함한 예상이에요.</div>' : ""}
    ${rows.map(r => {
      const none = r.st.pay_kind === "none", diff = r.act && !none ? r.act.amount - r.pay : null;
      return `<div class="card"><div class="top"><span><b>${esc(r.st.name)}</b> <span class="m">${r.st.pay_kind === "fixed" ? "월 고정 " + won(r.st.pay_amount) + "원" : none ? "강사표에 없음 · 계산 제외" : "30분 " + won(r.st.pay_amount) + "원"}</span></span>
        <b>${won(r.pay)}원</b></div>
        <div class="m">${r.st.pay_kind === "fixed" ? "월 고정급" : none ? `수업 ${r.mins}분 (참고)` : `수업 ${r.t.normal}분 · 대강 ${r.t.cover}분 · 당일 취소 50% ${r.t.half}분 = ${r.mins}분`}</div>
        <div class="m">3.3% ${won(r.it + r.lt)}원 (소득세 ${won(r.it)} · 지방 ${won(r.lt)}) → 이체 ${won(r.pay - r.it - r.lt)}원</div>
        ${r.act ? `<div class="m">실지급 ${won(r.act.amount)}원${none ? "" : ` · <b style="color:${diff === 0 ? "var(--ok)" : "var(--red)"}">${diff === 0 ? "일치 ✓" : "차이 " + (diff > 0 ? "+" : "") + won(diff) + "원"}</b>`} ${esc(r.act.memo || "")}</div>` : ""}
        ${r.t.lines.length ? `<details><summary class="m">대강·당일 취소·체험 ${r.t.lines.length}건</summary><div class="m">${r.t.lines.map(esc).join("<br>")}</div></details>` : ""}</div>`;
    }).join("")}
    ${pend.length ? `<div class="card" style="border-left:4px solid var(--red)"><b>💸 아직 보낼 돈 ${pend.length}건</b>${pend.map(a => `<div>${esc(tname(a.staff_id))} ${won(a.amount)}원 <span class="m">${a.month.slice(0, 7)}분 · 이체 ${esc((a.paid_month || "").slice(0, 7) || "미정")} · ${esc(a.memo || "")}</span></div>`).join("")}</div>` : ""}
    <h2 class="sec2">원천세 신고 기록</h2>
    <div class="card">${tax.slice(0, 8).map(x => `<div>${x.paid_month.slice(0, 7)} 이체분 · ${esc(x.kind)} · ${esc(x.memo || "")}</div>`).join("") || '<div class="m">없음</div>'}
      <div class="m" style="margin-top:6px">기한: 원천세·지방소득세 다음 달 10일 · 간이지급명세서 다음 달 말일</div></div>`;
  bindMonth();
}
