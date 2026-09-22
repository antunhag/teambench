// Linha do tempo visual do jogo — porta de buildTimelineData/buildTimelineHtml
// do banco.html. Reconstrói, a partir só do registo cronológico (nunca de uma
// grelha manual de minutos), quem esteve em campo minuto a minuto em cada
// parte, com golos/cartões/faltas marcados no segundo exato.
import { tipoGoloLabel } from "./goalTypes";
import { periodLabel } from "./matchFormat";
import { fmtMinSec } from "./time";
import type { MatchEvent, Player } from "./types";

export interface TimelinePlayerBar {
  id: string;
  num: string;
  name: string;
  intervals: [number, number][];
  totalSec: number;
}

export interface TimelineGoal {
  sec: number;
  side: "nos" | "adv";
  scorerId: string | null;
  tipo: string | null;
  zona: number | null;
  marcha: [number, number];
}

export interface TimelineCard {
  sec: number;
  playerId: string;
  kind: "amarelo" | "vermelho";
}

export interface TimelineFoul {
  sec: number;
  playerId: string;
}

export interface TimelineHalf {
  label: string;
  durSec: number;
  players: TimelinePlayerBar[];
  goals: TimelineGoal[];
  cards: TimelineCard[];
  fouls: TimelineFoul[];
}

export function buildTimelineData(events: MatchEvent[], playersList: Player[], titularIds: string[]): TimelineHalf[] {
  const byId = new Map(playersList.map((p) => [p.id, p]));
  const periods = new Map<number, MatchEvent[]>();
  events.forEach((e) => {
    const per = e.period || 1;
    if (!periods.has(per)) periods.set(per, []);
    periods.get(per)!.push(e);
  });
  const periodNums = [...periods.keys()].sort((a, b) => a - b);
  const periodDur = new Map<number, number>();
  events.forEach((e) => {
    if (e.type === "fim_periodo") periodDur.set(e.period || 1, e.duracaoSec || 0);
  });

  const onCourtSet = new Set(titularIds);
  let runningNos = 0;
  let runningAdv = 0;
  const halves: TimelineHalf[] = [];

  periodNums.forEach((per) => {
    const evs = (periods.get(per) || []).slice().sort((a, b) => (a.ms || 0) - (b.ms || 0));
    const maxMs = evs.reduce((m, e) => Math.max(m, e.ms || 0), 0);
    const durSec = periodDur.get(per) || Math.ceil(maxMs / 1000) || 60;

    const openStart = new Map<string, number>();
    onCourtSet.forEach((id) => openStart.set(id, 0));
    const intervals = new Map<string, [number, number][]>();
    const goals: TimelineGoal[] = [];
    const cards: TimelineCard[] = [];
    const fouls: TimelineFoul[] = [];

    evs.forEach((e) => {
      const sec = (e.ms || 0) / 1000;
      if (e.type === "substituicao") {
        const inId = e.playerId!;
        const outId = e.outId ?? null;
        if (outId && openStart.has(outId)) {
          const arr = intervals.get(outId) || [];
          arr.push([openStart.get(outId)!, sec]);
          intervals.set(outId, arr);
          openStart.delete(outId);
          onCourtSet.delete(outId);
        }
        openStart.set(inId, sec);
        onCourtSet.add(inId);
      } else if (e.type === "cartao_vermelho") {
        cards.push({ sec, playerId: e.playerId!, kind: "vermelho" });
        if (e.playerId && openStart.has(e.playerId)) {
          const arr = intervals.get(e.playerId) || [];
          arr.push([openStart.get(e.playerId)!, sec]);
          intervals.set(e.playerId, arr);
          openStart.delete(e.playerId);
          onCourtSet.delete(e.playerId);
        }
      } else if (e.type === "cartao_amarelo") {
        cards.push({ sec, playerId: e.playerId!, kind: "amarelo" });
      } else if (e.type === "falta") {
        fouls.push({ sec, playerId: e.playerId! });
      } else if (e.type === "golo" || e.type === "golo_sofrido") {
        if (e.type === "golo") runningNos++;
        else runningAdv++;
        goals.push({
          sec,
          side: e.type === "golo" ? "nos" : "adv",
          scorerId: e.type === "golo" ? e.playerId : null,
          tipo: e.tipo ?? null,
          zona: e.zona ?? null,
          marcha: [runningNos, runningAdv],
        });
      }
    });

    openStart.forEach((start, id) => {
      const arr = intervals.get(id) || [];
      arr.push([start, durSec]);
      intervals.set(id, arr);
    });

    const playersOut: TimelinePlayerBar[] = [...intervals.entries()]
      .map(([id, ivs]) => {
        const p = byId.get(id);
        const totalSec = ivs.reduce((acc, iv) => acc + Math.max(0, iv[1] - iv[0]), 0);
        return { id, num: p?.num ?? "?", name: p?.name ?? "?", intervals: ivs, totalSec };
      })
      .sort((a, b) => (parseInt(a.num, 10) || 999) - (parseInt(b.num, 10) || 999));

    halves.push({ label: periodLabel(per), durSec, players: playersOut, goals, cards, fouls });
  });

  return halves;
}

export interface TimelineMatchInfo {
  jornada?: string | null;
  date?: string | null;
  adversario?: string | null;
  local?: string | null;
}

function esc(s: unknown): string {
  return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Página HTML autónoma (sem JS de runtime) com a timeline visual de todas as partes de um jogo. */
export function buildTimelineHtml(
  matchInfo: TimelineMatchInfo,
  halves: TimelineHalf[],
  scoreNos: number,
  scoreAdv: number,
  playerById: (id: string) => Player | undefined
): string {
  function pct2(sec: number, dur: number): string {
    return `${((Math.min(sec, dur) / dur) * 100).toFixed(2)}%`;
  }

  const totalsByPid = new Map<string, { id: string; num: string; name: string; totalSec: number }>();
  halves.forEach((half) => {
    half.players.forEach((p) => {
      const t = totalsByPid.get(p.id) || { id: p.id, num: p.num, name: p.name, totalSec: 0 };
      t.totalSec += p.totalSec || 0;
      totalsByPid.set(p.id, t);
    });
  });
  const totalsRows = [...totalsByPid.values()].sort((a, b) => b.totalSec - a.totalSec);
  const totalsHtml = totalsRows
    .map((t) => `<tr><td>#${esc(t.num)} ${esc(t.name)}</td><td class="num">${Math.round(t.totalSec / 60)}'</td></tr>`)
    .join("");

  const halvesHtml = halves
    .map((half) => {
      const foulsByPid = new Map<string, TimelineFoul[]>();
      half.fouls.forEach((f) => {
        (foulsByPid.get(f.playerId) || foulsByPid.set(f.playerId, []).get(f.playerId)!).push(f);
      });
      const cardsByPid = new Map<string, TimelineCard[]>();
      half.cards.forEach((c) => {
        (cardsByPid.get(c.playerId) || cardsByPid.set(c.playerId, []).get(c.playerId)!).push(c);
      });
      const goalsByScorerPid = new Map<string, TimelineGoal[]>();
      half.goals.forEach((g) => {
        if (g.scorerId) (goalsByScorerPid.get(g.scorerId) || goalsByScorerPid.set(g.scorerId, []).get(g.scorerId)!).push(g);
      });

      const marcha =
        '<div class="marcha-row">' +
        half.goals
          .map((g) => {
            const cls = g.side === "nos" ? "nos" : "adv";
            return `<span class="marcha-chip ${cls}">${g.marcha[0]}–${g.marcha[1]}<span class="t">· ${fmtMinSec(g.sec * 1000)}</span></span>`;
          })
          .join("") +
        "</div>";

      const step = half.durSec > 2400 ? 600 : half.durSec > 1200 ? 300 : 60;
      const ticks: number[] = [];
      for (let t = 0; t <= half.durSec; t += step) ticks.push(t);
      if (ticks[ticks.length - 1] !== half.durSec) ticks.push(half.durSec);
      const ruler = `<div class="ruler">${ticks
        .map((t) => `<span style="left:${pct2(t, half.durSec)}">${Math.round(t / 60)}′</span>`)
        .join("")}</div>`;

      const rows = half.players
        .map((p) => {
          const bars = p.intervals
            .map(
              (iv) =>
                `<div class="bar" style="left:${pct2(iv[0], half.durSec)};width:${pct2(iv[1] - iv[0], half.durSec)};" title="${esc(
                  p.name
                )} — ${fmtMinSec(iv[0] * 1000)} a ${fmtMinSec(iv[1] * 1000)}"></div>`
            )
            .join("");
          let marks = "";
          (goalsByScorerPid.get(p.id) || []).forEach((g) => {
            marks += `<div class="mk goal" style="left:${pct2(g.sec, half.durSec)};" title="Golo — ${fmtMinSec(g.sec * 1000)}${
              g.tipo ? ` · ${esc(tipoGoloLabel(g.tipo) || g.tipo)}` : ""
            }${g.zona ? ` · zona ${g.zona}` : ""}">⚽</div>`;
          });
          (cardsByPid.get(p.id) || []).forEach((c) => {
            const isRed = c.kind === "vermelho";
            marks += `<div class="mk card ${isRed ? "red" : "yellow"}" style="left:${pct2(c.sec, half.durSec)};" title="Cartão ${
              isRed ? "vermelho" : "amarelo"
            } — ${fmtMinSec(c.sec * 1000)}"></div>`;
          });
          (foulsByPid.get(p.id) || []).forEach((f) => {
            marks += `<div class="mk foul" style="left:${pct2(f.sec, half.durSec)};" title="Falta — ${fmtMinSec(f.sec * 1000)}"></div>`;
          });
          return (
            `<div class="row"><div class="label"><span class="num">${esc(p.num)}</span><span class="nm">${esc(p.name)}</span></div>` +
            `<div class="track">${bars}${marks}</div>` +
            `<div class="mins" title="Minutos em campo nesta parte">${Math.round((p.totalSec || 0) / 60)}'</div></div>`
          );
        })
        .join("");

      return (
        `<div class="half-block"><div class="half-title"><h2>${esc(half.label)}</h2>` +
        `<div class="dur">0′ – ${Math.round(half.durSec / 60)}′</div></div>` +
        marcha +
        ruler +
        `<div class="rows">${rows}</div></div>`
      );
    })
    .join("");

  let goalsRows = "";
  halves.forEach((half) => {
    half.goals.forEach((g) => {
      const isNos = g.side === "nos";
      const scorer = isNos && g.scorerId ? playerById(g.scorerId) : undefined;
      goalsRows +=
        `<tr><td>${esc(half.label)}</td><td class="num">${fmtMinSec(g.sec * 1000)}</td>` +
        `<td class="${isNos ? "side-nos" : "side-adv"}">${isNos ? "Nós" : esc(matchInfo.adversario || "Adversário")}</td>` +
        `<td>${scorer ? `#${esc(scorer.num)} ${esc(scorer.name)}` : "—"}</td>` +
        `<td>${esc(g.tipo ? tipoGoloLabel(g.tipo) || g.tipo : "—")}</td>` +
        `<td class="num">${g.zona || "—"}</td>` +
        `<td>${g.marcha[0]}–${g.marcha[1]}</td></tr>`;
    });
  });

  return (
    '<!doctype html><html lang="pt"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>Timeline — ${esc(matchInfo.adversario || "Jogo")}</title>` +
    "<style>" +
    ':root{color-scheme:light;--surface-1:#fcfcfb;--page:#f2f1ec;--text-primary:#0b0b0b;--text-secondary:#52514e;--muted:#898781;--grid:#e1e0d9;--border:rgba(11,11,11,.10);--series-1:#2a78d6;--good:#0ca30c;--critical:#d03b3b;--warning:#fab219;--shadow:0 1px 2px rgba(11,11,11,.05),0 6px 20px rgba(11,11,11,.06);}' +
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--surface-1:#1a1a19;--page:#0d0d0d;--text-primary:#fff;--text-secondary:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--border:rgba(255,255,255,.10);--series-1:#3987e5;--good:#0ca30c;--critical:#e66767;--warning:#c98500;--shadow:0 1px 2px rgba(0,0,0,.35),0 8px 26px rgba(0,0,0,.4);}}' +
    ':root[data-theme="dark"]{color-scheme:dark;--surface-1:#1a1a19;--page:#0d0d0d;--text-primary:#fff;--text-secondary:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--border:rgba(255,255,255,.10);--series-1:#3987e5;--good:#0ca30c;--critical:#e66767;--warning:#c98500;--shadow:0 1px 2px rgba(0,0,0,.35),0 8px 26px rgba(0,0,0,.4);}' +
    "*{box-sizing:border-box;}body{margin:0;background:var(--page);color:var(--text-primary);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:20px 16px 40px;}" +
    ".wrap{max-width:920px;margin:0 auto;display:flex;flex-direction:column;gap:16px;}" +
    ".card{background:var(--surface-1);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);padding:18px;}" +
    ".hdr-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;}" +
    ".hdr-top h1{font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin:0;}" +
    ".hdr-meta{font-size:12.5px;color:var(--muted);}" +
    ".scoreline{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:14px;}" +
    ".team{flex:1;text-align:center;font-size:15px;font-weight:600;min-width:0;}.team.home{text-align:right;}.team.away{text-align:left;}" +
    ".score{font-size:34px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em;white-space:nowrap;}.score .dash{color:var(--muted);font-weight:500;margin:0 6px;}" +
    ".subinfo{text-align:center;font-size:12px;color:var(--muted);margin-top:10px;line-height:1.5;}" +
    ".half-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}" +
    ".half-title h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:0;}" +
    ".half-title .dur{font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums;}" +
    ".marcha-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;}" +
    ".marcha-chip{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;padding:3px 8px;border-radius:20px;border:1px solid var(--border);display:flex;align-items:center;gap:4px;}" +
    ".marcha-chip.nos{color:var(--good);}.marcha-chip.adv{color:var(--critical);}.marcha-chip .t{color:var(--muted);font-weight:500;}" +
    ".ruler{display:flex;margin:0 0 4px 132px;position:relative;height:16px;}" +
    ".ruler span{position:absolute;font-size:10px;color:var(--muted);transform:translateX(-50%);font-variant-numeric:tabular-nums;}" +
    ".row{display:flex;align-items:center;gap:8px;min-height:30px;}" +
    ".row .label{width:132px;flex:0 0 132px;display:flex;align-items:center;gap:6px;font-size:12px;overflow:hidden;}" +
    ".row .num{font-weight:800;font-size:10.5px;color:var(--surface-1);background:var(--text-secondary);width:18px;height:18px;border-radius:5px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}" +
    ".row .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".row .mins{flex:0 0 30px;text-align:right;font-size:11px;font-weight:600;color:var(--text-secondary);font-variant-numeric:tabular-nums;}" +
    ".track{flex:1;position:relative;height:14px;border-radius:7px;background:var(--grid);}" +
    ".bar{position:absolute;top:0;height:14px;border-radius:7px;background:var(--series-1);}" +
    ".mk{position:absolute;top:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8.5px;border:1.5px solid var(--surface-1);}" +
    ".mk.goal{background:var(--good);color:#fff;}" +
    ".mk.card{width:5px;height:7px;border-radius:1px;border:none;}" +
    ".mk.card.yellow{background:var(--warning);}" +
    ".mk.card.red{background:var(--critical);}" +
    ".mk.foul{background:var(--muted);width:6px;height:6px;border:none;}" +
    ".half-block{margin-top:18px;}.half-block:first-of-type{margin-top:4px;}.rows{display:flex;flex-direction:column;gap:6px;}" +
    ".legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--grid);font-size:11.5px;color:var(--text-secondary);}" +
    ".legend .it{display:flex;align-items:center;gap:6px;}.legend .sw{width:18px;height:8px;border-radius:4px;background:var(--series-1);}" +
    ".gtable{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px;}" +
    ".gtable th,.gtable td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--grid);}" +
    ".gtable th{color:var(--muted);font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.04em;}" +
    ".gtable td.num{font-variant-numeric:tabular-nums;text-align:center;}" +
    ".gtable .side-nos{color:var(--good);font-weight:700;}.gtable .side-adv{color:var(--critical);font-weight:700;}" +
    ".tablewrap{overflow-x:auto;}.note{font-size:11.5px;color:var(--muted);line-height:1.5;margin-top:14px;}" +
    "@media (max-width:480px){.row .label{width:96px;flex-basis:96px;}.ruler{margin-left:96px;}.team{font-size:13px;}.score{font-size:26px;}}" +
    "</style></head><body><div class=\"wrap\">" +
    '<div class="card"><div class="hdr-top"><h1>Timeline de jogo</h1>' +
    `<div class="hdr-meta">${matchInfo.jornada ? `Jornada ${esc(matchInfo.jornada)} · ` : ""}${esc(matchInfo.date || "")}</div></div>` +
    '<div class="scoreline"><div class="team home">Nós</div>' +
    `<div class="score"><span>${scoreNos}</span><span class="dash">–</span><span>${scoreAdv}</span></div>` +
    `<div class="team away">${esc(matchInfo.adversario || "Adversário")}</div></div>` +
    (matchInfo.local ? `<div class="subinfo">${esc(matchInfo.local)}</div>` : "") +
    "</div>" +
    `<div class="card">${halvesHtml}` +
    '<div class="legend"><div class="it"><span class="sw"></span>Em campo</div><div class="it">⚽ Golo marcado</div><div class="it">🟨/🟥 Cartão</div><div class="it">Ponto cinzento — falta</div></div>' +
    "</div>" +
    '<div class="card"><div class="half-title" style="margin-bottom:8px;"><h2>Minutos em campo (total do jogo)</h2></div>' +
    '<div class="tablewrap"><table class="gtable"><thead><tr><th>Atleta</th><th class="num">Min</th></tr></thead>' +
    `<tbody>${totalsHtml}</tbody></table></div></div>` +
    '<div class="card"><div class="half-title" style="margin-bottom:8px;"><h2>Registo de golos</h2></div>' +
    '<div class="tablewrap"><table class="gtable"><thead><tr><th>Parte</th><th class="num">Tempo</th><th>Equipa</th><th>Marcador</th><th>Tipo</th><th class="num">Zona</th><th>Marcha</th></tr></thead>' +
    `<tbody>${goalsRows}</tbody></table></div></div>` +
    '<div class="card"><div class="note" style="margin-top:0;">Gerado automaticamente pelo Teambench a partir do registo cronológico do jogo.</div></div>' +
    "</div></body></html>"
  );
}
