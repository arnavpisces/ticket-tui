import React, { useEffect, useState } from 'react';
import { Text, useInput } from 'ink';
import chalk from 'chalk';

export interface WordTextInputProps {
  value: string;
  placeholder?: string;
  focus?: boolean;
  mask?: string;
  highlightPastedText?: boolean;
  showCursor?: boolean;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
}

interface InputState {
  cursorOffset: number;
  cursorWidth: number;
}

const WORD_CHAR_REGEX = /[A-Za-z0-9_]/;

const isWordChar = (char: string): boolean => WORD_CHAR_REGEX.test(char);

const moveCursorWordLeft = (value: string, offset: number): number => {
  let next = Math.max(0, Math.min(offset, value.length));

  while (next > 0 && !isWordChar(value[next - 1])) {
    next -= 1;
  }

  while (next > 0 && isWordChar(value[next - 1])) {
    next -= 1;
  }

  return next;
};

const moveCursorWordRight = (value: string, offset: number): number => {
  let next = Math.max(0, Math.min(offset, value.length));

  while (next < value.length && isWordChar(value[next])) {
    next += 1;
  }

  while (next < value.length && !isWordChar(value[next])) {
    next += 1;
  }

  return next;
};

const isWordLeftShortcut = (input: string, key: { meta: boolean; leftArrow: boolean }): boolean =>
  key.meta && (key.leftArrow || input.toLowerCase() === 'b');

const isWordRightShortcut = (input: string, key: { meta: boolean; rightArrow: boolean }): boolean =>
  key.meta && (key.rightArrow || input.toLowerCase() === 'f');

export default function WordTextInput({
  value: originalValue,
  placeholder = '',
  focus = true,
  mask,
  highlightPastedText = false,
  showCursor = true,
  onChange,
  onSubmit,
}: WordTextInputProps) {
  const [state, setState] = useState<InputState>({
    cursorOffset: (originalValue || '').length,
    cursorWidth: 0,
  });
  const { cursorOffset, cursorWidth } = state;

  useEffect(() => {
    setState(previousState => {
      if (!focus || !showCursor) {
        return previousState;
      }

      if (previousState.cursorOffset > originalValue.length) {
        return {
          cursorOffset: originalValue.length,
          cursorWidth: 0,
        };
      }

      return previousState;
    });
  }, [originalValue, focus, showCursor]);

  const cursorActualWidth = highlightPastedText ? cursorWidth : 0;
  const value = mask ? mask.repeat(originalValue.length) : originalValue;
  let renderedValue = value;
  let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(' ');
    renderedValue = value.length > 0 ? '' : chalk.inverse(' ');
    let i = 0;
    for (const char of value) {
      renderedValue +=
        i >= cursorOffset - cursorActualWidth && i <= cursorOffset
          ? chalk.inverse(char)
          : char;
      i++;
    }
    if (value.length > 0 && cursorOffset === value.length) {
      renderedValue += chalk.inverse(' ');
    }
  }

  useInput((input, key) => {
    if (
      key.upArrow ||
      key.downArrow ||
      (key.ctrl && input === 'c') ||
      key.tab ||
      (key.shift && key.tab)
    ) {
      return;
    }

    if (key.return) {
      onSubmit?.(originalValue);
      return;
    }

    let nextCursorOffset = cursorOffset;
    let nextCursorWidth = 0;
    let nextValue = originalValue;

    if (showCursor && isWordLeftShortcut(input, key)) {
      nextCursorOffset = moveCursorWordLeft(originalValue, cursorOffset);
    } else if (showCursor && isWordRightShortcut(input, key)) {
      nextCursorOffset = moveCursorWordRight(originalValue, cursorOffset);
    } else if (key.leftArrow) {
      if (showCursor) {
        nextCursorOffset -= 1;
      }
    } else if (key.rightArrow) {
      if (showCursor) {
        nextCursorOffset += 1;
      }
    } else if (key.backspace || key.delete) {
      if (cursorOffset > 0) {
        nextValue =
          originalValue.slice(0, cursorOffset - 1) +
          originalValue.slice(cursorOffset, originalValue.length);
        nextCursorOffset -= 1;
      }
    } else if (!key.ctrl && (!key.meta || input.length > 1) && input.length > 0) {
      nextValue =
        originalValue.slice(0, cursorOffset) +
        input +
        originalValue.slice(cursorOffset, originalValue.length);
      nextCursorOffset += input.length;
      if (input.length > 1) {
        nextCursorWidth = input.length;
      }
    } else {
      return;
    }

    nextCursorOffset = Math.max(0, Math.min(nextCursorOffset, nextValue.length));

    setState({
      cursorOffset: nextCursorOffset,
      cursorWidth: nextCursorWidth,
    });

    if (nextValue !== originalValue) {
      onChange(nextValue);
    }
  }, { isActive: focus });

  return (
    <Text>
      {placeholder
        ? value.length > 0
          ? renderedValue
          : renderedPlaceholder
        : renderedValue}
    </Text>
  );
}

interface UncontrolledTextInputProps extends Omit<WordTextInputProps, 'value' | 'onChange'> {
  initialValue?: string;
}

export function UncontrolledTextInput({
  initialValue = '',
  ...props
}: UncontrolledTextInputProps) {
  const [value, setValue] = useState(initialValue);
  return <WordTextInput {...props} value={value} onChange={setValue} />;
}
