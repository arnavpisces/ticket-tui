import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Fuse from 'fuse.js';
import { te } from '../../theme/te.js';
import { ShortcutHints } from './ShortcutHints.js';

export interface FuzzySelectItem {
    label: string;
    value: any;
    key?: string;
}

const EMPTY_ITEMS: FuzzySelectItem[] = [];

export interface FuzzySelectProps {
    label: string;
    items?: FuzzySelectItem[]; // Static items or initial items
    onSearch?: (query: string) => Promise<FuzzySelectItem[]>; // Async search
    onSelect: (item: any) => void;
    onBack: () => void;
    placeholder?: string;
    limit?: number;
    minQueryLength?: number;
}

export function FuzzySelect({
    label,
    items = EMPTY_ITEMS,
    onSearch,
    onSelect,
    onBack,
    placeholder = 'Type to search...',
    limit = 20,
    minQueryLength = 1
}: FuzzySelectProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<FuzzySelectItem[]>(items);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initialize results
    useEffect(() => {
        if (items.length > 0 && !query) {
            setResults(items);
        }
    }, [items]);

    useEffect(() => {
        // Client-side filtering if no async search
        if (!onSearch) {
            if (!query.trim()) {
                setResults(items);
                return;
            }
            const fuse = new Fuse(items, { keys: ['label'], threshold: 0.4 });
            const res = fuse.search(query).map(r => r.item);
            setResults(res);
            return;
        }

        // Server-side search
        const handler = setTimeout(async () => {
            // If query empty, fallback to items (recent/default) or empty
            if (!query.trim()) {
                setResults(items);
                return;
            }

            if (query.trim().length < minQueryLength) {
                setResults([]);
                setError(null);
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);
            try {
                const res = await onSearch(query);
                setResults(res);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Search failed');
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(handler);
    }, [query, onSearch, items, minQueryLength]);

    useInput((input, key) => {
        if (key.escape) {
            onBack();
        }
    });

    return (
        <Box
            flexDirection="column"
            width="100%"
            borderStyle="single"
            borderColor={te.info}
            paddingX={1}
        >
            <Text bold color={te.accentAlt}>{label.toUpperCase()}</Text>
            <Box marginY={1} borderStyle="single" borderColor={te.muted} paddingX={1}>
                <Text color={te.accent}>QUERY </Text>
                <TextInput value={query} onChange={setQuery} placeholder={placeholder} />
            </Box>

            {/* Keep a stable 1-line status area to avoid UI "jumping" when loading/errors toggle. */}
            {error ? (
                <Text color={te.danger}>{error}</Text>
            ) : loading ? (
                <Text color={te.muted}>Loading...</Text>
            ) : query.trim().length > 0 && query.trim().length < minQueryLength ? (
                <Text color={te.muted}>Type at least {minQueryLength} characters to search.</Text>
            ) : (
                <Text> </Text>
            )}

            {results.length > 0 && (
                <SelectInput
                    items={results.slice(0, limit)}
                    onSelect={(item) => {
                        if (item && item.value !== undefined) {
                            onSelect(item.value);
                        }
                    }}
                />
            )}
            {!loading && !error && results.length === 0 && query.length > 0 && query.trim().length >= minQueryLength && (
                <Text color={te.muted}>No results found.</Text>
            )}

            <Box marginTop={1}>
                <ShortcutHints
                    hints={[
                        { key: 'Enter', label: 'Select' },
                        { key: 'Escape', label: 'Back' },
                    ]}
                />
            </Box>
        </Box>
    );
}
