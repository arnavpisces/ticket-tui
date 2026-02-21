import React from 'react';
import { Box, Text } from 'ink';
import { te } from '../../theme/te.js';

export interface HeaderProps {
  title?: string;
  version?: string;
  connectionStatus?: 'connected' | 'disconnected' | 'loading';
  metricLabel?: string;
  dateTimeLabel?: string;
}

export function Header({
  title = 'Sutra',
  version = '1.0.0',
  connectionStatus = 'connected',
  metricLabel,
  dateTimeLabel,
}: HeaderProps) {
  const statusColor =
    connectionStatus === 'connected'
      ? te.success
      : connectionStatus === 'loading'
        ? te.warning
        : te.danger;
  const statusIcon =
    connectionStatus === 'connected'
      ? '●'
      : connectionStatus === 'loading'
        ? '◐'
        : '○';

  const statusLabel = connectionStatus.toUpperCase();

  return (
    <Box width="100%" justifyContent="space-between">
      <Box>
        <Text backgroundColor={te.accent} color="black" bold>
          {' '}SUTRA{' '}
        </Text>
        <Text color={te.fg}> v{version}</Text>
      </Box>
      <Box flexDirection="row">
        {metricLabel && (
          <Box marginRight={1}>
            <Text backgroundColor={te.warning} color="black" bold>
              {' '}{metricLabel}{' '}
            </Text>
          </Box>
        )}
        {dateTimeLabel && (
          <Box marginRight={1}>
            <Text backgroundColor={te.info} color="black" bold>
              {' '}{dateTimeLabel}{' '}
            </Text>
          </Box>
        )}
        <Text backgroundColor={statusColor} color="black" bold>
          {' '}{statusIcon} {statusLabel}{' '}
        </Text>
      </Box>
    </Box>
  );
}
