// Tipos do motor de jogo — espelham o formato de dados do banco.html original
// (AAL-NEW), para que a porta seja verificável 1:1 por testes de regressão.

export type Position = "Guarda-Redes" | "Fixo" | "Ala Esquerda" | "Ala Direita" | "Pivô" | "Universal";

export interface Player {
  id: string;
  num: string;
  name: string;
  pos: Position;
}

// Formato de jogo parametrizável por equipa/competição — no banco.html original
// isto não existia (o treinador só carregava "iniciar"/"terminar parte" sem
// duração fixa). Aqui vira um dado de entrada explícito em vez de um número
// escondido no código, para servir qualquer clube.
export interface MatchFormat {
  periodCount: number;
  periodMinutes: number;
  overtimePeriodCount: number;
  overtimeMinutes: number;
}

export type EventType =
  | "kickoff"
  | "pausa"
  | "fim_periodo"
  | "golo"
  | "golo_sofrido"
  | "cartao_amarelo"
  | "cartao_vermelho"
  | "falta"
  | "falta_sofrida"
  | "fim_pausa"
  | "lesao_inicio"
  | "lesao_fim"
  | "substituicao"
  // Seleção de convocados/titulares (specs/007-convocados-sync/) — ao
  // contrário dos demais tipos acima, não representam algo que aconteceu EM
  // QUADRA; são metadados de escalação, nunca aparecem na timeline/relatório
  // do jogo. Existem como eventos de verdade (não um campo solto) só pra
  // reaproveitar a fila de sincronização offline-safe já existente — ver
  // research.md Decisão 1.
  | "convocado_add"
  | "convocado_remove"
  | "titular_add"
  | "titular_remove";

/**
 * Os 4 tipos de evento de escalação (ver `EventType` acima) — nunca vivem em
 * `LiveMatchState.events` (reservado a ações em quadra; ver
 * `LiveMatchState.squadEvents`), mas continuam na MESMA tabela
 * `match_events` do Supabase (reaproveitando a fila de sincronização).
 * Qualquer consulta que busque eventos pra exibir como registo
 * cronológico/timeline/relatório do jogo precisa excluir estes tipos — usar
 * esta constante em vez de repetir a lista em cada sítio.
 */
export const SQUAD_EVENT_TYPES: readonly EventType[] = ["convocado_add", "convocado_remove", "titular_add", "titular_remove"];

export interface MatchEvent {
  id: string;
  /** Gerado no dispositivo no momento da criação — chave de idempotência na sincronização. */
  clientEventId?: string;
  type: EventType;
  playerId: string | null;
  ms: number;
  min: number;
  sec: number;
  period: number;
  ts: number;
  assistId?: string | null;
  outId?: string | null;
  tipo?: string | null;
  zona?: number | null;
  /** Superioridade numérica da transição (ex.: "3x1") — só usado quando tipo === "trs". */
  transicaoNumeros?: string | null;
  /** Baliza adversária desguarnecida (goleiro-linha) na transição — só usado quando tipo === "trs". */
  transicaoBalizaDeserta?: boolean;
  lineup?: string[];
  label?: string;
  reasonId?: string;
  duracaoSec?: number;
  playerSeconds?: Record<string, number>;
  durSec?: number;
  correcao?: boolean;
  aproximado?: boolean;
}

export interface ClockAccounting {
  /** Segundos acumulados por jogador, somando todas as partes já assentadas. */
  secondsPlayed: Record<string, number>;
  /** Marca (ms do relógio de jogo) desde quando cada jogador está em campo, enquanto o relógio corre. */
  onCourtSince: Record<string, number>;
}

export interface Score {
  nos: number;
  advers: number;
}

export interface MatchRow {
  playerId: string;
  num: string;
  nome: string;
  convocado: "Sim";
  titular: "Sim" | "Não";
  min: number;
  golos: number;
  assist: number;
  ca: number;
  cv: number;
}
