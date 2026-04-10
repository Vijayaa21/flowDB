import autocannon from "autocannon";
import chalk from "chalk";

/**
 * Spike Testing for FlowDB
 *
 * Spike test = sudden 10x traffic increase to test system resilience
 */

const API_BASE = process.env.API_URL || "http://localhost:3000";

async function runSpikeTest(): Promise<void> {
  console.log(chalk.cyan.bold("⚡ FlowDB Spike Test\n"));
  console.log(`API URL: ${API_BASE}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Phase 1: Baseline
  console.log(chalk.blue("📊 Phase 1: Baseline (30s, 100 connections)"));
  const baseline = await autocannon({
    url: `${API_BASE}/health`,
    duration: 30,
    connections: 100,
    pipelining: 1,
  });

  console.log(`  Throughput: ${baseline.requests.average.toFixed(2)} req/s`);
  console.log(`  P99: ${baseline.latency.p99.toFixed(2)}ms\n`);

  // Phase 2: Ramp up
  console.log(chalk.blue("📊 Phase 2: Ramp Up (30s, 500 connections)"));
  const rampup = await autocannon({
    url: `${API_BASE}/health`,
    duration: 30,
    connections: 500,
    pipelining: 1,
  });

  console.log(`  Throughput: ${rampup.requests.average.toFixed(2)} req/s`);
  console.log(`  P99: ${rampup.latency.p99.toFixed(2)}ms\n`);

  // Phase 3: Spike
  console.log(chalk.yellow("⚡ Phase 3: SPIKE (30s, 1000 connections)"));
  const spike = await autocannon({
    url: `${API_BASE}/health`,
    duration: 30,
    connections: 1000,
    pipelining: 2,
  });

  console.log(`  Throughput: ${spike.requests.average.toFixed(2)} req/s`);
  console.log(`  P99: ${spike.latency.p99.toFixed(2)}ms`);
  console.log(`  Errors: ${spike.errors || 0}\n`);

  // Phase 4: Cool down
  console.log(chalk.blue("📊 Phase 4: Cool Down (30s, 100 connections)"));
  const cooldown = await autocannon({
    url: `${API_BASE}/health`,
    duration: 30,
    connections: 100,
    pipelining: 1,
  });

  console.log(`  Throughput: ${cooldown.requests.average.toFixed(2)} req/s`);
  console.log(`  P99: ${cooldown.latency.p99.toFixed(2)}ms\n`);

  // Analysis
  console.log(chalk.cyan.bold("\n📈 Spike Test Analysis\n"));

  const baselineP99 = baseline.latency.p99;
  const spikeP99 = spike.latency.p99;
  const degradation = ((spikeP99 - baselineP99) / baselineP99) * 100;

  console.log(`Baseline P99:     ${baselineP99.toFixed(2)}ms`);
  console.log(`Spike P99:        ${spikeP99.toFixed(2)}ms`);
  console.log(`Degradation:      ${degradation.toFixed(1)}%`);
  console.log(`Recovery Time:    ${cooldown.latency.p99 - baselineP99 < 10 ? "<10s" : ">10s"}`);

  // Verdict
  console.log(chalk.dim("\n" + "=".repeat(60)));
  const spikeErrors = spike.errors ?? 0;
  const verdict =
    spikeErrors === 0 && degradation < 200 && cooldown.latency.p99 < baselineP99 * 1.1;

  if (verdict) {
    console.log(chalk.green("✅ SPIKE TEST PASSED"));
    console.log("System handles 10x traffic spike gracefully");
  } else {
    console.log(chalk.red("❌ SPIKE TEST FAILED"));
    if (spikeErrors > 0) console.log(`  - Errors during spike: ${spikeErrors}`);
    if (degradation > 200)
      console.log(`  - Latency degradation too high: ${degradation.toFixed(1)}%`);
    if (cooldown.latency.p99 > baselineP99 * 1.1) console.log("  - Slow recovery after spike");
  }

  console.log(chalk.dim("=".repeat(60) + "\n"));

  process.exit(verdict ? 0 : 1);
}

runSpikeTest().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
