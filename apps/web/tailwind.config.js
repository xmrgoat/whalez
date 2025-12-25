/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'cursive'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        background: '#ffffff',
        foreground: '#000000',
        muted: '#f5f5f5',
        'muted-foreground': '#737373',
        border: '#e5e5e5',
        card: '#fafafa',
        accent: '#171717',
      },
    },
  },
  plugins: [],
};
