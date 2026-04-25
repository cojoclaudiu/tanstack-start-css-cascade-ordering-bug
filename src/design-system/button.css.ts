import { style } from '@vanilla-extract/css'

export const button = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '40px',
  paddingInline: '16px',
  border: '2px solid #b91c1c',
  borderRadius: '8px',
  background: '#fee2e2',
  color: '#7f1d1d',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
})
