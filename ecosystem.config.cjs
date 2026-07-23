module.exports = {
  apps: [
    {
      name: 'botsc',
      script: 'src/index.js',
      interpreter: 'node',

      // Restart otomatis jika crash
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,

      // Batasi memory — restart jika bocor > 512MB
      max_memory_restart: '512M',

      // Jangan gunakan watch di production (bisa loop restart)
      watch: false,

      // Log ke file
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Rotasi log otomatis (butuh pm2-logrotate)
      // pm2 install pm2-logrotate

      // Environment
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
