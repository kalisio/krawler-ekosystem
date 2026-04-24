// Dynamic import so that user jobs bringing their own winston plugins are not
// locked out of the shared winston registry. See hooks/hooks.logger.js for the
// per-job equivalent.
const winston = await import('winston')

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple())
    })
  ]
})

export default logger
