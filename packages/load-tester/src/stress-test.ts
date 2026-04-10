import autocannon, { Result } from 'autocannon';
import chalk from 'chalk';

/**
 * Stress Testing for FlowDB
 * 
 * Stress test = push system to breaking point to find maximum capacity
 */

const API_BASE = process.env.API_URL || 'http://localhost:3000';

interface StressPhase {
  connections: number;
  duration: number;
  label: string;
}

const phases: StressPhase[] = [
  { connections: 500, duration: 30, label: 'Phase 1: 500 connections' },
  { connections: 1000, duration: 30, label: 'Phase 2: 1000 connections' },
  { connections: 2000, duration: 30, label: 'Phase 3: 2000 connections' },
  { connections: 3000, duration: 30, label: 'Phase 4: 3000 connections' },
  { connections: 5000, duration: 30, label: 'Phase 5: 5000 connections (stress)' },
  { connections: 10000, duration: 30, label: 'Phase 6: 10000 connections (breaking)' },
];

async function runStressTest(): Promise<void> {
  console.log(chalk.cyan.bold('💪 FlowDB Stress Test\n'));
  console.log(`API URL: ${API_BASE}`);
  console.log(`Objective: Find maximum capacity and breaking point\n`);
  console.log(chalk.yellow('⚠️  This test will push the system to its limits!\n'));

  const results: Array<{
    connections: number;
    throughput: number;
    p99: number;
    errors: number;
    errorRate: number;
  }> = [];

  for (const phase of phases) {
    console.log(chalk.blue(`\n📊 ${phase.label}`));

    try {
      const result = await autocannon({
        url: `${API_BASE}/health`,
        duration: phase.duration,
        connections: phase.connections,
        pipelining: Math.ceil(phase.connections / 100),
      } as any);

      const errorRate = ((result.errors || 0) / result.requests.total) * 100;

      results.push({
        connections: phase.connections,
        throughput: result.requests.average,
        p99: result.latency.p99,
        errors: result.errors || 0,
        errorRate,
      });

      console.log(`  Throughput: ${result.requests.average.toFixed(2)} req/s`);
      console.log(`  P99: ${result.latency.p99.toFixed(2)}ms`);
      console.log(`  Errors: ${result.errors || 0} (${errorRate.toFixed(2)}%)`);

      // Early exit if too many errors
      if (errorRate > 20) {
        console.log(chalk.red('\n  ⚠️  High error rate reached - ending stress test'));
        break;
      }
    } catch (error) {
      console.log(chalk.red(`  ❌ Test failed: ${error instanceof Error ? error.message : String(error)}`));
      results.push({
        connections: phase.connections,
        throughput: 0,
        p99: 0,
        errors: -1,
        errorRate: 100,
      });
      break;
    }
  }

  // Analysis
  console.log(chalk.cyan.bold('\n\n📊 Stress Test Results\n'));
  console.log(chalk.dim('Connections | Throughput | P99 Latency | Error Rate'));
  console.log(chalk.dim('-'.repeat(60)));

  for (const result of results) {
    const throughput = result.throughput.toFixed(2).padEnd(11);
    const p99 = result.p99.toFixed(0).padStart(10) + 'ms';
    const errorRate = result.errorRate.toFixed(2).padStart(10) + '%';

    console.log(`${String(result.connections).padEnd(12)} ${throughput} ${p99} ${errorRate}`);
  }

  console.log(chalk.dim('-'.repeat(60)));

  // Find saturation point
  const sortedByThroughput = [...results].sort((a, b) => b.throughput - a.throughput);
  const maxThroughput = sortedByThroughput[0];
  const saturationPoint = sortedByThroughput[0].connections;

  console.log(chalk.cyan.bold('\n📈 Key Findings\n'));
  console.log(`Maximum Throughput: ${maxThroughput.throughput.toFixed(2)} req/s at ${saturationPoint} connections`);

  // Find error threshold
  const errorThreshold = results.find((r) => r.errorRate > 1.0);
  if (errorThreshold) {
    console.log(`Error Threshold: Errors appear at ${errorThreshold.connections} connections`);
  }

  // Recommendations
  console.log(chalk.dim('\n💡 Recommendations\n'));
  console.log(`1. System can sustain ~${maxThroughput.throughput.toFixed(0)} requests/second`);
  console.log(`2. Saturation point: ~${saturationPoint} concurrent connections`);
  console.log(`3. Set auto-scaling trigger at: ${Math.floor(saturationPoint * 0.7)} connections`);
  console.log(`4. Set critical alert at: ${Math.floor(saturationPoint * 0.9)} connections`);

  if (maxThroughput.throughput < 500) {
    console.log('\n⚠️  Performance is below target (500+ req/s) - optimization recommended');
  }

  console.log(chalk.blue.bold('\n✅ Stress test complete!\n'));
  process.exit(0);
}

runStressTest().catch((err) => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
