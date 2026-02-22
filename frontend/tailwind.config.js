/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        nunito: ['"Nunito"', 'ui-rounded', 'sans-serif'],
      },
      colors: {
        brand: {
          bg:     '#16192F',
          card:   '#1F223C',
          border: '#2A2D45',
          accent: '#4C67CF',
          text:   '#F9FAFD',
        },
      },
      borderRadius: {
        '2xl': '16px',
      },
    },
  },
  plugins: [],
}
