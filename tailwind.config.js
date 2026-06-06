/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#0078FF',
          navy: '#02132D',
          accent: '#1B85FB',
          text: '#223D67',
          background: '#F7F9FC',
          border: '#E1E3E7',
          hover: '#005FD6',
        },
        blue: {
          50: '#EEF6FF',
          100: '#DCEEFF',
          200: '#B8DBFF',
          300: '#80BDFF',
          400: '#3C9BFF',
          500: '#1B85FB',
          600: '#0078FF',
          700: '#005FD6',
          800: '#004AA8',
          900: '#053C80',
          950: '#02132D',
        },
      },
    },
  },
  plugins: [],
};
