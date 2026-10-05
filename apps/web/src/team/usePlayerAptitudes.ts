import { useCallback, useEffect, useState } from "preact/hooks";
import * as engine from "@teambench/engine";
import { supabase } from "../supabaseClient";

// Aptidões do atleta — classificação A/B/C independente em cada vaga de
// rotação (Fixo/Ala Esquerda/Ala Direita/Pivô). É dado do PLANTEL (como a
// posição), não do jogo: cadastra uma vez na gestão da equipa, vale pra todo
// plano de rotação futuro. Por isso vive em team/ junto de usePlayers, não
// em match/ — ver useRotationPlan.ts (match/) para o equivalente por jogo.
//
// Uma vaga AUSENTE do objeto de um atleta não é "vaga ruim" — é vaga não
// habitual. Uma vaga presente com `quality: null` é habitual, só ainda sem
// nota. Várias atletas podem ser "A" na mesma vaga ao mesmo tempo (ver
// AptitudeBySlot em rotationPlan.ts) — não há mais um ranking único por
// atleta como no modelo antigo.

export function usePlayerAptitudes(teamId: string) {
  const [byPlayer, setByPlayer] = useState<Record<string, engine.AptitudeBySlot>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    const { data, error } = await supabase.from("player_aptitudes").select("player_id, slot_type, quality").eq("team_id", teamId);
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    const grouped: Record<string, engine.AptitudeBySlot> = {};
    (data ?? []).forEach((row) => {
      const bySlot = grouped[row.player_id] ?? (grouped[row.player_id] = {});
      bySlot[row.slot_type as engine.RotationSlotType] = row.quality as engine.AptitudeQuality | null;
    });
    setByPlayer(grouped);
    setStatus("ready");
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Substitui as aptidões de UM atleta (apaga e reinsere só as linhas dele —
   * nunca `where team_id`, pra dois editores em atletas diferentes não se
   * atropelarem). Uma vaga ausente de `bySlot` vira "sem linha" (não
   * habitual); uma vaga presente vira uma linha com a `quality` daquela
   * chave, inclusive `null` (habitual, sem nota ainda).
   */
  async function saveAptitudes(playerId: string, bySlot: engine.AptitudeBySlot) {
    const { error: deleteError } = await supabase.from("player_aptitudes").delete().eq("player_id", playerId);
    if (deleteError) throw deleteError;

    const entries = Object.entries(bySlot) as [engine.RotationSlotType, engine.AptitudeQuality | null][];
    if (entries.length > 0) {
      const { error: insertError } = await supabase.from("player_aptitudes").insert(
        entries.map(([slotType, quality]) => ({
          player_id: playerId,
          team_id: teamId,
          slot_type: slotType,
          quality,
        }))
      );
      if (insertError) throw insertError;
    }
    setByPlayer((prev) => ({ ...prev, [playerId]: bySlot }));
  }

  return { byPlayer, status, errorMessage, saveAptitudes, refresh };
}
