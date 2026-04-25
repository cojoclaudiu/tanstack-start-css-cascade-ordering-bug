import { style } from '@vanilla-extract/css'

export const page = style({
  display: 'grid',
  gap: '16px',
  padding: '24px',
  fontFamily: 'system-ui, sans-serif',
})

// Each consumer rule overrides one DS class on a single DOM element.
// All four are equal-specificity single-class selectors against their
// DS counterparts, so the cascade is decided by source order. The
// final winning paint should be the green/dark-green pairs below.

export const consumerPanel = style({
  background: '#dcfce7',
  color: '#166534',
})

export const consumerButton = style({
  background: '#dcfce7',
  color: '#166534',
  borderColor: '#166534',
})

export const consumerBadge = style({
  background: '#dcfce7',
  color: '#166534',
})

export const consumerCard = style({
  background: '#dcfce7',
  color: '#166534',
  borderColor: '#166534',
})
