import React from 'react';
import { Box, Text } from 'ink';
import { ThemePreset, te } from '../../theme/te.js';

export interface ThemeModalProps {
  visible: boolean;
  themes: ThemePreset[];
  selectedIndex: number;
  activeThemeId: string;
}

const lightBackgrounds = new Set([
  'white',
  'gray',
  'grey',
  'yellow',
  'yellowBright',
  'green',
  'greenBright',
  'cyan',
  'cyanBright',
  'blueBright',
  'magentaBright',
  'redBright',
]);

function getSwatchTextColor(colorName: string): string {
  return lightBackgrounds.has(colorName) ? 'black' : 'white';
}

function TokenChip({ label, colorName }: { label: string; colorName: string }) {
  return (
    <Box marginRight={1}>
      <Text backgroundColor={colorName} color={getSwatchTextColor(colorName)} bold>
        {' '}
        {label}
        {' '}
      </Text>
    </Box>
  );
}

export function ThemeModal({ visible, themes, selectedIndex, activeThemeId }: ThemeModalProps) {
  if (!visible) return null;
  const selectedTheme = themes[selectedIndex] || themes[0];

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={te.accent} paddingX={2} paddingY={1}>
      <Text bold color={te.accentAlt}>THEME PALETTE</Text>
      <Text color={te.muted}>Preview updates while navigating. Enter saves. Esc reverts.</Text>
      <Box marginBottom={1}>
        <Text color={te.muted}>Use ↑/↓ or 1-9/0 for quick selection.</Text>
      </Box>

      {themes.map((theme, index) => {
        const selected = index === selectedIndex;
        const active = theme.id === activeThemeId;
        return (
          <Box key={theme.id}>
            <Box width={27}>
              <Text color={selected ? te.accentAlt : te.fg} bold={selected}>
                {selected ? '▶ ' : '  '}
                {index + 1 === 10 ? '0' : String(index + 1)}. {theme.name}
                {active ? '  (active)' : ''}
              </Text>
            </Box>
            <Box>
              {theme.palette.slice(0, 10).map((colorName, paletteIndex) => (
                <Text
                  key={`${theme.id}-${paletteIndex}`}
                  backgroundColor={colorName}
                  color={getSwatchTextColor(colorName)}
                >
                  {'  '}
                </Text>
              ))}
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor={te.info} paddingX={1}>
        <Text color={te.fg} bold>
          {selectedTheme.name} token preview
        </Text>
        <Box marginTop={1}>
          <TokenChip label="ACC" colorName={selectedTheme.tokens.accent} />
          <TokenChip label="ALT" colorName={selectedTheme.tokens.accentAlt} />
          <TokenChip label="INFO" colorName={selectedTheme.tokens.info} />
          <TokenChip label="OK" colorName={selectedTheme.tokens.success} />
          <TokenChip label="WARN" colorName={selectedTheme.tokens.warning} />
          <TokenChip label="ERR" colorName={selectedTheme.tokens.danger} />
        </Box>
      </Box>
    </Box>
  );
}
