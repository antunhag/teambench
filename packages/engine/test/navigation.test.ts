import { describe, expect, it } from "vitest";
import { visibleNavItems } from "../src/navigation";

describe("visibleNavItems", () => {
  it("viewer vê só os ecrãs de leitura — nunca Acesso à Equipa", () => {
    const ids = visibleNavItems("viewer").map((i) => i.id);
    expect(ids).toEqual(["calendar", "roster", "match-formats"]);
  });

  it("data_entry vê exatamente os mesmos ecrãs que viewer — nunca Acesso à Equipa", () => {
    const ids = visibleNavItems("data_entry").map((i) => i.id);
    expect(ids).toEqual(["calendar", "roster", "match-formats"]);
  });

  it("team_admin vê todos os ecrãs, incluindo Acesso à Equipa", () => {
    const ids = visibleNavItems("team_admin").map((i) => i.id);
    expect(ids).toEqual(["calendar", "roster", "match-formats", "team-members"]);
  });

  it("nunca devolve um item desabilitado — só os permitidos, nenhum a mais", () => {
    expect(visibleNavItems("viewer").some((i) => i.id === "team-members")).toBe(false);
  });
});
