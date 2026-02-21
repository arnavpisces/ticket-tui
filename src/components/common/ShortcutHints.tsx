import React from 'react';
import { Box, Text } from 'ink';
import { te } from '../../theme/te.js';

export interface ShortcutHint {
  key: string;
  label: string;
}

export interface ShortcutHintsProps {
  hints: ShortcutHint[];
  keyBackgroundColor?: string;
  keyTextColor?: string;
  labelColor?: string;
}

export function ShortcutHints({
  hints,
  keyBackgroundColor = te.info,
  keyTextColor = 'black',
  labelColor = te.muted,
}: ShortcutHintsProps) {
  if (hints.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="row" flexWrap="wrap">
      {hints.map((hint, index) => (
        <Box key={`${hint.key}-${index}`} marginRight={1}>
          <Text backgroundColor={keyBackgroundColor} color={keyTextColor}>
            {' '}{hint.key}{' '}
          </Text>
          <Text color={labelColor}>
            {' '}{hint.label}{index < hints.length - 1 ? ' |' : ''}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

