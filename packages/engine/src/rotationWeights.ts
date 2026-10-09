// Peso inicial sugerido por vaga, antes de qualquer ajuste manual do
// treinador (specs/004-rotation-plan-generation/) — ponto de partida pra um
// jogo específico, nunca persistido em player_aptitudes. Escala curta (1-5),
// não um número livre (Princípio V da constituição — simplicidade pro
// treinador não-técnico).
import type { AptitudeQuality } from "./rotationPlan";
import type { AvailabilityStatus } from "./rotationSuggestion";

const BASE_WEIGHT: Record<AptitudeQuality, number> = { A: 5, B: 3, C: 1 };
const NO_CLASSIFICATION_WEIGHT = 1;
const MIN_WEIGHT = 1;

/**
 * Peso sugerido (1-5) pra um atleta numa vaga — deriva da aptidão cadastrada
 * (A > B > C > sem classificação) combinada com o estado do atleta: "a
 * retomar" reduz o peso pela metade (arredondado pra baixo, nunca abaixo de
 * 1), refletindo "dosear a entrada" sem zerar o atleta. "Indisponível" nunca
 * deve chegar aqui — esses atletas são filtrados antes (FR-004), nunca
 * recebem peso nem aparecem na geração.
 */
export function defaultWeight(quality: AptitudeQuality | null, availabilityStatus: AvailabilityStatus): number {
  const base = quality ? BASE_WEIGHT[quality] : NO_CLASSIFICATION_WEIGHT;
  if (availabilityStatus === "a_retomar") return Math.max(MIN_WEIGHT, Math.floor(base / 2));
  return base;
}
