const os = require('os');
const fetch = require('node-fetch');
const config = require('./config.js').metrics;
const EventEmitter = require('events');
const metricsEmitter = new EventEmitter();

const METRIC_CONFIG = {
  requestCounts: {
    resettable: true,
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
  },
  authAttempts: {
    resettable: true,
    outcomes: ['successful', 'failed'],
  },
  activeUsers: {
    resettable: false,
    initialValue: 0,
  },
  systemMetrics: {
    resettable: false,
    metrics: ['cpuUsage', 'memoryUsage'],
  },
  pizzaMetrics: {
    resettable: true,
    metrics: ['sold', 'creationFailures', 'revenue'],
  },
  latencyMetrics: {
    resettable: false,
    metrics: ['serviceEndpoint', 'pizzaCreation'],
  },
};

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return parseFloat((cpuUsage * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return parseFloat(((usedMemory / totalMemory) * 100).toFixed(2));
}

class Metrics {
  constructor() {
    this.metrics = new Map();
    this.initializeMetrics();

    setInterval(() => {
      this.collectSystemMetrics();
      this.flushMetrics();
    }, 30000);

    metricsEmitter.on('metric:increment', ({ metricName, amount = 1 }) => {
      this.incrementMetric(metricName, amount);
    });

    metricsEmitter.on('metric:decrement', ({ metricName, amount = 1 }) => {
      this.decrementMetric(metricName, amount);
    });

    metricsEmitter.on('metric:set', ({ metricName, value }) => {
      this.setMetric(metricName, value);
    });
  }

  initializeMetrics() {
    for (const [key, config] of Object.entries(METRIC_CONFIG)) {
      const { resettable } = config;
      if (config.methods || config.outcomes || config.metrics) {
        const subMetrics = config.methods || config.outcomes || config.metrics;
        subMetrics.forEach((subMetric) => {
          const metricName = `${key}_${subMetric}`;
          const initialValue = config.initialValue || 0;
          this.metrics.set(metricName, {
            value: initialValue,
            resettable,
          });
        });
      } else {
        const initialValue = config.initialValue || 0;
        this.metrics.set(key, {
          value: initialValue,
          resettable,
        });
      }
    }
  }

  incrementMetric(metricName, amount = 1) {
    if (this.metrics.has(metricName)) {
      const metric = this.metrics.get(metricName);
      metric.value += amount;
    } else {
      console.warn(`Metric "${metricName}" not found.`);
    }
  }

  decrementMetric(metricName, amount = 1) {
    if (this.metrics.has(metricName)) {
      const metric = this.metrics.get(metricName);
      metric.value -= amount;
    } else {
      console.warn(`Metric "${metricName}" not found.`);
    }
  }

  setMetric(metricName, value) {
    if (this.metrics.has(metricName)) {
      const metric = this.metrics.get(metricName);
      metric.value = value;
    } else {
      console.warn(`Metric "${metricName}" not found.`);
    }
  }

  getMetricValue(metricName) {
    const metric = this.metrics.get(metricName);
    return metric ? metric.value : 0;
  }

  formatMetric(metricName) {
    const metric = this.metrics.get(metricName);
    return `${metricName},source=${config.source} value=${metric.value}`;
  }

  collectSystemMetrics() {
    const cpuUsage = getCpuUsagePercentage();
    const memoryUsage = getMemoryUsagePercentage();

    this.setMetric('systemMetrics_cpuUsage', cpuUsage);
    this.setMetric('systemMetrics_memoryUsage', memoryUsage);
  }

  async flushMetrics() {
    const metricsToReset = [];

    const payload = Array.from(this.metrics.entries())
      .map(([metricName, metric]) => {
        const metricLine = this.formatMetric(metricName);
        if (metric.resettable) {
          metricsToReset.push(metricName);
        }
        return metricLine;
      })
      .join('\n');

    // console.log('payload: ', payload);

    if (!payload) return;

    try {
      const response = await fetch(`${config.url}`, {
        method: 'POST',
        body: payload,
        headers: {
          Authorization: `Bearer ${config.userId}:${config.apiKey}`,
        },
      });
      if (!response.ok) {
        console.error('Failed to push metrics:', response.statusText);
      }
    } catch (error) {
      console.error('Error pushing metrics:', error);
    }

    metricsToReset.forEach((metricName) => {
      const metric = this.metrics.get(metricName);
      metric.value = 0;
    });
  }
}

const requestTracker = (req, res, next) => {
  const method = req.method;

  const start = Date.now();

  console.log('requestTracker method: ', method);

  metricsEmitter.emit('metric:increment', {
    metricName: `requestCounts_${method}`,
    amount: 1,
  });

  res.on('finish', () => {
    const latency = Date.now() - start;

    metricsEmitter.emit('metric:set', {
      metricName: 'latencyMetrics_serviceEndpoint',
      value: latency,
    });
  });

  next();
};

const metrics = new Metrics();
module.exports = { metrics, requestTracker, metricsEmitter };