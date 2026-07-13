/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        nunito: ['Nunito_400Regular'],
        'nunito-semibold': ['Nunito_600SemiBold'],
        'nunito-bold': ['Nunito_700Bold'],
        'nunito-extrabold': ['Nunito_800ExtraBold'],
        'nunito-black': ['Nunito_900Black'],
      },
      colors: {
        brand: {
          bg: '#16192F',
          card: '#1F223C',
          border: '#2A2D45',
          muted: '#3A4060',
          offwhite: '#F9FAFD',
          accent: '#4C67CF',
          'accent-plus': '#31458F',
          'accent-plus-plus': '#161F40',
          'accent-minus': '#A1B4FF',
          'accent-minus-minus': '#D5DDFF',
          'accent-minus-minus-minus': '#EEF2FF',
          success: '#66C770',
          error: '#E14664',
          warning: '#E76F51',
          yellow: '#FFC01F',
          pink: '#F7A9E2',
          purple: '#CD83F5',
        },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
};
