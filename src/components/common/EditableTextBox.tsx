import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput, useStdout, useStdin } from 'ink';
import { highlightMarkdownLine, highlightCodeLine } from '../../utils/markdown-highlighter.js';
import { te } from '../../theme/te.js';

export interface EditableTextBoxProps {
    /** The text content to edit */
    content: string;
    /** Callback when content changes */
    onChange: (content: string) => void;
    /** Height of the visible area in lines */
    height?: number;
    /** Width of the visible area */
    width?: number | string;
    /** Border color */
    borderColor?: string;
    /** Called when Ctrl+S is pressed */
    onSave?: () => void;
    /** Whether the component is active/focused */
    isActive?: boolean;
    /** Absolute screen row where this component starts (0-based, like ncurses _begy) */
    screenTop?: number;
    /** Absolute screen column where this component starts (0-based, like ncurses _begx) */
    screenLeft?: number;
    /** Enable markdown syntax highlighting */
    syntaxHighlight?: boolean;
    /** Read-only mode: allow navigation/search/scroll but prevent text edits */
    readOnly?: boolean;
    /** Open external editor */
    onOpenExternalEditor?: () => void;
    /** Request parent to switch from read-only preview into writable mode */
    onRequestWritable?: () => void;
}

interface CursorPosition {
    row: number;    // Line index (0-based)
    col: number;    // Column index (0-based)
}

interface SearchMatch {
    row: number;
    col: number;
    length: number;
}

interface SgrMouseEvent {
    button: number;
    screenX: number;
    screenY: number;
    isPress: boolean;
}

const SGR_MOUSE_REGEX = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

export function EditableTextBox({
    content,
    onChange,
    height = 15,
    width = '100%',
    borderColor = 'cyan',
    onSave,
    isActive = true,
    screenTop = 0,
    screenLeft = 0,
    syntaxHighlight = false,
    readOnly = false,
    onOpenExternalEditor,
    onRequestWritable,
}: EditableTextBoxProps) {
    const [cursor, setCursor] = useState<CursorPosition>({ row: 0, col: 0 });
    const [scrollTop, setScrollTop] = useState(0);
    // Track if scroll was manual (mouse) to prevent auto-scroll override
    const manualScrollRef = useRef(false);
    const { stdout } = useStdout();
    const { stdin } = useStdin();
    
    // Search state
    const [searchMode, setSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

    // Split content into lines (memoized to avoid re-render churn)
    const lines = useMemo(() => content.split('\n'), [content]);
    const linesRef = useRef(lines);
    useEffect(() => {
        linesRef.current = lines;
    }, [lines]);
    const totalLines = lines.length;

    const safeHeight = Math.max(1, height - 3); // Border (2) + status line (1)
    const maxScroll = Math.max(0, totalLines - safeHeight);
    const maxScrollRef = useRef(maxScroll);
    useEffect(() => {
        maxScrollRef.current = maxScroll;
    }, [maxScroll]);
    const scrollTopRef = useRef(scrollTop);
    useEffect(() => {
        scrollTopRef.current = scrollTop;
    }, [scrollTop]);
    const setScrollTopSafe = useCallback((next: number | ((prev: number) => number)) => {
        setScrollTop(prev => {
            const value = typeof next === 'function' ? (next as (p: number) => number)(prev) : next;
            scrollTopRef.current = value;
            return value;
        });
    }, []);

    // Component geometry for mouse hit-testing (like ncurses _begy, _begx, _maxy, _maxx)
    // Border adds 1 row top, 1 row bottom; paddingX adds 1 col left, 1 col right
    const contentTop = screenTop + 1;  // +1 for top border
    const contentLeft = screenLeft + 2; // +1 border +1 paddingX
    const contentHeight = safeHeight;
    const termWidth = stdout?.columns || 80;
    const contentWidth = Math.max(1, typeof width === 'number' ? width - 4 : termWidth - 4); // -2 border -2 padding
    const renderWidth = contentWidth;

    // Precompute code-block context once per content change to keep wheel scroll smooth.
    const codeBlockLangByRow = useMemo(() => {
        if (!syntaxHighlight) return [];
        const langs: Array<string | null> = new Array(lines.length).fill(null);
        let inCodeBlock = false;
        let currentLang: string | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i] || '';
            const fenceMatch = line.match(/^`{3,}([\w]*)$/);
            if (fenceMatch) {
                langs[i] = null;
                if (!inCodeBlock) {
                    inCodeBlock = true;
                    currentLang = fenceMatch[1] || 'text';
                } else {
                    inCodeBlock = false;
                    currentLang = null;
                }
            } else {
                langs[i] = inCodeBlock ? currentLang : null;
            }
        }

        return langs;
    }, [lines, syntaxHighlight]);

    // Keep cursor in bounds when content changes
    useEffect(() => {
        setCursor(prev => {
            const newRow = Math.min(prev.row, Math.max(0, lines.length - 1));
            const newCol = Math.min(prev.col, lines[newRow]?.length || 0);
            return { row: newRow, col: newCol };
        });
    }, [content, lines.length]);

    // Auto-scroll to keep cursor visible - only when NOT manual scrolling
    useEffect(() => {
        if (manualScrollRef.current) {
            // Reset flag after a short delay
            const timer = setTimeout(() => {
                manualScrollRef.current = false;
            }, 500);
            return () => clearTimeout(timer);
        }

        if (cursor.row < scrollTop) {
            setScrollTopSafe(cursor.row);
        } else if (cursor.row >= scrollTop + safeHeight) {
            setScrollTopSafe(Math.min(maxScroll, cursor.row - safeHeight + 1));
        }
    }, [cursor.row, scrollTop, safeHeight, maxScroll, setScrollTopSafe]);

    // Mouse support using ncurses approach:
    // 1. Parse SGR mouse events: ESC [ < button ; col ; row M/m
    // 2. Check if click is within our bounds (wenclose)
    // 3. Convert screen coords to local coords (wmouse_trafo)
    // 4. Map local coords to buffer position (localY + scrollTop)
    useEffect(() => {
        if (!stdin || !isActive) return;

        // Enable SGR mouse mode (1006) - more reliable than X10
        // Also enable basic mouse tracking (1000)
        stdout?.write('\x1b[?1000h\x1b[?1006h');

        let buffer = '';
        
        const handleData = (data: Buffer | string) => {
            const str = data.toString();
            buffer += str;

            // Parse and consume all complete SGR mouse events in this chunk.
            const events: SgrMouseEvent[] = [];
            SGR_MOUSE_REGEX.lastIndex = 0;
            let match: RegExpExecArray | null = null;
            let consumedUntil = 0;

            while ((match = SGR_MOUSE_REGEX.exec(buffer)) !== null) {
                events.push({
                    button: parseInt(match[1], 10),
                    screenX: parseInt(match[2], 10) - 1, // SGR is 1-based
                    screenY: parseInt(match[3], 10) - 1, // SGR is 1-based
                    isPress: match[4] === 'M',
                });
                consumedUntil = SGR_MOUSE_REGEX.lastIndex;
            }

            if (consumedUntil > 0) {
                buffer = buffer.slice(consumedUntil);
            } else if (buffer.length > 128) {
                // Keep a small tail for partial escape sequence parsing.
                buffer = buffer.slice(-32);
            }

            for (const event of events) {
                // Handle scroll wheel first (64 = up, 65 = down)
                if (event.isPress && event.button === 64) {
                    setScrollTopSafe(prev => Math.max(0, prev - 2));
                    manualScrollRef.current = true;
                    continue;
                }
                if (event.isPress && event.button === 65) {
                    setScrollTopSafe(prev => Math.min(maxScrollRef.current, prev + 2));
                    manualScrollRef.current = true;
                    continue;
                }

                // Left click only
                if (!event.isPress || event.button !== 0) continue;

                // wenclose: Check if click is within text content area
                const inBoundsY = event.screenY >= contentTop && event.screenY < contentTop + contentHeight;
                const inBoundsX = event.screenX >= contentLeft && event.screenX < contentLeft + contentWidth;
                if (!inBoundsY || !inBoundsX) continue;

                // wmouse_trafo: Convert screen coords to local coords
                const localY = event.screenY - contentTop;
                const localX = event.screenX - contentLeft;
                const bufferRow = scrollTopRef.current + localY;
                if (bufferRow < 0 || bufferRow >= linesRef.current.length) continue;

                const lineContent = linesRef.current[bufferRow] || '';
                const bufferCol = Math.min(localX, lineContent.length);
                manualScrollRef.current = true;
                setCursor({ row: bufferRow, col: bufferCol });
            }
        };

        stdin.on('data', handleData);

        return () => {
            stdin.off('data', handleData);
            // Disable mouse mode on cleanup
            stdout?.write('\x1b[?1006l\x1b[?1000l');
        };
    }, [stdin, stdout, isActive, contentTop, contentLeft, contentHeight, contentWidth, setScrollTopSafe]);

    // Helper to update content
    const updateContent = useCallback((newLines: string[]) => {
        onChange(newLines.join('\n'));
    }, [onChange]);

    // Search functions
    const findMatches = useCallback((query: string): SearchMatch[] => {
        if (!query) return [];
        const matches: SearchMatch[] = [];
        const lowerQuery = query.toLowerCase();
        
        lines.forEach((line, rowIndex) => {
            const lowerLine = line.toLowerCase();
            let startIndex = 0;
            let foundIndex: number;
            
            while ((foundIndex = lowerLine.indexOf(lowerQuery, startIndex)) !== -1) {
                matches.push({
                    row: rowIndex,
                    col: foundIndex,
                    length: query.length,
                });
                startIndex = foundIndex + 1;
            }
        });
        
        return matches;
    }, [lines]);

    const jumpToMatch = useCallback((matchIndex: number) => {
        if (searchMatches.length === 0) return;
        const match = searchMatches[matchIndex];
        if (match) {
            setCursor({ row: match.row, col: match.col });
            // Auto-scroll to show match
            if (match.row < scrollTop) {
                setScrollTopSafe(match.row);
            } else if (match.row >= scrollTop + safeHeight) {
                setScrollTopSafe(Math.min(maxScroll, match.row - Math.floor(safeHeight / 2)));
            }
        }
    }, [searchMatches, scrollTop, safeHeight, maxScroll, setScrollTopSafe]);

    const nextMatch = useCallback(() => {
        if (searchMatches.length === 0) return;
        const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
        setCurrentMatchIndex(nextIndex);
        jumpToMatch(nextIndex);
    }, [searchMatches.length, currentMatchIndex, jumpToMatch]);

    const prevMatch = useCallback(() => {
        if (searchMatches.length === 0) return;
        const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
        setCurrentMatchIndex(prevIndex);
        jumpToMatch(prevIndex);
    }, [searchMatches.length, currentMatchIndex, jumpToMatch]);

    // Update matches when search query changes
    useEffect(() => {
        if (searchMode && searchQuery) {
            const matches = findMatches(searchQuery);
            setSearchMatches(matches);
            if (matches.length > 0) {
                // Find the closest match to current cursor
                let closestIndex = 0;
                let minDistance = Infinity;
                matches.forEach((match, i) => {
                    const distance = Math.abs(match.row - cursor.row) * 1000 + Math.abs(match.col - cursor.col);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestIndex = i;
                    }
                });
                setCurrentMatchIndex(closestIndex);
                jumpToMatch(closestIndex);
            }
        } else {
            setSearchMatches([]);
            setCurrentMatchIndex(0);
        }
    }, [searchQuery, searchMode, findMatches]);

    // Keyboard input handling
    useInput((input, key) => {
        if (!isActive) return;

        // Search mode input handling
        if (searchMode) {
            if (key.escape) {
                setSearchMode(false);
                setSearchQuery('');
                setSearchMatches([]);
                return;
            }
            if (key.return) {
                // Jump to current match and exit search mode
                if (searchMatches.length > 0) {
                    jumpToMatch(currentMatchIndex);
                }
                setSearchMode(false);
                return;
            }
            if (key.backspace || key.delete) {
                setSearchQuery(prev => prev.slice(0, -1));
                return;
            }
            // Ctrl+N or Down for next match
            if ((key.ctrl && input === 'n') || key.downArrow) {
                nextMatch();
                return;
            }
            // Ctrl+P or Up for previous match
            if ((key.ctrl && input === 'p') || key.upArrow) {
                prevMatch();
                return;
            }
            // Regular character input for search
            if (input && input.length === 1 && !key.ctrl && !key.meta) {
                setSearchQuery(prev => prev + input);
                return;
            }
            return;
        }

        // Ctrl+E - External editor
        if (key.ctrl && input === 'e') {
            onOpenExternalEditor?.();
            return;
        }

        // Ctrl+F or '/' - Enter search mode
        if ((key.ctrl && input === 'f') || (input === '/' && !key.ctrl && !key.meta)) {
            setSearchMode(true);
            setSearchQuery('');
            return;
        }

        // Ctrl+S - Save
        if (key.ctrl && input === 's') {
            onSave?.();
            return;
        }

        // Navigation - these should trigger auto-scroll
        if (key.upArrow) {
            setCursor(prev => ({
                row: Math.max(0, prev.row - 1),
                col: Math.min(prev.col, lines[Math.max(0, prev.row - 1)]?.length || 0),
            }));
            return;
        }
        if (key.downArrow) {
            setCursor(prev => ({
                row: Math.min(lines.length - 1, prev.row + 1),
                col: Math.min(prev.col, lines[Math.min(lines.length - 1, prev.row + 1)]?.length || 0),
            }));
            return;
        }
        if (key.leftArrow) {
            setCursor(prev => {
                if (prev.col > 0) {
                    return { ...prev, col: prev.col - 1 };
                } else if (prev.row > 0) {
                    return { row: prev.row - 1, col: lines[prev.row - 1]?.length || 0 };
                }
                return prev;
            });
            return;
        }
        if (key.rightArrow) {
            setCursor(prev => {
                const lineLen = lines[prev.row]?.length || 0;
                if (prev.col < lineLen) {
                    return { ...prev, col: prev.col + 1 };
                } else if (prev.row < lines.length - 1) {
                    return { row: prev.row + 1, col: 0 };
                }
                return prev;
            });
            return;
        }

        // Page Up/Down
        if (key.pageUp) {
            setCursor(prev => ({
                row: Math.max(0, prev.row - safeHeight),
                col: 0,
            }));
            setScrollTopSafe(prev => Math.max(0, prev - safeHeight));
            return;
        }
        if (key.pageDown) {
            setCursor(prev => ({
                row: Math.min(lines.length - 1, prev.row + safeHeight),
                col: 0,
            }));
            setScrollTopSafe(prev => Math.min(maxScroll, prev + safeHeight));
            return;
        }

        // Backspace
        if (readOnly) {
            // Let parent swap to editable mode when user starts typing in preview mode.
            const wantsEdit =
                key.backspace ||
                key.delete ||
                key.return ||
                (input && input.length === 1 && !key.ctrl && !key.meta);

            if (wantsEdit) {
                onRequestWritable?.();
            }
            return;
        }

        // Backspace
        if (key.backspace || key.delete) {
            const newLines = [...lines];
            const { row, col } = cursor;

            if (col > 0) {
                newLines[row] = newLines[row].slice(0, col - 1) + newLines[row].slice(col);
                setCursor({ row, col: col - 1 });
            } else if (row > 0) {
                const prevLineLen = newLines[row - 1].length;
                newLines[row - 1] = newLines[row - 1] + newLines[row];
                newLines.splice(row, 1);
                setCursor({ row: row - 1, col: prevLineLen });
            }

            updateContent(newLines);
            return;
        }

        // Enter - new line
        if (key.return) {
            const newLines = [...lines];
            const { row, col } = cursor;
            const currentLine = newLines[row] || '';

            newLines[row] = currentLine.slice(0, col);
            newLines.splice(row + 1, 0, currentLine.slice(col));

            setCursor({ row: row + 1, col: 0 });
            updateContent(newLines);
            return;
        }

        // Regular character input
        if (input && input.length === 1 && !key.ctrl && !key.meta) {
            const newLines = [...lines];
            const { row, col } = cursor;
            const currentLine = newLines[row] || '';

            newLines[row] = currentLine.slice(0, col) + input + currentLine.slice(col);

            setCursor({ row, col: col + 1 });
            updateContent(newLines);
            return;
        }
    }, { isActive });

    // Render visible lines with cursor
    const visibleLines = useMemo(() => {
        return lines.slice(scrollTop, scrollTop + safeHeight);
    }, [lines, scrollTop, safeHeight]);
    const cursorInView = cursor.row >= scrollTop && cursor.row < scrollTop + safeHeight;

    // Calculate scroll percentage
    const scrollPercent = totalLines <= safeHeight ? 100 : Math.round((scrollTop / maxScroll) * 100);

    // Get matches for visible lines
    const getMatchesForRow = (row: number): SearchMatch[] => {
        return searchMatches.filter(m => m.row === row);
    };

    // Render a line with syntax highlighting and search highlights
    const renderLineWithHighlights = (line: string, row: number, isCursorLine: boolean) => {
        const displayLine = line.length > renderWidth ? line.slice(0, renderWidth) : line;
        const matches = getMatchesForRow(row);
        
        // If no matches, no cursor, and syntax highlighting is enabled, use markdown highlighter
        if (matches.length === 0 && !isCursorLine) {
            if (syntaxHighlight) {
                const codeBlockLang = codeBlockLangByRow[row] ?? null;
                if (codeBlockLang && !displayLine.startsWith('```')) {
                    // Inside code block - use code highlighting
                    return highlightCodeLine(displayLine || ' ', codeBlockLang);
                }
                // Regular markdown line
                return highlightMarkdownLine(displayLine || ' ', row);
            }
            return <Text wrap="truncate">{displayLine || ' '}</Text>;
        }

        // Build segments with highlights
        const segments: React.ReactNode[] = [];
        let lastEnd = 0;

        // Sort matches by column
        const sortedMatches = [...matches]
            .filter(m => m.col < displayLine.length)
            .sort((a, b) => a.col - b.col);

        sortedMatches.forEach((match, idx) => {
            // Add text before this match
            if (match.col > lastEnd) {
                segments.push(<Text key={`t-${idx}`} wrap="truncate">{displayLine.slice(lastEnd, match.col)}</Text>);
            }
            
            // Check if this is the current match
            const isCurrentMatch = searchMatches.indexOf(match) === currentMatchIndex;
            const matchText = displayLine.slice(match.col, match.col + match.length);
            
            segments.push(
                <Text 
                    key={`m-${idx}`} 
                    backgroundColor={isCurrentMatch ? 'yellow' : 'yellowBright'}
                    color="black"
                >
                    {matchText}
                </Text>
            );
            lastEnd = match.col + match.length;
        });

        // Add remaining text after last match
        if (lastEnd < displayLine.length) {
            segments.push(<Text key="end" wrap="truncate">{displayLine.slice(lastEnd)}</Text>);
        }

        // Handle cursor on this line
        if (isCursorLine && cursorInView) {
            // Re-render with cursor
            const cursorCol = Math.min(cursor.col, displayLine.length);
            const beforeCursor = displayLine.slice(0, cursorCol);
            const cursorChar = displayLine[cursorCol] || ' ';
            const afterCursor = displayLine.slice(cursorCol + 1);

            // Check if cursor is on a match
            const cursorOnMatch = sortedMatches.some(m => 
                cursorCol >= m.col && cursorCol < m.col + m.length
            );

            return (
                <>
                    {renderSegmentWithHighlights(beforeCursor, row, 0, sortedMatches)}
                    <Text backgroundColor={cursorOnMatch ? 'cyan' : 'white'} color="black">{cursorChar}</Text>
                    {renderSegmentWithHighlights(afterCursor, row, cursorCol + 1, sortedMatches)}
                </>
            );
        }

        return <>{segments}</>;
    };

    // Helper to render a segment with highlights
    const renderSegmentWithHighlights = (segment: string, row: number, startCol: number, matches: SearchMatch[]) => {
        const relevantMatches = matches.filter(m => 
            (m.col < startCol + segment.length) && (m.col + m.length > startCol)
        );

        if (relevantMatches.length === 0) {
            return <Text wrap="truncate">{segment}</Text>;
        }

        const parts: React.ReactNode[] = [];
        let pos = 0;

        relevantMatches.forEach((match, idx) => {
            const matchStart = Math.max(0, match.col - startCol);
            const matchEnd = Math.min(segment.length, match.col + match.length - startCol);

            if (matchStart > pos) {
                parts.push(<Text key={`s-${idx}`} wrap="truncate">{segment.slice(pos, matchStart)}</Text>);
            }

            const isCurrentMatch = searchMatches.indexOf(match) === currentMatchIndex;
            parts.push(
                <Text 
                    key={`h-${idx}`}
                    backgroundColor={isCurrentMatch ? 'yellow' : 'yellowBright'}
                    color="black"
                >
                    {segment.slice(matchStart, matchEnd)}
                </Text>
            );
            pos = matchEnd;
        });

        if (pos < segment.length) {
            parts.push(<Text key="e" wrap="truncate">{segment.slice(pos)}</Text>);
        }

        return <>{parts}</>;
    };

    return (
        <Box
            flexDirection="column"
            width={width}
            height={height}
            borderStyle="round"
            borderColor={searchMode ? 'yellow' : borderColor}
            paddingX={1}
        >
            {visibleLines.map((line, i) => {
                const actualRow = scrollTop + i;
                const isCursorLine = actualRow === cursor.row;

                return (
                    <Box key={`line-${actualRow}`} height={1}>
                        {renderLineWithHighlights(line, actualRow, isCursorLine)}
                    </Box>
                );
            })}

            {/* Search bar or Status bar */}
            <Box marginTop={0}>
                {searchMode ? (
                    <Text>
                        <Text color="yellow">Find: </Text>
                        <Text>{searchQuery}</Text>
                        <Text backgroundColor="yellow" color="black"> </Text>
                        {searchMatches.length > 0 && (
                            <Text dimColor> ({currentMatchIndex + 1}/{searchMatches.length})</Text>
                        )}
                        {searchQuery && searchMatches.length === 0 && (
                            <Text color="red"> No matches</Text>
                        )}
                        <Text dimColor> | </Text>
                        <Text backgroundColor={te.info} color="black"> Enter </Text>
                        <Text dimColor> Jump | </Text>
                        <Text backgroundColor={te.info} color="black"> ↑/↓ </Text>
                        <Text dimColor> Navigate | </Text>
                        <Text backgroundColor={te.info} color="black"> Esc </Text>
                        <Text dimColor> Cancel</Text>
                    </Text>
                ) : (
                    <Text dimColor wrap="truncate">
                        Ln {cursor.row + 1}, Col {cursor.col + 1} | {totalLines} lines | {scrollPercent}% | {readOnly ? 'Read-only | ' : ''}
                        <Text backgroundColor={te.info} color="black"> Ctrl+S </Text>
                        <Text dimColor> Save | </Text>
                        <Text backgroundColor={te.info} color="black"> Ctrl+F or / </Text>
                        <Text dimColor> Find</Text>
                    </Text>
                )}
            </Box>
        </Box>
    );
}
