// Production process for server 1. Managed with:
//   pm2 startOrRestart ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'heirloom',
      cwd: '/home/heirloom',
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: '3005',
      },
    },
  ],
};
