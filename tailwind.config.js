/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211d",
        paper: "#f6f7f3",
        forest: "#176b4d",
      },
    },
  },
  plugins: [],
};
