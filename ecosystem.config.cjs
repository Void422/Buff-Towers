module.exports = {
  apps: [
    {
      name: "buff-towers",
      script: "npm",
      args: "run start",
      cwd: "/var/www/buff-towers",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
