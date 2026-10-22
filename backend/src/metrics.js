import client from 'prom-client'

export const metricsRegistry = new client.Registry()

client.collectDefaultMetrics({ register: metricsRegistry })

const requestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
})

export function recordHttpMetrics(request, response, next) {
  const start = process.hrtime.bigint()
  response.once('finish', () => {
    const route = request.route?.path
      ? `${request.baseUrl}${request.route.path}`
      : request.path === '/health' || request.path === '/metrics'
        ? request.path
        : 'unmatched'
    requestDuration.observe(
      {
        method: request.method,
        route,
        status_code: String(response.statusCode),
      },
      Number(process.hrtime.bigint() - start) / 1e9,
    )
  })
  next()
}
