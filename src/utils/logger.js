import pino from 'pino';
import dayjs from 'dayjs';

const base = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: false
});

function log(level, message, extra = {}) {
  base[level]({
    time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    ...extra
  }, message);
}

export const logger = {
  info: (message, extra) => log('info', message, extra),
  success: (message, extra) => log('info', `[SUCCESS] ${message}`, extra),
  warning: (message, extra) => log('warn', `[WARNING] ${message}`, extra),
  error: (message, extra) => log('error', message, extra)
};

