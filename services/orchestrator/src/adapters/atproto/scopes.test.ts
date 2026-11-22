import { describe, expect, it } from "vitest";
import { ScopePermissions, SpacePermission } from "@atproto/oauth-scopes";
import { Collections } from "@bardcast/domain";
import { BARDCAST_CONDITIONAL_SCOPES, BARDCAST_SCOPE } from "./scopes.js";

const conditional = BARDCAST_CONDITIONAL_SCOPES.map((c) => c.scope).join(" ");
const TABLE = "did:plc:table";

describe("sign-in scopes", () => {
  it("are all scopes @atproto/oauth-scopes parses", () => {
    for (const token of `${BARDCAST_SCOPE} ${conditional}`.split(" ")) {
      if (token === "atproto") continue;
      expect(new ScopePermissions(token).scopes.size, token).toBe(1);
    }
  });

  it("let a player write their own character", () => {
    const granted = new ScopePermissions(BARDCAST_SCOPE);
    for (const collection of [Collections.characterProfile, Collections.characterSheet, Collections.voiceProfile]) {
      for (const action of ["create", "update", "delete"] as const) {
        expect(granted.allowsRepo({ collection, action }), `${action} ${collection}`).toBe(true);
      }
    }
    expect(granted.allowsRepo({ collection: Collections.campaign, action: "create" })).toBe(false);
  });

  it("let a player found, join and leave a table on any group host, where their PDS serves spaces", () => {
    const granted = new ScopePermissions(conditional);
    for (const lxm of ["provisionGroup", "createSpace", "requestJoin", "leaveGroup"]) {
      expect(granted.allowsRpc({ aud: "did:web:opensocial.fyi#opensocial", lxm: `fyi.opensocial.${lxm}` }), lxm).toBe(true);
    }
  });

  it("let a player read a table's members space and write only their acceptance there", () => {
    const granted = new ScopePermissions(conditional);
    const members = { spaceType: "fyi.opensocial.members", spaceDid: TABLE, skey: "self" } as const;
    expect(granted.allowsSpace(members, { action: "read" })).toBe(true);
    for (const action of ["create", "update", "delete"] as const) {
      expect(granted.allowsSpace(members, { action, collection: "fyi.opensocial.acceptance" })).toBe(true);
      expect(granted.allowsSpace(members, { action, collection: "fyi.opensocial.member" })).toBe(false);
    }
    expect(granted.allowsSpace({ ...members, spaceType: "fyi.opensocial.posts" }, { action: "read" })).toBe(false);
  });

  it("use the Spaces beta spelling: no named `type=` parameter", () => {
    expect(conditional).not.toMatch(/[?&]type=/);
    // The beta refuses the old name outright.
    expect(SpacePermission.fromString("space?type=fyi.opensocial.members&authority=*")).toBeNull();
    expect(SpacePermission.fromString("space?spaceType=fyi.opensocial.members&authority=*")).not.toBeNull();
  });
});
