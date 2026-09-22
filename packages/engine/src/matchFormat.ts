// Formato de jogo parametrizável (duração de cada parte) — cada clube define
// o seu (ex.: Sub-13 2×20min, Sub-15 2×25min, com ou sem prolongamento).
// O motor recebe isto como dado de entrada em vez de assumir um valor fixo.
import type { MatchFormat } from "./types";

/** Rótulo da parte atual (1ª Parte, 2ª Parte, Prolongamento 1, ...). */
export function periodLabel(periodNumber: number, format?: MatchFormat): string {
  const regularCount = format?.periodCount ?? 2;
  if (periodNumber <= regularCount) {
    if (periodNumber === 1) return "1ª Parte";
    if (periodNumber === 2) return "2ª Parte";
    return `${periodNumber}ª Parte`;
  }
  const overtimeNumber = periodNumber - regularCount;
  return `Prolongamento ${overtimeNumber}`;
}

/** Duração esperada (ms) da parte `periodNumber`, segundo o formato configurado. */
export function periodDurationMs(format: MatchFormat, periodNumber: number): number {
  const minutes = periodNumber <= format.periodCount ? format.periodMinutes : format.overtimeMinutes;
  return minutes * 60000;
}

/** Verdadeiro quando o tempo decorrido já ultrapassou a duração configurada — só um aviso, nunca corta o relógio sozinho (o treinador continua no controlo manual). */
export function isPeriodOverdue(elapsedMs: number, format: MatchFormat, periodNumber: number): boolean {
  return elapsedMs > periodDurationMs(format, periodNumber);
}

/** Total de partes do jogo neste formato (regulares + prolongamento), se o prolongamento chegar a ser jogado. */
export function totalPeriods(format: MatchFormat): number {
  return format.periodCount + format.overtimePeriodCount;
}

/** Verdadeiro quando `periodNumber` é a última parte deste formato — terminá-la termina o jogo, não abre mais uma. */
export function isLastPeriod(periodNumber: number, format: MatchFormat): boolean {
  return periodNumber >= totalPeriods(format);
}
