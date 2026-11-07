// Aviso de lances recusados pelo servidor (specs/010-fila-recusados,
// contracts/estado-sincronizacao.md). Partilhado pelo ecrã principal, pelo
// "Jogo ao vivo" e pela Consola.
import { useState } from "preact/hooks";
import { textoRecusados } from "./rejection";
import type { useOutboxSync } from "./useOutboxSync";

type Sync = Pick<
  ReturnType<typeof useOutboxSync>,
  "rejectedCount" | "rejectedReasons" | "rejectedOtherDetail" | "rejectedCorrupted" | "retryNow" | "syncing"
>;

export function RejectedNotice({ sync }: { sync: Sync }) {
  const [trying, setTrying] = useState(false);
  if (sync.rejectedCorrupted) {
    return (
      <div className="banner error" style={{ marginBottom: 12 }}>
        Não foi possível ler a lista de lances recusados deste aparelho. Não limpes os dados da app e contacta o suporte.
      </div>
    );
  }
  if (sync.rejectedCount === 0) return null;
  const { titulo, linhas } = textoRecusados(sync.rejectedCount, sync.rejectedReasons, sync.rejectedOtherDetail);
  const busy = trying || sync.syncing;
  return (
    <div className="banner warn" style={{ marginBottom: 12 }} role="status">
      <div>{titulo}</div>
      {linhas.length > 0 && (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {linhas.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn sm"
        style={{ marginTop: 8 }}
        disabled={busy}
        onClick={async () => {
          setTrying(true);
          try {
            await sync.retryNow();
          } finally {
            setTrying(false);
          }
        }}
      >
        {busy ? "A tentar…" : "Tentar outra vez"}
      </button>
    </div>
  );
}
