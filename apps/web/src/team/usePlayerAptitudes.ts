import { useCallback, useEffect, useState } from "preact/hooks";
import * as engine from "@teambench/engine";
import { supabase } from "../supabaseClient";

// Aptidões do atleta — quais vagas sabe jogar, em ordem de prioridade. É
// dado do PLANTEL (como a posição), não do jogo: cadastra uma vez na gestão
// da equipa, vale pra todo plano de rotação futuro. Por isso vive em
// team/ junto de usePlayers, não em match/ — ver useRotationPlan.ts
// (match/) para o equivalente por jogo.

export function usePlayerAptitudes(teamId: string) {
  const [byPlayer, setByPlayer] = useState<Record<string, engine.RotationSlotType[]>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    const { data, error } = await supabase
      .from("player_aptitudes")
      .select("player_id, slot_type, priority")
      .eq("team_id", teamId)
      .order("priority", { ascending: true });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    const grouped: Record<string, engine.RotationSlotType[]> = {};
    (data ?? []).forEach((row) => {
      const slots = grouped[row.player_id] ?? (grouped[row.player_id] = []);
      slots.push(row.slot_type as engine.RotationSlotType);
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
   * atropelarem). Valida sem duplicata antes de mexer no banco: salvar é
   * "apaga tudo do atleta e reinsere", então um insert rejeitado por
   * duplicata deixaria o atleta sem aptidão nenhuma (o delete já teria
   * acontecido) — ver 0013_player_aptitudes.sql.
   */
  async function saveAptitudes(playerId: string, slots: engine.RotationSlotType[]) {
    if (new Set(slots).size !== slots.length) {
      throw new Error("Vaga repetida nas aptidões do atleta.");
    }
    const { error: deleteError } = await supabase.from("player_aptitudes").delete().eq("player_id", playerId);
    if (deleteError) throw deleteError;

    if (slots.length > 0) {
      const { error: insertError } = await supabase.from("player_aptitudes").insert(
        slots.map((slotType, i) => ({
          player_id: playerId,
          team_id: teamId,
          slot_type: slotType,
          priority: i,
        }))
      );
      if (insertError) throw insertError;
    }
    setByPlayer((prev) => ({ ...prev, [playerId]: slots }));
  }

  return { byPlayer, status, errorMessage, saveAptitudes, refresh };
}
