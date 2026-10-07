import * as engine from "@teambench/engine";
import { useEffect, useRef, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

const HEARTBEAT_MS = 20_000;

export type LockStatus = "checking" | "master" | "readonly" | "error";

export type ResourceLockType = "roster" | "match_format" | "invites";

type LockRow = { holder_id: string | null; heartbeat_at: string | null };

/**
 * Generaliza apps/web/src/match/useMatchLock.ts (trava do jogo, migração
 * 0009) pra Plantel/Formato de Jogo/Convites — mesma ideia (uma conta, um
 * recurso, até libertar; heartbeat de 20s; nunca por aparelho/aba), agora
 * parametrizada por (teamId, resourceType) em vez de matchId, usando a
 * tabela genérica resource_locks (migração 0016). "Livre vs. minha vs.
 * obsoleta" usa lockStatusFor (packages/engine/src/resourceLock.ts), a
 * mesma lógica pura já coberta por testes.
 *
 * Ao contrário do jogo (onde entrar na tela já É a intenção de editar),
 * Plantel/Formato de Jogo/Convites ficam sempre visíveis no painel — só
 * entram em disputa pela trava quando `enabled` é true (ex.: o utilizador
 * clicou "Editar" nalguma linha), nunca só por estar a ver a lista. Ver
 * specs/001-multi-user-access/spec.md, FR-005/FR-006.
 */
export function useResourceLock(teamId: string, resourceType: ResourceLockType, enabled: boolean) {
  const [status, setStatus] = useState<LockStatus>(enabled ? "checking" : "master");
  const [errorMessage, setErrorMessage] = useState("");
  const releasedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus("master");
      setErrorMessage("");
      return;
    }
    let cancelled = false;
    releasedRef.current = false;

    async function claim() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;

      const { data, error } = await supabase.rpc("claim_resource_lock", {
        p_team_id: teamId,
        p_resource_type: resourceType,
      });
      if (cancelled) return;
      if (error) {
        // Sem rede (ou erro transitório) — segue como dono local; tenta de
        // novo no próximo heartbeat (mesmo comportamento de useMatchLock).
        setStatus((prev) => (prev === "checking" ? "master" : prev));
        setErrorMessage(error.message);
        return;
      }
      const row = data as LockRow | null;
      setStatus(
        engine.lockStatusFor(row ? { holderId: row.holder_id, heartbeatAt: row.heartbeat_at } : null, userId, Date.now())
      );
      setErrorMessage("");
    }

    claim();
    const interval = setInterval(claim, HEARTBEAT_MS);

    function release() {
      if (releasedRef.current) return;
      releasedRef.current = true;
      supabase.rpc("release_resource_lock", { p_team_id: teamId, p_resource_type: resourceType });
    }
    window.addEventListener("beforeunload", release);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("beforeunload", release);
      release();
    };
  }, [teamId, resourceType, enabled]);

  return { status, errorMessage };
}
