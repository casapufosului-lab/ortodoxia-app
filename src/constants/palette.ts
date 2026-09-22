/**
 * Brand palette — single source of truth for the app.
 *
 * Derived from the official Ortodoxia logo (bright sky blue, warm gold, natural green,
 * light surfaces) and kept in sync with the public website https://ortodoxia.web.app.
 *
 * The original keys are preserved so no screen has to change; the extra tokens are
 * additive. Liturgical calendar colours (e.g. #C24141 for the red cross) are NOT brand
 * colours and stay untouched in the calendar screen.
 */
export const palette = {
  /* Existing keys — values retargeted to the approved brand palette. */
  ink: '#10344F',
  muted: '#3F6285',
  background: '#FFFFFF',
  paper: '#FFFFFF',
  gold: '#E39F1B',
  goldDark: '#94691E',
  blue: '#1663A4',
  blueSoft: '#DCEBF9',
  line: 'rgba(22, 99, 164, 0.12)',
  success: '#4C7A34',
  /* Semantic error kept unchanged: the logo has no red and changing it needs a semantic decision. */
  danger: '#9B3D3D',

  /* Brand tokens (additive). */
  primary: '#2C90DE',
  primaryDark: '#1663A4',
  primaryDeep: '#0F4C80',
  /**
   * The brand sky blue is not readable as small text: #2C90DE on white is 3.41:1,
   * below the WCAG AA 4.5:1 floor, so the bright token stays for fills, borders and
   * decoration while text that must be read uses this darker shade of the same hue
   * (4.95:1 on white, 4.62:1 on skyLight).
   */
  primaryInk: '#2276AA',
  sky: '#DCEBF9',
  skyLight: '#F1F8FE',
  goldLight: '#F2C14E',
  card: '#FFFFFF',
  cardAlt: '#E9F3FC',
  border: 'rgba(22, 99, 164, 0.18)',
  divider: 'rgba(22, 99, 164, 0.12)',
  warning: '#E39F1B',
  error: '#9B3D3D',
  disabled: '#A9BED1',
  shadow: 'rgba(15, 76, 128, 0.18)',
  overlay: 'rgba(11, 53, 87, 0.55)',
} as const;