import { useCallback, useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

export interface MatchFormatRow {
  id: string;
  name: string;
  periodCount: number;
  periodMinutes: number;
  overtimePeriodCount: number;
  overtimeMinutes: number;
  isDefault: boolean;
  /** Mínimo esperado de convocados pra um jogo deste formato — null = sem aviso configurado (specs/007-convocados-sync/). */
  minConvocados: number | null;
}

export interface NewMatchFormat {
  name: string;
  periodCount: number;
  periodMinutes: number;
  overtimePeriodCount: number;
  overtimeMinutes: number;
  minConvocados: number | null;
}

export function useMatchFormats(teamId: string) {
  const [formats, setFormats] = useState<MatchFormatRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    const { data, error } = await supabase
      .from("match_formats")
      .select("id, name, period_count, period_minutes, overtime_period_count, overtime_minutes, is_default, min_convocados")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setFormats(
      (data ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        periodCount: f.period_count,
        periodMinutes: f.period_minutes,
        overtimePeriodCount: f.overtime_period_count,
        overtimeMinutes: f.overtime_minutes,
        isDefault: f.is_default,
        minConvocados: f.min_convocados,
      }))
    );
    setStatus("ready");
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addFormat(input: NewMatchFormat, makeDefault: boolean) {
    if (makeDefault) {
      await supabase.from("match_formats").update({ is_default: false }).eq("team_id", teamId);
    }
    const { error } = await supabase.from("match_formats").insert({
      id: crypto.randomUUID(),
      team_id: teamId,
      name: input.name,
      period_count: input.periodCount,
      period_minutes: input.periodMinutes,
      overtime_period_count: input.overtimePeriodCount,
      overtime_minutes: input.overtimeMinutes,
      is_default: makeDefault,
      min_convocados: input.minConvocados,
    });
    if (error) throw error;
    await refresh();
  }

  async function setDefault(id: string) {
    await supabase.from("match_formats").update({ is_default: false }).eq("team_id", teamId);
    const { error } = await supabase.from("match_formats").update({ is_default: true }).eq("id", id);
    if (error) throw error;
    await refresh();
  }

  /**
   * Não existia nenhuma forma de editar um formato já criado (só
   * add/setDefault) — necessário pra um formato já em uso em jogos reais
   * (ex.: "SUB-15 DIVISÃO ELITE") poder ganhar um `minConvocados` depois de
   * já existir (specs/007-convocados-sync/ US3, research.md Decisão 6).
   */
  async function updateFormat(id: string, input: NewMatchFormat) {
    const { error } = await supabase
      .from("match_formats")
      .update({
        name: input.name,
        period_count: input.periodCount,
        period_minutes: input.periodMinutes,
        overtime_period_count: input.overtimePeriodCount,
        overtime_minutes: input.overtimeMinutes,
        min_convocados: input.minConvocados,
      })
      .eq("id", id);
    if (error) throw error;
    await refresh();
  }

  return { formats, status, errorMessage, addFormat, setDefault, updateFormat, refresh };
}
