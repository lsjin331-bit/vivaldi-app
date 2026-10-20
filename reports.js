"use strict";
// 월말 리포트 (원장·실장 전용) — 매쓰플랜 '월말 리포트' + 상담카드 체험 결과 기준(잘함·보통·보완)
// 학생마다: 평가 6칸 · 상태 · 이번 달 자동 요약(출결·곡·촬영) · 원장 코멘트([AI 초안]) · 완료 → 학부모 문구 복사
// 저장: settings 'report_YYYY-MM' = { 학생번호: { r:{항목:'잘함'|'보통'|'보완'}, st, cm, done, at } }
const RP_ITEMS = ["자세", "소리", "음정", "리듬·박자", "악보 읽기", "집중·태도"];
const RP_LV = ["잘함", "보통", "보완"];
const RP_ST = ["해당 없음", "기초 다지기", "연주회 준비", "콩쿠르·입시"];
let RP = { t: "전체" };

async function reportsView() {
  const d = O.data, m = O.month, ms = m + "-01", me = monthEnd(ms), key = "report_" + m;
  const [row, logs, cells, ev] = await Promise.all([
    db.from("settings").select("value").eq("key", key).then(r => (r.data || [])[0]),
    q(db.from("lesson_logs").select("*").gte("lesson_date", ms).lte("lesson_date", me).order("lesson_date")),
    q(db.from("timetable_cells").select("lesson_date,student_id").gte("lesson_date", ms).lte("lesson_date", me)),
    q(db.from("attendance_events").select("event_date,student_id,kind").gte("event_date", ms).lte("event_date", me))
  ]);
  const R = (row && row.value) || {};
  const list = d.students.filter(s => enrolled(s, m) && (RP.t === "전체" || tname(teacherOn(s, me)) === RP.t))
    .sort((a, b) => INST_ORDER.indexOf(a.instrument) - INST_ORDER.indexOf(b.instrument) || (a.name < b.name ? -1 : 1));
  const today = ymd(new Date());
  const facts = s => {
    const days = new Set(cells.filter(c => c.student_id === s.id && c.lesson_date <= today).map(c => c.lesson_date));
    const abs = ev.filter(e => e.student_id === s.id && e.kind.startsWith("결석")).length;
    const ls = logs.filter(l => l.student_id === s.id), pieces = [...new Set(ls.map(l => l.piece).filter(Boolean))];
    const vids = ls.map(l => l.video_song).filter(Boolean);
    return { n: days.size, abs, pieces, vids, last: ls[ls.length - 1] };
  };
  const all = d.students.filter(s => enrolled(s, m)), doneN = all.filter(s => R[s.id] && R[s.id].done).length;
  const teachers = [...new Set(all.map(s => tname(teacherOn(s, me))))].filter(Boolean);
  $("#main").innerHTML = monthBar("월말 리포트") + `
    <div class="kpis">${kpi("대상", all.length + "명", m.replace("-", "년 ") + "월")}${kpi("완료", doneN + "명", all.length ? Math.round(doneN / all.length * 100) + "%" : "")}
      ${kpi("남은 리포트", all.length - doneN + "명", "", all.length - doneN ? "red" : "")}${kpi("평가 기준", "6항목", "상담카드 체험 결과와 같음")}</div>
    <div class="chips">${["전체", ...teachers].map(v => `<button class="${RP.t === v ? "on" : ""}" data-rt="${esc(v)}">${esc(v)}</button>`).join("")}</div><p></p>
    ${list.map(s => { const r = R[s.id] || { r: {} }, f = facts(s);
      return `<div class="card rp ${r.done ? "rpdone" : ""}" data-s="${s.id}"><div class="top"><span><b>${esc(s.name)}</b> <span class="m">${esc(s.instrument || "")} · ${esc(tname(teacherOn(s, me)))} · 수업 ${f.n}회${f.abs ? " · 결석 " + f.abs : ""}</span></span>
        <span>${r.done ? '<span class="tag ok">완료</span>' : ""} <select class="rst" style="width:auto;margin:0">${RP_ST.map(x => `<option ${x === (r.st || "해당 없음") ? "selected" : ""}>${x}</option>`).join("")}</select></span></div>
        <div class="rpi">${RP_ITEMS.map(it => `<div><small>${it}</small><span>${RP_LV.map(lv => `<button class="${(r.r || {})[it] === lv ? "on lv" + RP_LV.indexOf(lv) : ""}" data-it="${it}" data-lv="${lv}">${lv}</button>`).join("")}</span></div>`).join("")}</div>
        <div class="m" style="margin:6px 0">이번 달 곡: ${f.pieces.map(esc).join(", ") || "레슨일지 없음"}${f.vids.length ? " · 촬영: " + f.vids.map(esc).join(", ") : ""}</div>
        <textarea class="rcm" rows="3" placeholder="원장 코멘트 (비워 두고 [AI 초안]을 눌러도 돼요)">${esc(r.cm || "")}</textarea>
        <div class="row2" style="justify-content:flex-end;margin-top:6px"><button class="btn" data-ai>AI 초안</button><button class="btn" data-cp>학부모 문구 복사</button><button class="btn pri" data-sv>${r.done ? "다시 저장" : "완료"}</button></div></div>`; }).join("") || '<div class="card m">대상 학생이 없어요</div>'}`;
  bindMonth();
  document.querySelectorAll("[data-rt]").forEach(b => b.onclick = () => { RP.t = b.dataset.rt; reportsView(); });
  document.querySelectorAll(".rp [data-it]").forEach(b => b.onclick = () => { const box = b.closest("span"); box.querySelectorAll("button").forEach(x => x.className = ""); b.className = "on lv" + RP_LV.indexOf(b.dataset.lv); });
  const read = c => ({ r: Object.fromEntries([...c.querySelectorAll(".rpi button.on")].map(b => [b.dataset.it, b.dataset.lv])), st: c.querySelector(".rst").value, cm: c.querySelector(".rcm").value.trim() });
  const msg = (s, x) => { const f = facts(s), good = RP_ITEMS.filter(i => x.r[i] === "잘함"), work = RP_ITEMS.filter(i => x.r[i] === "보완");
    return `[비발디 관현악학원] ${s.name} ${+m.slice(5)}월 레슨 리포트 🎻\n\n• 출결: 수업 ${f.n}회${f.abs ? " · 결석 " + f.abs + "회" : ""}\n• 이번 달 곡: ${f.pieces.join(", ") || "-"}${f.vids.length ? "\n• 촬영: " + f.vids.join(", ") : ""}${good.length ? "\n• 잘하고 있는 점: " + good.join(", ") : ""}${work.length ? "\n• 다음 달에 다듬을 점: " + work.join(", ") : ""}${x.st && x.st !== "해당 없음" ? "\n• 지금: " + x.st : ""}\n\n${x.cm || ""}\n\n- 비발디 관현악학원 원장 이한은 드림`; };
  document.querySelectorAll(".rp").forEach(c => {
    const s = d.students.find(x => x.id === c.dataset.s);
    c.querySelector("[data-cp]").onclick = () => copyText(msg(s, read(c)));
    c.querySelector("[data-ai]").onclick = async e => {
      const x = read(c), f = facts(s), b = e.target; b.disabled = true; b.textContent = "만드는 중…";
      const ctx = { name: s.name, instrument: s.instrument, age: s.age_group, month: m, lessons: f.n, absences: f.abs, pieces: f.pieces, videos: f.vids, ratings: x.r, status: x.st,
        notes: logs.filter(l => l.student_id === s.id).map(l => l.today).filter(Boolean).slice(-4) };
      let text = "";
      try { const r = await db.functions.invoke("ai-draft", { body: { kind: "report", ctx } }); if (r.error) throw r.error; text = (r.data || {}).text || ""; } catch (err) { text = ""; }
      if (!text) {   // AI 연결 전: 기록으로 만든 기본 초안
        const good = RP_ITEMS.filter(i => x.r[i] === "잘함"), work = RP_ITEMS.filter(i => x.r[i] === "보완");
        text = `${s.name}${/[가-힣]$/.test(s.name) && (s.name.charCodeAt(s.name.length - 1) - 0xAC00) % 28 ? "이는" : "는"} 이번 달 ${f.pieces[0] ? f.pieces[0] + "을(를) 중심으로 " : ""}${f.n}회 수업을 꾸준히 해 왔어요.${good.length ? " 특히 " + good.join("·") + "이(가) 좋아지고 있어요." : ""}${work.length ? " 다음 달에는 " + work.join("·") + "을(를) 조금 더 다듬어 볼게요." : ""} 즐겁게, 그러나 정확하게 이어 가겠습니다.`;
        toast("AI 연결 전이라 기록으로 만든 기본 초안이에요");
      }
      c.querySelector(".rcm").value = text; b.disabled = false; b.textContent = "AI 초안";
    };
    c.querySelector("[data-sv]").onclick = async e => {
      const x = read(c); e.target.disabled = true;
      const cur = ((await db.from("settings").select("value").eq("key", key)).data || [])[0];
      const all2 = (cur && cur.value) || {}; all2[s.id] = { ...x, done: true, at: ymd(new Date()) };
      const { error } = await db.from("settings").upsert({ key, value: all2 });
      if (error) { e.target.disabled = false; return toast("저장 실패: " + error.message); }
      toast(s.name + " 리포트 완료"); reportsView();
    };
  });
}
