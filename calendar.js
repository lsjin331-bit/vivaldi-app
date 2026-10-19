"use strict";
// 캘린더 · 일지 · 마케팅 (원장·실장 전용) — 시트 '일지·일정' 탭(종류: 일지/일정/마케팅)과 같은 자료
const J_KINDS = ["일정", "일지", "마케팅"];
const MK_CH = ["블로그", "인스타", "플레이스", "당근", "리뷰"];
let CAL_SEL = null;

async function loadJournal(ms, me) {
  return q(db.from("journal").select("*").gte("day", ms).lte("day", me).order("day"));
}
// 날짜별 표시할 것: 일지·일정·마케팅 기록 + 상담 후속 연락 + 휴강일 + 세금·교육비 기한
function calItems(jn, hol, day) {
  const d = O.data, out = [];
  if (hol.has(day)) out.push({ c: "hol", t: "휴강" });
  jn.filter(j => j.day === day).forEach(j => out.push({ c: j.kind === "일정" ? "plan" : j.kind === "마케팅" ? "mk" : "log", t: (j.channel ? "[" + j.channel + "] " : "") + j.content }));
  d.consults.filter(c => c.follow_on === day && !/^(등록|미등록)$/.test(c.status || "")).forEach(c => out.push({ c: "call", t: "📞 " + c.name + " 연락" }));
  const dd = Number(day.slice(8)), last = Number(monthEnd(day).slice(8));
  if (dd === 10) out.push({ c: "due", t: "원천세·지방세 신고" });
  if (dd === last) out.push({ c: "due", t: "간이지급명세서" });
  if (dd === last - 6) out.push({ c: "due", t: "다음 달 교육비 납부 주간 시작" });
  return out;
}
async function calendarView() {
  const m = O.month, ms = m + "-01", me = monthEnd(ms);
  const [jn, hol] = await Promise.all([loadJournal(ms, me), q(db.from("holidays").select("day").gte("day", ms).lte("day", me))]);
  const H = new Set(hol.map(h => h.day)), today = ymd(new Date());
  const first = (new Date(ms + "T00:00:00").getDay() + 6) % 7, nd = Number(me.slice(8));
  let cells = Array(first).fill('<div class="cd empty"></div>').join("");
  for (let i = 1; i <= nd; i++) {
    const day = ms.slice(0, 8) + String(i).padStart(2, "0"), it = calItems(jn, H, day), sun = new Date(day + "T00:00:00").getDay() === 0;
    cells += `<div class="cd ${day === today ? "today" : ""} ${sun ? "sun" : ""} ${H.has(day) ? "hol" : ""} ${CAL_SEL === day ? "sel" : ""}" data-day="${day}"><b>${i}</b>${it.slice(0, 3).map(x => `<span class="ci ${x.c}">${esc(x.t)}</span>`).join("")}${it.length > 3 ? `<span class="ci more">+${it.length - 3}</span>` : ""}</div>`;
  }
  const sel = CAL_SEL && CAL_SEL.startsWith(m) ? CAL_SEL : today.startsWith(m) ? today : ms;
  const selItems = calItems(jn, H, sel);
  $("#main").innerHTML = monthBar("캘린더 · 일지") +
    `<div class="cal">${["월", "화", "수", "목", "금", "토", "일"].map(w => `<div class="cw">${w}</div>`).join("")}${cells}</div>
    <div class="card" style="margin-top:10px"><h2>${label(sel)}</h2>
      ${selItems.map(x => `<div class="ci ${x.c}" style="display:block;margin:3px 0">${esc(x.t)}</div>`).join("") || '<div class="m">기록 없음</div>'}
      <div class="row2" style="margin-top:10px"><select id="j1" style="max-width:110px">${J_KINDS.map(k => `<option>${k}</option>`).join("")}</select><select id="j2" style="max-width:120px"><option value="">채널</option>${MK_CH.map(k => `<option>${k}</option>`).join("")}</select></div>
      <textarea id="j3" rows="2" placeholder="예) 11월 휴강일 공지 / 오늘 상담 2건 / 블로그 '성인 플룻 첫 달' 발행"></textarea>
      <p style="margin-top:8px"><button class="btn pri" id="jsave">${label(sel)}에 저장</button></p></div>
    <p class="m">파랑 일정 · 회색 일지 · 초록 마케팅 · 빨강 상담 연락 · 주황 기한 · 빗금 휴강</p>`;
  bindMonth();
  document.querySelectorAll("[data-day]").forEach(c => c.onclick = () => { CAL_SEL = c.dataset.day; calendarView(); });
  $("#jsave").onclick = async e => {
    const content = $("#j3").value.trim(); if (!content) return toast("내용을 적어 주세요");
    e.target.disabled = true;
    const { error } = await db.from("journal").insert({ day: sel, kind: $("#j1").value, channel: $("#j2").value || null, content, created_on: ymd(new Date()), source_kind: "app" });
    e.target.disabled = false;
    if (error) return toast("저장 실패: " + error.message);
    CAL_SEL = sel; toast("저장했어요"); calendarView();
  };
}

// ===== 마케팅: 채널 신호등(마지막 게시 후 며칠) + 주력 추천 =====
async function marketingView() {
  const today = ymd(new Date());
  const [jn, recs] = await Promise.all([
    q(db.from("journal").select("*").eq("kind", "마케팅").order("day", { ascending: false }).limit(300)),
    q(db.from("marketing_recs").select("*").order("id"))
  ]);
  const light = ch => {
    const last = jn.find(j => (j.channel || "") === ch || (j.content || "").includes(ch));
    if (!last) return { cls: "red", txt: "기록 없음" };
    const days = Math.round((new Date(today) - new Date(last.day)) / 864e5);
    return { cls: days <= 7 ? "ok" : days <= 14 ? "gold" : "red", txt: days === 0 ? "오늘" : days + "일 전", last };
  };
  $("#main").innerHTML = `<div class="nav"><h1>마케팅</h1></div>
    <div class="kpis">${MK_CH.map(ch => { const l = light(ch); return `<div class="kpi"><span>${ch}</span><b><span class="tag ${l.cls}" style="font-size:14px">${l.txt}</span></b><small>${l.last ? esc(l.last.content.slice(0, 18)) : ""}</small></div>`; }).join("")}</div>
    <p class="m">초록 7일 이내 · 노랑 14일 이내 · 빨강 그 이상. '했어요'를 누르면 오늘 마케팅 기록으로 남고 신호등이 바뀌어요.</p>
    <h2 class="sec2">주력 추천</h2>
    ${recs.map((r, i) => `<div class="card"><div class="top"><span><b>${esc(r.rank || "")} ${esc(r.target || "")}</b> <span class="m">${esc(r.channel || "")} · ${esc(r.type || "")}</span></span>
      ${r.done ? `<span class="tag ok">${esc(r.done)}</span>` : `<button class="btn" data-rec="${i}">했어요</button>`}</div>
      <div>${esc(r.content || "")}</div>${r.reason ? `<div class="m">${esc(r.reason)}</div>` : ""}</div>`).join("") || '<div class="card m">추천이 없어요</div>'}
    <h2 class="sec2">최근 마케팅 기록</h2>
    <div class="card">${jn.slice(0, 15).map(j => `<div>${j.day.slice(5).replace("-", "/")} · ${esc(j.channel || "")} ${esc(j.content)}</div>`).join("") || '<div class="m">아직 없어요</div>'}</div>`;
  document.querySelectorAll("[data-rec]").forEach(b => b.onclick = async () => {
    const r = recs[+b.dataset.rec], ch = MK_CH.find(c => (r.channel || "").includes(c)) || (r.channel || "").split(/[·,]/)[0].trim() || null;
    b.disabled = true;
    const { error } = await db.from("journal").insert({ day: today, kind: "마케팅", channel: ch, content: (r.content || r.target || "").slice(0, 200), created_on: today, source_kind: "app" });
    if (error) { b.disabled = false; return toast("저장 실패: " + error.message); }
    toast("오늘 마케팅으로 기록했어요"); marketingView();
  });
}
