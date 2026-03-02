/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./popup.html', './popup.js'],
  theme: {
    extend: {
      colors: {
        'th-bg':          'var(--clr-bg)',
        'th-surface':     'var(--clr-surface)',
        'th-border':      'var(--clr-border)',
        'th-text':        'var(--clr-text)',
        'th-text-sec':    'var(--clr-text-sec)',
        'th-text-ph':     'var(--clr-text-ph)',
        'th-accent':      'var(--clr-accent)',
        'th-destructive': 'var(--clr-destructive)',
        'grp-red':    '#EF4444',
        'grp-orange': '#F97316',
        'grp-yellow': '#EAB308',
        'grp-green':  '#22C55E',
        'grp-teal':   '#14B8A6',
        'grp-blue':   '#3B82F6',
        'grp-purple': '#A855F7',
        'grp-pink':   '#EC4899',
        'grp-grey':   '#9CA3AF',
      },
    },
  },
  safelist: [
    'bg-grp-red', 'bg-grp-orange', 'bg-grp-yellow', 'bg-grp-green',
    'bg-grp-teal', 'bg-grp-blue', 'bg-grp-purple', 'bg-grp-pink', 'bg-grp-grey',
    'ring-2', 'ring-offset-2', 'ring-th-text', 'ring-offset-th-bg',
    'rotate-180', 'border-dashed', 'border-th-accent', 'border-2',
    'opacity-80', 'bg-th-border',
  ],
};
