import React from 'react';
import { Box, Text } from 'ink';
import { te } from '../../theme/te.js';

export interface HeaderProps {
  title?: string;
  version?: string;
  connectionStatus?: 'connected' | 'disconnected' | 'loading';
}

export function Header({
  title = 'Ticket TUI',
  version = '1.0.0',
  connectionStatus = 'connected',
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
          {' '}TICKET TUI{' '}
        </Text>
        <Text color={te.fg}> v{version}</Text>
      </Box>
      <Text backgroundColor={statusColor} color="black" bold>
        {' '}{statusIcon} {statusLabel}{' '}
      </Text>
    </Box>
  );
}
