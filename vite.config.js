import liveReload from "vite-plugin-live-reload";

module.exports = {
  root: "./",
  server: {
    port: 3000,
  },

  plugins: [liveReload("./**/*.{js,html,css}")],
};
