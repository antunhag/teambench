// Planeador de rotações — previsão de tempo em quadra e substituições a
// partir de quem foi convocado para o jogo. Ao contrário do resto do motor
// (sempre event-sourced, olhando para o que já aconteceu), isto é um plano
// hipotético pré-jogo: nunca lê nem escreve em MatchEvent, e vive numa
// tabela própria no Supabase — nunca em match_events.
//
// O plano é montado À MÃO pelo treinador, turno a turno — não há geração
// automática aqui (já existiu uma versão com divisão igual automática;
// o pedido foi tirar isso e deixar o treinador montar o plano ele mesmo,
// jogo a jogo). O que resta neste módulo são só os blocos que qualquer
// forma de montar o plano precisa: validar que dois turnos da mesma vaga
// não se sobrepõem, e agregar os segundos previstos por atleta.

export interface RotationStint {
  playerId: string;
  /** 0..3 — vaga de linha que este turno ocupa (guarda-redes fica de fora da rotação). */
  slotIndex: number;
  period: number;
  startSec: number;
  endSec: number;
}

// 4 vagas FIXAS de linha, sempre nesta ordem — slotIndex é o índice neste
// array (0=Fixo, 1=Ala Esquerda, 2=Ala Direita, 3=Pivô). Combina com a
// formação real do futsal (1 Fixo + 2 Alas + 1 Pivô em quadra ao mesmo
// tempo) — ao contrário de agrupar por uma única posição do plantel, as duas
// Alas são vagas diferentes e simultâneas (o atleta joga do lado oposto ao
// pé dominante, pra poder cortar pra dentro e rematar). Guarda-redes nem dá
// pra representar aqui — o próprio tipo já impede, sem precisar filtrar.
export type RotationSlotType = "Fixo" | "Ala Esquerda" | "Ala Direita" | "Pivô";
export const ROTATION_SLOT_TYPES: readonly RotationSlotType[] = ["Fixo", "Ala Esquerda", "Ala Direita", "Pivô"];

/**
 * Classificação do atleta numa vaga — dado do ATLETA (cadastrado uma vez no
 * Plantel), não do jogo. A=primeira opção, B=rotação, C=apoio. Uma vaga
 * AUSENTE do objeto nunca é "C" nem "sem nota" — significa que não é vaga
 * habitual pro atleta. Uma vaga PRESENTE com `null` significa o oposto: é
 * habitual, só ainda não foi avaliada. Ao contrário do modelo antigo (lista
 * ordenada, um atleta por posição no ranking de cada um), aqui vários
 * atletas podem ser "A" na mesma vaga ao mesmo tempo — é assim que times de
 * verdade têm 2-3 opções igualmente boas pra uma posição.
 */
export type AptitudeQuality = "A" | "B" | "C";
export type AptitudeBySlot = Partial<Record<RotationSlotType, AptitudeQuality | null>>;

/** Vagas habituais do atleta (as presentes em `bySlot`), ordenadas por qualidade — A, depois B, depois C, sem-classificação por último. Empate mantém a ordem fixa de ROTATION_SLOT_TYPES (sort é estável). */
export function sortedAptitudeSlots(bySlot: AptitudeBySlot): RotationSlotType[] {
  const rank = (q: AptitudeQuality | null | undefined) => (q ? { A: 0, B: 1, C: 2 }[q] : 3);
  return ROTATION_SLOT_TYPES.filter((slot) => slot in bySlot).sort((a, b) => rank(bySlot[a]) - rank(bySlot[b]));
}

/** "Ala Esquerda (A)" quando classificada; só "Ala Esquerda" quando habitual mas ainda sem nota. */
export function aptitudeLabel(slot: RotationSlotType, quality: AptitudeQuality | null | undefined): string {
  return quality ? `${slot} (${quality})` : slot;
}

/**
 * Verdadeiro se um turno de `startSec` a `endSec` nessa vaga/parte bateria
 * com algum turno já existente — usado antes de aceitar um turno novo
 * montado à mão, pra nunca deixar dois atletas sobrepostos na mesma vaga.
 * `ignoreStintId` exclui o próprio turno da checagem ao editar um já
 * existente (comparando por referência, já que `RotationStint` não tem id
 * próprio — quem chama passa o objeto que está editando).
 */
export function stintsOverlap(
  stints: RotationStint[],
  slotIndex: number,
  period: number,
  startSec: number,
  endSec: number,
  ignoreStint?: RotationStint
): boolean {
  return stints.some(
    (s) =>
      s !== ignoreStint &&
      s.slotIndex === slotIndex &&
      s.period === period &&
      startSec < s.endSec &&
      endSec > s.startSec
  );
}

/**
 * O turno de OUTRA vaga que bateria com um turno de `startSec` a `endSec`
 * pra esse atleta nessa parte, se houver — um atleta não pode estar em duas
 * vagas ao mesmo tempo em quadra (ex.: Ala Direita e Pivô simultaneamente).
 * Turnos do atleta NA MESMA vaga (`slotIndex`) não contam — ele pode voltar
 * pra mesma vaga mais tarde na parte, isso não é um conflito.
 */
export function playerOverlapsOtherSlot(
  stints: RotationStint[],
  playerId: string,
  period: number,
  slotIndex: number,
  startSec: number,
  endSec: number
): RotationStint | null {
  return (
    stints.find(
      (s) =>
        s.playerId === playerId &&
        s.period === period &&
        s.slotIndex !== slotIndex &&
        startSec < s.endSec &&
        endSec > s.startSec
    ) ?? null
  );
}

/** O turno que um atleta deveria estar cumprindo num instante `atSec` da parte, se houver. */
export function currentStintFor(
  stints: RotationStint[],
  playerId: string,
  period: number,
  atSec: number
): RotationStint | null {
  return stints.find((s) => s.playerId === playerId && s.period === period && atSec >= s.startSec && atSec < s.endSec) ?? null;
}

/** O próximo turno previsto para a mesma vaga, a partir de `afterSec` (inclusive) — "quem entra depois". */
export function nextStintInSlot(
  stints: RotationStint[],
  slotIndex: number,
  period: number,
  afterSec: number
): RotationStint | null {
  const candidates = stints.filter((s) => s.slotIndex === slotIndex && s.period === period && s.startSec >= afterSec);
  if (!candidates.length) return null;
  return candidates.reduce((best, s) => (s.startSec < best.startSec ? s : best));
}

/** Total de segundos previstos por atleta, somando todas as partes. */
export function plannedSecondsByPlayer(stints: RotationStint[]): Record<string, number> {
  const out: Record<string, number> = {};
  stints.forEach((s) => {
    out[s.playerId] = (out[s.playerId] ?? 0) + (s.endSec - s.startSec);
  });
  return out;
}

/** Segundos previstos por atleta, abertos por parte — para a tabela "1ª/2ª/Total". */
export function plannedSecondsByPlayerPerPeriod(stints: RotationStint[]): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {};
  stints.forEach((s) => {
    const byPeriod = out[s.playerId] ?? (out[s.playerId] = {});
    byPeriod[s.period] = (byPeriod[s.period] ?? 0) + (s.endSec - s.startSec);
  });
  return out;
}
