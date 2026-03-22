export type ThemeTokens = {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  accentAlt: string;
  info: string;
  success: string;
  warning: string;
  danger: string;
};

export type ThemePreset = {
  id: string;
  name: string;
  palette: string[];
  tokens: ThemeTokens;
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'te-blueprint',
    name: 'Blueprint',
    palette: ['blueBright', 'cyanBright', 'white', 'gray', 'yellowBright', 'greenBright', 'redBright', 'magentaBright', 'blue', 'black'],
    tokens: {
      bg: 'black',
      fg: 'white',
      muted: 'gray',
      accent: 'blue',
      accentAlt: 'blueBright',
      info: 'cyanBright',
      success: 'greenBright',
      warning: 'yellowBright',
      danger: 'redBright',
    },
  },
  {
    id: 'neon-tokyo',
    name: 'Neon Tokyo',
    palette: ['cyanBright', 'magentaBright', 'blueBright', 'yellowBright', 'greenBright', 'redBright', 'white', 'cyan', 'magenta', 'black'],
    tokens: {
      bg: 'black',
      fg: 'white',
      muted: 'gray',
      accent: 'cyanBright',
      accentAlt: 'magentaBright',
      info: 'blueBright',
      success: 'greenBright',
      warning: 'yellowBright',
      danger: 'redBright',
    },
  },
  {
    id: 'synthwave-grid',
    name: 'Synthwave Grid',
    palette: ['magentaBright', 'cyanBright', 'blueBright', 'redBright', 'yellowBright', 'white', 'magenta', 'cyan', 'gray', 'black'],
    tokens: {
      bg: 'black',
      fg: 'white',
      muted: 'gray',
      accent: 'magentaBright',
      accentAlt: 'cyanBright',
      info: 'magentaBright',
      success: 'greenBright',
      warning: 'yellowBright',
      danger: 'redBright',
    },
  },
  {
    id: 'acid-matrix',
    name: 'Acid Matrix',
    palette: ['greenBright', 'yellowBright', 'cyanBright', 'blueBright', 'magentaBright', 'white', 'green', 'cyan', 'gray', 'black'],
    tokens: {
      bg: 'black',
      fg: 'white',
      muted: 'gray',
      accent: 'greenBright',
      accentAlt: 'yellowBright',
      info: 'cyanBright',
      success: 'greenBright',
      warning: 'yellowBright',
      danger: 'magentaBright',
    },
  },
  {
    id: 'laser-cyan',
    name: 'Laser Cyan',
    palette: ['cyanBright', 'blueBright', 'white', 'gray', 'greenBright', 'yellowBright', 'magentaBright', 'redBright', 'cyan', 'black'],
    tokens: {
      bg: 'black',
      fg: 'white',
      muted: 'gray',
      accent: 'cyanBright',
      accentAlt: 'blueBright',
      info: 'magentaBright',
      success: 'greenBright',
      warning: 'yellowBright',
      danger: 'redBright',
    },
  },
  {
    id: 'vapor-sunset',
    name: 'Vapor Sunset',
    palette: ['yellowBright', 'redBright', 'magentaBright', 'blueBright', 'white', 'gray', 'cyanBright', 'greenBright', 'yellow', 'black'],
    tokens: {
      bg: 'black',
      fg: 'white',
      muted: 'gray',
      accent: 'yellowBright',
      accentAlt: 'redBright',
      info: 'magentaBright',
      success: 'greenBright',
      warning: 'yellowBright',
      danger: 'redBright',
    },
  },
  {
    id: 'cyber-violet',
    name: 'Cyber Violet',
    palette: ['magentaBright', 'blueBright', 'cyanBright', 'white', 'gray', 'yellowBright', 'greenBright', 'redBright', 'magenta', 'black'],
    tokens: {
      bg: 'black',
      fg: 'white',
      muted: 'gray',
      accent: 'magentaBright',
      accentAlt: 'blueBright',
      info: 'cyanBright',
      success: 'greenBright',
      warning: 'yellowBright',
      danger: 'redBright',
    },
  },
  {
    id: 'electric-lime',
    name: 'Electric Lime',
    palette: ['greenBright', 'cyanBright', 'yellowBright', 'white', 'gray', 'blueBright', 'magentaBright', 'redBright', 'green', 'black'],
    tokens: {
      bg: 'black',
      fg: 'white',
      muted: 'gray',
      accent: 'greenBright',
      accentAlt: 'cyanBright',
      info: 'yellowBright',
      success: 'greenBright',
      warning: 'yellow',
      danger: 'redBright',
    },
  },
  {
    id: 'plasma-red',
    name: 'Plasma Red',
    palette: ['redBright', 'magentaBright', 'yellowBright', 'white', 'gray', 'blueBright', 'cyanBright', 'greenBright', 'red', 'black'],
    tokens: {
      bg: 'black',
      fg: 'white',
      muted: 'gray',
      accent: 'yellowBright',
      accentAlt: 'redBright',
      info: 'cyanBright',
      success: 'greenBright',
      warning: 'yellowBright',
      danger: 'redBright',
    },
  },
  {
    id: 'ocean-neon',
    name: 'Ocean Neon',
    palette: ['blueBright', 'cyanBright', 'greenBright', 'white', 'gray', 'yellowBright', 'magentaBright', 'redBright', 'blue', 'black'],
    tokens: {
      bg: 'black',
      fg: 'white',
      muted: 'gray',
      accent: 'blueBright',
      accentAlt: 'cyanBright',
      info: 'greenBright',
      success: 'greenBright',
      warning: 'yellowBright',
      danger: 'redBright',
    },
  },
];

const DEFAULT_THEME_ID = 'te-blueprint';

function getPreset(themeId: string): ThemePreset {
  return THEME_PRESETS.find((theme) => theme.id === themeId) || THEME_PRESETS[0];
}

export const te: ThemeTokens = { ...getPreset(DEFAULT_THEME_ID).tokens };

let activeThemeId = DEFAULT_THEME_ID;

export function getThemePreset(themeId: string): ThemePreset {
  return getPreset(themeId);
}

export function getActiveThemeId(): string {
  return activeThemeId;
}

export function applyTheme(themeId: string): ThemePreset {
  const nextTheme = getPreset(themeId);
  Object.assign(te, nextTheme.tokens);
  activeThemeId = nextTheme.id;
  return nextTheme;
}
