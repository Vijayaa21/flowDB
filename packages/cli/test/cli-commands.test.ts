import { createProgram } from "../src/program";

// Verify that all the new Step 4 commands are defined
const program = createProgram();

const commands = program.commands.map((cmd) => cmd.name());

console.log("Registered CLI commands:");
console.log(commands);

// Verify new commands exist
const requiredCommands = ["login", "health"];
const missingCommands = requiredCommands.filter((cmd) => !commands.includes(cmd));

if (missingCommands.length > 0) {
  console.error(`Missing commands: ${missingCommands.join(", ")}`);
  process.exit(1);
}

// Verify branch subcommands
const branchCommand = program.commands.find((cmd) => cmd.name() === "branch");
if (branchCommand) {
  const branchSubcommands = branchCommand.commands.map((cmd) => cmd.name());
  console.log("Branch subcommands:", branchSubcommands);

  const requiredSubcommands = ["list", "create", "delete", "reset"];
  const missingSubcommands = requiredSubcommands.filter((cmd) => !branchSubcommands.includes(cmd));

  if (missingSubcommands.length > 0) {
    console.error(`Missing branch subcommands: ${missingSubcommands.join(", ")}`);
    process.exit(1);
  }
} else {
  console.error("Branch command not found");
  process.exit(1);
}

console.log("✓ All Step 4 CLI commands are properly registered");
