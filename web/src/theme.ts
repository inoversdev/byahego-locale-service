// ByaheGo brand colours for the map. Single source for the data tint ramp (used by the globe texture and the legend).
const STOPS: [number, number, number][] = [
  [0x6b, 0x7f, 0xd7],
  [0xff, 0x6b, 0x4a],
  [0xff, 0xc8, 0x57]
];

export const NO_DATA_COLOR = '#232f5e';
export const OCEAN_COLOR = '#0a1230';
export const BORDER_COLOR = '#0a1230';

/** `t` in 0..1 → colour on the periwinkle → Sunset Coral → sunrise ramp. */
export const rampColor = (t: number): string => {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (STOPS.length - 1);
  const index = Math.min(STOPS.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const [a, b] = [STOPS[index], STOPS[index + 1]];
  const channel = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * local);

  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
};
