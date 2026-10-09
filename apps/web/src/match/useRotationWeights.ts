import { useCallback, useEffect, useState } from "preact/hooks";
import * as engine from "@teambench/engine";
import { supabase } from "../supabaseClient";

// Peso de confiança do treinador num atleta, por vaga, pra UM jogo
// específico (specs/004-rotation-plan-generation/) — guarda só o que foi
// AJUSTADO manualmente (sparse); o padrão sugerido (aptidão + estado) é
// calculado por quem usa este hook via `engine.defaultWeight`, nunca
// persistido até o treinador mexer. Nunca escreve em `player_aptitudes`.

export function useRotationWeights(teamId: string, matchId: string) {
  const [weightsByPlayerSlot, setWeightsByPlayerSlot] = useState<Record<string, Partial<Record<engine.RotationSlotType, number>>>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    const { data, error } = await supabase
      .from("rotation_plan_weights")
      .select("player_id, slot_type, weight")
      .eq("match_id", matchId);
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    const grouped: Record<string, Partial<Record<engine.RotationSlotType, number>>> = {};
    (data ?? []).forEach((row) => {
      const bySlot = grouped[row.player_id] ?? (grouped[row.player_id] = {});
      bySlot[row.slot_type as engine.RotationSlotType] = row.weight;
    });
    setWeightsByPlayerSlot(grouped);
    setStatus("ready");
  }, [matchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function setWeight(playerId: string, slot: engine.RotationSlotType, weight: number) {
    const { error } = await supabase.from("rotation_plan_weights").upsert(
      { match_id: matchId, team_id: teamId, player_id: playerId, slot_type: slot, weight },
      { onConflict: "match_id,player_id,slot_type" }
    );
    if (error) throw error;
    setWeightsByPlayerSlot((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [slot]: weight } }));
  }

  return { weightsByPlayerSlot, status, errorMessage, setWeight, refresh };
}
