import chalk from "chalk";

/**
 * Soak Testing Suite for FlowDB
 *
 * Soak test = sustained load over extended period to detect:
 * - Memory leaks
 * - Connection pooling issues
 * - Resource exhaustion
 * - Long-running state degradation
 */

interface SoakTestConfig {
  duration: number; // seconds
  requestsPerSecond: number;
  title: string;
  check?: () => Promise<boolean>;
}

interface SoakMetrics {
  title: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  avgLatency: number;
  peakLatency: number;
  status: "PASS" | "FAIL";
  memoryGrowth?: {
    start: number;
    end: number;
    growthPercent: number;
  };
}

const API_BASE = process.env.API_URL || "http://localhost:3000";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";

/**
 * Run sustained load for monitoring degradation
 */
async function runSoakTest(config: SoakTestConfig): Promise<SoakMetrics> {
  console.log(chalk.blue(`\n⏱️  Running Soak Test: ${config.title}`));
  console.log(`Duration: ${config.duration}s | RPS: ${config.requestsPerSecond}`);

  const startTime = Date.now();
  const metrics: SoakMetrics = {
    title: config.title,
    totalRequests: 0,
    successCount: 0,
    errorCount: 0,
    errorRate: 0,
    avgLatency: 0,
    peakLatency: 0,
    status: "PASS",
  };

  let latencies: number[] = [];
  const interval = 1000 / config.requestsPerSecond; // ms between requests

  while (Date.now() - startTime < config.duration * 1000) {
    const requestStart = Date.now();

    try {
      const response = await fetch(`${API_BASE}/health`, {
        headers: {
          Authorization: AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : "",
        },
      });
      if (!response.ok) {
        throw new Error(`Health check returned ${response.status}`);
      }

      const latency = Date.now() - requestStart;
      latencies.push(latency);
      metrics.successCount++;
    } catch (error) {
      metrics.errorCount++;
      console.log(
        chalk.yellow(`✗ Request failed: ${error instanceof Error ? error.message : String(error)}`)
      );
    }

    metrics.totalRequests++;

    // Print progress every 10 seconds
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed % 10 < 0.1) {
      const errorRate = ((metrics.errorCount / metrics.totalRequests) * 100).toFixed(2);
      console.log(
        chalk.dim(
          `Progress: ${elapsed.toFixed(0)}s | Requests: ${metrics.totalRequests} | Errors: ${metrics.errorCount} (${errorRate}%)`
        )
      );
    }

    // Wait for interval
    const requestDuration = Date.now() - requestStart;
    if (requestDuration < interval) {
      await new Promise((resolve) => setTimeout(resolve, interval - requestDuration));
    }
  }

  // Calculate metrics
  metrics.errorRate = (metrics.errorCount / metrics.totalRequests) * 100;
  metrics.avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b) / latencies.length : 0;
  metrics.peakLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

  // Evaluate status
  if (metrics.errorRate > 1.0) {
    metrics.status = "FAIL";
    console.log(chalk.red(`✗ Error rate exceeded: ${metrics.errorRate.toFixed(2)}% (limit: 1%)`));
  }
  if (metrics.peakLatency > 5000) {
    metrics.status = "FAIL";
    console.log(
      chalk.red(`✗ Peak latency too high: ${metrics.peakLatency.toFixed(0)}ms (limit: 5000ms)`)
    );
  }

  // Print results
  console.log(chalk.dim("\n📊 Soak Test Results:"));
  console.log(`  Total Requests: ${metrics.totalRequests}`);
  console.log(`  Successful: ${metrics.successCount}`);
  console.log(`  Failed: ${metrics.errorCount}`);
  console.log(`  Error Rate: ${metrics.errorRate.toFixed(2)}%`);
  console.log(`  Avg Latency: ${metrics.avgLatency.toFixed(2)}ms`);
  console.log(`  Peak Latency: ${metrics.peakLatency.toFixed(0)}ms`);
  console.log(`  Status: ${metrics.status === "PASS" ? chalk.green("PASS") : chalk.red("FAIL")}`);

  return metrics;
}

/**
 * Morning soak test (4 hours)
 */
async function morningLoadSoak(): Promise<SoakMetrics> {
  return runSoakTest({
    title: "Morning Load Soak (4 hours)",
    duration: 4 * 3600, // 4 hours
    requestsPerSecond: 100,
  });
}

/**
 * Extended soak test (24 hours)
 */
async function extendedLoadSoak(): Promise<SoakMetrics> {
  return runSoakTest({
    title: "Extended Soak Test (24 hours)",
    duration: 24 * 3600, // 24 hours
    requestsPerSecond: 50,
  });
}

async function runSoakSuite(): Promise<void> {
  console.log(chalk.cyan.bold("🧪 FlowDB Soak Test Suite\n"));
  console.log(`API URL: ${API_BASE}`);
  console.log(`Start Time: ${new Date().toISOString()}\n`);

  // Select test duration based on CLI argument
  const duration = process.argv[2] || "quick";

  let metrics: SoakMetrics;

  switch (duration) {
    case "extended":
      metrics = await extendedLoadSoak();
      break;
    case "morning":
      metrics = await morningLoadSoak();
      break;
    default:
      // Quick 1-minute soak for testing
      metrics = await runSoakTest({
        title: "Quick Soak Test (1 minute)",
        duration: 60,
        requestsPerSecond: 100,
      });
  }

  // Summary
  console.log(chalk.cyan.bold("\n\n📋 Soak Test Summary\n"));
  console.log(`Test Duration: ${metrics.title}`);
  console.log(`Total Requests: ${metrics.totalRequests}`);
  console.log(`Success Rate: ${(100 - metrics.errorRate).toFixed(2)}%`);
  console.log(`Peak Latency: ${metrics.peakLatency.toFixed(0)}ms`);
  console.log(`Status: ${metrics.status === "PASS" ? chalk.green("PASS") : chalk.red("FAIL")}`);

  console.log(chalk.blue.bold("\n✅ Soak test complete!\n"));
  process.exit(metrics.status === "PASS" ? 0 : 1);
}

// Run tests
runSoakSuite().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
