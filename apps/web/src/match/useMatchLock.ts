import { useEffect, useRef, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

const HEARTBEAT_MS = 20_000;

export type LockStatus = "checking" | "master" | "readonly" | "error";

type ClaimedMatch = { live_holder_id: string | null };

/**
 * Trava de edição por jogo: só quem "reivindicar" o jogo primeiro (por
 * utilizador, não por aparelho) pode registar eventos — qualquer outra conta
 * que abra o mesmo jogo enquanto a trava estiver ativa entra em modo leitura.
 * Sem rede não há como reivindicar — nesse caso assume-se dono local, e a
 * app tenta reivindicar de verdade assim que a rede voltar.
 */
export function useMatchLock(matchId: string) {
  const [status, setStatus] = useState<LockStatus>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const releasedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    releasedRef.current = false;

    async function claim() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      const { data, error } = await supabase.rpc("claim_live_match", { p_match_id: matchId });
      if (cancelled) return;
      if (error) {
        // Sem rede (ou erro transitório) — segue como dono local; tenta de
        // novo no próximo heartbeat.
        setStatus((prev) => (prev === "checking" ? "master" : prev));
        setErrorMessage(error.message);
        return;
      }
      const row = data as ClaimedMatch | null;
      setStatus(row?.live_holder_id === userId ? "master" : "readonly");
      setErrorMessage("");
    }

    claim();
    const interval = setInterval(claim, HEARTBEAT_MS);

    function release() {
      if (releasedRef.current) return;
      releasedRef.current = true;
      supabase.rpc("release_live_match", { p_match_id: matchId });
    }
    window.addEventListener("beforeunload", release);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("beforeunload", release);
      release();
    };
  }, [matchId]);

  return { status, errorMessage };
}
