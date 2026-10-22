"use strict";
// 레슨 일지 모아보기 (원장·실장) — 기존 운영실 앱 레슨일지와 같은 구성(원장 2026-10-22)
// 최근 2주 특이사항(교재 지급·교재 진급·촬영·면담 요청) + 날짜별 카드. 선생님 화면은 [선생님 화면으로]에서.
let LG = { k: "all", t: "", q: "" };
async function lessonLogView() {
  const d = O.data, S = Object.fromEntries(d.students.map(s => [s.id, s]));
  const rows = await q(db.from("lesson_logs").select("lesson_date,start_time,student_id,teacher_id,piece,today,homework,new_book,video_song,talk,raw")
    .gte("lesson_date", addDays(ymd(new Date()), -120)).order("lesson_date", { ascending: false }).limit(1500));
  const line = (t, k) => ((String(t || "").match(new RegExp("^\\s*" + k + "\\s*[:：]\\s*(.+)$", "m")) || [])[1] || "").trim();
  const flag = v => v && !/^(교재|촬영|상담)$/.test(v) ? v : (v ? "" : null);
  const vol = t => { const m = String(t).match(/(스즈키|테크닉북|킨더스트링|하모니네이션|세브칙|카이저|호만|볼마르|크로이처)[^0-9]{0,6}(\d+)\s*권?/); return m ? { s: m[1], n: +m[2] } : null; };
  const list = rows.map(r => {
    const text = line(r.raw, "교재"), piece = r.piece || line(r.raw, "곡");
    return { date: r.lesson_date, time: String(r.start_time || "").slice(0, 5), name: (S[r.student_id] || {}).name || "?", teacher: tname(r.teacher_id), text, piece,
      today: r.today || line(r.raw, "오늘"), hw: r.homework || line(r.raw, "숙제"), kind: line(r.raw, "종류") || ((String(r.today || "").match(/^\[(추가 수업|요일 이동[^\]]*)\]/) || [])[1] || ""),
      book: r.new_book != null ? flag(r.new_book) ?? "" : null, video: r.video_song != null ? flag(r.video_song) ?? "" : null, talk: r.talk != null ? flag(r.talk) ?? "" : null, v: vol(text + " " + piece) };
  });
  const last = {};
  list.slice().reverse().forEach(x => { if (!x.v) return; const k = x.name + "|" + x.v.s, p = last[k]; if (p && x.v.n > p.n) x.up = `${x.v.s} ${p.n}권 → ${x.v.n}권`; last[k] = x.v; });
  const has = v => v !== null && v !== undefined;
  const special = l => has(l.book) || l.up || has(l.video) || has(l.talk);
  const badges = l => (has(l.book) ? `<span class="lgb bk">교재 지급${l.book ? " · " + esc(l.book) : ""}</span>` : "") + (l.up ? `<span class="lgb up">교재 진급 · ${esc(l.up)}</span>` : "") +
    (has(l.video) ? `<span class="lgb vd">촬영${l.video ? " · " + esc(l.video) : ""}</span>` : "") + (has(l.talk) ? `<span class="lgb tk">면담 요청${l.talk ? " · " + esc(l.talk) : ""}</span>` : "") + (l.kind ? `<span class="lgb">${esc(l.kind)}</span>` : "");
  const teachers = [...new Set(list.map(l => l.teacher))].filter(Boolean).sort();
  const draw = () => {
    const fl = list.filter(l => (!LG.t || l.teacher === LG.t) && (!LG.q || l.name.includes(LG.q)) &&
      (LG.k === "all" || (LG.k === "sp" && special(l)) || (LG.k === "book" && has(l.book)) || (LG.k === "up" && l.up) || (LG.k === "video" && has(l.video)) || (LG.k === "talk" && has(l.talk))));
    const since = addDays(ymd(new Date()), -14), sp = list.filter(l => special(l) && l.date >= since);
    const by = {}; fl.forEach(l => (by[l.date] = by[l.date] || []).push(l));
    $("#lgbody").innerHTML = `<div class="card"><h2>최근 2주 특이사항</h2>
      <div class="kpis" style="margin:8px 0">${kpi("교재 지급", sp.filter(l => has(l.book)).length + "건", "")}${kpi("교재 진급", sp.filter(l => l.up).length + "건", "")}${kpi("촬영", sp.filter(l => has(l.video)).length + "건", "")}${kpi("면담 요청", sp.filter(l => has(l.talk)).length + "건", "")}</div>
      ${sp.length ? sp.map(l => `<div class="lgsrow"><span class="lgd">${label(l.date)}</span><b>${esc(l.name)}</b><span class="m">${esc(l.teacher)}</span><span>${badges(l)}</span></div>`).join("") : '<p class="m">최근 2주 특이사항이 없어요</p>'}</div>` +
      (Object.keys(by).length ? Object.keys(by).map(dt => `<h3 class="lgday">${label(dt)}</h3>` + by[dt].map(l => `<div class="card lgi${special(l) ? " lgsp" : ""}">
        <div class="lgh"><span class="lgt">${esc(l.time)}</span><b class="lgn">${esc(l.name)}</b><span class="m">${esc(l.teacher)} 선생님</span></div>
        ${special(l) || l.kind ? `<div class="lgbs">${badges(l)}</div>` : ""}
        <div class="lgp">${l.text ? `<span class="m">교재</span> ${esc(l.text)} · ` : ""}<span class="m">곡</span> ${esc(l.piece || "—")}</div>
        ${l.today ? `<div class="lgc">${esc(l.today.replace(/^\[[^\]]*\]\s*/, "")).replace(/ \/ (?=•|개별:)/g, "<br>")}</div>` : ""}
        ${l.hw ? `<div class="lgc"><span class="m">숙제</span> ${esc(l.hw)}</div>` : ""}</div>`).join("")).join("") : '<div class="card m">조건에 맞는 일지가 없어요</div>');
  };
  $("#main").innerHTML = `<div class="nav"><h1>레슨 일지</h1><button class="btn" id="lgteach">선생님 화면으로</button></div>
    <p class="m">선생님 일지가 모여요 · 교재 지급·교재 진급·촬영·면담 요청은 위에 따로 모여요</p>
    <div class="chips">${[["all", "전체"], ["sp", "특이사항만"], ["book", "교재 지급"], ["up", "교재 진급"], ["video", "촬영"], ["talk", "면담 요청"]].map(([k, t]) => `<button data-lk="${k}" class="${LG.k === k ? "on" : ""}">${t}</button>`).join("")}</div>
    <div class="row2" style="gap:8px;margin:10px 0"><select id="lgt" style="width:auto"><option value="">선생님 전체</option>${teachers.map(t => `<option ${t === LG.t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><input id="lgq" placeholder="학생 이름" value="${esc(LG.q)}" style="max-width:180px"></div>
    <div id="lgbody"></div>`;
  document.querySelectorAll("[data-lk]").forEach(b => b.onclick = () => { LG.k = b.dataset.lk; document.querySelectorAll("[data-lk]").forEach(x => x.classList.toggle("on", x === b)); draw(); });
  $("#lgt").onchange = e => { LG.t = e.target.value; draw(); };
  $("#lgq").oninput = e => { LG.q = e.target.value.trim(); draw(); };
  $("#lgteach").onclick = () => load();
  draw();
}
