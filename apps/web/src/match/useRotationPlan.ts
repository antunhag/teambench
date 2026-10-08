import { useCallback, useEffect, useState } from "preact/hooks";
import * as engine from "@teambench/engine";
import { supabase } from "../supabaseClient";

// Plano de rotação de um jogo — nunca mexe em match_events (é um plano
// hipotético pré-jogo, não um fato do que aconteceu). Um plano só por jogo
// (match_id é único na tabela); "sem plano" é um estado normal, não um erro.

export function useRotationPlan(teamId: string, matchId: string) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [stints, setStints] = useState<engine.RotationStint[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    const { data: plan, error: planError } = await supabase
      .from("rotation_plans")
      .select("id")
      .eq("match_id", matchId)
      .maybeSingle();
    if (planError) {
      setStatus("error");
      setErrorMessage(planError.message);
      return;
    }
    if (!plan) {
      setPlanId(null);
      setStints([]);
      setStatus("ready");
      return;
    }
    const { data: rows, error: stintsError } = await supabase
      .from("rotation_plan_stints")
      .select("player_id, slot_index, period, start_sec, end_sec")
      .eq("plan_id", plan.id);
    if (stintsError) {
      setStatus("error");
      setErrorMessage(stintsError.message);
      return;
    }
    setPlanId(plan.id);
    setStints(
      (rows ?? []).map((r) => ({
        playerId: r.player_id,
        slotIndex: r.slot_index,
        period: r.period,
        startSec: r.start_sec,
        endSec: r.end_sec,
      }))
    );
    setStatus("ready");
  }, [matchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Substitui o plano inteiro pelos turnos dados — regenerar automaticamente
   * ou salvar um ajuste manual usam o mesmo caminho. Cria a linha de
   * rotation_plans na primeira vez; nas seguintes, apaga e reinsere os
   * turnos (não precisa de diff fino — são poucas dezenas de linhas por
   * jogo). Lança o erro em vez de engolir — quem chama decide como avisar.
   */
  async function saveStints(newStints: engine.RotationStint[]) {
    let id = planId;
    if (!id) {
      const { data, error } = await supabase
        .from("rotation_plans")
        .insert({ match_id: matchId, team_id: teamId })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
      setPlanId(id);
    } else {
      const { error } = await supabase.from("rotation_plans").update({ updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    }

    const { error: deleteError } = await supabase.from("rotation_plan_stints").delete().eq("plan_id", id);
    if (deleteError) throw deleteError;

    if (newStints.length > 0) {
      const { error: insertError } = await supabase.from("rotation_plan_stints").insert(
        newStints.map((s) => ({
          plan_id: id,
          team_id: teamId,
          player_id: s.playerId,
          slot_index: s.slotIndex,
          period: s.period,
          start_sec: s.startSec,
          end_sec: s.endSec,
        }))
      );
      if (insertError) throw insertError;
    }
    setStints(newStints);

    // "A retomar" vale só pro próximo jogo planeado — reverte sozinho assim
    // que um plano que inclui o atleta é de facto guardado (Decisão 1,
    // specs/003-data-driven-rotation/research.md). Filtrado no servidor por
    // availability_status='a_retomar': nunca toca quem já está "apto" ou em
    // "indisponivel" (esse só reverte manualmente, é lesão longa).
    const playerIds = [...new Set(newStints.map((s) => s.playerId))];
    if (playerIds.length > 0) {
      const { error: availabilityError } = await supabase
        .from("players")
        .update({ availability_status: "apto", availability_note: null })
        .in("id", playerIds)
        .eq("availability_status", "a_retomar");
      if (availabilityError) throw availabilityError;
    }
  }

  return { hasPlan: planId !== null, stints, status, errorMessage, saveStints, refresh };
}
