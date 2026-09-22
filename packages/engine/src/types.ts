// Tipos do motor de jogo — espelham o formato de dados do banco.html original
// (AAL-NEW), para que a porta seja verificável 1:1 por testes de regressão.

export type Position = "Guarda-Redes" | "Fixo" | "Ala" | "Pivô" | "Universal";

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
  | "lesao_inicio"
  | "lesao_fim"
  | "substituicao";

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
