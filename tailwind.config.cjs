/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        dark: '#1e1e2e',
        darker: '#12121a',
      }
    }
  },
  plugins: [],
}
