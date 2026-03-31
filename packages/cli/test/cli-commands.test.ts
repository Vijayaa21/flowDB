import { describe, expect, test } from "vitest";

import { createProgram } from "../src/program";

describe("cli command registration", () => {
  test("registers required top-level commands", () => {
    const program = createProgram();
    const commands = program.commands.map((cmd) => cmd.name());

    expect(commands).toContain("login");
    expect(commands).toContain("health");
    expect(commands).toContain("branch");
  });

  test("registers required branch subcommands", () => {
    const program = createProgram();
    const branchCommand = program.commands.find((cmd) => cmd.name() === "branch");

    expect(branchCommand).toBeDefined();
    const subcommands = branchCommand?.commands.map((cmd) => cmd.name()) ?? [];

    expect(subcommands).toContain("list");
    expect(subcommands).toContain("create");
    expect(subcommands).toContain("delete");
    expect(subcommands).toContain("reset");
  });
});
