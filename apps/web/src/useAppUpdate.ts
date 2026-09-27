import { useEffect, useRef, useState } from "preact/hooks";
import { registerSW } from "virtual:pwa-register";

// Confere se há uma versão nova a cada 30 min enquanto a aba fica aberta —
// sem isto, o service worker só checaria ao recarregar a página, e um
// tablet do clube pode ficar com o mesmo jogo aberto a tarde toda.
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Nunca troca de versão sozinho: registerType "prompt" (ver vite.config.ts)
 * deixa a troca esperando confirmação — um jogo ao vivo aberto no tablet do
 * clube não pode recarregar a página sozinho no meio de um lance. Devolve
 * `needRefresh` pra mostrar um aviso, e `applyUpdate` pra só trocar quando
 * o treinador tocar.
 */
export function useAppUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    updateSWRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        intervalId = setInterval(() => {
          registration.update().catch(() => {
            // Sem rede nesse instante — tenta de novo no próximo ciclo, sem alarde nenhum.
          });
        }, CHECK_INTERVAL_MS);
      },
    });
    return () => {
      if (intervalId != null) clearInterval(intervalId);
    };
  }, []);

  return {
    needRefresh,
    applyUpdate: () => updateSWRef.current?.(true),
  };
}
