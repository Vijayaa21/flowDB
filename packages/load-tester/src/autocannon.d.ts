declare module 'autocannon' {
  type RequestConfig = {
    path: string;
    method?: string;
    headers?: Record<string, string>;
  };

  type AutoCannonConfig = {
    url: string;
    duration?: number;
    connections?: number;
    pipelining?: number;
    requests?: RequestConfig[];
  };

  type AutoCannonResult = {
    requests: {
      average: number;
      total: number;
    };
    latency: {
      mean: number;
      p50: number;
      p99: number;
    };
    errors?: number;
    timeouts?: number;
  };

  export default function autocannon(config: AutoCannonConfig): Promise<AutoCannonResult>;
}
