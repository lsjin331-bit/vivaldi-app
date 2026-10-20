"use strict";
// 소통 · 알림 (원장·실장 전용) — ARCO '알림톡 · 발송 워크플로우' 구성: 왼쪽 발송 레시피 · 가운데 조건→초안→승인 · 오른쪽 카톡 미리보기 · 아래 발송 이력
// 지금은 초안 → 미리보기 → 복사(문자 앱) → '보냈어요' 기록. 카카오 채널·SOLAPI 연결 뒤 같은 자리에서 [발송].
// 연락처는 화면에 쓰지 않는다(연락처 표는 원장 전용, 발송 연동 때만 사용).
let NT = { r: "change", sel: 0 };
const ACADEMY = "비발디 관현악학원";
const PLACE = "\n\n📍위치 : 광덕1로 159 5층 비발디관현악학원\n📌주차 : 건물 내 지하 주차장 이용 시 최대 1시간 30분 지원해 드립니다.";
const RECIPES = [
  ["change", "내일 변동 수업 안내", "보강·휴강·시간 변경 하루 전", "선생님 기록표 + 시간표 칸"],
  ["unpaid", "수업료 미납 안내", "이번 달 1일이 지났는데 미납", "수납(잔액 차감 낼 돈)"],
  ["weekly", "주간 레슨 피드백", "이번 주 수업한 학생 · 주 1회", "레슨일지 곡 · 오늘 한 것"],
  ["book", "상담 예약 알림", "후속 연락일이 내일인 상담", "상담 CRM · 원장님 안내 문구"],
  ["follow", "상담 후속 연락", "상담 후 1 · 2 · 3일", "상담 기록"],
  ["newbie", "신규생 케어", "입학 2주 · 첫 달 · 대여 종료 전", "원생 명부 입학월"]
];
const FOLLOW_T = [
  c => `안녕하세요, ${ACADEMY} 원장 이한은입니다 🎻\n어제 ${c.name} ${c.subject || "악기"} 상담 와 주셔서 감사했어요.\n상담 때 이야기 나눈 내용을 바탕으로 가장 잘 맞는 수업 시간과 방식을 같이 찾아 드릴게요. 궁금한 점은 언제든 편하게 물어봐 주세요.`,
  c => `안녕하세요, ${ACADEMY}입니다.\n${c.subject || "악기"}를 처음 시작하실 때 가장 많이 걱정하시는 게 연습 시간과 악기 준비예요.\n처음에는 학원 악기로 시작해서 진도에 맞춰 천천히 준비하셔도 괜찮아요. 원하시는 요일·시간을 알려 주시면 자리를 먼저 확인해 드릴게요.`,
  c => `안녕하세요, ${ACADEMY}입니다 😊\n${c.name} 수업 시작 관련해서 마지막으로 안내드려요.\n지금 고민되는 부분이 있으시면 한 줄만 남겨 주세요. 맞춰서 방법을 찾아 드릴게요.`
];

async function notifyView() {
  const d = O.data, today = ymd(new Date()), tmr = addDays(today, new Date().getDay() === 6 ? 2 : 1);   // 토요일이면 다음 수업일은 월요일
  const ms = today.slice(0, 7);
  const [cellsT, logs, logRow] = await Promise.all([
    q(db.from("timetable_cells").select("*").eq("lesson_date", tmr)),
    q(db.from("lesson_logs").select("*").gte("lesson_date", addDays(today, -7)).order("lesson_date")),
    db.from("settings").select("value").eq("key", "send_log").then(r => (r.data || [])[0])
  ]);
  const sent = (logRow && logRow.value) || [];
  const S = Object.fromEntries(d.students.map(s => [s.id, s]));
  const done = (r, key) => sent.some(x => x.r === r && x.key === key);
  const md = s => label(s);
  const lists = {};
  // 1) 내일 변동: 내일 날짜의 보강·결석·대강 기록 (+ 그 학생 내일 시간표 칸의 시간·방)
  const evT = d.events.filter(e => e.event_date === tmr && e.student_id);
  lists.change = [...new Set(evT.map(e => e.student_id))].map(sid => {
    const s = S[sid]; if (!s) return null;
    const es = evT.filter(e => e.student_id === sid), c = cellsT.filter(x => x.student_id === sid).sort((a, b) => a.start_time < b.start_time ? -1 : 1);
    const when = c.length ? `${hm(c[0].start_time)}${c[0].room ? " · " + c[0].room + "실" : ""}` : "";
    const lines = es.map(e => e.kind === "보강" ? `보강 수업${e.minutes ? " " + e.minutes + "분" : ""}${e.linked_date ? " (" + md(e.linked_date) + " 결석분)" : ""}` : e.kind.startsWith("결석") ? `수업 쉼 (${e.kind.replace("결석 · ", "")})` : e.kind.startsWith("대강") ? `다른 선생님(${tname(e.teacher_id)})이 수업` : e.kind);
    return { key: sid + "|" + tmr, name: s.name, sub: lines.join(" · ") + (when ? " · " + when : ""),
      text: `안녕하세요, ${ACADEMY}입니다.\n내일 ${md(tmr)} ${s.name} 수업 안내드려요.\n\n${lines.map(l => "• " + l).join("\n")}${when ? "\n• 시간 · 장소: " + when : ""}\n\n시간을 한 번 더 확인해 주세요. 감사합니다.` };
  }).filter(Boolean);
  // 2) 미납 (1일 지난 뒤)
  lists.unpaid = +today.slice(8) > 1 ? d.students.filter(s => enrolled(s, ms) && dueOf(s.id, ms) > 0 && !payOf(s.id, ms)).map(s => ({ key: s.id + "|" + ms, name: s.name, sub: won(dueOf(s.id, ms)) + "원" + (useOf(s.id, ms) ? " (잔액 " + won(useOf(s.id, ms)) + " 차감)" : ""),
    text: `안녕하세요, ${ACADEMY}입니다 🎻\n${s.name} ${+ms.slice(5)}월 교육비(${won(dueOf(s.id, ms))}원) 안내드려요.\n이미 납부하셨다면 이 메시지는 넘겨 주세요. 납부가 어려우시면 편하게 말씀 주세요. 감사합니다.` })) : [];
  // 3) 주간 피드백: 지난 7일 레슨일지
  const wk = ymd(new Date(Date.now() - (new Date().getDay() || 7) * 864e5 + 864e5)).slice(0, 10);   // 이번 주 월요일
  const byS = {}; logs.forEach(l => { if (l.student_id && S[l.student_id]) (byS[l.student_id] = byS[l.student_id] || []).push(l); });
  lists.weekly = Object.entries(byS).map(([sid, ls]) => {
    const s = S[sid], last = ls[ls.length - 1];
    const today2 = String(last.today || "").split(/\n|\/|·/).map(x => x.trim()).filter(Boolean).slice(0, 4);
    return { key: sid + "|" + wk, name: s.name, sub: `${ls.length}회 · ${last.piece || "곡 미기록"}`,
      text: `[${ACADEMY}] ${s.name} 이번 주 레슨 소식 🎻\n\n🎼 곡: ${last.piece || "-"}\n${today2.length ? "📝 이번 주에 한 것\n" + today2.map(x => "• " + x).join("\n") + "\n" : ""}🏠 숙제: ${last.homework || "(원장님이 한 줄 적어 주세요)"}${last.video_song ? "\n🎥 촬영: " + last.video_song : ""}\n\n꾸준히 와 줘서 고마워요. 궁금한 점은 편하게 물어봐 주세요.` };
  });
  // 4) 상담 예약 알림: 후속 연락일 = 내일이고 아직 진행 중
  const open = c => !/^(등록|미등록)$/.test(c.status || "");
  lists.book = d.consults.filter(c => c.follow_on === tmr && open(c) && !c.with_name).map(c => ({ key: "c" + c.id + "|" + tmr, name: c.name, sub: `${c.subject || ""} · ${md(tmr)}`,
    text: `안녕하세요. ${ACADEMY} 이한은 원장입니다.\n내일 ${md(tmr)}에 뵙겠습니다.\n\n사용하시던 악기와 교재가 있으면 지참해 주세요. 악기 상태와 진도 조율 및 체크 도와드리겠습니다.${PLACE}` }));
  // 5) 상담 후속: 상담 후 1~3일, 진행 중
  lists.follow = d.consults.filter(c => open(c) && !c.with_name && c.asked_on).map(c => ({ c, n: Math.round((new Date(today) - new Date(c.asked_on)) / 864e5) })).filter(x => x.n >= 1 && x.n <= 3)
    .map(({ c, n }) => ({ key: "c" + c.id + "|" + n, name: c.name, sub: `상담 ${n}일째 · ${c.status || ""}`, text: FOLLOW_T[n - 1](c) }));
  // 6) 신규생 케어: 입학 90일 안 — 2주차 통화 · 첫 달 리포트 · 대여 종료 전 악기 상담
  lists.newbie = d.students.filter(s => s.status === "재원" && s.start_month && (new Date(today) - new Date(s.start_month)) / 864e5 <= 92).map(s => {
    const days = Math.round((new Date(today) - new Date(s.start_month)) / 864e5) + 1;
    const step = days <= 31 ? "2주차 학부모 통화" : days <= 61 ? "첫 달 리포트 보내기" : "대여 종료 전 악기 상담";   // 입학월이 달 단위라 한 달씩
    return { key: s.id + "|" + step, name: s.name, sub: `${+s.start_month.slice(5, 7)}월 입학 · ${step}`, task: true,
      text: step === "2주차 학부모 통화" ? `[통화 메모] ${s.name} 2주 적응: 연습 시간 · 아이 반응 · 수업 시간 괜찮은지 · 궁금한 점` :
        step === "첫 달 리포트 보내기" ? `[${ACADEMY}] ${s.name} 첫 달 이야기 🎻\n\n첫 달 동안 자세와 소리 만들기를 함께 시작했어요.\n(원장님이 한두 줄 덧붙여 주세요)\n\n다음 달에도 즐겁게, 그러나 정확하게 이어 갈게요.` :
        `[상담 메모] ${s.name} 악기 이야기: 대여 종료 시점 · 구입/대여 연장 · 연계 악기사 안내 · 부담되는 점` };
  });
  const cur = RECIPES.find(r => r[0] === NT.r), list = (lists[NT.r] || []).map(x => ({ ...x, sent: done(NT.r, x.key) }));
  const pend = list.filter(x => !x.sent), sel = list[NT.sel] || pend[0] || list[0];
  $("#main").innerHTML = `<div class="nav"><h1>알림 · 발송 워크플로우</h1><span class="m">필요한 순간에 필요한 안내를 · 내용을 확인한 뒤 보내세요</span></div>
    <div class="ntg">
      <div class="card ntl"><b>발송 레시피</b>${RECIPES.map(([k, t, c]) => { const n = (lists[k] || []).filter(x => !done(k, x.key)).length;
        return `<button class="ntr ${NT.r === k ? "on" : ""}" data-r="${k}"><span>${t}</span><small>${c}</small>${n ? `<em>${n}</em>` : ""}</button>`; }).join("")}
        <div class="m" style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px">보낼 것 ${RECIPES.reduce((a, [k]) => a + (lists[k] || []).filter(x => !done(k, x.key)).length, 0)}건 · 이번 달 보낸 것 ${sent.filter(x => (x.at || "").startsWith(ms)).length}건</div></div>
      <div class="card"><div class="top"><b style="font-size:17px">${cur[1]}</b><span class="tag blue">검토 후 발송</span></div>
        <div class="ntflow"><div><small>조건 확인</small><b>${cur[2]}</b></div><div><small>안내문 준비</small><b>${cur[3]}</b></div><div><small>운영자 확인</small><b>미리보기 · 복사 · 보냈어요</b></div></div>
        ${list.length ? list.map((x, i) => `<div class="ntc ${sel === x ? "on" : ""} ${x.sent ? "sent" : ""}" data-i="${i}"><div><b>${esc(x.name)}</b> <span class="m">${esc(x.sub)}</span></div>
          <span>${x.sent ? '<span class="tag ok">보냄</span>' : `<button class="btn" data-copy="${i}">${x.task ? "메모 복사" : "복사"}</button> <button class="btn pri" data-done="${i}">${x.task ? "했어요" : "보냈어요"}</button>`}</span></div>`).join("")
          : '<div class="m" style="padding:14px 0">지금 보낼 대상이 없어요</div>'}</div>
      <div><b class="m">발송 미리보기</b><div class="phone"><div class="ph-top"><span class="ph-av">V</span><div><b>${ACADEMY}</b><small>알림톡</small></div></div>
        <div class="ph-body"><div class="ph-msg">${sel ? esc(sel.text).replace(/\n/g, "<br>") : "왼쪽에서 대상을 고르면 여기 보여요"}</div></div></div>
        ${sel && !sel.task ? `<textarea id="ntx" rows="6" style="margin-top:8px">${esc(sel.text)}</textarea><p class="m">고친 내용으로 복사돼요 · 실제 알림톡은 카카오 채널 연결 뒤</p>` : ""}</div>
    </div>
    <div class="card"><b>발송 대기 · 이력</b>${sent.slice(-15).reverse().map(x => `<div class="m" style="margin-top:4px">${esc(x.at)} · ${esc((RECIPES.find(r => r[0] === x.r) || [])[1] || x.r)} · <b style="color:var(--ink)">${esc(x.name)}</b></div>`).join("") || '<div class="m">아직 없어요</div>'}</div>`;
  document.querySelectorAll("[data-r]").forEach(b => b.onclick = () => { NT = { r: b.dataset.r, sel: 0 }; notifyView(); });
  document.querySelectorAll(".ntc").forEach(c => c.onclick = e => { if (e.target.closest("button")) return; NT.sel = +c.dataset.i; notifyView(); });
  document.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => { const x = list[+b.dataset.copy]; copyText(x === sel && $("#ntx") ? $("#ntx").value : x.text); });
  document.querySelectorAll("[data-done]").forEach(b => b.onclick = async () => {
    const x = list[+b.dataset.done]; b.disabled = true;
    const next = sent.concat([{ r: NT.r, key: x.key, name: x.name, at: new Date().toLocaleString("sv-SE").slice(0, 16) }]).slice(-500);
    const { error } = await db.from("settings").upsert({ key: "send_log", value: next });
    if (error) { b.disabled = false; return toast("기록 실패: " + error.message); }
    toast(x.name + " · 기록했어요"); notifyView();
  });
}
