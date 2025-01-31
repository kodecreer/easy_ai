module.exports = {
    content: ["./src/**/*.{js,jsx,ts,tsx}"],
    theme: {
      extend: {
        backgroundColor: {
          'dark': '#1e1e1e',
          'dark-secondary': '#1a1a1a',
        }
      }
    },
    plugins: [
      require('@tailwindcss/typography'),
    ],
  }