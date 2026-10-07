import { describe, expect, it } from "vitest";
import { lockStatusFor, LOCK_STALE_MS, type ResourceLockRow } from "../src/resourceLock";

const me = "user-me";
const other = "user-other";
const now = Date.parse("2026-10-07T12:00:00.000Z");

describe("lockStatusFor", () => {
  it("trava livre (sem linha, ou holderId null) — sou master", () => {
    expect(lockStatusFor(null, me, now)).toBe("master");
    expect(lockStatusFor({ holderId: null, heartbeatAt: null }, me, now)).toBe("master");
  });

  it("trava já é minha — sou master", () => {
    const row: ResourceLockRow = { holderId: me, heartbeatAt: new Date(now).toISOString() };
    expect(lockStatusFor(row, me, now)).toBe("master");
  });

  it("trava de outra conta com heartbeat ainda válido — sou readonly", () => {
    const row: ResourceLockRow = { holderId: other, heartbeatAt: new Date(now - 1000).toISOString() };
    expect(lockStatusFor(row, me, now)).toBe("readonly");
  });

  it("trava de outra conta bem no limiar (exatamente 45s) — ainda readonly (obsoleta é só DEPOIS do limiar)", () => {
    const row: ResourceLockRow = { holderId: other, heartbeatAt: new Date(now - LOCK_STALE_MS).toISOString() };
    expect(lockStatusFor(row, me, now)).toBe("readonly");
  });

  it("trava de outra conta com heartbeat obsoleto (mais de 45s) — sou master, posso reivindicar", () => {
    const row: ResourceLockRow = { holderId: other, heartbeatAt: new Date(now - LOCK_STALE_MS - 1).toISOString() };
    expect(lockStatusFor(row, me, now)).toBe("master");
  });
});
