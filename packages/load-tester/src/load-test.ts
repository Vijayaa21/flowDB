import autocannon from 'autocannon';
import chalk from 'chalk';

/**
 * Load Testing Suite for FlowDB
 * 
 * This suite validates performance under realistic load:
 * - Sustained load (baseline performance)
 * - Spike load (sudden traffic increase)
 * - Soak test (long-running stability)
 */

interface LoadTestConfig {
  url: string;
  duration: number; // seconds
  connections: number;
  pipelining: number;
  title: string;
  requests?: Array<{
    path: string;
    method: string;
  }>;
}

interface PerformanceMetrics {
  title: string;
  throughput: number; // requests/sec
  latency: {
    mean: number; // ms
    p50: number;
    p99: number;
  };
  errors: number;
  timeouts: number;
  errorRate: number; // percent
  status: 'PASS' | 'FAIL';
}

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

/**
 * Health check before load test
 */
async function preHealthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) {
      throw new Error(`Health check returned ${response.status}`);
    }
    const payload = (await response.json()) as { version?: string; database?: string };
    console.log(chalk.green('✓ Health check passed'));
    console.log(`  Version: ${payload.version ?? 'unknown'}`);
    console.log(`  Database: ${payload.database ?? 'unknown'}`);
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Health check failed'));
    console.log(`  ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Run autocannon load test
 */
async function runLoadTest(config: LoadTestConfig): Promise<PerformanceMetrics> {
  console.log(chalk.blue(`\n📊 Running: ${config.title}`));

  const result = await autocannon({
    url: `${API_BASE}${config.requests?.[0]?.path || '/health'}`,
    duration: config.duration,
    connections: config.connections,
    pipelining: config.pipelining,
    requests: config.requests?.map((req) => ({
      path: req.path,
      method: req.method || 'GET',
      headers: {
        'Authorization': AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : '',
        'Content-Type': 'application/json',
      },
    })) || [
      {
        path: '/health',
        method: 'GET',
      },
    ],
  });

  const metrics: PerformanceMetrics = {
    title: config.title,
    throughput: result.requests.average,
    latency: {
      mean: result.latency.mean,
      p50: result.latency.p50,
      p99: result.latency.p99,
    },
    errors: result.errors || 0,
    timeouts: result.timeouts || 0,
    errorRate: ((result.errors || 0) / result.requests.total) * 100,
    status: 'PASS',
  };

  // Evaluate against thresholds
  if (metrics.latency.p99 > 1000) {
    metrics.status = 'FAIL';
    console.log(
      chalk.red(
        `✗ P99 latency exceeded limit: ${metrics.latency.p99.toFixed(2)}ms (limit: 1000ms)`
      )
    );
  }
  if (metrics.errorRate > 0.5) {
    metrics.status = 'FAIL';
    console.log(
      chalk.red(
        `✗ Error rate exceeded limit: ${metrics.errorRate.toFixed(2)}% (limit: 0.5%)`
      )
    );
  }
  if (metrics.errors > 0) {
    console.log(chalk.yellow(`⚠ Errors encountered: ${metrics.errors}`));
  }

  // Print results
  console.log(chalk.dim('\nResults:'));
  console.log(`  Throughput: ${metrics.throughput.toFixed(2)} req/s`);
  console.log(`  Latency (mean): ${metrics.latency.mean.toFixed(2)}ms`);
  console.log(`  Latency (p50): ${metrics.latency.p50.toFixed(2)}ms`);
  console.log(`  Latency (p99): ${metrics.latency.p99.toFixed(2)}ms`);
  console.log(`  Error rate: ${metrics.errorRate.toFixed(2)}%`);
  console.log(`  Status: ${metrics.status === 'PASS' ? chalk.green('PASS') : chalk.red('FAIL')}`);

  return metrics;
}

/**
 * Baseline load test
 * Standard production load with normal traffic patterns
 */
async function baselineLoadTest(): Promise<PerformanceMetrics> {
  return runLoadTest({
    title: 'Baseline Load Test (100 connections, 30s)',
    url: API_BASE,
    duration: 30,
    connections: 100,
    pipelining: 1,
    requests: [
      { path: '/health', method: 'GET' },
      { path: '/metrics', method: 'GET' },
      { path: '/branches', method: 'GET' },
    ],
  });
}

/**
 * Sustained load test
 * Baseline performance over extended period
 */
async function sustainedLoadTest(): Promise<PerformanceMetrics> {
  return runLoadTest({
    title: 'Sustained Load Test (200 connections, 120s)',
    url: API_BASE,
    duration: 120,
    connections: 200,
    pipelining: 2,
    requests: [
      { path: '/health', method: 'GET' },
      { path: '/metrics', method: 'GET' },
      { path: '/branches', method: 'GET' },
    ],
  });
}

/**
 * Spike load test
 * Sudden 10x traffic increase
 */
async function spikeLoadTest(): Promise<PerformanceMetrics> {
  return runLoadTest({
    title: 'Spike Load Test (1000 connections, 30s)',
    url: API_BASE,
    duration: 30,
    connections: 1000,
    pipelining: 5,
    requests: [
      { path: '/health', method: 'GET' },
      { path: '/metrics', method: 'GET' },
      { path: '/branches', method: 'GET' },
    ],
  });
}

/**
 * Stress test
 * Maximum sustainable load determination
 */
async function _stressLoadTest(): Promise<PerformanceMetrics> {
  console.log(chalk.yellow('\n⚠ Stress test starting - will push system to limits'));

  return runLoadTest({
    title: 'Stress Load Test (5000 connections, 60s)',
    url: API_BASE,
    duration: 60,
    connections: 5000,
    pipelining: 10,
    requests: [
      { path: '/health', method: 'GET' },
      { path: '/metrics', method: 'GET' },
    ],
  });
}

/**
 * Full performance test suite
 */
async function runFullSuite(): Promise<void> {
  console.log(chalk.cyan.bold('🚀 FlowDB Performance Test Suite\n'));
  console.log(`API URL: ${API_BASE}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Pre-flight checks
  const healthy = await preHealthCheck();
  if (!healthy) {
    console.log(chalk.red('Cannot proceed - API not healthy'));
    process.exit(1);
  }

  const results: PerformanceMetrics[] = [];

  // Run tests sequentially
  try {
    results.push(await baselineLoadTest());
    results.push(await sustainedLoadTest());
    results.push(await spikeLoadTest());
    // results.push(await stressLoadTest()); // Uncomment for full stress test
  } catch (error) {
    console.error(chalk.red(`\nTest failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }

  // Summary
  console.log(chalk.cyan.bold('\n\n📋 Test Summary\n'));
  if (results.length === 0) {
    console.log(chalk.red('No test results were collected'));
    process.exit(1);
  }
  const baselineResult = results[0]!;
  console.log(chalk.dim('Test'.padEnd(45) + 'Status'.padEnd(10) + 'P99 Latency'));
  console.log(chalk.dim('-'.repeat(75)));

  let allPassed = true;
  for (const result of results) {
    const status = result.status === 'PASS' ? chalk.green('PASS') : chalk.red('FAIL');
    console.log(
      result.title.padEnd(45) +
        status.padEnd(17) +
        `${result.latency.p99.toFixed(2)}ms`
    );
    if (result.status === 'FAIL') allPassed = false;
  }

  console.log(chalk.dim('-'.repeat(75)));

  // Performance benchmarks
  console.log(chalk.cyan.bold('\n\n📈 Performance Benchmarks\n'));
  console.log('Target Metrics (Production):\n');
  console.log(chalk.dim('Metric'.padEnd(25) + 'Target'.padEnd(20) + 'Result'));
  console.log(chalk.dim('-'.repeat(60)));

  const benchmarks = [
    ['P99 Latency', '< 500ms', `${baselineResult.latency.p99.toFixed(2)}ms`],
    ['Error Rate', '< 0.5%', `${baselineResult.errorRate.toFixed(2)}%`],
    ['Throughput', '> 500 req/s', `${baselineResult.throughput.toFixed(2)} req/s`],
    ['Mean Latency', '< 100ms', `${baselineResult.latency.mean.toFixed(2)}ms`],
  ] as const;

  for (const [metric, target, result] of benchmarks) {
    console.log(metric.padEnd(25) + target.padEnd(20) + result);
  }

  console.log(chalk.blue.bold('\n✅ Load test suite complete!\n'));
  process.exit(allPassed ? 0 : 1);
}

// Run tests
runFullSuite().catch((err) => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
