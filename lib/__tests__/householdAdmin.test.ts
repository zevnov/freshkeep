import { canRemoveMember, canRenameHousehold, roleChoices, sortMembers } from "@/lib/householdAdmin";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("household permissions", () => {
  it("lets owners and admins rename", () => {
    expect(canRenameHousehold("owner")).toBe(true);
    expect(canRenameHousehold("admin")).toBe(true);
    expect(canRenameHousehold("member")).toBe(false);
    expect(canRenameHousehold(null)).toBe(false);
  });

  it("matches the server's removal rules", () => {
    expect(canRemoveMember("owner", "admin", false)).toBe(true);
    expect(canRemoveMember("owner", "owner", true)).toBe(false);
    expect(canRemoveMember("admin", "member", false)).toBe(true);
    expect(canRemoveMember("admin", "admin", false)).toBe(false);
    expect(canRemoveMember("admin", "owner", false)).toBe(false);
    expect(canRemoveMember("member", "member", false)).toBe(false);
  });

  it("offers role changes to the owner only, never on themselves", () => {
    expect(roleChoices("owner", "member", false)).toEqual(["admin", "owner"]);
    expect(roleChoices("owner", "admin", false)).toEqual(["member", "owner"]);
    expect(roleChoices("owner", "owner", true)).toEqual([]);
    expect(roleChoices("admin", "member", false)).toEqual([]);
  });
});

describe("sortMembers", () => {
  it("orders by role then name", () => {
    const sorted = sortMembers([
      { role: "member" as const, display_name: "Zed" },
      { role: "member" as const, display_name: "Amy" },
      { role: "owner" as const, display_name: "Kim" },
      { role: "admin" as const, display_name: "Bo" },
    ]);
    expect(sorted.map((m) => m.display_name)).toEqual(["Kim", "Bo", "Amy", "Zed"]);
  });
});
