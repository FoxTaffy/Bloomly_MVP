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
          // Neutrals (from brand guide)
          bg:       '#16192F',  // Фон — page background
          card:     '#1F223C',  // Фон блока — card / panel background
          border:   '#2A2D45',  // Рамка блока — border colour
          muted:    '#3A4060',  // Muted text / dividers
          offwhite: '#F9FAFD',  // Off-White — primary text on dark
          // Brand blue scale (Знак)
          accent:   '#4C67CF',  // Знак — primary brand accent
          'accent-plus': '#31458F', // + — dark/hover
          'accent-plus-plus': '#161F40', // ++ — darker
          'accent-minus': '#A1B4FF', // - — light tint
          'accent-minus-minus': '#D5DDFF',// -- — very light
          'accent-minus-minus-minus': '#EEF2FF',// --- — wash
          // Status
          success:  '#66C770',  // Успех
          error:    '#E14664',  // Ошибка
          warning:  '#E76F51',  // Внимание
          yellow:   '#FFC01F',  // Жёлтый
          pink:     '#F7A9E2',  // Розовый
          purple:   '#CD83F5',  // Пурпурный
        },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        'card': '0 4px 24px rgba(0,0,0,0.35)',
        'accent': '0 4px 16px rgba(76,151,207,0.35)',
      },
    },
  },
  plugins: [],
}
