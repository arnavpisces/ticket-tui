import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { FuzzySelect, FuzzySelectItem } from '../common/FuzzySelect.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { JiraClient } from '../../api/jira-client.js';
import { te } from '../../theme/te.js';

interface CreateTicketProps {
    client: JiraClient;
    onCancel: () => void;
    onCreated: (issueKey: string) => void;
}

type Step = 'project' | 'type' | 'parent' | 'priority' | 'summary' | 'description' | 'creating';
type ParentMode = 'none' | 'epic-optional' | 'issue-required';

const DEFAULT_PRIORITY = '__default__';
const DEFAULT_PRIORITY_ITEM: FuzzySelectItem = {
    label: 'Use project default priority',
    value: DEFAULT_PRIORITY,
    key: DEFAULT_PRIORITY
};
const NO_PARENT = '__no_parent__';
const NO_PARENT_ITEM: FuzzySelectItem = {
    label: 'No epic',
    value: NO_PARENT,
    key: NO_PARENT
};

interface IssueTypeOption {
    id: string;
    name: string;
}

function getParentMode(issueTypeName: string): ParentMode {
    const normalized = issueTypeName.trim().toLowerCase();
    if (normalized.includes('sub-task') || normalized.includes('subtask')) {
        return 'issue-required';
    }
    if (normalized === 'epic') {
        return 'none';
    }
    return 'epic-optional';
}

export function CreateTicket({ client, onCancel, onCreated }: CreateTicketProps) {
    const [step, setStep] = useState<Step>('project');
    const [projects, setProjects] = useState<FuzzySelectItem[]>([]);
    const [selectedProject, setSelectedProject] = useState<string | null>(null);

    const [issueTypes, setIssueTypes] = useState<FuzzySelectItem[]>([]);
    const [selectedType, setSelectedType] = useState<IssueTypeOption | null>(null);
    const [parentOptions, setParentOptions] = useState<FuzzySelectItem[]>([NO_PARENT_ITEM]);
    const [selectedParent, setSelectedParent] = useState<string>(NO_PARENT);
    const [priorities, setPriorities] = useState<FuzzySelectItem[]>([DEFAULT_PRIORITY_ITEM]);
    const [selectedPriority, setSelectedPriority] = useState<string>(DEFAULT_PRIORITY);

    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');

    const [error, setError] = useState<string | null>(null);

    // Fetch initial projects
    useEffect(() => {
        const fetchInitial = async () => {
            try {
                const projs = await client.searchProjects('');
                setProjects(projs.map(p => ({
                    label: `${p.name} (${p.key})`,
                    value: p.key,
                    key: p.id
                })));
                const prios = await client.getPriorities();
                setPriorities([
                    DEFAULT_PRIORITY_ITEM,
                    ...prios.map((p) => ({
                        label: p.name,
                        value: p.id,
                        key: p.id
                    }))
                ]);
            } catch (err) {
                // Ignore error on initial fetch
            }
        };
        fetchInitial();
    }, [client]);

    const handleProjectSearch = async (query: string): Promise<FuzzySelectItem[]> => {
        const projs = await client.searchProjects(query);
        return projs.map(p => ({
            label: `${p.name} (${p.key})`,
            value: p.key,
            key: p.id
        }));
    };

    // Fetch issue types when project selected
    useEffect(() => {
        if (selectedProject) {
            const fetchTypes = async () => {
                try {
                    const types = await client.getCreateMeta(selectedProject);
                    setIssueTypes(types.map(t => ({
                        label: t.name,
                        value: { id: t.id, name: t.name } satisfies IssueTypeOption,
                        key: t.id
                    })));
                    setError(null);
                } catch (err) {
                    setError('Failed to load issue types');
                }
            };
            fetchTypes();
        }
    }, [selectedProject, client]);

    useEffect(() => {
        if (step !== 'parent' || !selectedProject || !selectedType) {
            return;
        }

        const parentMode = getParentMode(selectedType.name);
        const fetchParentOptions = async () => {
            try {
                if (parentMode === 'issue-required') {
                    const parentIssues = await client.searchParentIssues(selectedProject, '', 35);
                    setParentOptions(
                        parentIssues.map(issue => ({
                            label: `${issue.key}: ${issue.fields.summary}`,
                            value: issue.key,
                            key: issue.key,
                        }))
                    );
                } else if (parentMode === 'epic-optional') {
                    const epicIssues = await client.searchEpics(selectedProject, '', 35);
                    setParentOptions([
                        NO_PARENT_ITEM,
                        ...epicIssues.map(issue => ({
                            label: `${issue.key}: ${issue.fields.summary}`,
                            value: issue.key,
                            key: issue.key,
                        }))
                    ]);
                } else {
                    setParentOptions([NO_PARENT_ITEM]);
                }
                setError(null);
            } catch {
                if (parentMode === 'issue-required') {
                    setParentOptions([]);
                    setError('Failed to load eligible parent issues');
                } else {
                    setParentOptions([NO_PARENT_ITEM]);
                    setError('Failed to load epics');
                }
            }
        };

        fetchParentOptions();
    }, [step, selectedProject, selectedType, client]);

    const handleParentSearch = async (query: string): Promise<FuzzySelectItem[]> => {
        if (!selectedProject || !selectedType) {
            return [];
        }

        const parentMode = getParentMode(selectedType.name);
        if (parentMode === 'issue-required') {
            const parentIssues = await client.searchParentIssues(selectedProject, query, 35);
            return parentIssues.map(issue => ({
                label: `${issue.key}: ${issue.fields.summary}`,
                value: issue.key,
                key: issue.key
            }));
        }

        const epicIssues = await client.searchEpics(selectedProject, query, 35);
        return [
            NO_PARENT_ITEM,
            ...epicIssues.map(issue => ({
                label: `${issue.key}: ${issue.fields.summary}`,
                value: issue.key,
                key: issue.key
            }))
        ];
    };

    const handleCreate = async () => {
        if (!selectedProject || !selectedType) {
            setError('Project and issue type are required');
            setStep('type');
            return;
        }

        const parentMode = getParentMode(selectedType.name);
        if (parentMode === 'issue-required' && selectedParent === NO_PARENT) {
            setError('Sub-task requires a parent issue');
            setStep('parent');
            return;
        }

        setStep('creating');
        try {
            const parentIssueKey = selectedParent !== NO_PARENT ? selectedParent : undefined;
            const issue = await client.createIssue(
                selectedProject,
                selectedType.id,
                summary,
                description,
                selectedPriority !== DEFAULT_PRIORITY ? selectedPriority : undefined,
                parentIssueKey
            );
            onCreated(issue.key);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Creation failed');
            setStep('description'); // Go back to fix?
        }
    };

    useInput((input, key) => {
        if (key.escape) {
            if (step === 'project') onCancel();
            if (step === 'type') setStep('project');
            if (step === 'parent') setStep('type');
            if (step === 'priority') {
                if (selectedType && getParentMode(selectedType.name) !== 'none') {
                    setStep('parent');
                } else {
                    setStep('type');
                }
            }
            if (step === 'summary') setStep('priority');
            if (step === 'description') setStep('summary');
        }
    });

    if (step === 'project') {
        return (
            <Box flexDirection="column">
                <Text bold color={te.accentAlt}>Create Ticket: Select Project</Text>
                <FuzzySelect
                    label="Project"
                    items={projects}
                    onSearch={handleProjectSearch}
                    onSelect={(val) => {
                        setError(null);
                        setSelectedProject(val);
                        setSelectedType(null);
                        setSelectedParent(NO_PARENT);
                        setParentOptions([NO_PARENT_ITEM]);
                        setStep('type');
                    }}
                    onBack={onCancel}
                    placeholder="Select project..."
                />
                {error && <Text color="red">{error}</Text>}
            </Box>
        );
    }

    if (step === 'type') {
        return (
            <Box flexDirection="column">
                <Text bold color={te.accentAlt}>Create Ticket: Select Issue Type</Text>
                <FuzzySelect
                    label="Issue Type"
                    items={issueTypes}
                    onSelect={(val) => {
                        const issueType = val as IssueTypeOption;
                        setSelectedType(issueType);
                        const parentMode = getParentMode(issueType.name);
                        setSelectedParent(NO_PARENT);
                        if (parentMode === 'issue-required') {
                            setParentOptions([]);
                        } else {
                            setParentOptions([NO_PARENT_ITEM]);
                        }
                        if (parentMode === 'none') {
                            setStep('priority');
                        } else {
                            setStep('parent');
                        }
                    }}
                    onBack={() => setStep('project')}
                    placeholder="Select type..."
                />
                {error && <Text color="red">{error}</Text>}
            </Box>
        );
    }

    if (step === 'parent') {
        const parentMode = selectedType ? getParentMode(selectedType.name) : 'none';
        const isParentIssueRequired = parentMode === 'issue-required';
        const title = isParentIssueRequired
            ? 'Create Ticket: Select Parent Issue'
            : 'Create Ticket: Select Parent Epic';
        const label = isParentIssueRequired ? 'Parent Issue' : 'Parent Epic (Optional)';
        const hint = isParentIssueRequired
            ? 'Sub-task requires a parent issue. Select one to continue.'
            : 'Select an epic to link this issue, or choose "No epic" to continue without one.';
        const placeholder = isParentIssueRequired ? 'Search parent issues...' : 'Search epics...';

        return (
            <Box flexDirection="column">
                <Text bold color={te.accentAlt}>{title}</Text>
                <FuzzySelect
                    label={label}
                    items={parentOptions}
                    onSearch={handleParentSearch}
                    onSelect={(val) => {
                        setSelectedParent(val as string);
                        setStep('priority');
                    }}
                    onBack={() => setStep('type')}
                    placeholder={placeholder}
                />
                <Box marginTop={1}>
                    <Text dimColor>{hint}</Text>
                </Box>
                {error && <Text color="red">{error}</Text>}
            </Box>
        );
    }

    if (step === 'priority') {
        return (
            <Box flexDirection="column">
                <Text bold color={te.accentAlt}>Create Ticket: Select Priority</Text>
                <FuzzySelect
                    label="Priority"
                    items={priorities}
                    onSelect={(val) => {
                        setSelectedPriority(val);
                        setStep('summary');
                    }}
                    onBack={() => {
                        if (selectedType && getParentMode(selectedType.name) !== 'none') {
                            setStep('parent');
                        } else {
                            setStep('type');
                        }
                    }}
                    placeholder="Select priority..."
                />
                {error && <Text color="red">{error}</Text>}
            </Box>
        );
    }

    if (step === 'summary') {
        return (
            <Box flexDirection="column">
                <Text bold color={te.accentAlt}>Create Ticket: Title</Text>
                <Box borderStyle="round" borderColor={te.accent} paddingX={1}>
                    <TextInput
                        value={summary}
                        onChange={setSummary}
                        onSubmit={() => {
                            if (summary.trim()) setStep('description');
                        }}
                        placeholder="Enter title..."
                    />
                </Box>
                <Box marginTop={1}>
                    <ShortcutHints
                        hints={[
                            { key: 'Enter', label: 'Next' },
                            { key: 'Escape', label: 'Back' },
                        ]}
                    />
                </Box>
            </Box>
        );
    }

    if (step === 'description') {
        return (
            <Box flexDirection="column">
                <Text bold color={te.accentAlt}>Create Ticket: Description</Text>
                <Box borderStyle="round" borderColor={te.accent} paddingX={1}>
                    <TextInput
                        value={description}
                        onChange={setDescription}
                        onSubmit={handleCreate}
                        placeholder="Enter description..."
                    />
                </Box>
                <Box marginTop={1}>
                    <ShortcutHints
                        hints={[
                            { key: 'Enter', label: 'Create' },
                            { key: 'Escape', label: 'Back' },
                        ]}
                    />
                </Box>
                {error && <Text color="red">{error}</Text>}
            </Box>
        );
    }

    return (
        <Box>
            <Text>Creating ticket...</Text>
        </Box>
    );
}
